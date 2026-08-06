import { query } from '../../../db/index.js';

export interface NutritionInsight {
  agent: 'nutrition';
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  actions: string[];
  evidence: Record<string, any>;
  reasoning?: string[];
}

export async function runNutritionAgent(farmId: string): Promise<NutritionInsight[]> {
  const [stockRes, headRes, feedCostRes, milkRes] = await Promise.all([
    query(`SELECT COALESCE(SUM(fi.quantity),0) AS stock FROM feed_inventory fi JOIN feed_types ft ON ft.id=fi.feed_type_id WHERE ft.farm_id=$1`, [farmId]),
    query(`SELECT count(*) FILTER (WHERE is_milking AND status='active') AS milking, count(*) FILTER (WHERE is_pregnant AND status='active') AS pregnant FROM cows WHERE farm_id=$1`, [farmId]),
    query(`SELECT COALESCE(SUM(amount),0) AS cost FROM expenses WHERE farm_id=$1 AND category ILIKE '%feed%' AND incurred_on >= CURRENT_DATE - INTERVAL '30 days'`, [farmId]),
    query(`SELECT COALESCE(SUM(morning_liters+afternoon_liters+evening_liters),0) AS milk FROM milk_records WHERE farm_id=$1 AND recorded_on >= CURRENT_DATE - INTERVAL '30 days'`, [farmId]),
  ]);

  const stock = Number(stockRes.rows[0]?.stock || 0);
  const milking = Number(headRes.rows[0]?.milking || 0);
  const pregnant = Number(headRes.rows[0]?.pregnant || 0);
  const dailyNeed = milking * 25 + pregnant * 5;
  const daysOfFeed = dailyNeed > 0 ? stock / dailyNeed : 999;
  const feedCost = Number(feedCostRes.rows[0]?.cost || 0);
  const milkVolume = Number(milkRes.rows[0]?.milk || 0);
  const costPerLiter = milkVolume > 0 ? feedCost / milkVolume : 0;

  const insights: NutritionInsight[] = [];

  if (daysOfFeed < 3) {
    insights.push({
      agent: 'nutrition',
      title: `Emergency: feed stock will last only ${daysOfFeed.toFixed(1)} day(s)`,
      description: `At current consumption, feed inventory will run out in less than 3 days. Immediate action required.`,
      severity: 'critical',
      confidence: 0.95,
      actions: ['Place emergency feed order', 'Confirm supplier delivery ETA', 'Consider temporary ration reduction'],
      evidence: { stock, dailyNeed, daysOfFeed, milking, pregnant },
    });
  } else if (daysOfFeed < 7) {
    insights.push({
      agent: 'nutrition',
      title: `Feed stock low: ${daysOfFeed.toFixed(1)} days remaining`,
      description: `Feed inventory is below the 7-day threshold. Order soon to avoid disruption.`,
      severity: 'high',
      confidence: 0.9,
      actions: ['Order feed within 24-48 hours', 'Review consumption patterns'],
      evidence: { stock, dailyNeed, daysOfFeed },
    });
  } else if (daysOfFeed < 14) {
    insights.push({
      agent: 'nutrition',
      title: `Feed stock at ${daysOfFeed.toFixed(1)} days`,
      description: `Feed is adequate for now, but plan the next order within the week.`,
      severity: 'medium',
      confidence: 0.8,
      actions: ['Schedule feed order for this week'],
      evidence: { stock, dailyNeed, daysOfFeed },
    });
  }

  if (milkVolume > 0 && costPerLiter > 0.35) {
    insights.push({
      agent: 'nutrition',
      title: `Feed cost per liter elevated at $${costPerLiter.toFixed(2)}/L`,
      description: `Feed cost exceeds the $0.30/L benchmark. Audit ration composition and negotiate bulk pricing.`,
      severity: 'medium',
      confidence: 0.75,
      actions: ['Audit ration composition', 'Negotiate bulk feed pricing', 'Review feed wastage'],
      evidence: { feedCost, milkVolume, costPerLiter, benchmark: 0.30 },
    });
  }

  return insights;
}
