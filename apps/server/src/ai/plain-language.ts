/**
 * Plain-Language Reasoning Layer
 *
 * The fusion engine (fusion-engine.ts) is good at observing farm data and detecting
 * patterns, but its raw output is a technical signal dump — "z_score: -2.30, expected:
 * 22.10, actual: 14.30". That's evidence, not an explanation. A farmer reading an insight
 * needs three separate questions answered, in order:
 *
 *   1. What is happening?           (state, in plain words)
 *   2. Why does that matter?        (consequence if ignored)
 *   3. How sure is the system?      (confidence, in plain words)
 *   4. How soon do I need to act?   (urgency — distinct from severity)
 *
 * This module answers all four from a signal's `signal_type` and `metrics`, without an
 * LLM: every sentence is a template filled with real numbers pulled straight from the
 * evidence, so nothing here can hallucinate a fact the SQL analyzers didn't produce.
 */

import type { IntelligenceSignal } from './fusion-engine.js';

// ---------- 1. What is happening? (plain-language state per signal type) ----------

const PLAIN_STATE: Record<string, (m: any) => string> = {
  vaccination_compliance_low: (m) => `Only ${Math.round((m.compliance_rate || 0) * 100)}% of scheduled vaccinations have actually been given.`,
  dry_period_insufficient: (m) => `${m.cows_affected || 'Some'} cow(s) due to calve soon haven't had the dry-off break they need first.`,
  milk_withdrawal_monitoring: (m) => `${m.cows_in_withdrawal || 'Some'} recently treated cow(s) are still inside their milk-withdrawal window.`,
  yield_anomaly_detected: (m) => {
    const a = m.anomalies?.[0];
    return a
      ? `${a.cow_code} produced ${a.actual}L today, well off her usual ${a.expected}L average${m.anomaly_count > 1 ? ` (${m.anomaly_count} cows affected in total)` : ''}.`
      : `${m.anomaly_count || 'Several'} cow(s) are producing noticeably off their own normal pattern.`;
  },
  herd_pattern_decline: (m) => `Herd-wide milk output has been sliding for ${m.declining_days} of the last 14 days — down from about ${m.previous_avg}L to ${m.current_avg}L a day.`,
  production_forecast: (m) => `At the current trend, herd output is projected to ${m.trend_direction === 'declining' ? 'fall' : 'rise'} ${Math.abs(Number(m.projected_change_pct))}% over the next month, to around ${m.forecast_30d}L/day.`,
  feed_shortage_predicted: (m) => `At current usage, your feed stock will run out in about ${m.days_remaining} days.`,
  production_out_of_control: (m) => `Milk output over the last week has moved outside its normal day-to-day range on ${m.out_of_control_days} day(s) — a bigger swing than typical noise.`,
  bcs_distribution_skewed: (m) => `${m.thin_pct}% of the herd is scoring thin on body condition, above what's normal for a well-fed herd.`,
  labor_efficiency_low: (m) => `Milk output per worker is running at ${m.milk_per_worker}L/day, below the ${m.benchmark}L/day benchmark for a farm this size.`,
  feed_cost_high: (m) => `Feed is costing ${m.cost_per_liter}/L of milk produced, above the ${m.benchmark}/L benchmark.`,
  conception_rate_below_benchmark: (m) => `Only ${m.conception_rate}% of services in the last six months resulted in a confirmed pregnancy, against a ${m.benchmark}% benchmark.`,
  mastitis_risk_elevated: (m) => `${m.cows_with_fever} cow(s) are running a fever (avg ${m.avg_temperature}°C) — often the earliest sign of mastitis.`,
  lameness_prevalence_high: (m) => `${m.severe_lameness_pct}% of the herd is showing severe lameness, above the 5% line vets consider a welfare concern.`,
  metabolic_disease_detected: (m) => `${m.metabolic_cases} case(s) of ketosis or acidosis have been flagged in the last 30 days.`,
  heat_stress_risk: (m) => `It's ${m.temperature_c}°C at ${m.humidity_pct}% humidity — hot and humid enough (THI ${m.thi}) to put cows under ${m.risk_level} heat stress.`,
  cold_stress_risk: (m) => `At ${m.temperature_c}°C, cows are likely under cold stress and burning roughly ${m.energy_requirement_increase_pct}% more energy just to stay warm.`,
  margin_below_target: (m) => `Profit margin has averaged ${m.avg_margin_pct}% over the last ${m.months_analyzed} month(s), against a ${m.target_margin}% target.`,
  vet_roi_low: (m) => `Every dollar spent on veterinary care is returning about ${m.roi_ratio}x in milk revenue, below the ${m.target_roi}x you'd expect.`,
  cost_per_cow_high: (m) => `Monthly cost per cow is running at ${m.cost_per_cow}, above the ${m.benchmark} benchmark.`,
  disease_outbreak_risk: (m) => `Several early-warning signs — sick cows (${m.sick_ratio}%), thin body condition (${m.thin_ratio}%), missed vaccinations (${m.vacc_gap_ratio}%) — are stacking up at once.`,
  cash_runway_short: (m) => `At the current burn rate, the farm has about ${m.runway_days} days of cash left before income stops covering expenses.`,
  key_person_dependency: (m) => `${m.single_point_roles} role(s) on the farm — ${m.critical_roles} — have exactly one person who can do them.`,
};

// ---------- 2. Why does it matter? (consequence if ignored) ----------

const WHY_IT_MATTERS: Record<string, string> = {
  vaccination_compliance_low: 'Gaps in vaccination coverage leave the whole herd more exposed the next time a preventable disease reaches the farm.',
  dry_period_insufficient: 'Cows that don\'t get a full dry period produce less milk in their next lactation and calve into it with a weaker start.',
  milk_withdrawal_monitoring: 'Selling milk still inside the withdrawal window risks contaminated milk reaching the tank, which can void a whole batch.',
  yield_anomaly_detected: 'A sudden drop like this is usually an early sign of illness, heat stress, or a feed problem — catching it now is far cheaper than treating it once it becomes visible.',
  herd_pattern_decline: 'A herd-wide slide rather than one cow points to something shared — feed, water, heat, or a missed routine — that will keep costing milk every day it goes unaddressed.',
  production_forecast: 'This is a projection, not a certainty, but if the trend holds it compounds daily — the earlier a correction happens, the smaller it needs to be.',
  feed_shortage_predicted: 'Running out of feed forces a sudden ration change, which causes its own milk-yield drop on top of the shortage itself.',
  production_out_of_control: 'Swings this size are unlikely to be random noise — something specific changed, and it\'s worth finding before it happens again.',
  bcs_distribution_skewed: 'Thin cows are more likely to struggle with fertility, immunity, and milk persistence through the rest of their lactation.',
  labor_efficiency_low: 'Persistently low output per worker either means the herd is understaffed for its size or routines are taking longer than they should — both are fixable and both cost money every week.',
  feed_cost_high: 'Feed is typically the single largest expense line — a persistent gap above benchmark compounds into the biggest drag on margin of anything on the farm.',
  conception_rate_below_benchmark: 'Every unconfirmed pregnancy is a cow sitting open for another cycle — still eating, still costing feed, without producing a calf or extending lactation.',
  mastitis_risk_elevated: 'Untreated mastitis spreads through the milking line to other cows and can permanently reduce the affected cow\'s future milk production.',
  lameness_prevalence_high: 'Lameness this widespread usually has one shared cause — flooring, footbaths, or nutrition — and will keep adding cases until that cause is fixed.',
  metabolic_disease_detected: 'Ketosis and acidosis are often invisible until they\'re advanced, and by then they\'ve already cost significant milk yield and fertility.',
  heat_stress_risk: 'Heat-stressed cows eat less and produce less milk for days after the heat itself has passed.',
  cold_stress_risk: 'Cows burning extra energy on warmth alone will show it as reduced milk yield or body condition within days if the ration isn\'t adjusted.',
  margin_below_target: 'At a thin margin, a single bad month — a price dip or an unplanned vet bill — can push the farm into an outright loss.',
  vet_roi_low: 'Veterinary spend that isn\'t translating into milk revenue is either being spent reactively on problems that should have been prevented, or on the wrong things.',
  cost_per_cow_high: 'Cost per cow above benchmark, sustained across the herd, is one of the most direct levers on whether the farm is actually profitable this month.',
  disease_outbreak_risk: 'Individually, each of these signals might be minor. Together, they sharply raise the odds of a costly, herd-wide outbreak rather than an isolated case.',
  cash_runway_short: 'Without action inside this window, the farm may not be able to cover feed, payroll, or supplier bills on time.',
  key_person_dependency: 'If that one person is unavailable for even a few days — illness, leave, resignation — that task doesn\'t get done at all.',
};

const GENERIC_WHY_IT_MATTERS = 'Left unaddressed, this tends to compound quietly rather than resolve on its own.';

/** Looks up the plain-language consequence for a signal type — used both by the fusion
 *  engine's headline description and by the insight detail view, so the two stay consistent. */
export function WHY_IT_MATTERS_LOOKUP(signalType: string): string {
  return WHY_IT_MATTERS[signalType] || GENERIC_WHY_IT_MATTERS;
}

/** Looks up the plain-language "what's happening" sentence for a signal type from its
 *  stored metrics — same templates the fusion engine uses, reused so the insight detail
 *  view never falls back to "insufficient evidence" for a signal type it just doesn't
 *  happen to know about. */
export function PLAIN_STATE_LOOKUP(signalType: string, metrics: Record<string, any>): string {
  const fn = PLAIN_STATE[signalType];
  try {
    return fn ? fn(metrics || {}) : humanizeSignalType(signalType);
  } catch {
    return humanizeSignalType(signalType);
  }
}

function humanizeSignalType(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---------- 3. How sure is the system? (confidence, in plain words) ----------

export function describeConfidence(confidence: number, sourceDiversity: number, agreementScore: number): string {
  if (confidence >= 0.85 && sourceDiversity >= 2) {
    return `Very confident — ${sourceDiversity} independent checks agree on this.`;
  }
  if (confidence >= 0.85) {
    return `Very confident — this comes from a strong, well-established signal.`;
  }
  if (confidence >= 0.65 && sourceDiversity >= 2) {
    return `Fairly confident — ${sourceDiversity} checks point the same way, though not all perfectly agree (${Math.round(agreementScore * 100)}% agreement).`;
  }
  if (confidence >= 0.65) {
    return `Fairly confident, based on one clear signal — worth watching for a second confirming sign.`;
  }
  return `An early signal, not yet fully confirmed — flagged now so it isn't missed, but treat it as a heads-up rather than a certainty.`;
}

// ---------- 4. How soon does this need attention? (urgency — distinct from severity) ----------

/** Metric/evidence keys that represent a countdown to a real-world deadline. */
const DEADLINE_KEY = /^(days_remaining|days_left|runway_days|days_to_[a-z_]+)$/i;

const WELFARE_SIGNAL = /mastitis|lameness|disease_outbreak|metabolic|calving|dry_period/i;

export interface Urgency {
  score: number; // 0-100
  reason: string;
  daysToImpact: number | null;
}

export function estimateUrgency(signals: IntelligenceSignal[], severity: 'low' | 'medium' | 'high' | 'critical'): Urgency {
  const severityBase: Record<string, number> = { critical: 70, high: 50, medium: 30, low: 15 };
  let score = severityBase[severity] ?? 15;

  // Scan every signal's metrics and evidence rows for an explicit countdown.
  let minDays: number | null = null;
  for (const s of signals) {
    const pools = [s.metrics, ...(Array.isArray(s.evidence) ? s.evidence : [])];
    for (const pool of pools) {
      if (!pool || typeof pool !== 'object') continue;
      for (const [key, val] of Object.entries(pool)) {
        if (DEADLINE_KEY.test(key)) {
          const n = Number(val);
          if (Number.isFinite(n) && n >= 0 && (minDays === null || n < minDays)) minDays = n;
        }
      }
    }
  }

  let reason: string;
  if (minDays !== null) {
    if (minDays <= 3) { score += 35; reason = `Acts within ${minDays === 0 ? 'today' : `${Math.round(minDays)} day(s)`} — a real deadline is close.`; }
    else if (minDays <= 7) { score += 22; reason = `About ${Math.round(minDays)} days before this becomes a hard problem — this week.`; }
    else if (minDays <= 14) { score += 10; reason = `Roughly ${Math.round(minDays)} days of runway — worth scheduling soon.`; }
    else { reason = `No immediate deadline (~${Math.round(minDays)} days out) — plan for it, no need to drop everything.`; }
  } else {
    reason = severity === 'critical' || severity === 'high'
      ? 'No fixed deadline, but the severity alone means this shouldn\'t wait.'
      : 'No fixed deadline — address it in the normal course of work.';
  }

  // Irreversible-harm bonus: welfare/health signals that can compound if delayed.
  const isWelfare = signals.some((s) => s.source === 'veterinary' || WELFARE_SIGNAL.test(s.signal_type));
  if (isWelfare && (severity === 'critical' || severity === 'high')) {
    score += 15;
    reason += ' Delaying risks harm that treatment can\'t fully reverse.';
  }

  return { score: Math.max(0, Math.min(100, Math.round(score))), reason, daysToImpact: minDays };
}

export function urgencyToPriority(score: number): number {
  if (score >= 80) return 5;
  if (score >= 60) return 4;
  if (score >= 40) return 3;
  if (score >= 20) return 2;
  return 1;
}

// ---------- Putting it together: one coherent, plain-language explanation ----------

export interface PlainExplanation {
  summary: string;        // what's happening — plain words, real numbers
  whyItMatters: string;   // consequence if ignored
  confidenceNote: string; // how sure, in plain words
  urgency: Urgency;
  description: string;    // the three prose sentences joined — what ships as insight.description
  technicalEvidence: string[]; // the old per-signal jargon dump, kept for audit/vet detail
}

export function buildPlainExplanation(
  signals: IntelligenceSignal[],
  severity: 'low' | 'medium' | 'high' | 'critical',
  sourceDiversity: number,
  agreementScore: number,
  weightedConfidence: number,
): PlainExplanation {
  const primary = signals.reduce((a, b) => (a.confidence > b.confidence ? a : b));
  const stateFn = PLAIN_STATE[primary.signal_type];
  let summary = stateFn ? stateFn(primary.metrics) : `${humanizeSignalType(primary.signal_type)} was flagged for review.`;
  if (signals.length > 1) {
    const others = signals.length - 1;
    summary += ` This lines up with ${others} other signal${others > 1 ? 's' : ''} pointing the same way.`;
  }

  const whyItMatters = WHY_IT_MATTERS[primary.signal_type] || GENERIC_WHY_IT_MATTERS;
  const confidenceNote = describeConfidence(weightedConfidence, sourceDiversity, agreementScore);
  const urgency = estimateUrgency(signals, severity);

  const technicalEvidence = signals.map((s) => {
    const metrics = Object.entries(s.metrics || {})
      .filter(([k]) => !k.startsWith('_'))
      .map(([k, v]) => `${k}: ${typeof v === 'number' ? v.toFixed(2) : v}`)
      .join(', ');
    return `[${s.source}] ${s.signal_type}: ${metrics || 'signal detected'}`;
  });

  return {
    summary,
    whyItMatters,
    confidenceNote,
    urgency,
    description: `${summary}\n\n${whyItMatters}\n\n${confidenceNote}`,
    technicalEvidence,
  };
}
