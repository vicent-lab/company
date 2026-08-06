import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/index.js';
import { requireAuth, requirePermission, resolveFarmId, audit, isSuperAdmin } from '../middleware/auth.js';
import { HttpError, asyncHandler } from '../lib/errors.js';

const router = Router();
router.use(requireAuth);

router.get('/', asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const { rows } = await query(
    `SELECT mr.id, mr.cow_id, c.cow_code, c.name AS cow_name, mr.recorded_on,
            mr.morning_liters, mr.afternoon_liters, mr.evening_liters,
            (mr.morning_liters+mr.afternoon_liters+mr.evening_liters) AS total_liters,
            mr.fat_percent, mr.snf_percent
     FROM milk_records mr JOIN cows c ON c.id=mr.cow_id
     WHERE mr.farm_id=$1 ORDER BY mr.recorded_on DESC LIMIT 100`,
    [farmId]
  );
  res.json({ data: rows, count: rows.length });
}));

const schema = z.object({
  cowId: z.string().min(1),
  recordedOn: z.string(),
  morningLiters: z.number().min(0).default(0),
  afternoonLiters: z.number().min(0).default(0),
  eveningLiters: z.number().min(0).default(0),
  fatPercent: z.number().optional(),
  snfPercent: z.number().optional(),
});

router.post('/', requirePermission('milk:write'), asyncHandler(async (req, res) => {
  const b = schema.parse(req.body);
  const farmId = resolveFarmId(req);
  const cow = await query('SELECT id, farm_id FROM cows WHERE id=$1', [b.cowId]);
  if (!cow.rows[0]) throw new HttpError(404, 'Cow not found');
  if (!req.user!.isSuperAdmin && cow.rows[0].farm_id !== farmId)
    throw new HttpError(403, 'Cow does not belong to this farm');
  const { rows } = await query(
    `INSERT INTO milk_records (farm_id, cow_id, recorded_on, morning_liters, afternoon_liters, evening_liters, fat_percent, snf_percent)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (cow_id, recorded_on) DO UPDATE SET morning_liters=EXCLUDED.morning_liters, afternoon_liters=EXCLUDED.afternoon_liters, evening_liters=EXCLUDED.evening_liters
     RETURNING *`,
    [farmId, b.cowId, b.recordedOn, b.morningLiters, b.afternoonLiters, b.eveningLiters, b.fatPercent ?? null, b.snfPercent ?? null]
  );
  await audit(req.user, 'create', 'milk_record', rows[0].id);
  res.status(201).json(rows[0]);
}));

const patchSchema = schema.partial();
router.patch('/:id', requirePermission('milk:write'), asyncHandler(async (req, res) => {
  const b = patchSchema.parse(req.body);
  const existing = await query('SELECT farm_id FROM milk_records WHERE id=$1', [req.params.id]);
  if (!existing.rows[0]) throw new HttpError(404, 'Milk record not found');
  if (!req.user!.isSuperAdmin && existing.rows[0].farm_id !== req.user!.farmId)
    throw new HttpError(403, 'Access denied');
  const sets: string[] = [];
  const params: any[] = [];
  let i = 1;
  const map: Record<string, string> = {
    cowId: 'cow_id', recordedOn: 'recorded_on', morningLiters: 'morning_liters',
    afternoonLiters: 'afternoon_liters', eveningLiters: 'evening_liters',
    fatPercent: 'fat_percent', snfPercent: 'snf_percent',
  };
  for (const [k, col] of Object.entries(map)) {
    if ((b as any)[k] !== undefined) { sets.push(`${col} = $${i}`); params.push((b as any)[k]); i++; }
  }
  sets.push('updated_at = now()');
  params.push(req.params.id);
  const { rows } = await query(`UPDATE milk_records SET ${sets.join(', ')} WHERE id=$${i} RETURNING *`, params);
  await audit(req.user, 'update', 'milk_record', req.params.id, b);
  res.json(rows[0]);
}));

router.delete('/:id', requirePermission('milk:write'), asyncHandler(async (req, res) => {
  const existing = await query('SELECT farm_id FROM milk_records WHERE id=$1', [req.params.id]);
  if (!existing.rows[0]) throw new HttpError(404, 'Milk record not found');
  if (!req.user!.isSuperAdmin && existing.rows[0].farm_id !== req.user!.farmId)
    throw new HttpError(403, 'Access denied');
  await query('DELETE FROM milk_records WHERE id=$1', [req.params.id]);
  await audit(req.user, 'delete', 'milk_record', req.params.id);
  res.status(204).end();
}));

export default router;
