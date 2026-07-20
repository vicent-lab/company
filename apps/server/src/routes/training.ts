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
    `SELECT tr.*, e.job_title, u.name as employee_name
     FROM training_records tr
     JOIN employees e ON e.id = tr.employee_id
     LEFT JOIN users u ON u.id = e.user_id
     WHERE tr.farm_id=$1 ORDER BY tr.scheduled_on DESC`,
    [farmId]
  );
  res.json({ data: rows, count: rows.length });
}));

const schema = z.object({
  employeeId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  category: z.string().default('general'),
  status: z.string().default('scheduled'),
  scheduledOn: z.string(),
  completedOn: z.string().optional(),
  score: z.number().optional(),
  certificateUrl: z.string().optional(),
});

router.post('/', requirePermission('cow:manage'), asyncHandler(async (req, res) => {
  const b = schema.parse(req.body);
  const farmId = resolveFarmId(req);
  const { rows } = await query(
    `INSERT INTO training_records (farm_id, employee_id, title, description, category, status, scheduled_on, completed_on, score, certificate_url)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [farmId, b.employeeId, b.title, b.description || null, b.category, b.status, b.scheduledOn, b.completedOn || null, b.score ?? null, b.certificateUrl || null]
  );
  await audit(req.user, 'create', 'training', rows[0].id);
  res.status(201).json(rows[0]);
}));

router.patch('/:id', requirePermission('cow:manage'), asyncHandler(async (req, res) => {
  const b = schema.partial().parse(req.body);
  const existing = await query('SELECT farm_id FROM training_records WHERE id=$1', [req.params.id]);
  if (!existing.rows[0]) throw new HttpError(404, 'Training record not found');
  if (existing.rows[0].farm_id !== resolveFarmId(req)) throw new HttpError(403, 'Access denied');
  const sets: string[] = [];
  const params: any[] = [];
  let i = 1;
  const map: Record<string, string> = { employeeId: 'employee_id', title: 'title', description: 'description', category: 'category', status: 'status', scheduledOn: 'scheduled_on', completedOn: 'completed_on', score: 'score', certificateUrl: 'certificate_url' };
  for (const [k, col] of Object.entries(map)) {
    if ((b as any)[k] !== undefined) { sets.push(`${col}=$${i}`); params.push((b as any)[k]); i++; }
  }
  params.push(req.params.id);
  const { rows } = await query(`UPDATE training_records SET ${sets.join(', ')} WHERE id=$${i} RETURNING *`, params);
  await audit(req.user, 'update', 'training', req.params.id, b);
  res.json(rows[0]);
}));

router.delete('/:id', requirePermission('cow:manage'), asyncHandler(async (req, res) => {
  const existing = await query('SELECT farm_id FROM training_records WHERE id=$1', [req.params.id]);
  if (!existing.rows[0]) throw new HttpError(404, 'Training record not found');
  if (existing.rows[0].farm_id !== resolveFarmId(req)) throw new HttpError(403, 'Access denied');
  await query('DELETE FROM training_records WHERE id=$1', [req.params.id]);
  await audit(req.user, 'delete', 'training', req.params.id);
  res.status(204).end();
}));

export default router;
