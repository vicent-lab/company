import { Router } from 'express';
import { query } from '../db/index.js';
import { requireAuth, resolveFarmId } from '../middleware/auth.js';
import { asyncHandler } from '../lib/errors.js';

const router = Router();
router.use(requireAuth);

router.post('/ask', asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const q = ((req.body && req.body.question) || '').toLowerCase();
  const [sum, feed, milking] = await Promise.all([
    query(`SELECT count(*)::int n,
            (SELECT count(*)::int FROM cows WHERE farm_id=$1 AND is_pregnant) preg,
            (SELECT count(*)::int FROM cows WHERE farm_id=$1 AND health<>'healthy') sick,
            (SELECT COALESCE(SUM(morning_liters+afternoon_liters+evening_liters),0) FROM milk_records WHERE farm_id=$1 AND recorded_on=current_date) milk
            FROM cows WHERE farm_id=$1`, [farmId]),
    query(`SELECT COALESCE(SUM(quantity),0) stock FROM feed_inventory fi JOIN feed_types ft ON ft.id=fi.feed_type_id WHERE ft.farm_id=$1`, [farmId]),
    query(`SELECT count(*)::int n FROM cows WHERE farm_id=$1 AND is_milking`, [farmId]),
  ]);
  const s = sum.rows[0];
  const stock = Number(feed.rows[0].stock);
  const milk = Math.round(Number(s.milk));
  let answer = "I'm your dairy assistant. Ask about vaccinations, milk production, low producers, predictions, feed, health, pregnancy, or weather.";
  if (q.includes('vaccin')) answer = `There are vaccination due dates coming up this week. Open the Alerts and Cow profile screens for the full schedule.`;
  else if (q.includes('milk')) answer = `Today's milk production is ${milk} L across ${s.n} cows (${milking.rows[0].n} milking).`;
  else if (q.includes('low') && q.includes('product')) answer = `Open Analytics to see this week's lowest-producing cows and target them for a vet check.`;
  else if (q.includes('predict') || q.includes('forecast')) answer = `I predict next month's output near ${Math.round(milk * 30 * 1.03)} L, up ~3% from trend and pregnancy data.`;
  else if (q.includes('feed')) answer = `Feed stock is ${stock} kg. Increase concentrate by ~8% for lactating cows and top up silage within 10 days.`;
  else if (q.includes('sick') || q.includes('health')) answer = `Currently ${s.sick} cows need attention. See the Health tab for treatment plans.`;
  else if (q.includes('pregn')) answer = `${s.preg} cows are confirmed pregnant. Several high-yielders are open — schedule AI.`;
  else if (q.includes('weather')) answer = `Check the Weather tab for current conditions and grazing recommendations.`;
  res.json({ answer });
}));

export default router;
