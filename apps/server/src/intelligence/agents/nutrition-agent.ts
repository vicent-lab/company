import { query } from '../../db/index.js';
import { FarmKnowledgeEngine } from '../knowledge/farm-data.js';
import { type AgentResult } from './types.js';

export class NutritionAgent {
  constructor(private knowledge: FarmKnowledgeEngine) {}

  async analyze(question: string): Promise<AgentResult> {
    const [overview, feedInventory, feedConsumption] = await Promise.all([
      this.knowledge.getOverview(),
      this.knowledge.getInventoryAnalysis(),
      query(`SELECT fc.cow_id, c.cow_code, SUM(fc.quantity) AS total_qty, ft.name AS feed_name FROM feed_consumption fc JOIN cows c ON c.id=fc.cow_id JOIN feed_types ft ON ft.id=fc.feed_type_id WHERE c.farm_id=$1 AND fc.consumed_on >= CURRENT_DATE - INTERVAL '7 days' GROUP BY fc.cow_id, c.cow_code, ft.name ORDER BY total_qty DESC LIMIT 10`, [this.knowledge['farmId']]),
    ]);

    const evidence: string[] = [];
    const reasoning: string[] = [];
    const recommendedActions: string[] = [];
    const risksList: string[] = [];

    evidence.push(`Feed days remaining: ${overview.feed_days_remaining.toFixed(1)}`);
    evidence.push(`Milking cows: ${overview.milking_cows}`);
    evidence.push(`Pregnant cows: ${overview.pregnant_cows}`);
    evidence.push(`Feed types in stock: ${feedInventory.feed?.length || 0}`);
    if (feedConsumption.rows.length > 0) {
      evidence.push(`Top feed consumers: ${feedConsumption.rows.slice(0, 3).map((r: any) => `${r.cow_code} (${r.feed_name}: ${r.total_qty.toFixed(1)})`).join(', ')}`);
    }

    const dailyFeedNeed = overview.milking_cows * 25;
    const feedDays = dailyFeedNeed > 0 ? (feedInventory.feed?.reduce((sum: number, f: any) => sum + Number(f.quantity || 0), 0) || 0) / dailyFeedNeed : 999;

    if (feedDays < 3) {
      risksList.push(`CRITICAL: Feed will run out in ${feedDays.toFixed(1)} days`);
      reasoning.push('Emergency feed situation — immediate action required to prevent starvation and production loss');
      recommendedActions.push('Place emergency feed order immediately');
      recommendedActions.push('Contact multiple suppliers to ensure delivery');
      recommendedActions.push('Consider temporary ration reduction while waiting');
    } else if (feedDays < 7) {
      risksList.push(`Feed stock low: ${feedDays.toFixed(1)} days remaining`);
      reasoning.push('Feed inventory below safe threshold — order within 24-48 hours');
      recommendedActions.push('Order additional feed within 24-48 hours');
      recommendedActions.push('Review consumption patterns for wastage');
    } else {
      reasoning.push('Feed inventory is adequate for current operations');
      recommendedActions.push('Schedule next feed order within the week');
    }


    const severity = feedDays < 3 ? 'critical' : feedDays < 7 ? 'high' : 'low';
    const confidence = Math.min(0.95, 0.75 + (feedInventory.feed?.length || 0) * 0.05);

    return {
      agent: 'nutrition',
      title: `Feed inventory: ${feedDays.toFixed(1)} days remaining`,
      summary: feedDays < 7
        ? `Feed stock is at ${feedDays.toFixed(1)} days. Immediate action recommended.`
        : `Feed inventory is adequate at ${feedDays.toFixed(1)} days. Plan next order within the week.`,
      severity,
      confidence,
      evidence,
      reasoning,
      risks: risksList,
      recommended_actions: recommendedActions.length ? recommendedActions : ['Continue current feeding schedule'],
      expected_outcome: 'Maintaining adequate feed supply ensures consistent milk production and animal welfare.',
      data: { overview, feedInventory, feedConsumption: feedConsumption.rows, feedDays },
    };
  }
}
