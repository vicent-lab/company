import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/index.js';
import { requireAuth, requirePermission, resolveFarmId, audit } from '../middleware/auth.js';
import { HttpError, asyncHandler } from '../lib/errors.js';

const router = Router();
router.use(requireAuth);

const schema = z.object({
  animalId: z.string().min(1),
  motherId: z.string().min(1),
  fatherId: z.string().min(1),
});

router.get('/', asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const { rows } = await query(
    `SELECT o.*, c.cow_code as animal_code, m.cow_code as mother_code, f.cow_code as father_code
     FROM offspring o
     JOIN cows c ON c.id = o.animal_id
     JOIN cows m ON m.id = o.mother_id
     JOIN cows f ON f.id = o.father_id
     WHERE o.animal_id IN (SELECT id FROM cows WHERE farm_id=$1)
     ORDER BY o.created_at DESC`,
    [farmId]
  );
  res.json({ data: rows, count: rows.length });
}));

router.post('/', requirePermission('cow:manage'), asyncHandler(async (req, res) => {
  const b = schema.parse(req.body);
  const farmId = resolveFarmId(req);
  const animal = await query('SELECT id, farm_id FROM cows WHERE id=$1', [b.animalId]);
  if (!animal.rows[0]) throw new HttpError(404, 'Animal not found');
  if (animal.rows[0].farm_id !== farmId) throw new HttpError(403, 'Access denied');
  const { rows } = await query(
    `INSERT INTO offspring (animal_id, mother_id, father_id)
     VALUES ($1,$2,$3) RETURNING *`,
    [b.animalId, b.motherId, b.fatherId]
  );
  await audit(req.user, 'create', 'offspring', rows[0].id);
  res.status(201).json(rows[0]);
}));

router.delete('/:id', requirePermission('cow:manage'), asyncHandler(async (req, res) => {
  const existing = await query('SELECT o.id FROM offspring o WHERE o.id=$1', [req.params.id]);
  if (!existing.rows[0]) throw new HttpError(404, 'Offspring record not found');
  await query('DELETE FROM offspring WHERE id=$1', [req.params.id]);
  await audit(req.user, 'delete', 'offspring', req.params.id);
  res.status(204).end();
}));

export default router;
