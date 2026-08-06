import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/index.js';
import { requireAuth, requirePermission, resolveFarmId, audit } from '../middleware/auth.js';
import { HttpError, asyncHandler } from '../lib/errors.js';

const router = Router();
router.use(requireAuth);

const taskSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  assignedTo: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  dueDate: z.string().optional(),
  dueTime: z.string().optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

router.get('/', asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const { rows } = await query(
    `SELECT t.*, u.name AS assigned_name, e.job_title
     FROM tasks t
     LEFT JOIN employees e ON e.id = t.assigned_to
     LEFT JOIN users u ON u.id = e.user_id
     WHERE t.farm_id = $1
     ORDER BY t.due_date ASC NULLS LAST, t.priority DESC, t.created_at DESC`,
    [farmId]
  );
  res.json({ data: rows, count: rows.length });
}));

router.post('/', requirePermission('task:write'), asyncHandler(async (req, res) => {
  const b = taskSchema.parse(req.body);
  const farmId = resolveFarmId(req);
  const { rows } = await query(
    `INSERT INTO tasks (farm_id, title, description, assigned_to, priority, due_date, due_time, category, tags, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING *`,
    [farmId, b.title, b.description ?? null, b.assignedTo ?? null, b.priority, b.dueDate ?? null, b.dueTime ?? null, b.category ?? null, b.tags ?? [], req.user!.id]
  );
  await audit(req.user, 'create', 'task', rows[0].id);
  res.status(201).json(rows[0]);
}));

router.patch('/:id', requirePermission('task:write'), asyncHandler(async (req, res) => {
  const b = taskSchema.partial().parse(req.body);
  const existing = await query('SELECT farm_id FROM tasks WHERE id=$1', [req.params.id]);
  if (!existing.rows[0]) throw new HttpError(404, 'Task not found');
  if (!req.user!.isSuperAdmin && existing.rows[0].farm_id !== resolveFarmId(req))
    throw new HttpError(403, 'Access denied');
  const sets: string[] = [];
  const params: any[] = [];
  let i = 1;
  const map: Record<string, string> = {
    title: 'title', description: 'description', assignedTo: 'assigned_to',
    priority: 'priority', dueDate: 'due_date', dueTime: 'due_time',
    category: 'category', tags: 'tags',
  };
  for (const [k, col] of Object.entries(map)) {
    if ((b as any)[k] !== undefined) { sets.push(`${col} = $${i}`); params.push((b as any)[k]); i++; }
  }
  if ((b as any).status) {
    sets.push(`status = $${i}`);
    params.push((b as any).status);
    i++;
    if ((b as any).status === 'completed') {
      sets.push(`completed_at = now()`);
    }
  }
  params.push(req.params.id);
  const { rows } = await query(`UPDATE tasks SET ${sets.join(', ')} WHERE id=$${i} RETURNING *`, params);
  await audit(req.user, 'update', 'task', req.params.id, b);
  res.json(rows[0]);
}));

router.delete('/:id', requirePermission('task:write'), asyncHandler(async (req, res) => {
  const existing = await query('SELECT farm_id FROM tasks WHERE id=$1', [req.params.id]);
  if (!existing.rows[0]) throw new HttpError(404, 'Task not found');
  if (!req.user!.isSuperAdmin && existing.rows[0].farm_id !== resolveFarmId(req))
    throw new HttpError(403, 'Access denied');
  await query('DELETE FROM tasks WHERE id=$1', [req.params.id]);
  await audit(req.user, 'delete', 'task', req.params.id);
  res.status(204).end();
}));

export default router;
