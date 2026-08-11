import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/index.js';
import { requireAuth, requirePermission, resolveFarmId, audit } from '../middleware/auth.js';
import { HttpError, asyncHandler } from '../lib/errors.js';

const router = Router();
router.use(requireAuth);

const schema = z.object({
  cowId: z.string().min(1),
  breedingId: z.string().min(1),
  confirmationDate: z.string().min(1),
  status: z.string().min(1),
  expectedCalvingDate: z.string().min(1),
});

router.get('/', asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const { rows } = await query(
    `SELECT p.*, c.cow_code, c.name as cow_name
     FROM pregnancies p
     JOIN cows c ON c.id = p.cow_id
     WHERE p.farm_id=$1 ORDER BY p.confirmation_date DESC`,
    [farmId]
  );
  res.json({ data: rows, count: rows.length });
}));

router.post('/', requirePermission('cow:manage'), asyncHandler(async (req, res) => {
  const b = schema.parse(req.body);
  const farmId = resolveFarmId(req);
  const cow = await query('SELECT id, farm_id FROM cows WHERE id=$1', [b.cowId]);
  if (!cow.rows[0]) throw new HttpError(404, 'Cow not found');
  if (cow.rows[0].farm_id !== farmId) throw new HttpError(403, 'Access denied');
  const { rows } = await query(
    `INSERT INTO pregnancies (farm_id, cow_id, breeding_id, confirmation_date, status, expected_calving_date)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [farmId, b.cowId, b.breedingId, b.confirmationDate, b.status, b.expectedCalvingDate]
  );
  await audit(req.user, 'create', 'pregnancy', rows[0].id);
  res.status(201).json(rows[0]);
}));

router.patch('/:id', requirePermission('cow:manage'), asyncHandler(async (req, res) => {
  const b = schema.partial().parse(req.body);
  const existing = await query('SELECT p.id, c.farm_id FROM pregnancies p JOIN cows c ON c.id=p.cow_id WHERE p.id=$1', [req.params.id]);
  if (!existing.rows[0]) throw new HttpError(404, 'Pregnancy not found');
  if (existing.rows[0].farm_id !== resolveFarmId(req)) throw new HttpError(403, 'Access denied');
  const sets: string[] = [];
  const params: any[] = [];
  let i = 1;
  const map: Record<string, string> = { cowId: 'cow_id', breedingId: 'breeding_id', confirmationDate: 'confirmation_date', status: 'status', expectedCalvingDate: 'expected_calving_date' };
  for (const [k, col] of Object.entries(map)) {
    if ((b as any)[k] !== undefined) { sets.push(`${col}=$${i}`); params.push((b as any)[k]); i++; }
  }
  sets.push(`updated_at=now()`);
  params.push(req.params.id);
  const { rows } = await query(`UPDATE pregnancies SET ${sets.join(', ')} WHERE id=$${i} RETURNING *`, params);
  await audit(req.user, 'update', 'pregnancy', req.params.id, b);
  res.json(rows[0]);
}));

router.delete('/:id', requirePermission('cow:manage'), asyncHandler(async (req, res) => {
  const existing = await query('SELECT p.id, c.farm_id FROM pregnancies p JOIN cows c ON c.id=p.cow_id WHERE p.id=$1', [req.params.id]);
  if (!existing.rows[0]) throw new HttpError(404, 'Pregnancy not found');
  if (existing.rows[0].farm_id !== resolveFarmId(req)) throw new HttpError(403, 'Access denied');
  await query('DELETE FROM pregnancies WHERE id=$1', [req.params.id]);
  await audit(req.user, 'delete', 'pregnancy', req.params.id);
  res.status(204).end();
}));

export default router;
