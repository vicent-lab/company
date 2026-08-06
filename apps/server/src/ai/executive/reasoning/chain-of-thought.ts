import { query } from '../../../db/index.js';

interface Evidence {
  source: string;
  signal_type: string;
  confidence: number;
  metrics: Record<string, any>;
}

interface ReasoningStep {
  step: string;
  evidence: string;
  confidence: number;
}

export async function buildChainOfThought(farmId: string, question: string, evidence: Evidence[]): Promise<ReasoningStep[]> {
  const steps: ReasoningStep[] = [];

  if (evidence.length === 0) {
    steps.push({ step: 'No evidence found', evidence: 'No signals matched the question', confidence: 0 });
    return steps;
  }

  steps.push({
    step: 'Gather evidence',
    evidence: `${evidence.length} signal(s) collected from ${[...new Set(evidence.map(e => e.source))].join(', ')}`,
    confidence: Math.min(0.95, evidence.reduce((s, e) => s + e.confidence, 0) / evidence.length),
  });

  const highConfidence = evidence.filter((e) => e.confidence > 0.7).length;
  const mediumConfidence = evidence.filter((e) => e.confidence > 0.4 && e.confidence <= 0.7).length;
  const lowConfidence = evidence.filter((e) => e.confidence <= 0.4).length;

  steps.push({
    step: 'Assess confidence distribution',
    evidence: `${highConfidence} high, ${mediumConfidence} medium, ${lowConfidence} low confidence signals`,
    confidence: highConfidence > 0 ? 0.85 : mediumConfidence > 0 ? 0.6 : 0.3,
  });

  const strongest = evidence.sort((a, b) => b.confidence - a.confidence)[0];
  if (strongest) {
    steps.push({
      step: 'Identify strongest signal',
      evidence: `${strongest.source} / ${strongest.signal_type} (confidence: ${(strongest.confidence * 100).toFixed(0)}%)`,
      confidence: strongest.confidence,
    });
  }

  const farmScore = await query(`SELECT overall_score FROM ai_farm_scores WHERE farm_id=$1 ORDER BY score_date DESC LIMIT 1`, [farmId]);
  const farmScoreVal = farmScore.rows[0]?.overall_score;
  if (farmScoreVal != null) {
    steps.push({
      step: 'Cross-check farm health',
      evidence: `Farm score is ${farmScoreVal}/100 — ${farmScoreVal >= 80 ? 'generally healthy' : farmScoreVal >= 60 ? 'some concerns' : 'significant issues detected'}`,
      confidence: 0.75,
    });
  }

  steps.push({
    step: 'Synthesize recommendation',
    evidence: `Based on ${evidence.length} signal(s), the AI recommends prioritizing the highest-confidence, highest-impact action first.`,
    confidence: steps[steps.length - 1].confidence,
  });

  return steps;
}

export function buildCounterfactual(actual: string, alternative: string, outcome: string): string {
  return `If you had chosen to "${alternative}" instead of "${actual}", the likely outcome would be: ${outcome}.`;
}

export function quantifyUncertainty(confidence: number): string {
  if (confidence >= 0.9) return 'High confidence';
  if (confidence >= 0.7) return 'Moderate confidence';
  if (confidence >= 0.5) return 'Low confidence';
  return 'Very low confidence — gather more data';
}
