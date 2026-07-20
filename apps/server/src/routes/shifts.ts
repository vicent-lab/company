import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/index.js';
import { requireAuth, requirePermission, resolveFarmId, audit } from '../middleware/auth.js';
import { HttpError, asyncHandler } from '../lib/errors.js';

const router = Router();
router.use(requireAuth);

router.get('/', asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const { rows } = await query('SELECT * FROM shifts WHERE farm_id=$1 ORDER BY start_time', [farmId]);
  res.json({ data: rows, count: rows.length });
}));

const schema = z.object({
  name: z.string().min(1),
  startTime: z.string(),
  endTime: z.string(),
  days: z.array(z.string()).default([]),
  color: z.string().default('#2f7d54'),
});

router.post('/', requirePermission('cow:manage'), asyncHandler(async (req, res) => {
  const b = schema.parse(req.body);
  const farmId = resolveFarmId(req);
  const { rows } = await query(
    `INSERT INTO shifts (farm_id, name, start_time, end_time, days, color) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [farmId, b.name, b.startTime, b.endTime, b.days, b.color]
  );
  await audit(req.user, 'create', 'shift', rows[0].id);
  res.status(201).json(rows[0]);
}));

router.patch('/:id', requirePermission('cow:manage'), asyncHandler(async (req, res) => {
  const b = schema.partial().parse(req.body);
  const existing = await query('SELECT farm_id FROM shifts WHERE id=$1', [req.params.id]);
  if (!existing.rows[0]) throw new HttpError(404, 'Shift not found');
  if (existing.rows[0].farm_id !== resolveFarmId(req)) throw new HttpError(403, 'Access denied');
  const sets: string[] = [];
  const params: any[] = [];
  let i = 1;
  const map: Record<string, string> = { name: 'name', startTime: 'start_time', endTime: 'end_time', days: 'days', color: 'color' };
  for (const [k, col] of Object.entries(map)) {
    if ((b as any)[k] !== undefined) { sets.push(`${col}=$${i}`); params.push((b as any)[k]); i++; }
  }
  params.push(req.params.id);
  const { rows } = await query(`UPDATE shifts SET ${sets.join(', ')} WHERE id=$${i} RETURNING *`, params);
  await audit(req.user, 'update', 'shift', req.params.id, b);
  res.json(rows[0]);
}));

router.delete('/:id', requirePermission('cow:manage'), asyncHandler(async (req, res) => {
  const existing = await query('SELECT farm_id FROM shifts WHERE id=$1', [req.params.id]);
  if (!existing.rows[0]) throw new HttpError(404, 'Shift not found');
  if (existing.rows[0].farm_id !== resolveFarmId(req)) throw new HttpError(403, 'Access denied');
  await query('DELETE FROM shifts WHERE id=$1', [req.params.id]);
  await audit(req.user, 'delete', 'shift', req.params.id);
  res.status(204).end();
}));

const assignSchema = z.object({
  employeeId: z.string().min(1),
  assignedOn: z.string().optional(),
});

router.post('/:id/assign', requirePermission('cow:manage'), asyncHandler(async (req, res) => {
  const b = assignSchema.parse(req.body);
  const farmId = resolveFarmId(req);
  const shift = await query('SELECT farm_id FROM shifts WHERE id=$1', [req.params.id]);
  if (!shift.rows[0]) throw new HttpError(404, 'Shift not found');
  if (shift.rows[0].farm_id !== farmId) throw new HttpError(403, 'Access denied');
  const { rows } = await query(
    `INSERT INTO employee_shifts (farm_id, employee_id, shift_id, assigned_on) VALUES ($1,$2,$3,$4) RETURNING *`,
    [farmId, b.employeeId, req.params.id, b.assignedOn || new Date().toISOString().slice(0, 10)]
  );
  await audit(req.user, 'create', 'employee_shift', rows[0].id);
  res.status(201).json(rows[0]);
}));

router.get('/assignments', asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const { rows } = await query(
    `SELECT es.*, u.name as employee_name, e.job_title, s.name as shift_name, s.start_time, s.end_time
     FROM employee_shifts es
     JOIN employees e ON e.id = es.employee_id
     LEFT JOIN users u ON u.id = e.user_id
     JOIN shifts s ON s.id = es.shift_id
     WHERE es.farm_id=$1 ORDER BY es.assigned_on DESC`,
    [farmId]
  );
  res.json({ data: rows, count: rows.length });
}));

router.delete('/assignments/:id', requirePermission('cow:manage'), asyncHandler(async (req, res) => {
  const existing = await query('SELECT farm_id FROM employee_shifts WHERE id=$1', [req.params.id]);
  if (!existing.rows[0]) throw new HttpError(404, 'Assignment not found');
  if (existing.rows[0].farm_id !== resolveFarmId(req)) throw new HttpError(403, 'Access denied');
  await query('DELETE FROM employee_shifts WHERE id=$1', [req.params.id]);
  await audit(req.user, 'delete', 'employee_shift', req.params.id);
  res.status(204).end();
}));

export default router;
