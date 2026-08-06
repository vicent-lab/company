import { query } from '../../db/index.js';
import { FarmKnowledgeEngine } from '../knowledge/farm-data.js';
import { type AgentResult } from './types.js';

export class NutritionAgent {
  constructor(private knowledge: FarmKnowledgeEngine) {}

  async analyze(question: string): Promise<AgentResult> {
    const [overview, feedInventory, feedConsumption] = await Promise.all([
      this.knowledge.getOverview(),
      this.knowledge.getInventoryAnalysis(),
      query(`SELECT fc.cow_id, c.cow_code, SUM(fc.quantity) AS total_qty FROM feed_consumption fc JOIN cows c ON c.id=fc.cow_id WHERE c.farm_id=$1 AND fc.consumed_on >= CURRENT_DATE - INTERVAL '7 days' GROUP BY fc.cow_id, c.cow_code ORDER BY total_qty DESC LIMIT 10`, [this.knowledge['farmId']]),
    ]);

    const evidence: string[] = [];
    const reasoning: string[] = [];
    const recommendedActions: string[] = [];
    const risks: string[] = [];

    evidence.push(`Feed days remaining: ${overview.feed_days_remaining.toFixed(1)}`);
    evidence.push(`Milking cows: ${overview.milking_cows}`);
    evidence.push(`Pregnant cows: ${overview.pregnant_cows}`);
    if (feedInventory.feed?.length) {
      evidence.push(`Feed types in stock: ${feedInventory.feed.length}`);
    }

    if (overview.feed_days_remaining < 3) {
      risks.push(`CRITICAL: Feed will run out in ${overview.feed_days_remaining.toFixed(1)} days`);
      reasoning.push('Emergency feed situation — immediate action required to prevent starvation and production loss');
      recommendedActions.push('Place emergency feed order immediately');
      recommendedActions.push('Contact multiple suppliers to ensure delivery');
      recommendedActions.push('Consider temporary ration reduction while waiting');
    } else if (overview.feed_days_remaining < 7) {
      risks.push(`Feed stock low: ${overview.feed_days_remaining.toFixed(1)} days remaining`);
      reasoning.push('Feed inventory below safe threshold — order within 24-48 hours');
      recommendedActions.push('Order additional feed within 24-48 hours');
      recommendedActions.push('Review consumption patterns for wastage');
    } else {
      reasoning.push('Feed inventory is adequate for current operations');
      recommendedActions.push('Schedule next feed order within the week');
    }

    if (feedConsumption.rows.length > 0) {
      evidence.push(`Top feed consumers: ${feedConsumption.rows.slice(0, 3).map((r: any) => `${r.cow_code} (${r.total_qty.toFixed(1)} units)`).join(', ')}`);
    }

    const severity = overview.feed_days_remaining < 3 ? 'critical' : overview.feed_days_remaining < 7 ? 'high' : 'low';
    const confidence = Math.min(0.95, 0.75 + (feedInventory.feed?.length || 0) * 0.05);

    return {
      agent: 'nutrition',
      title: `Feed inventory: ${overview.feed_days_remaining.toFixed(1)} days remaining`,
      summary: overview.feed_days_remaining < 7
        ? `Feed stock is at ${overview.feed_days_remaining.toFixed(1)} days. Immediate action recommended.`
        : `Feed inventory is adequate at ${overview.feed_days_remaining.toFixed(1)} days. Plan next order within the week.`,
      severity,
      confidence,
      evidence,
      reasoning,
      risks,
      recommended_actions: recommendedActions.length ? recommendedActions : ['Continue current feeding schedule'],
      expected_outcome: 'Maintaining adequate feed supply ensures consistent milk production and animal welfare.',
      data: { overview, feedInventory, feedConsumption: feedConsumption.rows },
    };
  }
}
