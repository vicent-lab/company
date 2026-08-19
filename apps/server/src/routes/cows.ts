import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/index.js';
import { requireAuth, requirePermission, resolveFarmId, audit, isSuperAdmin } from '../middleware/auth.js';
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
    `SELECT id, cow_code, ear_tag, name, breed, gender, date_of_birth, weight_kg, health, is_milking, is_pregnant, water_intake_liters, barn_id, photo_url, mother_id, father_id
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
  photoUrl: z.string().optional(),
});

router.post('/', requirePermission('cow:manage'), asyncHandler(async (req, res) => {
  const b = createSchema.parse(req.body);
  const farmId = resolveFarmId(req);
  const { rows } = await query(
    `INSERT INTO cows (farm_id, barn_id, cow_code, ear_tag, name, breed, gender, date_of_birth, weight_kg, health, is_milking, is_pregnant, water_intake_liters, photo_url)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     ON CONFLICT (farm_id, cow_code) DO UPDATE SET name=EXCLUDED.name, updated_at=now()
     RETURNING *`,
     [farmId, b.barnId ?? null, b.cowCode, b.earTag, b.name ?? null, b.breed ?? null, b.gender, b.dateOfBirth ?? null, b.weightKg ?? null, b.health, b.isMilking ?? false, b.isPregnant ?? false, b.waterIntakeLiters ?? 0, b.photoUrl ?? null]
  );
  await audit(req.user, 'create', 'cow', rows[0].id, { cowCode: b.cowCode });
  res.status(201).json(rows[0]);
}));

// Bulk import — the farm setup wizard's "Import cows" step feeds parsed CSV/Excel rows
// (or hand-typed rows) through here in one request. Bad rows are skipped and reported
// rather than failing the whole batch, since a partial spreadsheet mistake shouldn't
// block the good rows from importing.
const importSchema = z.object({
  cows: z.array(createSchema).min(1).max(500),
});

router.post('/import', requirePermission('cow:manage'), asyncHandler(async (req, res) => {
  const { cows } = importSchema.parse(req.body);
  const farmId = resolveFarmId(req);
  let created = 0;
  const errors: { row: number; message: string }[] = [];
  for (let i = 0; i < cows.length; i++) {
    const b = cows[i];
    try {
      await query(
        `INSERT INTO cows (farm_id, barn_id, cow_code, ear_tag, name, breed, gender, date_of_birth, weight_kg, health, is_milking, is_pregnant, water_intake_liters)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT (farm_id, cow_code) DO UPDATE SET name=EXCLUDED.name, updated_at=now()`,
        [farmId, b.barnId ?? null, b.cowCode, b.earTag, b.name ?? null, b.breed ?? null, b.gender, b.dateOfBirth ?? null, b.weightKg ?? null, b.health, b.isMilking ?? false, b.isPregnant ?? false, b.waterIntakeLiters ?? 0]
      );
      created++;
    } catch {
      errors.push({ row: i + 1, message: `Could not import ${b.cowCode || 'row ' + (i + 1)} (duplicate ear tag?)` });
    }
  }
  await audit(req.user, 'create', 'cow', null, { imported: created });
  res.status(201).json({ created, errors });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  // Scoped by isSuperAdmin specifically, not by whether farmId happens to be truthy — a
  // regular (non-admin) account with no active farm yet has a null farmId too, and must
  // still never match "unscoped", or it would see every farm's cows by id.
  const sql = isSuperAdmin(req) ? `SELECT * FROM cows WHERE id=$1` : `SELECT * FROM cows WHERE id=$1 AND farm_id=$2`;
  const params = isSuperAdmin(req) ? [req.params.id] : [req.params.id, req.user!.farmId];
  const { rows } = await query(sql, params);
  if (!rows[0]) throw new HttpError(404, 'Cow not found');
  // This profile endpoint is deliberately scoped to the one verified cow above.  It
  // never falls back to a farm-wide fetch, so an id guessed from another farm returns 404.
  const [milk, vacc, treat, breed, feed, health, pregnancy, calving, parents, audits] = await Promise.all([
  query(
    `SELECT recorded_on, morning_liters, afternoon_liters, evening_liters FROM milk_records WHERE cow_id=$1 ORDER BY recorded_on DESC LIMIT 30`, [req.params.id]
  ),
  query(`SELECT id, vaccine_name, due_on, administered_on, veterinarian_id FROM vaccinations WHERE cow_id=$1 ORDER BY due_on DESC LIMIT 100`, [req.params.id]),
  query(
    `SELECT t.id, t.disease_id, d.name AS disease_name, t.diagnosis, t.diagnosed_on, t.veterinarian_name, t.status
     FROM treatments t LEFT JOIN diseases d ON d.id = t.disease_id
     WHERE t.cow_id=$1 ORDER BY t.diagnosed_on DESC`, [req.params.id]
  ),
  query(`SELECT id, method, breeding_date, expected_calving_on, result, sire_id, technician FROM breeding_records WHERE cow_id=$1 ORDER BY breeding_date DESC LIMIT 100`, [req.params.id]),
  query(`SELECT fc.id, ft.name AS feed_name, fc.consumed_on, fc.quantity FROM feed_consumption fc JOIN feed_types ft ON ft.id=fc.feed_type_id WHERE fc.cow_id=$1 ORDER BY fc.consumed_on DESC LIMIT 100`, [req.params.id]),
  query(`SELECT id, recorded_on, health_status, body_condition_score, lameness_score, ai_detected_disease, notes, veterinarian_name FROM health_records WHERE cow_id=$1 ORDER BY recorded_on DESC LIMIT 100`, [req.params.id]),
  query(`SELECT id, confirmation_date, status, expected_calving_date FROM pregnancies WHERE cow_id=$1 ORDER BY confirmation_date DESC LIMIT 50`, [req.params.id]),
  query(`SELECT cr.id, cr.calving_date, cr.difficulty_score, cr.assistance_required, cr.veterinarian_name, cr.notes, c.id AS calf_id, c.name AS calf_name, c.cow_code AS calf_code, c.gender AS calf_gender FROM calving_records cr LEFT JOIN cows c ON c.id=cr.calf_id WHERE cr.cow_id=$1 ORDER BY cr.calving_date DESC LIMIT 100`, [req.params.id]),
  query(`SELECT m.id AS mother_id, m.name AS mother_name, m.cow_code AS mother_code, f.id AS father_id, f.name AS father_name, f.cow_code AS father_code FROM cows c LEFT JOIN cows m ON m.id=c.mother_id LEFT JOIN cows f ON f.id=c.father_id WHERE c.id=$1`, [req.params.id]),
  query(`SELECT a.id, a.action, a.entity_type, a.entity_id, a.metadata, a.created_at, u.name AS user_name FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id WHERE a.farm_id=$1 AND (a.entity_id=$2 OR a.metadata->>'cowId'=$3) ORDER BY a.created_at DESC LIMIT 100`, [rows[0].farm_id, req.params.id, req.params.id]),
  ]);
  res.json({ ...rows[0], milk: milk.rows, vaccinations: vacc.rows, treatments: treat.rows, breedings: breed.rows, feed: feed.rows, healthRecords: health.rows, pregnancies: pregnancy.rows, calvings: calving.rows, family: parents.rows[0] || null, auditHistory: audits.rows });
}));

const patchSchema = createSchema.partial().extend({
  waterIntakeLiters: z.number().optional(),
  deathDate: z.string().optional(),
  deathCause: z.string().optional(),
  deathNotes: z.string().optional(),
  status: z.enum(['active', 'sold', 'deceased', 'archived']).optional(),
  photoUrl: z.string().optional(),
  motherId: z.string().uuid().nullable().optional(),
  fatherId: z.string().uuid().nullable().optional(),
});
router.patch('/:id', requirePermission('cow:manage'), asyncHandler(async (req, res) => {
  const b = patchSchema.parse(req.body);
  const existing = await query('SELECT id, farm_id, status FROM cows WHERE id=$1', [req.params.id]);
  if (!existing.rows[0]) throw new HttpError(404, 'Cow not found');
  if (!req.user!.isSuperAdmin && existing.rows[0].farm_id !== req.user!.farmId)
    throw new HttpError(403, 'Access denied');
  const parentIds = [b.motherId, b.fatherId].filter((value): value is string => Boolean(value));
  if (parentIds.length) {
    const { rows: parents } = await query('SELECT id, farm_id, gender FROM cows WHERE id = ANY($1::uuid[])', [parentIds]);
    if (parents.length !== parentIds.length || parents.some((parent) => parent.farm_id !== existing.rows[0].farm_id))
      throw new HttpError(400, 'Parents must belong to the same farm');
    if (b.motherId && !parents.some((parent) => parent.id === b.motherId && parent.gender === 'female'))
      throw new HttpError(400, 'Mother must be a female animal');
    if (b.fatherId && !parents.some((parent) => parent.id === b.fatherId && parent.gender === 'male'))
      throw new HttpError(400, 'Father must be a male animal');
    if (parentIds.includes(req.params.id)) throw new HttpError(400, 'An animal cannot be its own parent');
  }
  const sets: string[] = [];
  const params: any[] = [];
  let i = 1;
  const map: Record<string, string> = {
    cowCode: 'cow_code', earTag: 'ear_tag', name: 'name', breed: 'breed', gender: 'gender',
    dateOfBirth: 'date_of_birth', weightKg: 'weight_kg', waterIntakeLiters: 'water_intake_liters',
    barnId: 'barn_id', health: 'health', isMilking: 'is_milking', isPregnant: 'is_pregnant',
    deathCause: 'death_cause', deathNotes: 'death_notes', status: 'status', photoUrl: 'photo_url',
    motherId: 'mother_id', fatherId: 'father_id',
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
  if (!req.user!.isSuperAdmin && existing.rows[0].farm_id !== req.user!.farmId)
    throw new HttpError(403, 'Access denied');
  await query("UPDATE cows SET status='archived' WHERE id=$1", [req.params.id]);
  await audit(req.user, 'delete', 'cow', req.params.id);
  res.status(204).end();
}));

export default router;
