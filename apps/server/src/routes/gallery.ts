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
    `SELECT id, farm_id, category, url, caption, is_primary, created_at
     FROM gallery
     WHERE farm_id=$1
     ORDER BY created_at DESC`,
    [farmId]
  );
  res.json({ data: rows, count: rows.length });
}));

router.get('/categories', asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const [cats, items] = await Promise.all([
    query(`SELECT category, count(*)::int as count FROM gallery WHERE farm_id=$1 GROUP BY category ORDER BY category`, [farmId]),
    query(`SELECT id, url, caption, category, is_primary FROM gallery WHERE farm_id=$1 ORDER BY created_at DESC`, [farmId]),
  ]);
  res.json({ categories: cats.rows, items: items.rows });
}));

const createSchema = z.object({
  url: z.string().min(1),
  category: z.string().default('general'),
  caption: z.string().optional(),
  isPrimary: z.boolean().default(false),
});

router.post('/', requirePermission('cow:manage'), asyncHandler(async (req, res) => {
  const b = createSchema.parse(req.body);
  const farmId = resolveFarmId(req);
  const { rows } = await query(
    `INSERT INTO gallery (farm_id, url, category, caption, is_primary)
     VALUES ($1,$2,$3,$4,$5)
     RETURNING *`,
    [farmId, b.url, b.category, b.caption || null, b.isPrimary]
  );
  await audit(req.user, 'create', 'gallery', rows[0].id);
  res.status(201).json(rows[0]);
}));

const patchSchema = z.object({
  url: z.string().min(1).optional(),
  category: z.string().optional(),
  caption: z.string().optional(),
  isPrimary: z.boolean().optional(),
});

router.patch('/:id', requirePermission('cow:manage'), asyncHandler(async (req, res) => {
  const b = patchSchema.parse(req.body);
  const existing = await query('SELECT farm_id FROM gallery WHERE id=$1', [req.params.id]);
  if (!existing.rows[0]) throw new HttpError(404, 'Gallery item not found');
  if (req.user!.role !== 'administrator' && existing.rows[0].farm_id !== resolveFarmId(req))
    throw new HttpError(403, 'Access denied');

  const sets: string[] = [];
  const params: any[] = [];
  let i = 1;
  const map: Record<string, string> = {
    url: 'url', category: 'category', caption: 'caption', isPrimary: 'is_primary',
  };
  for (const [k, col] of Object.entries(map)) {
    if ((b as any)[k] !== undefined) { sets.push(`${col} = $${i}`); params.push((b as any)[k]); i++; }
  }
  if (sets.length === 0) return res.json(existing.rows[0]);
  params.push(req.params.id);
  const { rows } = await query(`UPDATE gallery SET ${sets.join(', ')} WHERE id=$${i} RETURNING *`, params);
  await audit(req.user, 'update', 'gallery', req.params.id, b);
  res.json(rows[0]);
}));

router.delete('/:id', requirePermission('cow:manage'), asyncHandler(async (req, res) => {
  const existing = await query('SELECT farm_id FROM gallery WHERE id=$1', [req.params.id]);
  if (!existing.rows[0]) throw new HttpError(404, 'Gallery item not found');
  if (req.user!.role !== 'administrator' && existing.rows[0].farm_id !== resolveFarmId(req))
    throw new HttpError(403, 'Access denied');
  await query('DELETE FROM gallery WHERE id=$1', [req.params.id]);
  await audit(req.user, 'delete', 'gallery', req.params.id);
  res.status(204).end();
}));

export default router;
