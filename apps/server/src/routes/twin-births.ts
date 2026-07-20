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
    `SELECT tb.*, c.cow_code, c.name as cow_name, cal.calving_date
     FROM twin_births tb
     JOIN cows c ON c.id = tb.cow_id
     JOIN calving_records cal ON cal.id = tb.calving_id
     WHERE tb.farm_id=$1 ORDER BY tb.created_at DESC`,
    [farmId]
  );
  res.json({ data: rows, count: rows.length });
}));

const schema = z.object({
  cowId: z.string().min(1),
  calvingId: z.string().min(1),
  calf1Id: z.string().min(1),
  calf2Id: z.string().min(1),
  birthType: z.string().default('fraternal'),
  notes: z.string().optional(),
});

router.post('/', requirePermission('cow:manage'), asyncHandler(async (req, res) => {
  const b = schema.parse(req.body);
  const farmId = resolveFarmId(req);
  const cow = await query('SELECT id, farm_id FROM cows WHERE id=$1', [b.cowId]);
  if (!cow.rows[0]) throw new HttpError(404, 'Cow not found');
  if (cow.rows[0].farm_id !== farmId) throw new HttpError(403, 'Access denied');
  const { rows } = await query(
    `INSERT INTO twin_births (farm_id, cow_id, calving_id, calf_1_id, calf_2_id, birth_type, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [farmId, b.cowId, b.calvingId, b.calf1Id, b.calf2Id, b.birthType, b.notes || null]
  );
  await audit(req.user, 'create', 'twin_birth', rows[0].id);
  res.status(201).json(rows[0]);
}));

router.delete('/:id', requirePermission('cow:manage'), asyncHandler(async (req, res) => {
  const existing = await query('SELECT farm_id FROM twin_births WHERE id=$1', [req.params.id]);
  if (!existing.rows[0]) throw new HttpError(404, 'Twin birth record not found');
  if (existing.rows[0].farm_id !== resolveFarmId(req)) throw new HttpError(403, 'Access denied');
  await query('DELETE FROM twin_births WHERE id=$1', [req.params.id]);
  await audit(req.user, 'delete', 'twin_birth', req.params.id);
  res.status(204).end();
}));

export default router;
