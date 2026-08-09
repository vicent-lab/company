import { query } from '../../db/index.js';
import { FarmKnowledgeEngine } from '../knowledge/farm-data.js';
import { type AgentResult } from './types.js';

export class HealthAgent {
  constructor(private knowledge: FarmKnowledgeEngine) {}

  async analyze(question: string): Promise<AgentResult> {
    const [health, overview, recentTreatments, vaccinations] = await Promise.all([
      this.knowledge.getHealthAnalysis(),
      this.knowledge.getOverview(),
      query(`SELECT c.cow_code, h.health_status, h.ai_detected_disease, h.body_condition_score, h.lameness_score, h.recorded_on FROM health_records h JOIN cows c ON c.id=h.cow_id WHERE c.farm_id=$1 AND h.recorded_on >= CURRENT_DATE - INTERVAL '30 days' ORDER BY h.recorded_on DESC LIMIT 20`, [this.knowledge['farmId']]),
      query(`SELECT c.cow_code, v.vaccine_name, v.due_on, v.administered_on FROM vaccinations v JOIN cows c ON c.id=v.cow_id WHERE c.farm_id=$1 AND v.due_on >= CURRENT_DATE - INTERVAL '30 days' ORDER BY v.due_on ASC LIMIT 20`, [this.knowledge['farmId']]),
    ]);

    const sick = health.sickCows || [];
    const risks = health.riskCows || [];
    const evidence: string[] = [];
    const reasoning: string[] = [];
    const recommendedActions: string[] = [];
    const risksList: string[] = [];

    evidence.push(`Total cows: ${overview.total_cows}`);
    evidence.push(`Sick cows: ${sick.length}`);
    evidence.push(`At-risk cows: ${risks.length}`);
    evidence.push(`Health records last 30 days: ${recentTreatments.rows.length}`);
    evidence.push(`Upcoming vaccinations: ${vaccinations.rows.filter((v: any) => !v.administered_on).length}`);

    if (sick.length > 0) {
      risksList.push(`${sick.length} cow(s) currently sick or under treatment`);
      reasoning.push(`${sick.length} animals are not in healthy status — requires immediate attention`);
      recommendedActions.push('Examine all sick cows immediately');
      recommendedActions.push('Isolate contagious animals if disease is suspected');
      recommendedActions.push('Consult veterinarian for treatment plan');
      if (sick.some((c: any) => c.ai_detected_disease)) {
        const diseases = [...new Set(sick.map((c: any) => c.ai_detected_disease).filter(Boolean))];
        risksList.push(`AI-detected diseases: ${diseases.join(', ')}`);
        recommendedActions.push(`Priority: review ${diseases[0]} protocol`);
      }
    }

    if (risks.length > 0) {
      risksList.push(`${risks.length} cow(s) show risk factors`);
      reasoning.push('Risk factors include low body condition, lameness, or AI-detected disease indicators');
      recommendedActions.push('Prioritize examination of at-risk cows');
      recommendedActions.push('Review nutrition and comfort conditions');
    }

    const overdueVacc = vaccinations.rows.filter((v: any) => !v.administered_on && new Date(v.due_on) < new Date());
    if (overdueVacc.length > 0) {
      risksList.push(`${overdueVacc.length} overdue vaccination(s)`);
      recommendedActions.push('Schedule overdue vaccinations');
    }

    const severity = sick.length > 3 ? 'critical' : sick.length > 0 ? 'high' : risks.length > 0 ? 'medium' : 'low';
    const confidence = Math.min(0.95, 0.7 + (sick.length + risks.length) * 0.05);

    return {
      agent: 'health',
      title: sick.length > 0 ? `${sick.length} cow(s) need health attention` : 'Herd health status',
      summary: risksList.length ? risksList.join('. ') : 'No immediate health issues detected. Continue routine monitoring.',
      severity,
      confidence,
      evidence,
      reasoning,
      risks: risksList,
      recommended_actions: recommendedActions.length ? recommendedActions : ['Continue routine health monitoring'],
      expected_outcome: 'Early detection and treatment reduces recovery time, prevents spread, and minimizes production loss.',
      data: { sickCows: sick, riskCows: risks, recentTreatments: recentTreatments.rows, vaccinations: vaccinations.rows },
    };
  }
}
