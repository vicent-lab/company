import { query } from '../../db/index.js';
import { FarmKnowledgeEngine } from '../knowledge/farm-data.js';
import { type AgentResult } from './types.js';

export class SustainabilityAgent {
  constructor(private knowledge: FarmKnowledgeEngine) {}

  async analyze(question: string): Promise<AgentResult> {
    const [feedRes, energyRes] = await Promise.all([
      query(`SELECT COALESCE(SUM(fc.quantity),0) AS total_feed FROM feed_consumption fc JOIN cows c ON c.id=fc.cow_id WHERE c.farm_id=$1 AND fc.consumed_on >= date_trunc('month', current_date)`, [this.knowledge['farmId']]),
      query(`SELECT COALESCE(SUM(amount),0) AS total_energy FROM expenses WHERE farm_id=$1 AND category ILIKE '%energy%' AND incurred_on >= date_trunc('month', current_date)`, [this.knowledge['farmId']]),
    ]);

    const totalFeed = Number(feedRes.rows[0]?.total_feed || 0);
    const totalEnergy = Number(energyRes.rows[0]?.total_energy || 0);

    const evidence: string[] = [];
    const reasoning: string[] = [];
    const recommendedActions: string[] = [];
    const risksList: string[] = [];

    evidence.push(`Feed consumed this month: ${totalFeed.toFixed(1)} units`);
    evidence.push(`Energy expenses: ${totalEnergy.toFixed(2)}`);

    reasoning.push('Sustainability metrics help reduce environmental impact and operating costs');
    recommendedActions.push('Monitor feed-to-milk conversion efficiency');
    recommendedActions.push('Consider renewable energy options');

    const severity = 'low';
    const confidence = 0.7;

    return {
      agent: 'sustainability',
      title: 'Sustainability metrics',
      summary: `Feed: ${totalFeed.toFixed(1)} units, Energy: ${totalEnergy.toFixed(2)} this month.`,
      severity,
      confidence,
      evidence,
      reasoning,
      risks: risksList,
      recommended_actions: recommendedActions,
      expected_outcome: 'Improved sustainability reduces costs and environmental impact.',
      data: { totalFeed, totalEnergy },
    };
  }
}
