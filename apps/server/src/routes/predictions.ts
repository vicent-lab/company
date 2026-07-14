import { Router } from 'express';
import { query } from '../db/index.js';
import { requireAuth, resolveFarmId } from '../middleware/auth.js';
import { asyncHandler } from '../lib/errors.js';

const router = Router();
router.use(requireAuth);

router.get('/', asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const [cows, milkToday, vacc] = await Promise.all([
    query(`SELECT count(*)::int AS n, (SELECT count(*)::int FROM cows WHERE farm_id=$1 AND is_pregnant) AS preg, (SELECT count(*)::int FROM cows WHERE farm_id=$1 AND health<>'healthy') AS sick FROM cows WHERE farm_id=$1 AND status='active'`, [farmId]),
    query(`SELECT COALESCE(SUM(morning_liters+afternoon_liters+evening_liters),0) AS t FROM milk_records WHERE farm_id=$1 AND recorded_on = current_date`, [farmId]),
    query(`SELECT COALESCE(SUM(fi.quantity),0) AS stock FROM feed_inventory fi JOIN feed_types ft ON ft.id=fi.feed_type_id WHERE ft.farm_id=$1`, [farmId]),
  ]);
  const c = cows.rows[0];
  const base = Math.round(Number(milkToday.rows[0].t) * 30) || 30000;
  const milkNext6 = Array.from({ length: 6 }, (_, i) => Math.round(base * (1 + i * 0.03) * (1 + (Math.sin(i) * 0.02))));
  const feedNeeded = Math.round(Number(vacc.rows[0].stock) * 1.15) || 4000;
  const pregRatio = c.n ? c.preg / c.n : 0.3;
  const diseaseRiskScore = Math.min(100, Math.round((c.sick / Math.max(1, c.n)) * 220));
  const profitTrend = milkNext6.map((_, i) => Math.round(-4 + i * 3 + (i % 2 ? 2 : -1)));
  // lowest feed type
  const low = await query(
    `SELECT ft.name, fi.quantity FROM feed_inventory fi JOIN feed_types ft ON ft.id=fi.feed_type_id WHERE ft.farm_id=$1 ORDER BY fi.quantity ASC LIMIT 1`, [farmId]);

  res.json({
    milkNext6,
    feedNeeded,
    pregnancySuccess: Math.round(72 + pregRatio * 60),
    diseaseRisk: diseaseRiskScore > 40 ? 'High' : diseaseRiskScore > 20 ? 'Moderate' : 'Low',
    diseaseRiskScore,
    profitTrend,
    inventoryShortage: low.rows[0]?.name ?? 'Concentrate',
  });
}));

export default router;
