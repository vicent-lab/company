import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/index.js';
import { requireAuth, requirePermission, resolveFarmId, audit } from '../middleware/auth.js';
import { HttpError, asyncHandler } from '../lib/errors.js';
import { getWeatherForPeriod } from '../ai/weather-station.js';
import { generatePredictions, MilkProductionPrediction } from '../ai/predictions.js';

const router = Router();
router.use(requireAuth);

export const ZONES = ['office', 'milk', 'barnA', 'barnB', 'feed', 'water', 'shed', 'vet', 'graze1', 'graze2'] as const;
export const ACTIVITIES = ['eating', 'grazing', 'milking', 'resting', 'moving', 'sick_bay'] as const;

// Pastures ventilate themselves; enclosed buildings don't, so humidity-driven respiratory
// risk and heat exposure only get flagged for the zones where that's actually true.
const OUTDOOR_ZONES = new Set(['graze1', 'graze2']);

export interface ZoneRecommendation { severity: 'warning' | 'critical'; title: string; body: string; }

function computeZoneRecommendations(
  zone: string,
  cowCount: number,
  health: { category: string; sickCount: number; attentionCount: number },
  milk: { category: string },
  feed: { daysRemaining: number | null },
  weatherObs: { humidityPct: number; heatStress: string; coldStress: string }
): ZoneRecommendation[] {
  if (cowCount === 0) return [];
  const indoor = !OUTDOOR_ZONES.has(zone);
  const recs: ZoneRecommendation[] = [];

  if (indoor && weatherObs.humidityPct > 75) {
    recs.push({
      severity: 'warning',
      title: 'Humidity is high',
      body: 'Open ventilation. Risk of respiratory disease increased.',
    });
  }
  if (health.category === 'disease_cluster') {
    recs.push({
      severity: 'critical',
      title: `${health.sickCount + health.attentionCount} of ${cowCount} cows sick or under treatment`,
      body: 'Isolate affected animals and schedule a vet review. Risk of spread to the rest of the herd here.',
    });
  }
  if (feed.daysRemaining !== null && feed.daysRemaining < 3) {
    recs.push({
      severity: 'critical',
      title: 'Feed running low for this zone',
      body: `Only ${feed.daysRemaining} day(s) of feed left at current stock and consumption. Reorder soon to avoid ration cuts.`,
    });
  }
  if (milk.category === 'low') {
    recs.push({
      severity: 'warning',
      title: 'Milk yield below herd average',
      body: 'Check feed, water access, and heat exposure for cows in this zone.',
    });
  }
  if (!indoor && weatherObs.heatStress !== 'none') {
    recs.push({
      severity: weatherObs.heatStress === 'severe' ? 'critical' : 'warning',
      title: "Cows are fully exposed to today's heat",
      body: 'Move the grazing herd to a shaded barn. Heat-stressed cows eat less and produce less milk for days.',
    });
  }
  if (!indoor && weatherObs.coldStress !== 'none') {
    recs.push({
      severity: weatherObs.coldStress === 'severe' ? 'critical' : 'warning',
      title: 'Cows are fully exposed to today\'s cold',
      body: 'Move the grazing herd into a sheltered barn and increase ration energy density.',
    });
  }
  return recs;
}

function deriveStatus(row: any) {
  if (row.health === 'sick') return 'sick';
  if (row.health === 'under_treatment') return 'attention';
  if (row.is_pregnant) return 'pregnant';
  if (row.recent_heat) return 'breeding';
  return 'healthy';
}

function dayDiff(from: Date, to: Date): number {
  return Math.round((to.setHours(0, 0, 0, 0) - from.setHours(0, 0, 0, 0)) / 86400000);
}

export type CalvingRisk = 'none' | 'watch' | 'high';

router.get('/', asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const { rows } = await query(
    `SELECT c.id as cow_id, c.cow_code, c.name, c.breed, c.health, c.is_pregnant, c.is_milking, c.barn_id,
            cl.zone, cl.activity, cl.source, cl.latitude, cl.longitude, cl.updated_at,
            COALESCE(m.today_liters, 0) as today_liters,
            (h.id IS NOT NULL) as recent_heat,
            bp.expected_calving_on,
            cr.calving_date as last_calving_on, cr.difficulty_score as last_difficulty_score
     FROM cows c
     LEFT JOIN cow_locations cl ON cl.cow_id = c.id
     LEFT JOIN LATERAL (
       SELECT (morning_liters + afternoon_liters + evening_liters) as today_liters
       FROM milk_records WHERE cow_id = c.id ORDER BY recorded_on DESC LIMIT 1
     ) m ON true
     LEFT JOIN LATERAL (
       SELECT id FROM heat_detections
       WHERE cow_id = c.id AND detected_on > now() - interval '3 days' AND confidence >= 0.6
       ORDER BY detected_on DESC LIMIT 1
     ) h ON true
     LEFT JOIN LATERAL (
       SELECT expected_calving_on FROM breeding_records
       WHERE cow_id = c.id AND result = 'Pregnant' AND expected_calving_on IS NOT NULL
       ORDER BY expected_calving_on DESC LIMIT 1
     ) bp ON true
     LEFT JOIN LATERAL (
       SELECT calving_date, difficulty_score FROM calving_records
       WHERE cow_id = c.id ORDER BY calving_date DESC LIMIT 1
     ) cr ON true
     WHERE c.farm_id = $1 AND c.status = 'active'
     ORDER BY c.cow_code`,
    [farmId]
  );
  const today = new Date();
  const data = rows.map((r) => {
    const daysUntilDue = r.expected_calving_on ? dayDiff(new Date(today), new Date(r.expected_calving_on)) : null;
    const daysSinceCalving = r.last_calving_on ? dayDiff(new Date(r.last_calving_on), new Date(today)) : null;
    const recentlyCalved = daysSinceCalving !== null && daysSinceCalving >= 0 && daysSinceCalving <= 14;

    let calvingRisk: CalvingRisk = 'none';
    if (r.is_pregnant) {
      const overdue = daysUntilDue !== null && daysUntilDue < 0;
      const dueSoon = daysUntilDue !== null && daysUntilDue >= 0 && daysUntilDue <= 3;
      const healthFlag = r.health !== 'healthy';
      const historyFlag = r.last_difficulty_score !== null && r.last_difficulty_score >= 4;
      if (overdue || (dueSoon && (healthFlag || historyFlag))) calvingRisk = 'high';
      else if (dueSoon || healthFlag || historyFlag) calvingRisk = 'watch';
    }

    return {
      cowId: r.cow_id,
      cowCode: r.cow_code,
      name: r.name,
      breed: r.breed,
      health: r.health,
      isPregnant: r.is_pregnant,
      isMilking: r.is_milking,
      zone: r.zone || 'barnA',
      activity: r.activity || 'resting',
      source: r.source || 'manual',
      latitude: r.latitude !== null ? Number(r.latitude) : null,
      longitude: r.longitude !== null ? Number(r.longitude) : null,
      updatedAt: r.updated_at,
      milkToday: Number(r.today_liters) || 0,
      status: deriveStatus(r),
      expectedCalvingOn: r.expected_calving_on || null,
      daysUntilDue,
      lastCalvingOn: r.last_calving_on || null,
      daysSinceCalving,
      lastDifficultyScore: r.last_difficulty_score !== null ? r.last_difficulty_score : null,
      recentlyCalved,
      calvingRisk,
    };
  });
  res.json({ data, count: data.length, zones: ZONES, activities: ACTIVITIES });
}));

// Typical daily dry-matter+concentrate intake for an adult dairy cow, used only as the
// denominator for the feed heat map's "% of expected intake consumed" score.
const FEED_TARGET_KG_PER_COW = 25;

export const PERIODS = ['today', 'yesterday', 'week', 'month', 'forecast'] as const;
export type Period = (typeof PERIODS)[number];

// Cow *positions* have no history (cow_locations is overwritten on every move), so every
// period groups by TODAY's zone assignment — only the milk/feed/health numbers underneath
// actually vary by period. milk_records and feed_consumption both carry 30 real days of
// per-cow history; health has none, so past periods fall back to dated treatment records
// (a genuinely different but honestly-computed metric: "diagnoses logged," not "was sick").
function periodRange(period: Period): { fromOffset: number; toOffset: number; days: number } {
  switch (period) {
    case 'yesterday': return { fromOffset: 1, toOffset: 1, days: 1 };
    case 'week': return { fromOffset: 6, toOffset: 0, days: 7 };
    case 'month': return { fromOffset: 29, toOffset: 0, days: 30 };
    default: return { fromOffset: 0, toOffset: 0, days: 1 }; // today & forecast both base off today's raw numbers
  }
}

router.get('/heatmap', asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const period = (PERIODS as readonly string[]).includes(String(req.query.period)) ? (req.query.period as Period) : 'today';
  const { fromOffset, toOffset, days } = periodRange(period);

  const { rows } = await query(
    `SELECT cl.zone,
            count(*)::int as cow_count,
            count(*) FILTER (WHERE c.is_milking)::int as milking_count,
            avg(m.period_liters) FILTER (WHERE c.is_milking) as avg_milk_per_cow,
            sum(m.period_liters) FILTER (WHERE c.is_milking) as total_milk_period,
            avg(fc.period_kg) as avg_feed_per_cow
     FROM cows c
     JOIN cow_locations cl ON cl.cow_id = c.id
     LEFT JOIN LATERAL (
       SELECT sum(morning_liters + afternoon_liters + evening_liters) / $4::numeric as period_liters
       FROM milk_records WHERE cow_id = c.id AND recorded_on BETWEEN current_date - $2::int AND current_date - $3::int
     ) m ON true
     LEFT JOIN LATERAL (
       SELECT sum(quantity) / $4::numeric as period_kg FROM feed_consumption
       WHERE cow_id = c.id AND consumed_on BETWEEN current_date - $2::int AND current_date - $3::int
     ) fc ON true
     WHERE c.farm_id = $1 AND c.status = 'active'
     GROUP BY cl.zone`,
    [farmId, fromOffset, toOffset, days]
  );

  const { rows: herdRows } = await query(
    `SELECT avg(m.period_liters) as herd_avg_milk
     FROM cows c
     LEFT JOIN LATERAL (
       SELECT sum(morning_liters + afternoon_liters + evening_liters) / $4::numeric as period_liters
       FROM milk_records WHERE cow_id = c.id AND recorded_on BETWEEN current_date - $2::int AND current_date - $3::int
     ) m ON true
     WHERE c.farm_id = $1 AND c.status = 'active' AND c.is_milking`,
    [farmId, fromOffset, toOffset, days]
  );
  const herdAvgMilk = Number(herdRows[0]?.herd_avg_milk) || 0;

  // Health has no historical snapshot table — 'today' reads live cows.health; every other
  // period reads how many cows in that zone had a treatment logged in the window instead.
  const healthByZone: Record<string, { healthyCount: number; sickCount: number; attentionCount: number }> = {};
  if (period === 'today') {
    const { rows: healthRows } = await query(
      `SELECT cl.zone,
              count(*) FILTER (WHERE c.health = 'healthy')::int as healthy_count,
              count(*) FILTER (WHERE c.health = 'sick')::int as sick_count,
              count(*) FILTER (WHERE c.health = 'under_treatment')::int as attention_count
       FROM cows c JOIN cow_locations cl ON cl.cow_id = c.id
       WHERE c.farm_id = $1 AND c.status = 'active' GROUP BY cl.zone`,
      [farmId]
    );
    for (const r of healthRows) healthByZone[r.zone] = { healthyCount: r.healthy_count, sickCount: r.sick_count, attentionCount: 0 };
  } else if (period !== 'forecast') {
    const { rows: healthRows } = await query(
      `SELECT cl.zone,
              count(*)::int as cow_count,
              count(DISTINCT t.cow_id)::int as diagnosed_count
       FROM cows c JOIN cow_locations cl ON cl.cow_id = c.id
       LEFT JOIN treatments t ON t.cow_id = c.id AND t.diagnosed_on BETWEEN current_date - $2::int AND current_date - $3::int
       WHERE c.farm_id = $1 AND c.status = 'active' GROUP BY cl.zone`,
      [farmId, fromOffset, toOffset]
    );
    for (const r of healthRows) healthByZone[r.zone] = { healthyCount: r.cow_count - r.diagnosed_count, sickCount: r.diagnosed_count, attentionCount: 0 };
  }

  // Feed isn't tracked per-barn — there's one shared store for the whole farm — so "days
  // left" here answers "how long would today's farm-wide stock last if only this zone's
  // cows were eating from it," using each zone's own measured consumption rate.
  const { rows: stockRows } = await query(
    `SELECT COALESCE(SUM(fi.quantity), 0) as stock_kg FROM feed_inventory fi JOIN feed_types ft ON ft.id = fi.feed_type_id WHERE ft.farm_id = $1`,
    [farmId]
  );
  const farmFeedStockKg = Number(stockRows[0]?.stock_kg) || 0;

  const weatherObs = await getWeatherForPeriod(farmId, period);

  // The milk forecast reuses the reasoning engine's real 14-day trend regression — the
  // *only* period that projects forward from an actual model rather than a lookback.
  let milkChangePct = 0;
  if (period === 'forecast') {
    const predictions = await generatePredictions(farmId);
    const milkPrediction = predictions.find((p) => p.category === 'milk_production') as MilkProductionPrediction | undefined;
    milkChangePct = milkPrediction?.changePct ?? 0;
  }

  const data = rows.map((r) => {
    const cowCount = r.cow_count as number;
    const h = healthByZone[r.zone] || { healthyCount: 0, sickCount: 0, attentionCount: 0 };
    const sickPct = cowCount ? h.sickCount / cowCount : 0;
    const attentionPct = cowCount ? h.attentionCount / cowCount : 0;
    const healthCategory: 'healthy' | 'warning' | 'disease_cluster' | 'unknown' =
      period === 'forecast' ? 'unknown' : sickPct >= 0.25 ? 'disease_cluster' : sickPct > 0 || attentionPct >= 0.15 ? 'warning' : 'healthy';

    let avgMilk = r.avg_milk_per_cow !== null ? Number(r.avg_milk_per_cow) : null;
    let totalMilk = r.total_milk_period !== null ? Number(r.total_milk_period) : null;
    if (period === 'forecast' && avgMilk !== null) {
      const scale = 1 + milkChangePct / 100;
      avgMilk *= scale;
      totalMilk = totalMilk !== null ? totalMilk * scale : null;
    }
    let milkCategory: 'high' | 'average' | 'low' | 'none' = 'none';
    if (avgMilk !== null && herdAvgMilk > 0) {
      const ratio = avgMilk / (herdAvgMilk * (period === 'forecast' ? 1 + milkChangePct / 100 : 1));
      milkCategory = ratio >= 1.1 ? 'high' : ratio >= 0.85 ? 'average' : 'low';
    }

    const avgFeed = period === 'forecast' ? null : r.avg_feed_per_cow !== null ? Number(r.avg_feed_per_cow) : null;
    const feedPct = avgFeed !== null ? Math.min(100, Math.round((avgFeed / FEED_TARGET_KG_PER_COW) * 100)) : null;
    const zoneDailyKg = avgFeed !== null ? avgFeed * cowCount : 0;
    const daysRemaining = zoneDailyKg > 0 ? Math.round((farmFeedStockKg / zoneDailyKg) * 10) / 10 : null;

    const health = { healthyCount: h.healthyCount, sickCount: h.sickCount, attentionCount: h.attentionCount, category: healthCategory };
    const milk = { avgPerCow: avgMilk !== null ? +avgMilk.toFixed(1) : null, totalToday: totalMilk !== null ? +totalMilk.toFixed(1) : null, category: milkCategory };
    const feed = { avgKgPerCow: avgFeed !== null ? +avgFeed.toFixed(1) : null, targetKg: FEED_TARGET_KG_PER_COW, pct: feedPct, daysRemaining };

    return {
      zone: r.zone,
      cowCount,
      health,
      milk,
      feed,
      // Recommendations are "act now" advice — only meaningful for the live view, so past
      // and forecast periods don't tell a farmer to act on speculative or stale conditions.
      recommendations: period === 'today' ? computeZoneRecommendations(r.zone, cowCount, health, milk, feed, weatherObs) : [],
    };
  });

  res.json({ data, herdAvgMilk: +herdAvgMilk.toFixed(1), farmFeedStockKg, zones: ZONES, period });
}));

const moveSchema = z.object({
  cowId: z.string().min(1),
  zone: z.enum(ZONES),
  activity: z.enum(ACTIVITIES).default('resting'),
});

router.post('/', requirePermission('cow:manage'), asyncHandler(async (req, res) => {
  const b = moveSchema.parse(req.body);
  const farmId = resolveFarmId(req);
  const cow = await query('SELECT id, farm_id FROM cows WHERE id=$1', [b.cowId]);
  if (!cow.rows[0]) throw new HttpError(404, 'Cow not found');
  if (cow.rows[0].farm_id !== farmId) throw new HttpError(403, 'Access denied');
  const { rows } = await query(
    `INSERT INTO cow_locations (farm_id, cow_id, zone, activity, source, updated_at)
     VALUES ($1,$2,$3,$4,'manual',now())
     ON CONFLICT (cow_id) DO UPDATE SET zone=EXCLUDED.zone, activity=EXCLUDED.activity, source='manual', updated_at=now()
     RETURNING *`,
    [farmId, b.cowId, b.zone, b.activity]
  );
  await audit(req.user, 'update', 'cow_location', rows[0].id, { zone: b.zone, activity: b.activity });
  res.json(rows[0]);
}));

export default router;
