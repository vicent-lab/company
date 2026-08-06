import { query } from '../../db/index.js';
import { FarmKnowledgeEngine } from '../knowledge/farm-data.js';
import { type AgentResult } from './types.js';

export class BreedingAgent {
  constructor(private knowledge: FarmKnowledgeEngine) {}

  async analyze(question: string): Promise<AgentResult> {
    const breeding = await this.knowledge.getBreedingAnalysis();
    const evidence: string[] = [];
    const reasoning: string[] = [];
    const recommendedActions: string[] = [];
    const risks: string[] = [];

    evidence.push(`Confirmed pregnant: ${breeding.pregnant?.length || 0}`);
    evidence.push(`Awaiting confirmation: ${breeding.candidates?.length || 0}`);
    evidence.push(`Calving soon: ${breeding.calvingSoon?.length || 0}`);

    if (breeding.calvingSoon?.length > 0) {
      risks.push(`${breeding.calvingSoon.length} cow(s) expected to calve soon`);
      reasoning.push('Prepare calving facilities and ensure veterinary standby');
      recommendedActions.push('Prepare calving pens and equipment');
      recommendedActions.push('Ensure colostrum supply is available');
      recommendedActions.push('Arrange veterinary support for calving');
    }

    if (breeding.candidates?.length > 0) {
      reasoning.push(`${breeding.candidates.length} cows likely pregnant but awaiting confirmation — schedule ultrasound`);
      recommendedActions.push('Schedule pregnancy checks for candidates');
    }

    if (breeding.pregnant?.length === 0 && breeding.candidates?.length === 0) {
      reasoning.push('No active pregnancies detected — review breeding program');
      recommendedActions.push('Review breeding records and identify candidates for insemination');
      recommendedActions.push('Check semen inventory and quality');
    }

    const severity = breeding.calvingSoon?.length > 2 ? 'high' : breeding.calvingSoon?.length > 0 ? 'medium' : 'low';
    const confidence = Math.min(0.95, 0.7 + (breeding.pregnant?.length || 0) * 0.02);

    return {
      agent: 'breeding',
      title: `Breeding status: ${breeding.pregnant?.length || 0} pregnant, ${breeding.calvingSoon?.length || 0} calving soon`,
      summary: breeding.calvingSoon?.length > 0
        ? `${breeding.calvingSoon.length} cow(s) expected to calve soon. Prepare calving facilities.`
        : breeding.pregnant?.length > 0
        ? `${breeding.pregnant.length} cow(s) confirmed pregnant. Monitor for calving.`
        : 'No active pregnancies detected. Review breeding program.',
      severity,
      confidence,
      evidence,
      reasoning,
      risks,
      recommended_actions: recommendedActions.length ? recommendedActions : ['Continue routine breeding monitoring'],
      expected_outcome: 'Proper breeding management ensures consistent calving intervals and herd replacement.',
      data: breeding,
    };
  }
}
