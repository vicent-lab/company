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
    `SELECT lr.*, u.name as employee_name, e.job_title, a.name as approver_name
     FROM leave_requests lr
     JOIN employees e ON e.id = lr.employee_id
     LEFT JOIN users u ON u.id = e.user_id
     LEFT JOIN users a ON a.id = lr.approved_by
     WHERE lr.farm_id=$1 ORDER BY lr.created_at DESC`,
    [farmId]
  );
  res.json({ data: rows, count: rows.length });
}));

const schema = z.object({
  employeeId: z.string().min(1),
  leaveType: z.string().default('annual'),
  startDate: z.string(),
  endDate: z.string(),
  reason: z.string().optional(),
  status: z.string().default('pending'),
});

router.post('/', requirePermission('cow:manage'), asyncHandler(async (req, res) => {
  const b = schema.parse(req.body);
  const farmId = resolveFarmId(req);
  const { rows } = await query(
    `INSERT INTO leave_requests (farm_id, employee_id, leave_type, start_date, end_date, reason, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [farmId, b.employeeId, b.leaveType, b.startDate, b.endDate, b.reason || null, b.status]
  );
  await audit(req.user, 'create', 'leave_request', rows[0].id);
  res.status(201).json(rows[0]);
}));

router.patch('/:id', requirePermission('cow:manage'), asyncHandler(async (req, res) => {
  const b = schema.partial().parse(req.body);
  const existing = await query('SELECT farm_id FROM leave_requests WHERE id=$1', [req.params.id]);
  if (!existing.rows[0]) throw new HttpError(404, 'Leave request not found');
  if (existing.rows[0].farm_id !== resolveFarmId(req)) throw new HttpError(403, 'Access denied');
  const sets: string[] = [];
  const params: any[] = [];
  let i = 1;
  const map: Record<string, string> = { employeeId: 'employee_id', leaveType: 'leave_type', startDate: 'start_date', endDate: 'end_date', reason: 'reason', status: 'status' };
  for (const [k, col] of Object.entries(map)) {
    if ((b as any)[k] !== undefined) { sets.push(`${col}=$${i}`); params.push((b as any)[k]); i++; }
  }
  if (b.status === 'approved' && !req.body.approvedBy) {
    sets.push(`approved_by=$${i}`); params.push(req.user!.id); i++;
    sets.push(`approved_on=$${i}`); params.push('CURRENT_DATE'); i++;
  }
  params.push(req.params.id);
  const { rows } = await query(`UPDATE leave_requests SET ${sets.join(', ')} WHERE id=$${i} RETURNING *`, params);
  await audit(req.user, 'update', 'leave_request', req.params.id, b);
  res.json(rows[0]);
}));

router.delete('/:id', requirePermission('cow:manage'), asyncHandler(async (req, res) => {
  const existing = await query('SELECT farm_id FROM leave_requests WHERE id=$1', [req.params.id]);
  if (!existing.rows[0]) throw new HttpError(404, 'Leave request not found');
  if (existing.rows[0].farm_id !== resolveFarmId(req)) throw new HttpError(403, 'Access denied');
  await query('DELETE FROM leave_requests WHERE id=$1', [req.params.id]);
  await audit(req.user, 'delete', 'leave_request', req.params.id);
  res.status(204).end();
}));

export default router;
