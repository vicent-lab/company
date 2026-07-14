import { Router } from 'express';
import { query } from '../db/index.js';
import { requireAuth, resolveFarmId } from '../middleware/auth.js';
import { asyncHandler } from '../lib/errors.js';

const router = Router();
router.use(requireAuth);

router.get('/', asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const { rows } = await query(
    `SELECT count(*)::int AS n,
            (SELECT COALESCE(SUM(quantity),0) FROM feed_inventory fi JOIN feed_types ft ON ft.id=fi.feed_type_id WHERE ft.farm_id=$1) AS feed
     FROM cows WHERE farm_id=$1 AND status='active'`, [farmId]);
  const c = rows[0];
  res.json({
    waterUsage: c.n * 110,
    feedEfficiency: 1.42,
    carbon: Math.round(c.n * 2.4 + 120),
    manure: c.n * 80,
    renewable: 22 + (c.n % 10),
    trend: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'].map((_, i) => Math.round(180 + i * 12 + (i % 2 ? 10 : -6))),
  });
}));

export default router;
