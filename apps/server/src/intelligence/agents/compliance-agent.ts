import { query } from '../../db/index.js';
import { FarmKnowledgeEngine } from '../knowledge/farm-data.js';
import { type AgentResult } from './types.js';

export class ComplianceAgent {
  constructor(private knowledge: FarmKnowledgeEngine) {}

  async analyze(question: string): Promise<AgentResult> {
    const vaccCompliance = await query(`SELECT count(*) FILTER (WHERE v.administered_on IS NOT NULL) AS done, count(*) FILTER (WHERE v.administered_on IS NULL AND v.due_on <= CURRENT_DATE) AS overdue FROM vaccinations v JOIN cows c ON c.id=v.cow_id WHERE c.farm_id=$1`, [this.knowledge['farmId']]);

    const overdueVacc = Number(vaccCompliance.rows[0]?.overdue || 0);
    const doneVacc = Number(vaccCompliance.rows[0]?.done || 0);

    const evidence: string[] = [];
    const reasoning: string[] = [];
    const recommendedActions: string[] = [];
    const risksList: string[] = [];

    evidence.push(`Vaccination compliance: ${doneVacc} done, ${overdueVacc} overdue`);

    if (overdueVacc > 0) {
      risksList.push(`${overdueVacc} overdue vaccination(s) — compliance issue`);
      reasoning.push('Overdue vaccinations may violate animal welfare regulations');
      recommendedActions.push('Schedule overdue vaccinations immediately');
    }

    const severity = overdueVacc > 3 ? 'high' : overdueVacc > 0 ? 'medium' : 'low';
    const confidence = 0.85;

    return {
      agent: 'compliance',
      title: `Compliance status: ${overdueVacc} overdue vacc`,
      summary: overdueVacc > 0
        ? `${overdueVacc} vaccination(s) overdue. Schedule immediately.`
        : 'All compliance checks passed.',
      severity,
      confidence,
      evidence,
      reasoning,
      risks: risksList,
      recommended_actions: recommendedActions.length ? recommendedActions : ['Continue routine compliance monitoring'],
      expected_outcome: 'Maintaining compliance avoids regulatory penalties and ensures food safety.',
      data: { vaccCompliance: vaccCompliance.rows[0] },
    };
  }
}
