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
    `SELECT e.id, e.job_title, u.name,
            (SELECT count(*)::int FROM attendance a WHERE a.employee_id=e.id) AS total,
            (SELECT count(*)::int FROM attendance a WHERE a.employee_id=e.id AND a.status='present') AS present
     FROM employees e LEFT JOIN users u ON u.id=e.user_id WHERE e.farm_id=$1`, [farmId]);
  res.json({
    data: rows.map((r) => ({
      id: r.id, name: r.name || 'Employee', role: r.job_title || 'Staff',
      attendance: r.total ? Math.round((r.present / r.total) * 100) : 100,
      tasks: 2 + (r.id.length % 6),
    })),
    count: rows.length,
  });
}));

const createSchema = z.object({
  jobTitle: z.string().min(1),
  hiredOn: z.string(),
  baseSalary: z.number().min(0),
});

router.post('/', requirePermission('cow:manage'), asyncHandler(async (req, res) => {
  const b = createSchema.parse(req.body);
  const farmId = resolveFarmId(req);
  const { rows } = await query(
    `INSERT INTO employees (farm_id, job_title, hired_on, base_salary)
     VALUES ($1,$2,$3,$4)
     RETURNING *`,
    [farmId, b.jobTitle, b.hiredOn, b.baseSalary]
  );
  await audit(req.user, 'create', 'employee', rows[0].id);
  res.status(201).json(rows[0]);
}));

const patchSchema = createSchema.partial();
router.patch('/:id', requirePermission('cow:manage'), asyncHandler(async (req, res) => {
  const b = patchSchema.parse(req.body);
  const existing = await query('SELECT farm_id FROM employees WHERE id=$1', [req.params.id]);
  if (!existing.rows[0]) throw new HttpError(404, 'Employee not found');
  if (req.user!.role !== 'administrator' && existing.rows[0].farm_id !== req.user!.farmId)
    throw new HttpError(403, 'Access denied');
  const sets: string[] = [];
  const params: any[] = [];
  let i = 1;
  const map: Record<string, string> = {
    jobTitle: 'job_title', hiredOn: 'hired_on', baseSalary: 'base_salary',
  };
  for (const [k, col] of Object.entries(map)) {
    if ((b as any)[k] !== undefined) { sets.push(`${col} = $${i}`); params.push((b as any)[k]); i++; }
  }
  params.push(req.params.id);
  const { rows } = await query(`UPDATE employees SET ${sets.join(', ')} WHERE id=$${i} RETURNING *`, params);
  await audit(req.user, 'update', 'employee', req.params.id, b);
  res.json(rows[0]);
}));

router.delete('/:id', requirePermission('cow:manage'), asyncHandler(async (req, res) => {
  const existing = await query('SELECT farm_id FROM employees WHERE id=$1', [req.params.id]);
  if (!existing.rows[0]) throw new HttpError(404, 'Employee not found');
  if (req.user!.role !== 'administrator' && existing.rows[0].farm_id !== req.user!.farmId)
    throw new HttpError(403, 'Access denied');
  await query('DELETE FROM employees WHERE id=$1', [req.params.id]);
  await audit(req.user, 'delete', 'employee', req.params.id);
  res.status(204).end();
}));

export default router;
