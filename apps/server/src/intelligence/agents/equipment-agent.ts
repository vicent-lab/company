import { query } from '../../db/index.js';
import { FarmKnowledgeEngine } from '../knowledge/farm-data.js';
import { type AgentResult } from './types.js';

export class EquipmentAgent {
  constructor(private knowledge: FarmKnowledgeEngine) {}

  async analyze(question: string): Promise<AgentResult> {
    const [inventory, overdueMaintenance, upcomingMaintenance] = await Promise.all([
      this.knowledge.getInventoryAnalysis(),
      query(`SELECT count(*)::int AS overdue FROM tasks WHERE farm_id=$1 AND category='maintenance' AND status NOT IN ('completed','cancelled') AND due_date < CURRENT_DATE`, [this.knowledge['farmId']]),
      query(`SELECT count(*)::int AS upcoming FROM tasks WHERE farm_id=$1 AND category='maintenance' AND status NOT IN ('completed','cancelled') AND due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'`, [this.knowledge['farmId']]),
    ]);

    const equipment = inventory.equipment || [];
    const evidence: string[] = [];
    const reasoning: string[] = [];
    const recommendedActions: string[] = [];
    const risksList: string[] = [];

    evidence.push(`Equipment items tracked: ${equipment.length}`);
    evidence.push(`Overdue maintenance tasks: ${overdueMaintenance.rows[0]?.overdue || 0}`);
    evidence.push(`Upcoming maintenance (7 days): ${upcomingMaintenance.rows[0]?.upcoming || 0}`);

    const overdue = overdueMaintenance.rows[0]?.overdue || 0;
    if (overdue > 0) {
      risksList.push(`${overdue} overdue maintenance task(s)`);
      reasoning.push('Overdue maintenance can lead to equipment failure and production downtime');
      recommendedActions.push('Schedule overdue maintenance immediately');
      recommendedActions.push('Review maintenance schedule');
    }

    const upcoming = upcomingMaintenance.rows[0]?.upcoming || 0;
    if (upcoming > 0) {
      reasoning.push(`${upcoming} maintenance tasks due within 7 days`);
      recommendedActions.push('Plan maintenance schedule for upcoming week');
    }

    const lowStock = equipment.filter((e: any) => Number(e.quantity) < Number(e.reorder_level));
    if (lowStock.length > 0) {
      risksList.push(`${lowStock.length} equipment/item(s) below reorder level`);
      recommendedActions.push('Order low-stock items');
    }

    const severity = overdue > 3 ? 'high' : overdue > 0 ? 'medium' : lowStock.length > 0 ? 'medium' : 'low';
    const confidence = Math.min(0.9, 0.7 + equipment.length * 0.02);

    return {
      agent: 'equipment',
      title: `Equipment status: ${equipment.length} items, ${overdue} overdue maintenance`,
      summary: overdue > 0
        ? `${overdue} maintenance task(s) overdue. Schedule immediately to prevent failures.`
        : `Equipment status good. ${equipment.length} items tracked.`,
      severity,
      confidence,
      evidence,
      reasoning,
      risks: risksList,
      recommended_actions: recommendedActions.length ? recommendedActions : ['Continue routine equipment checks'],
      expected_outcome: 'Proper equipment maintenance prevents breakdowns and extends asset life.',
      data: { equipment, overdueMaintenance: overdue, upcomingMaintenance: upcoming },
    };
  }
}
