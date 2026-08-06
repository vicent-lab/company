import { query } from '../db/index.js';
import { WHY_IT_MATTERS_LOOKUP, PLAIN_STATE_LOOKUP } from './plain-language.js';

export interface DetailedExplanation {
  probability: number;
  reasons: string[];
  whyItMatters: string;
  urgencyReason: string | null;
  recommendedActions: string[];
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: string;
  relatedCowId?: string;
  confidence: number;
}

export async function generateDetailedExplanation(insightId: string, farmId: string): Promise<DetailedExplanation | null> {
  const insightResult = await query(`SELECT * FROM ai_insights WHERE id=$1 AND farm_id=$2`, [insightId, farmId]);
  if (!insightResult.rows.length) return null;

  const insight = insightResult.rows[0];
  const evidenceResult = await query(`SELECT * FROM ai_evidence WHERE insight_id=$1 ORDER BY base_confidence DESC`, [insightId]);
  return buildExplanation(insight, evidenceResult.rows);
}

// Pure, query-free core so callers that already have the insight + evidence rows in hand
// (e.g. the insights list endpoint, which batches evidence for every row in one query)
// can get the same explanation without an extra round-trip per insight.
export function buildExplanation(insight: any, evidence: any[]): DetailedExplanation {
  // One plain-language reason per piece of evidence, reusing the same signal-type
  // templates the fusion engine's headline description uses — so every signal type it
  // can produce has a real reason here too, not just the handful this file used to
  // special-case.
  const reasons: string[] = [];
  let probability = 0;
  let severity: 'low' | 'medium' | 'high' | 'critical' = 'medium';

  for (const ev of evidence) {
    reasons.push(PLAIN_STATE_LOOKUP(ev.signal, ev.metrics || {}));
    probability = Math.max(probability, Number(ev.base_confidence || 0));
  }

  if (insight.severity === 'critical') severity = 'critical';
  else if (insight.severity === 'high') severity = 'high';
  else if (insight.severity === 'medium') severity = 'medium';
  else severity = 'low';

  const recommendedActions = generateRecommendedActions(insight, evidence);

  // The strongest-evidence signal drives the "why does this matter" consequence — kept
  // consistent with the same lookup the fusion engine used to write the headline
  // description, so the list view and this detail view never contradict each other.
  const primarySignal = evidence[0]?.signal;
  const whyItMatters = primarySignal ? WHY_IT_MATTERS_LOOKUP(primarySignal) : (insight.metadata?.why_it_matters || 'Left unaddressed, this tends to compound quietly rather than resolve on its own.');

  return {
    probability: Math.round(probability * 100),
    reasons: reasons.length > 0 ? reasons : ['Insufficient evidence to determine specific causes'],
    whyItMatters,
    urgencyReason: insight.metadata?.urgency_reason || null,
    recommendedActions,
    severity,
    category: insight.category,
    relatedCowId: insight.related_cow_id,
    confidence: Number(insight.confidence_score || 0),
  };
}

// The insight's own action_items (buildFusedActions in fusion-engine.ts) already cover
// every signal type the engine produces — this just surfaces that same list as plain
// strings instead of maintaining a second, narrower copy of the same mapping.
function generateRecommendedActions(insight: any, evidence: any[]): string[] {
  const stored: { label: string }[] = Array.isArray(insight.action_items) ? insight.action_items : [];
  if (stored.length) return stored.map((a) => a.label).slice(0, 6);

  return [
    'Review the evidence and take appropriate action.',
    'Monitor the situation closely over the next 24-48 hours.',
    'Consult with a veterinarian if conditions worsen.',
  ];
}
