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
    `SELECT hd.*, c.cow_code, c.name as cow_name, c.breed
     FROM heat_detections hd
     JOIN cows c ON c.id = hd.cow_id
     WHERE hd.farm_id=$1 ORDER BY hd.detected_on DESC`,
    [farmId]
  );
  res.json({ data: rows, count: rows.length });
}));

const schema = z.object({
  cowId: z.string().min(1),
  confidence: z.number().min(0).max(1).default(0.5),
  sensorType: z.string().default('wearable'),
  activityLevel: z.number().optional(),
  temperatureC: z.number().optional(),
  notes: z.string().optional(),
});

router.post('/', requirePermission('cow:manage'), asyncHandler(async (req, res) => {
  const b = schema.parse(req.body);
  const farmId = resolveFarmId(req);
  const cow = await query('SELECT id, farm_id FROM cows WHERE id=$1', [b.cowId]);
  if (!cow.rows[0]) throw new HttpError(404, 'Cow not found');
  if (cow.rows[0].farm_id !== farmId) throw new HttpError(403, 'Access denied');
  const { rows } = await query(
    `INSERT INTO heat_detections (farm_id, cow_id, confidence, sensor_type, activity_level, temperature_c, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [farmId, b.cowId, b.confidence, b.sensorType, b.activityLevel ?? null, b.temperatureC ?? null, b.notes || null]
  );
  await audit(req.user, 'create', 'heat_detection', rows[0].id);
  res.status(201).json(rows[0]);
}));

router.delete('/:id', requirePermission('cow:manage'), asyncHandler(async (req, res) => {
  const existing = await query('SELECT farm_id FROM heat_detections WHERE id=$1', [req.params.id]);
  if (!existing.rows[0]) throw new HttpError(404, 'Heat detection not found');
  if (existing.rows[0].farm_id !== resolveFarmId(req)) throw new HttpError(403, 'Access denied');
  await query('DELETE FROM heat_detections WHERE id=$1', [req.params.id]);
  await audit(req.user, 'delete', 'heat_detection', req.params.id);
  res.status(204).end();
}));

export default router;
