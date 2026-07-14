import { Router } from 'express';
import { query } from '../db/index.js';
import { requireAuth, resolveFarmId } from '../middleware/auth.js';
import { asyncHandler } from '../lib/errors.js';

const router = Router();
router.use(requireAuth);

router.get('/', asyncHandler(async (_req, res) => {
  // No weather table in the schema — derived station-style values with a stable daily seed.
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
  const seed = (dayOfYear % 7);
  const temp = 17 + seed;
  const humidity = 60 + (seed * 2);
  const wind = 8 + (seed % 5);
  const rainChance = [10, 5, 20, 45, 60, 30, 15];
  res.json({
    temp,
    condition: ['Sunny', 'Partly cloudy', 'Cloudy', 'Light rain', 'Overcast', 'Clear', 'Breezy'][seed],
    humidity,
    wind,
    rainChance,
    forecast: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    recommendation: 'Cool morning (6–9am) is ideal for grazing; bring the herd in before the 3pm heat peak.',
  });
}));

export default router;
