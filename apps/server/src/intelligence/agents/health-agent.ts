import { query } from '../../db/index.js';
import { FarmKnowledgeEngine } from '../knowledge/farm-data.js';
import { type AgentResult } from './types.js';

export class HealthAgent {
  constructor(private knowledge: FarmKnowledgeEngine) {}

  async analyze(question: string): Promise<AgentResult> {
    const [sickCows, riskCows, healthSummary] = await Promise.all([
      this.knowledge.getHealthAnalysis(),
      this.knowledge.getOverview(),
      query(`SELECT count(*)::int AS total_health_records FROM health_records WHERE farm_id=$1 AND recorded_on >= CURRENT_DATE - INTERVAL '30 days'`, [this.knowledge['farmId']]),
    ]);

    const sick = sickCows.sickCows || [];
    const risks = sickCows.riskCows || [];
    const issues: string[] = [];
    const evidence: string[] = [];
    const reasoning: string[] = [];
    const recommendedActions: string[] = [];

    evidence.push(`Total cows: ${(riskCows as any).total_cows || 0}`);
    evidence.push(`Sick cows: ${sick.length}`);
    evidence.push(`At-risk cows: ${risks.length}`);
    evidence.push(`Health records last 30 days: ${(healthSummary.rows[0] as any)?.total_health_records || 0}`);

    if (sick.length > 0) {
      issues.push(`${sick.length} cow(s) currently sick or under treatment`);
      reasoning.push(`${sick.length} animals are not in healthy status — this requires immediate attention`);
      recommendedActions.push('Examine all sick cows immediately');
      recommendedActions.push('Isolate contagious animals if disease is suspected');
      recommendedActions.push('Consult veterinarian for treatment plan');
    }

    if (risks.length > 0) {
      issues.push(`${risks.length} cow(s) show risk factors`);
      reasoning.push('Risk factors include low body condition, lameness, or AI-detected disease indicators');
      recommendedActions.push('Prioritize examination of at-risk cows');
      recommendedActions.push('Review nutrition and comfort conditions');
    }

    const severity = sick.length > 3 ? 'critical' : sick.length > 0 ? 'high' : risks.length > 0 ? 'medium' : 'low';
    const confidence = Math.min(0.95, 0.7 + (sick.length + risks.length) * 0.05);

    return {
      agent: 'health',
      title: sick.length > 0 ? `${sick.length} cow(s) need health attention` : 'Herd health status',
      summary: issues.length ? issues.join('. ') : 'No immediate health issues detected. Continue routine monitoring.',
      severity,
      confidence,
      evidence,
      reasoning,
      risks: sick.map((c: any) => `${c.cow_code}: ${c.health_status || 'unknown'}${c.ai_detected_disease ? ` — ${c.ai_detected_disease}` : ''}`),
      recommended_actions: recommendedActions.length ? recommendedActions : ['Continue routine health monitoring'],
      expected_outcome: 'Early detection and treatment reduces recovery time, prevents spread, and minimizes production loss.',
      data: { sickCows: sick, riskCows: risks },
    };
  }
}
