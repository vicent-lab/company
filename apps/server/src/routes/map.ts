import { Router } from 'express';
import { query } from '../db/index.js';
import { requireAuth, resolveFarmId } from '../middleware/auth.js';
import { asyncHandler } from '../lib/errors.js';

const router = Router();
router.use(requireAuth);

router.get('/', asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const { rows } = await query(
    `SELECT b.id, b.name, b.capacity,
            (SELECT count(*)::int FROM cows c WHERE c.barn_id=b.id AND c.status='active') AS cows
     FROM barns b WHERE b.farm_id=$1 ORDER BY b.name`, [farmId]);
  res.json({ barns: rows });
}));

export default router;
