import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/index.js';
import { requireAuth, requirePermission, resolveFarmId, audit } from '../middleware/auth.js';
import { HttpError, asyncHandler } from '../lib/errors.js';

const router = Router();
router.use(requireAuth);

router.get('/', asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const { rows } = await query(
    `SELECT br.*, c.cow_code, c.name as cow_name
     FROM breeding_records br
     JOIN cows c ON c.id = br.cow_id
     WHERE c.farm_id=$1 ORDER BY br.serviced_on DESC`,
    [farmId]
  );
  res.json({ data: rows, count: rows.length });
}));

const schema = z.object({
  cowId: z.string().min(1),
  method: z.string().min(1),
  servicedOn: z.string(),
  sireReference: z.string().optional(),
  expectedCalvingOn: z.string().optional(),
  result: z.string().optional(),
});

router.post('/', requirePermission('cow:manage'), asyncHandler(async (req, res) => {
  const b = schema.parse(req.body);
  const farmId = resolveFarmId(req);
  const cow = await query('SELECT id, farm_id FROM cows WHERE id=$1', [b.cowId]);
  if (!cow.rows[0]) throw new HttpError(404, 'Cow not found');
  if (cow.rows[0].farm_id !== farmId) throw new HttpError(403, 'Access denied');
  const { rows } = await query(
    `INSERT INTO breeding_records (cow_id, method, serviced_on, sire_reference, expected_calving_on, result)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [b.cowId, b.method, b.servicedOn, b.sireReference || null, b.expectedCalvingOn || null, b.result || null]
  );
  await audit(req.user, 'create', 'breeding_record', rows[0].id);
  res.status(201).json(rows[0]);
}));

router.patch('/:id', requirePermission('cow:manage'), asyncHandler(async (req, res) => {
  const b = schema.partial().parse(req.body);
  const existing = await query('SELECT br.id, c.farm_id FROM breeding_records br JOIN cows c ON c.id=br.cow_id WHERE br.id=$1', [req.params.id]);
  if (!existing.rows[0]) throw new HttpError(404, 'Breeding record not found');
  if (existing.rows[0].farm_id !== resolveFarmId(req)) throw new HttpError(403, 'Access denied');
  const sets: string[] = [];
  const params: any[] = [];
  let i = 1;
  const map: Record<string, string> = { cowId: 'cow_id', method: 'method', servicedOn: 'serviced_on', sireReference: 'sire_reference', expectedCalvingOn: 'expected_calving_on', result: 'result' };
  for (const [k, col] of Object.entries(map)) {
    if ((b as any)[k] !== undefined) { sets.push(`${col}=$${i}`); params.push((b as any)[k]); i++; }
  }
  params.push(req.params.id);
  const { rows } = await query(`UPDATE breeding_records SET ${sets.join(', ')} WHERE id=$${i} RETURNING *`, params);
  await audit(req.user, 'update', 'breeding_record', req.params.id, b);
  res.json(rows[0]);
}));

router.delete('/:id', requirePermission('cow:manage'), asyncHandler(async (req, res) => {
  const existing = await query('SELECT br.id, c.farm_id FROM breeding_records br JOIN cows c ON c.id=br.cow_id WHERE br.id=$1', [req.params.id]);
  if (!existing.rows[0]) throw new HttpError(404, 'Breeding record not found');
  if (existing.rows[0].farm_id !== resolveFarmId(req)) throw new HttpError(403, 'Access denied');
  await query('DELETE FROM breeding_records WHERE id=$1', [req.params.id]);
  await audit(req.user, 'delete', 'breeding_record', req.params.id);
  res.status(204).end();
}));

export default router;
