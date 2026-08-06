import { Router } from 'express';
import { query } from '../db/index.js';
import { requireAuth, resolveFarmId } from '../middleware/auth.js';
import { asyncHandler } from '../lib/errors.js';
import { generatePredictions } from '../ai/predictions.js';

const router = Router();
router.use(requireAuth);

router.get('/', asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const predictions = await generatePredictions(farmId);
  res.json({ ok: true, data: predictions });
}));

export default router;
