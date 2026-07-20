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
    `SELECT p.*, u.name as employee_name, e.job_title
     FROM payroll p
     JOIN employees e ON e.id = p.employee_id
     LEFT JOIN users u ON u.id = e.user_id
     WHERE e.farm_id=$1 ORDER BY p.period_start DESC`,
    [farmId]
  );
  res.json({ data: rows, count: rows.length });
}));

const schema = z.object({
  employeeId: z.string().min(1),
  periodStart: z.string(),
  periodEnd: z.string(),
  grossAmount: z.number().min(0),
  paidOn: z.string().optional(),
});

router.post('/', requirePermission('cow:manage'), asyncHandler(async (req, res) => {
  const b = schema.parse(req.body);
  const farmId = resolveFarmId(req);
  const { rows } = await query(
    `INSERT INTO payroll (employee_id, period_start, period_end, gross_amount, paid_on) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [b.employeeId, b.periodStart, b.periodEnd, b.grossAmount, b.paidOn || null]
  );
  await audit(req.user, 'create', 'payroll', rows[0].id);
  res.status(201).json(rows[0]);
}));

export default router;
