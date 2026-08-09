import { query } from '../../db/index.js';
import { FarmKnowledgeEngine } from '../knowledge/farm-data.js';
import { type AgentResult } from './types.js';

export class InventoryAgent {
  constructor(private knowledge: FarmKnowledgeEngine) {}

  async analyze(question: string): Promise<AgentResult> {
    const [inventory, feedConsumption, medicineUsage] = await Promise.all([
      this.knowledge.getInventoryAnalysis(),
      query(`SELECT SUM(quantity) AS total_consumed_7d FROM feed_consumption fc JOIN cows c ON c.id=fc.cow_id WHERE c.farm_id=$1 AND fc.consumed_on >= CURRENT_DATE - INTERVAL '7 days'`, [this.knowledge['farmId']]),
      query(`SELECT COUNT(*) AS treatments_last_30d FROM treatments t JOIN cows c ON c.id=t.cow_id WHERE c.farm_id=$1 AND t.diagnosed_on >= CURRENT_DATE - INTERVAL '30 days'`, [this.knowledge['farmId']]),
    ]);

    const evidence: string[] = [];
    const reasoning: string[] = [];
    const recommendedActions: string[] = [];
    const risksList: string[] = [];

    evidence.push(`Feed types in stock: ${inventory.feed?.length || 0}`);
    evidence.push(`Medicines in stock: ${inventory.medicines?.length || 0}`);
    evidence.push(`General inventory items: ${inventory.equipment?.length || 0}`);
    evidence.push(`Feed consumed last 7 days: ${Number(feedConsumption.rows[0]?.total_consumed_7d || 0).toFixed(1)}`);
    evidence.push(`Treatments last 30 days: ${medicineUsage.rows[0]?.treatments_last_30d || 0}`);

    const expiringMedicines = (inventory.medicines || []).filter((m: any) => m.expiry_date && new Date(m.expiry_date) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));
    if (expiringMedicines.length > 0) {
      risksList.push(`${expiringMedicines.length} medicine(s) expiring within 30 days`);
      reasoning.push('Expired medicines lose effectiveness and may be unsafe');
      recommendedActions.push('Use expiring medicines first (FIFO)');
      recommendedActions.push('Order replacements for expired stock');
    }

    const lowFeed = (inventory.feed || []).filter((f: any) => Number(f.quantity) < 100);
    if (lowFeed.length > 0) {
      risksList.push(`${lowFeed.length} feed type(s) with low stock`);
      recommendedActions.push('Order low-stock feed types');
    }

    const severity = expiringMedicines.length > 2 ? 'high' : expiringMedicines.length > 0 ? 'medium' : lowFeed.length > 0 ? 'medium' : 'low';
    const confidence = Math.min(0.95, 0.75 + (inventory.feed?.length || 0) * 0.03);

    return {
      agent: 'inventory',
      title: `Inventory status: ${inventory.feed?.length || 0} feeds, ${inventory.medicines?.length || 0} medicines`,
      summary: expiringMedicines.length > 0
        ? `${expiringMedicines.length} medicine(s) expiring soon. Review inventory.`
        : `Inventory levels adequate. ${inventory.feed?.length || 0} feed types, ${inventory.medicines?.length || 0} medicines in stock.`,
      severity,
      confidence,
      evidence,
      reasoning,
      risks: risksList,
      recommended_actions: recommendedActions.length ? recommendedActions : ['Continue routine inventory monitoring'],
      expected_outcome: 'Proper inventory management prevents stockouts and ensures medication efficacy.',
      data: inventory,
    };
  }
}
