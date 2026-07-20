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
    `SELECT f.*, u.name as employee_name, e.job_title
     FROM face_registrations f
     JOIN employees e ON e.id = f.employee_id
     LEFT JOIN users u ON u.id = e.user_id
     WHERE f.farm_id=$1 AND f.is_active=true`,
    [farmId]
  );
  res.json({ data: rows, count: rows.length });
}));

const schema = z.object({
  employeeId: z.string().min(1),
  faceDescriptor: z.string().min(1),
  photoUrl: z.string().optional(),
});

router.post('/', requirePermission('cow:manage'), asyncHandler(async (req, res) => {
  const b = schema.parse(req.body);
  const farmId = resolveFarmId(req);
  const { rows } = await query(
    `INSERT INTO face_registrations (farm_id, employee_id, face_descriptor, photo_url) VALUES ($1,$2,$3,$4) RETURNING *`,
    [farmId, b.employeeId, b.faceDescriptor, b.photoUrl || null]
  );
  await audit(req.user, 'create', 'face_registration', rows[0].id);
  res.status(201).json(rows[0]);
}));

router.delete('/:id', requirePermission('cow:manage'), asyncHandler(async (req, res) => {
  const existing = await query('SELECT farm_id FROM face_registrations WHERE id=$1', [req.params.id]);
  if (!existing.rows[0]) throw new HttpError(404, 'Face registration not found');
  if (existing.rows[0].farm_id !== resolveFarmId(req)) throw new HttpError(403, 'Access denied');
  await query('UPDATE face_registrations SET is_active=false WHERE id=$1', [req.params.id]);
  await audit(req.user, 'delete', 'face_registration', req.params.id);
  res.status(204).end();
}));

export default router;
