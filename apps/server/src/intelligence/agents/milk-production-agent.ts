import { query } from '../../db/index.js';
import { FarmKnowledgeEngine } from '../knowledge/farm-data.js';
import { type AgentResult } from './types.js';

export class MilkProductionAgent {
  constructor(private knowledge: FarmKnowledgeEngine) {}

  async analyze(question: string): Promise<AgentResult> {
    const [milkAnalysis, overview] = await Promise.all([
      this.knowledge.getMilkAnalysis(),
      this.knowledge.getOverview(),
    ]);

    const evidence: string[] = [];
    const reasoning: string[] = [];
    const recommendedActions: string[] = [];
    const risks: string[] = [];

    evidence.push(`Today's milk: ${overview.today_milk_liters.toFixed(1)} L`);
    evidence.push(`This week: ${overview.week_milk_liters.toFixed(1)} L`);
    evidence.push(`This month: ${overview.month_milk_liters.toFixed(1)} L`);
    evidence.push(`Top producers: ${milkAnalysis.topProducers?.length || 0}`);
    evidence.push(`Declining cows: ${milkAnalysis.decliningCows?.length || 0}`);

    if (milkAnalysis.decliningCows?.length > 0) {
      risks.push(`${milkAnalysis.decliningCows.length} cow(s) showing declining production`);
      reasoning.push('Declining milk production can indicate health issues, nutrition problems, or stress');
      recommendedActions.push('Examine declining cows for health issues');
      recommendedActions.push('Review feeding routine and ration');
      recommendedActions.push('Check for heat stress or environmental factors');
    }

    if (milkAnalysis.topProducers?.length > 0) {
      reasoning.push(`Top performer: ${milkAnalysis.topProducers[0].cow_code} with ${Number(milkAnalysis.topProducers[0].total_liters).toFixed(0)} L in 30 days`);
    }

    if (overview.today_milk_liters === 0 && overview.milking_cows > 0) {
      risks.push('No milk recorded today despite having milking cows');
      reasoning.push('This may indicate data recording issues or actual production problems');
      recommendedActions.push('Verify milk recording process');
      recommendedActions.push('Check milking equipment and routine');
    }

    const severity = milkAnalysis.decliningCows?.length > 3 ? 'high' : milkAnalysis.decliningCows?.length > 0 ? 'medium' : 'low';
    const confidence = Math.min(0.95, 0.8 + (milkAnalysis.topProducers?.length || 0) * 0.03);

    return {
      agent: 'milk_production',
      title: `Milk production analysis`,
      summary: milkAnalysis.decliningCows?.length > 0
        ? `${milkAnalysis.decliningCows.length} cow(s) showing declining production. Immediate review recommended.`
        : `Milk production is stable. ${overview.milking_cows} milking cows averaging ${overview.today_milk_liters.toFixed(1)} L today.`,
      severity,
      confidence,
      evidence,
      reasoning,
      risks,
      recommended_actions: recommendedActions.length ? recommendedActions : ['Continue current milking routine and monitoring'],
      expected_outcome: 'Maintaining stable milk production requires consistent nutrition, health monitoring, and proper milking management.',
      data: { milkAnalysis, overview },
    };
  }
}
