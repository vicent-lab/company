import { query } from '../../db/index.js';
import { FarmKnowledgeEngine } from '../knowledge/farm-data.js';
import { type AgentResult } from './types.js';

export class ComplianceAgent {
  constructor(private knowledge: FarmKnowledgeEngine) {}

  async analyze(question: string): Promise<AgentResult> {
    const [vaccCompliance, treatmentCompliance] = await Promise.all([
      query(`SELECT count(*) FILTER (WHERE administered_on IS NOT NULL) AS done, count(*) FILTER (WHERE administered_on IS NULL AND due_on <= CURRENT_DATE) AS overdue FROM vaccinations WHERE farm_id=$1`, [this.knowledge['farmId']]),
      query(`SELECT count(*) FILTER (WHERE withdrawal_period IS NOT NULL AND (CURRENT_DATE - administered_on) < withdrawal_period) AS in_withdrawal FROM treatments WHERE farm_id=$1 AND administered_on IS NOT NULL`, [this.knowledge['farmId']]),
    ]);

    const overdueVacc = Number(vaccCompliance.rows[0]?.overdue || 0);
    const inWithdrawal = Number(treatmentCompliance.rows[0]?.in_withdrawal || 0);

    const evidence: string[] = [];
    const reasoning: string[] = [];
    const recommendedActions: string[] = [];
    const risks: string[] = [];

    evidence.push(`Vaccination compliance: ${vaccCompliance.rows[0]?.done || 0} done, ${overdueVacc} overdue`);
    evidence.push(`Animals in withdrawal period: ${inWithdrawal}`);

    if (overdueVacc > 0) {
      risks.push(`${overdueVacc} overdue vaccination(s) — compliance issue`);
      reasoning.push('Overdue vaccinations may violate animal welfare regulations');
      recommendedActions.push('Schedule overdue vaccinations immediately');
    }

    if (inWithdrawal > 0) {
      risks.push(`${inWithdrawal} animal(s) in drug withdrawal period — milk may not be marketable`);
      reasoning.push('Selling milk from animals in withdrawal period violates food safety regulations');
      recommendedActions.push('Segregate animals in withdrawal period');
      recommendedActions.push('Ensure milk from these animals is not sold');
    }

    const severity = inWithdrawal > 0 ? 'critical' : overdueVacc > 3 ? 'high' : overdueVacc > 0 ? 'medium' : 'low';
    const confidence = 0.85;

    return {
      agent: 'compliance',
      title: `Compliance status: ${overdueVacc} overdue vacc, ${inWithdrawal} in withdrawal`,
      summary: inWithdrawal > 0
        ? `CRITICAL: ${inWithdrawal} animal(s) in drug withdrawal. Milk may not be marketable.`
        : overdueVacc > 0
        ? `${overdueVacc} vaccination(s) overdue. Schedule immediately.`
        : 'All compliance checks passed.',
      severity,
      confidence,
      evidence,
      reasoning,
      risks,
      recommended_actions: recommendedActions.length ? recommendedActions : ['Continue routine compliance monitoring'],
      expected_outcome: 'Maintaining compliance avoids regulatory penalties and ensures food safety.',
      data: { vaccCompliance: vaccCompliance.rows[0], treatmentCompliance: treatmentCompliance.rows[0] },
    };
  }
}
