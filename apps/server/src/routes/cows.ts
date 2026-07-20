import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/index.js';
import { requireAuth, requirePermission, resolveFarmId, audit, isAdmin } from '../middleware/auth.js';
import { HttpError, asyncHandler } from '../lib/errors.js';

const router = Router();
router.use(requireAuth);

const listQuery = z.object({
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(200).default(50),
  search: z.string().optional(),
  breed: z.string().optional(),
  health: z.string().optional(),
  pregnant: z.enum(['yes', 'no']).optional(),
  gender: z.string().optional(),
});

router.get('/', asyncHandler(async (req, res) => {
  const q = listQuery.parse(req.query);
  const farmId = resolveFarmId(req);
  const where: string[] = ['farm_id = $1', "status = 'active'"];
  const params: any[] = [farmId];
  let i = 2;
  if (q.search) { where.push(`(cow_code ILIKE $${i} OR name ILIKE $${i} OR ear_tag ILIKE $${i})`); params.push(`%${q.search}%`); i++; }
  if (q.breed) { where.push(`breed = $${i}`); params.push(q.breed); i++; }
  if (q.health) { where.push(`health = $${i}`); params.push(q.health); i++; }
  if (q.gender) { where.push(`gender = $${i}`); params.push(q.gender); i++; }
  if (q.pregnant) { where.push(`is_pregnant = $${i}`); params.push(q.pregnant === 'yes'); i++; }

  const { rows: countRows } = await query(`SELECT count(*)::int AS n FROM cows WHERE ${where.join(' AND ')}`, params);
  const total = countRows[0].n;
  const { rows } = await query(
    `SELECT id, cow_code, ear_tag, name, breed, gender, date_of_birth, weight_kg, health, is_milking, is_pregnant, water_intake_liters, barn_id
     FROM cows WHERE ${where.join(' AND ')} ORDER BY cow_code LIMIT $${i} OFFSET $${i + 1}`,
    [...params, q.pageSize, (q.page - 1) * q.pageSize]
  );
  res.json({ data: rows, count: total, page: q.page, pageSize: q.pageSize });
}));

const createSchema = z.object({
  cowCode: z.string().min(1),
  earTag: z.string().min(1),
  name: z.string().optional(),
  breed: z.string().optional(),
  gender: z.enum(['female', 'male']).default('female'),
  dateOfBirth: z.string().optional(),
  weightKg: z.number().optional(),
  waterIntakeLiters: z.number().optional(),
  barnId: z.string().optional(),
  health: z.enum(['healthy', 'sick', 'under_treatment']).default('healthy'),
  isMilking: z.boolean().optional(),
  isPregnant: z.boolean().optional(),
});

router.post('/', requirePermission('cow:manage'), asyncHandler(async (req, res) => {
  const b = createSchema.parse(req.body);
  const farmId = resolveFarmId(req);
  const { rows } = await query(
    `INSERT INTO cows (farm_id, barn_id, cow_code, ear_tag, name, breed, gender, date_of_birth, weight_kg, health, is_milking, is_pregnant, water_intake_liters)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     ON CONFLICT (farm_id, cow_code) DO UPDATE SET name=EXCLUDED.name, updated_at=now()
     RETURNING *`,
    [farmId, b.barnId ?? null, b.cowCode, b.earTag, b.name ?? null, b.breed ?? null, b.gender, b.dateOfBirth ?? null, b.weightKg ?? null, b.health, b.isMilking ?? false, b.isPregnant ?? false, b.waterIntakeLiters ?? 0]
  );
  await audit(req.user, 'create', 'cow', rows[0].id, { cowCode: b.cowCode });
  res.status(201).json(rows[0]);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const farmId = isAdmin(req) ? null : req.user!.farmId;
  const sql = farmId
    ? `SELECT * FROM cows WHERE id=$1 AND farm_id=$2`
    : `SELECT * FROM cows WHERE id=$1`;
  const { rows } = await query(sql, farmId ? [req.params.id, farmId] : [req.params.id]);
  if (!rows[0]) throw new HttpError(404, 'Cow not found');
  // enrich with related records
  const milk = await query(
    `SELECT recorded_on, morning_liters, afternoon_liters, evening_liters FROM milk_records WHERE cow_id=$1 ORDER BY recorded_on DESC LIMIT 30`, [req.params.id]
  );
  const vacc = await query(`SELECT id, vaccine_name, due_on, administered_on FROM vaccinations WHERE cow_id=$1 ORDER BY due_on`, [req.params.id]);
  const treat = await query(`SELECT id, disease_id, diagnosis, diagnosed_on, status, veterinarian_name FROM treatments WHERE cow_id=$1 ORDER BY diagnosed_on DESC`, [req.params.id]);
  const breed = await query(`SELECT id, method, serviced_on, expected_calving_on, result FROM breeding_records WHERE cow_id=$1 ORDER BY serviced_on DESC`, [req.params.id]);
  const feed = await query(`SELECT id, feed_type_id, consumed_on, quantity FROM feed_consumption WHERE cow_id=$1 ORDER BY consumed_on DESC LIMIT 10`, [req.params.id]);
  res.json({ ...rows[0], milk: milk.rows, vaccinations: vacc.rows, treatments: treat.rows, breedings: breed.rows, feed: feed.rows });
}));

const patchSchema = createSchema.partial().extend({
  waterIntakeLiters: z.number().optional(),
  deathDate: z.string().optional(),
  deathCause: z.string().optional(),
  deathNotes: z.string().optional(),
  status: z.enum(['active', 'sold', 'deceased', 'archived']).optional(),
});
router.patch('/:id', requirePermission('cow:manage'), asyncHandler(async (req, res) => {
  const b = patchSchema.parse(req.body);
  const existing = await query('SELECT id, farm_id, status FROM cows WHERE id=$1', [req.params.id]);
  if (!existing.rows[0]) throw new HttpError(404, 'Cow not found');
  if (req.user!.role !== 'administrator' && existing.rows[0].farm_id !== req.user!.farmId)
    throw new HttpError(403, 'Access denied');
  const sets: string[] = [];
  const params: any[] = [];
  let i = 1;
  const map: Record<string, string> = {
    cowCode: 'cow_code', earTag: 'ear_tag', name: 'name', breed: 'breed', gender: 'gender',
    dateOfBirth: 'date_of_birth', weightKg: 'weight_kg', waterIntakeLiters: 'water_intake_liters',
    barnId: 'barn_id', health: 'health', isMilking: 'is_milking', isPregnant: 'is_pregnant',
    deathCause: 'death_cause', deathNotes: 'death_notes', status: 'status',
  };
  for (const [k, col] of Object.entries(map)) {
    if ((b as any)[k] !== undefined) {
      const val = (b as any)[k];
      if (col === 'status' && val === 'deceased') {
        sets.push(`${col} = $${i}`);
        params.push(val);
        i++;
        sets.push(`death_date = COALESCE($${i}, current_date)`);
        params.push((b as any).deathDate || null);
        i++;
      } else {
        sets.push(`${col} = $${i}`);
        params.push(val);
        i++;
      }
    }
  }
  if ((b as any).deathDate !== undefined && (b as any).status !== 'deceased') {
    sets.push(`death_date = $${i}`);
    params.push((b as any).deathDate);
    i++;
  }
  sets.push('updated_at = now()');
  params.push(req.params.id);
  const { rows } = await query(`UPDATE cows SET ${sets.join(', ')} WHERE id=$${i} RETURNING *`, params);
  await audit(req.user, 'update', 'cow', req.params.id, b);
  res.json(rows[0]);
}));

router.delete('/:id', requirePermission('cow:manage'), asyncHandler(async (req, res) => {
  const existing = await query('SELECT farm_id FROM cows WHERE id=$1', [req.params.id]);
  if (!existing.rows[0]) throw new HttpError(404, 'Cow not found');
  if (req.user!.role !== 'administrator' && existing.rows[0].farm_id !== req.user!.farmId)
    throw new HttpError(403, 'Access denied');
  await query("UPDATE cows SET status='archived' WHERE id=$1", [req.params.id]);
  await audit(req.user, 'delete', 'cow', req.params.id);
  res.status(204).end();
}));

export default router;
