import { Router } from 'express';
import { query } from '../db/index.js';
import { requireAuth, resolveFarmId } from '../middleware/auth.js';
import { asyncHandler } from '../lib/errors.js';

const router = Router();
router.use(requireAuth);

router.get('/', asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const { rows } = await query(
    `SELECT id, type, title, body, read_at, created_at FROM notifications WHERE farm_id=$1 ORDER BY created_at DESC LIMIT 50`,
    [farmId]
  );
  res.json({ data: rows, count: rows.length });
}));

router.post('/:id/read', asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  await query(`UPDATE notifications SET read_at = now() WHERE id=$1 AND farm_id=$2`, [req.params.id, farmId]);
  res.json({ ok: true });
}));

router.post('/read-all', asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  await query(`UPDATE notifications SET read_at = now() WHERE farm_id=$1 AND read_at IS NULL`, [farmId]);
  res.json({ ok: true });
}));

export default router;
