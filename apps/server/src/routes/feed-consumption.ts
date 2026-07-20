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
    `SELECT fc.id, fc.cow_id, c.cow_code, c.name AS cow_name, fc.feed_type_id, ft.name AS feed_type_name,
            fc.consumed_on, fc.quantity
     FROM feed_consumption fc
     LEFT JOIN cows c ON c.id=fc.cow_id
     LEFT JOIN feed_types ft ON ft.id=fc.feed_type_id
     WHERE c.farm_id=$1 ORDER BY fc.consumed_on DESC LIMIT 100`,
    [farmId]
  );
  res.json({ data: rows, count: rows.length });
}));

const createSchema = z.object({
  cowId: z.string().optional(),
  feedTypeId: z.string().min(1),
  consumedOn: z.string(),
  quantity: z.number().min(0),
});

router.post('/', requirePermission('cow:manage'), asyncHandler(async (req, res) => {
  const b = createSchema.parse(req.body);
  let feedTypeId = b.feedTypeId;
  if (!feedTypeId) throw new HttpError(400, 'feedTypeId is required');
  if (feedTypeId.length !== 36 || !feedTypeId.includes('-')) {
    const found = await query('SELECT id FROM feed_types WHERE name ILIKE $1 LIMIT 1', [feedTypeId]);
    if (!found.rows[0]) throw new HttpError(404, 'Feed type not found');
    feedTypeId = found.rows[0].id;
  }
  const { rows } = await query(
    `INSERT INTO feed_consumption (cow_id, feed_type_id, consumed_on, quantity)
     VALUES ($1,$2,$3,$4)
     RETURNING *`,
    [b.cowId ?? null, feedTypeId, b.consumedOn, b.quantity]
  );
  await audit(req.user, 'create', 'feed_consumption', rows[0].id);
  res.status(201).json(rows[0]);
}));

const patchSchema = createSchema.partial();
router.patch('/:id', requirePermission('cow:manage'), asyncHandler(async (req, res) => {
  const b = patchSchema.parse(req.body);
  const existing = await query('SELECT cow_id FROM feed_consumption WHERE id=$1', [req.params.id]);
  if (!existing.rows[0]) throw new HttpError(404, 'Feed consumption record not found');
  const cow = await query('SELECT farm_id FROM cows WHERE id=$1', [existing.rows[0].cow_id]);
  if (!cow.rows[0]) throw new HttpError(404, 'Cow not found');
  if (req.user!.role !== 'administrator' && cow.rows[0].farm_id !== req.user!.farmId)
    throw new HttpError(403, 'Access denied');
  const sets: string[] = [];
  const params: any[] = [];
  let i = 1;
  const map: Record<string, string> = {
    cowId: 'cow_id', feedTypeId: 'feed_type_id', consumedOn: 'consumed_on', quantity: 'quantity',
  };
  for (const [k, col] of Object.entries(map)) {
    if ((b as any)[k] !== undefined) {
      let val = (b as any)[k];
      if (k === 'feedTypeId' && val && (val.length !== 36 || !val.includes('-'))) {
        const found = await query('SELECT id FROM feed_types WHERE name ILIKE $1 LIMIT 1', [val]);
        if (!found.rows[0]) throw new HttpError(404, 'Feed type not found');
        val = found.rows[0].id;
      }
      sets.push(`${col} = $${i}`);
      params.push(val);
      i++;
    }
  }
  sets.push('updated_at = now()');
  params.push(req.params.id);
  const { rows } = await query(`UPDATE feed_consumption SET ${sets.join(', ')} WHERE id=$${i} RETURNING *`, params);
  await audit(req.user, 'update', 'feed_consumption', req.params.id, b);
  res.json(rows[0]);
}));

router.delete('/:id', requirePermission('cow:manage'), asyncHandler(async (req, res) => {
  const existing = await query('SELECT cow_id FROM feed_consumption WHERE id=$1', [req.params.id]);
  if (!existing.rows[0]) throw new HttpError(404, 'Feed consumption record not found');
  const cow = await query('SELECT farm_id FROM cows WHERE id=$1', [existing.rows[0].cow_id]);
  if (!cow.rows[0]) throw new HttpError(404, 'Cow not found');
  if (req.user!.role !== 'administrator' && cow.rows[0].farm_id !== req.user!.farmId)
    throw new HttpError(403, 'Access denied');
  await query('DELETE FROM feed_consumption WHERE id=$1', [req.params.id]);
  await audit(req.user, 'delete', 'feed_consumption', req.params.id);
  res.status(204).end();
}));

export default router;
