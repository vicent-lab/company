import { Router } from 'express';
import { requireAuth, resolveFarmId } from '../middleware/auth.js';
import { asyncHandler } from '../lib/errors.js';
import { snapshotFarmScore, getFarmScoreHistory } from '../ai/farm-score.js';

const router = Router();
router.use(requireAuth);

// Computes today's farm score fresh and upserts the daily snapshot, so "today" in the
// history always matches what's displayed right now.
router.get('/', asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const data = await snapshotFarmScore(farmId);
  res.json({ data });
}));

router.get('/history', asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const days = Math.min(Number(req.query.days) || 30, 365);
  const data = await getFarmScoreHistory(farmId, days);
  res.json({ data });
}));

export default router;
