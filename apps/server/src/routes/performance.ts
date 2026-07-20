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
    `SELECT pr.*, u.name as reviewer_name, e.job_title, u2.name as employee_name
     FROM performance_reviews pr
     JOIN employees e ON e.id = pr.employee_id
     LEFT JOIN users u ON u.id = pr.reviewer_id
     LEFT JOIN users u2 ON u2.id = e.user_id
     WHERE pr.farm_id=$1 ORDER BY pr.period_end DESC`,
    [farmId]
  );
  res.json({ data: rows, count: rows.length });
}));

const schema = z.object({
  employeeId: z.string().min(1),
  reviewerId: z.string().optional(),
  periodStart: z.string(),
  periodEnd: z.string(),
  rating: z.number().min(0).max(5).optional(),
  goalsMet: z.string().optional(),
  areasForImprovement: z.string().optional(),
  notes: z.string().optional(),
  status: z.string().default('draft'),
});

router.post('/', requirePermission('cow:manage'), asyncHandler(async (req, res) => {
  const b = schema.parse(req.body);
  const farmId = resolveFarmId(req);
  const { rows } = await query(
    `INSERT INTO performance_reviews (farm_id, employee_id, reviewer_id, period_start, period_end, rating, goals_met, areas_for_improvement, notes, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [farmId, b.employeeId, b.reviewerId || null, b.periodStart, b.periodEnd, b.rating ?? null, b.goalsMet || null, b.areasForImprovement || null, b.notes || null, b.status]
  );
  await audit(req.user, 'create', 'performance_review', rows[0].id);
  res.status(201).json(rows[0]);
}));

router.patch('/:id', requirePermission('cow:manage'), asyncHandler(async (req, res) => {
  const b = schema.partial().parse(req.body);
  const existing = await query('SELECT farm_id FROM performance_reviews WHERE id=$1', [req.params.id]);
  if (!existing.rows[0]) throw new HttpError(404, 'Performance review not found');
  if (existing.rows[0].farm_id !== resolveFarmId(req)) throw new HttpError(403, 'Access denied');
  const sets: string[] = [];
  const params: any[] = [];
  let i = 1;
  const map: Record<string, string> = { employeeId: 'employee_id', reviewerId: 'reviewer_id', periodStart: 'period_start', periodEnd: 'period_end', rating: 'rating', goalsMet: 'goals_met', areasForImprovement: 'areas_for_improvement', notes: 'notes', status: 'status' };
  for (const [k, col] of Object.entries(map)) {
    if ((b as any)[k] !== undefined) { sets.push(`${col}=$${i}`); params.push((b as any)[k]); i++; }
  }
  params.push(req.params.id);
  const { rows } = await query(`UPDATE performance_reviews SET ${sets.join(', ')} WHERE id=$${i} RETURNING *`, params);
  await audit(req.user, 'update', 'performance_review', req.params.id, b);
  res.json(rows[0]);
}));

router.delete('/:id', requirePermission('cow:manage'), asyncHandler(async (req, res) => {
  const existing = await query('SELECT farm_id FROM performance_reviews WHERE id=$1', [req.params.id]);
  if (!existing.rows[0]) throw new HttpError(404, 'Performance review not found');
  if (existing.rows[0].farm_id !== resolveFarmId(req)) throw new HttpError(403, 'Access denied');
  await query('DELETE FROM performance_reviews WHERE id=$1', [req.params.id]);
  await audit(req.user, 'delete', 'performance_review', req.params.id);
  res.status(204).end();
}));

export default router;
