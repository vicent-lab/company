import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/index.js';
import { requireAuth, requirePermission, resolveFarmId, audit } from '../middleware/auth.js';
import { HttpError, asyncHandler } from '../lib/errors.js';

const router = Router();
router.use(requireAuth);

router.get('/', asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const { employeeId, date } = req.query;
  let sql = `SELECT a.*, u.name as employee_name, e.job_title FROM attendance a JOIN employees e ON e.id = a.employee_id LEFT JOIN users u ON u.id = e.user_id WHERE a.employee_id IN (SELECT id FROM employees WHERE farm_id=$1)`;
  const params: any[] = [farmId];
  if (employeeId) { sql += ` AND a.employee_id=$${params.length + 1}`; params.push(employeeId); }
  if (date) { sql += ` AND a.attended_on=$${params.length + 1}`; params.push(date); }
  sql += ' ORDER BY a.attended_on DESC LIMIT 500';
  const { rows } = await query(sql, params);
  res.json({ data: rows, count: rows.length });
}));

const schema = z.object({
  employeeId: z.string().min(1),
  status: z.string().default('present'),
  notes: z.string().optional(),
});

router.post('/', requirePermission('cow:manage'), asyncHandler(async (req, res) => {
  const b = schema.parse(req.body);
  const today = new Date().toISOString().slice(0, 10);
  const { rows } = await query(
    `INSERT INTO attendance (employee_id, attended_on, status, notes) VALUES ($1,$2,$3,$4) ON CONFLICT (employee_id, attended_on) DO UPDATE SET status=EXCLUDED.status, notes=EXCLUDED.notes RETURNING *`,
    [b.employeeId, today, b.status, b.notes || null]
  );
  await audit(req.user, 'create', 'attendance', rows[0].id);
  res.status(201).json(rows[0]);
}));

export default router;
