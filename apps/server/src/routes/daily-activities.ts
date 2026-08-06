import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/index.js';
import { requireAuth, requirePermission, resolveFarmId, audit } from '../middleware/auth.js';
import { HttpError, asyncHandler } from '../lib/errors.js';

const router = Router();
router.use(requireAuth);

const schema = z.object({
  activityType: z.string().min(1),
  description: z.string().optional(),
  durationMinutes: z.number().optional(),
  relatedCowId: z.string().optional(),
  relatedTaskId: z.string().optional(),
  activityDate: z.string(),
  employeeId: z.string().optional(),
});

router.get('/', asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const date = (req.query.date as string | undefined) || undefined;
  const { rows } = await query(
    `SELECT da.*, e.job_title, u.name AS employee_name, t.title AS task_title
     FROM daily_activities da
     LEFT JOIN employees e ON e.id = da.employee_id
     LEFT JOIN users u ON u.id = e.user_id
     LEFT JOIN tasks t ON t.id = da.related_task_id
     WHERE da.farm_id = $1 AND da.activity_date = $2
     ORDER BY da.created_at DESC`,
    [farmId, date || new Date().toISOString().slice(0, 10)]
  );
  res.json({ data: rows, count: rows.length });
}));

router.post('/', requirePermission('task:write'), asyncHandler(async (req, res) => {
  const b = schema.parse(req.body);
  const farmId = resolveFarmId(req);
  const { rows } = await query(
    `INSERT INTO daily_activities (farm_id, employee_id, activity_type, description, duration_minutes, related_cow_id, related_task_id, activity_date)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING *`,
    [farmId, b.employeeId ?? null, b.activityType, b.description ?? null, b.durationMinutes ?? null, b.relatedCowId ?? null, b.relatedTaskId ?? null, b.activityDate]
  );
  await audit(req.user, 'create', 'daily_activity', rows[0].id);
  res.status(201).json(rows[0]);
}));

router.patch('/:id', requirePermission('task:write'), asyncHandler(async (req, res) => {
  const b = schema.partial().parse(req.body);
  const existing = await query('SELECT farm_id FROM daily_activities WHERE id=$1', [req.params.id]);
  if (!existing.rows[0]) throw new HttpError(404, 'Activity not found');
  if (!req.user!.isSuperAdmin && existing.rows[0].farm_id !== resolveFarmId(req))
    throw new HttpError(403, 'Access denied');
  const sets: string[] = [];
  const params: any[] = [];
  let i = 1;
  const map: Record<string, string> = {
    activityType: 'activity_type', description: 'description', durationMinutes: 'duration_minutes',
    relatedCowId: 'related_cow_id', relatedTaskId: 'related_task_id', activityDate: 'activity_date',
    employeeId: 'employee_id',
  };
  for (const [k, col] of Object.entries(map)) {
    if ((b as any)[k] !== undefined) { sets.push(`${col} = $${i}`); params.push((b as any)[k]); i++; }
  }
  params.push(req.params.id);
  const { rows } = await query(`UPDATE daily_activities SET ${sets.join(', ')} WHERE id=$${i} RETURNING *`, params);
  await audit(req.user, 'update', 'daily_activity', req.params.id, b);
  res.json(rows[0]);
}));

router.delete('/:id', requirePermission('task:write'), asyncHandler(async (req, res) => {
  const existing = await query('SELECT farm_id FROM daily_activities WHERE id=$1', [req.params.id]);
  if (!existing.rows[0]) throw new HttpError(404, 'Activity not found');
  if (!req.user!.isSuperAdmin && existing.rows[0].farm_id !== resolveFarmId(req))
    throw new HttpError(403, 'Access denied');
  await query('DELETE FROM daily_activities WHERE id=$1', [req.params.id]);
  await audit(req.user, 'delete', 'daily_activity', req.params.id);
  res.status(204).end();
}));

export default router;
