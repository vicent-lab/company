import { query } from '../../db/index.js';
import { FarmKnowledgeEngine } from '../knowledge/farm-data.js';
import { type AgentResult } from './types.js';

export class EquipmentAgent {
  constructor(private knowledge: FarmKnowledgeEngine) {}

  async analyze(question: string): Promise<AgentResult> {
    const [inventory, tasks] = await Promise.all([
      this.knowledge.getInventoryAnalysis(),
      query(`SELECT count(*)::int AS overdue FROM tasks WHERE farm_id=$1 AND category='maintenance' AND status NOT IN ('completed','cancelled') AND due_date < CURRENT_DATE`, [this.knowledge['farmId']]),
    ]);

    const equipment = inventory.equipment || [];
    const evidence: string[] = [];
    const reasoning: string[] = [];
    const recommendedActions: string[] = [];
    const risks: string[] = [];

    evidence.push(`Equipment items tracked: ${equipment.length}`);
    evidence.push(`Overdue maintenance tasks: ${tasks.rows[0]?.overdue || 0}`);

    const overdue = tasks.rows[0]?.overdue || 0;
    if (overdue > 0) {
      risks.push(`${overdue} overdue maintenance task(s)`);
      reasoning.push('Overdue maintenance can lead to equipment failure and production downtime');
      recommendedActions.push('Schedule overdue maintenance immediately');
      recommendedActions.push('Review maintenance schedule');
    }

    const lowStock = equipment.filter((e: any) => e.quantity < e.reorder_level);
    if (lowStock.length > 0) {
      risks.push(`${lowStock.length} equipment/item(s) below reorder level`);
      recommendedActions.push('Order low-stock items');
    }

    const severity = overdue > 3 ? 'high' : overdue > 0 ? 'medium' : 'low';
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
      risks,
      recommended_actions: recommendedActions.length ? recommendedActions : ['Continue routine equipment checks'],
      expected_outcome: 'Proper equipment maintenance prevents breakdowns and extends asset life.',
      data: { equipment, overdueMaintenance: overdue },
    };
  }
}
