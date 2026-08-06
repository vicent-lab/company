import { query } from '../db/index.js';
import { recordOutcome as recordLearningOutcome, suppressRule, updateWeightOverride, computeAccuracy } from './learning-engine.js';

export interface PredictionOutcome {
  insightId: string;
  farmId: string;
  signalType: string;
  source: string;
  category: string;
  predictedAt: string;
  checkDate: string;
  outcome: 'success' | 'failure' | 'partial' | 'unknown';
  actualValue?: number;
  predictedValue?: number;
  notes?: string;
}

export async function recordOutcome(outcome: PredictionOutcome): Promise<void> {
  await query(`
    INSERT INTO ai_prediction_outcomes (insight_id, farm_id, signal_type, source, category, predicted_at, check_date, outcome, actual_value, predicted_value, notes)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    ON CONFLICT (insight_id, check_date) DO UPDATE SET
      outcome = EXCLUDED.outcome,
      actual_value = EXCLUDED.actual_value,
      predicted_value = EXCLUDED.predicted_value,
      notes = EXCLUDED.notes
  `, [
    outcome.insightId,
    outcome.farmId,
    outcome.signalType,
    outcome.source,
    outcome.category,
    outcome.predictedAt,
    outcome.checkDate,
    outcome.outcome,
    outcome.actualValue ?? null,
    outcome.predictedValue ?? null,
    outcome.notes || null,
  ]);
}

export async function verifyMilkProductionPrediction(farmId: string, insightId: string, predictedValue: number, predictedAt: string): Promise<'success' | 'failure' | 'partial' | 'unknown'> {
  const checkDate = new Date().toISOString().slice(0, 10);
  const r = await query(`
    SELECT SUM(morning_liters + afternoon_liters + evening_liters) as actual
    FROM milk_records
    WHERE farm_id = $1 AND recorded_on = $2
  `, [farmId, checkDate]);

  const actual = Number(r.rows[0]?.actual || 0);
  if (actual === 0) return 'unknown';

  const deviation = Math.abs(actual - predictedValue) / Math.max(predictedValue, 1);
  if (deviation < 0.1) return 'success';
  if (deviation < 0.25) return 'partial';
  return 'failure';
}

export async function verifyDiseaseRiskPrediction(farmId: string, insightId: string, riskLevel: string, predictedAt: string): Promise<'success' | 'failure' | 'partial' | 'unknown'> {
  const r = await query(`
    SELECT count(*)::int as sick_count
    FROM cows
    WHERE farm_id = $1 AND health <> 'healthy' AND status = 'active'
  `, [farmId]);

  const sickCount = Number(r.rows[0]?.sick_count || 0);
  const totalCows = await query(`SELECT count(*)::int as n FROM cows WHERE farm_id=$1 AND status='active'`, [farmId]);
  const n = Number(totalCows.rows[0]?.n || 1);
  const actualRisk = sickCount / n;

  if (riskLevel === 'High' && actualRisk > 0.15) return 'success';
  if (riskLevel === 'Moderate' && actualRisk > 0.05) return 'success';
  if (riskLevel === 'Low' && actualRisk <= 0.05) return 'success';
  if (riskLevel === 'High' && actualRisk <= 0.05) return 'failure';
  return 'partial';
}

export async function verifyFeedShortagePrediction(farmId: string, insightId: string, daysRemaining: number, predictedAt: string): Promise<'success' | 'failure' | 'partial' | 'unknown'> {
  const r = await query(`
    SELECT COALESCE(SUM(fi.quantity), 0) as stock
    FROM feed_inventory fi
    JOIN feed_types ft ON ft.id = fi.feed_type_id
    WHERE ft.farm_id = $1
  `, [farmId]);

  const currentStock = Number(r.rows[0]?.stock || 0);
  const milkingCount = await query(`SELECT count(*)::int as n FROM cows WHERE farm_id=$1 AND is_milking AND status='active'`, [farmId]);
  const milkers = Number(milkingCount.rows[0]?.n || 0);
  const dailyNeed = milkers * 25;
  const actualRemaining = dailyNeed > 0 ? currentStock / dailyNeed : 999;

  if (actualRemaining < 3 && daysRemaining <= 7) return 'success';
  if (actualRemaining > daysRemaining * 1.5) return 'failure';
  return 'partial';
}

// ---------- Follow-through: did following the advice actually help? ----------
// Delay before re-checking a category after the farmer has completed every action item.
const FOLLOW_UP_DELAY_DAYS: Record<string, number> = {
  health: 3,
  milk_production: 3,
  feed_nutrition: 3,
  infrastructure: 7,
  team_management: 7,
  breeding: 14,
  financial: 14,
  sustainability: 14,
  general: 7,
};

export function followUpDelayDays(category: string): number {
  return FOLLOW_UP_DELAY_DAYS[category] ?? 7;
}

async function verifyBreedingFollowThrough(farmId: string): Promise<'success' | 'failure' | 'partial' | 'unknown'> {
  const r = await query(`
    SELECT
      COUNT(*) FILTER (WHERE br.result IS NULL AND br.serviced_on < CURRENT_DATE - INTERVAL '45 days') AS still_unconfirmed,
      COUNT(*) FILTER (WHERE lower(br.result) = 'pregnant' AND br.serviced_on >= CURRENT_DATE - INTERVAL '120 days') AS confirmed_pregnant
    FROM breeding_records br
    JOIN cows c ON c.id = br.cow_id
    WHERE c.farm_id = $1
  `, [farmId]);
  const row = r.rows[0];
  const stillUnconfirmed = Number(row?.still_unconfirmed || 0);
  const confirmedPregnant = Number(row?.confirmed_pregnant || 0);
  if (stillUnconfirmed === 0 && confirmedPregnant > 0) return 'success';
  if (stillUnconfirmed > 0) return 'partial';
  return 'unknown';
}

async function verifyFinancialFollowThrough(farmId: string): Promise<'success' | 'failure' | 'partial' | 'unknown'> {
  const r = await query(`
    WITH monthly AS (
      SELECT COALESCE(SUM(amount), 0) AS income FROM income WHERE farm_id = $1 AND received_on >= date_trunc('month', current_date)
    ), exp AS (
      SELECT COALESCE(SUM(amount), 0) AS expenses FROM expenses WHERE farm_id = $1 AND incurred_on >= date_trunc('month', current_date)
    )
    SELECT income, expenses FROM monthly, exp
  `, [farmId]);
  const income = Number(r.rows[0]?.income || 0);
  const expenses = Number(r.rows[0]?.expenses || 0);
  if (income <= 0) return 'unknown';
  const marginPct = ((income - expenses) / income) * 100;
  if (marginPct >= 15) return 'success';
  if (marginPct < 5) return 'failure';
  return 'partial';
}

/**
 * Checks insights where the farmer completed every action item and the category's
 * follow-up delay has elapsed. Re-evaluates the underlying condition and records the
 * result as advice-followed feedback, feeding directly into per-farm and cross-farm
 * calibration (see learning-engine.ts).
 */
export async function runAdviceFollowThroughChecks(farmId?: string): Promise<{ checked: number; outcomes: Array<{ insightId: string; outcome: string }> }> {
  const sql = farmId
    ? `SELECT * FROM ai_insights WHERE farm_id = $1 AND actions_completed_at IS NOT NULL AND follow_up_checked_at IS NULL AND follow_up_due_at <= now()`
    : `SELECT * FROM ai_insights WHERE actions_completed_at IS NOT NULL AND follow_up_checked_at IS NULL AND follow_up_due_at <= now()`;
  const params = farmId ? [farmId] : [];
  const r = await query(sql, params);
  const insights = r.rows;

  const outcomes: Array<{ insightId: string; outcome: string }> = [];
  let checked = 0;

  for (const insight of insights) {
    let outcome: 'success' | 'failure' | 'partial' | 'unknown' = 'unknown';
    try {
      const metadata = insight.metadata || {};

      if (insight.category === 'milk_production' && metadata.metrics?.today_liters) {
        outcome = await verifyMilkProductionPrediction(insight.farm_id, insight.id, Number(metadata.metrics.today_liters), insight.created_at);
      } else if (insight.category === 'health') {
        outcome = await verifyDiseaseRiskPrediction(insight.farm_id, insight.id, insight.severity, insight.created_at);
      } else if (insight.category === 'feed_nutrition') {
        outcome = await verifyFeedShortagePrediction(insight.farm_id, insight.id, metadata.metrics?.days_remaining || 7, insight.created_at);
      } else if (insight.category === 'breeding') {
        outcome = await verifyBreedingFollowThrough(insight.farm_id);
      } else if (insight.category === 'financial') {
        outcome = await verifyFinancialFollowThrough(insight.farm_id);
      }

      const ruleId = metadata.rule_id || `${insight.category}_${insight.type}`;
      const source = metadata.intelligence_sources?.[0] || 'advice_follow_through';

      if (outcome !== 'unknown') {
        await recordLearningOutcome({
          farmId: insight.farm_id,
          ruleId,
          feedback: outcome === 'success' ? 'positive' : outcome === 'failure' ? 'negative' : 'neutral',
          signalType: insight.type,
          source,
          category: insight.category,
          predictedOutcome: insight.title,
          actualOutcome: `Farmer followed the advice; re-checked outcome: ${outcome}`,
          confidenceDelta: outcome === 'success' ? 0.05 : outcome === 'failure' ? -0.1 : 0,
          adviceFollowed: true,
        });

        if (outcome === 'failure') {
          await suppressRule(insight.farm_id, ruleId, 7);
          const newWeight = Math.max(0.5, (await computeAccuracy(insight.farm_id, ruleId)) * 0.7);
          await updateWeightOverride(insight.farm_id, ruleId, newWeight);
        } else if (outcome === 'success') {
          const newWeight = Math.min(2.0, (await computeAccuracy(insight.farm_id, ruleId)) * 1.1);
          await updateWeightOverride(insight.farm_id, ruleId, newWeight);
        }
      }

      await query(`UPDATE ai_insights SET follow_up_checked_at = now() WHERE id = $1`, [insight.id]);
      outcomes.push({ insightId: insight.id, outcome });
      checked++;
    } catch {
      // Leave follow_up_checked_at null so this insight is retried on the next cycle
    }
  }

  return { checked, outcomes };
}

/**
 * The continuous-learning heartbeat: runs prediction verification and advice
 * follow-through checks across every farm. Intended to run on a schedule (see index.ts)
 * so accuracy keeps improving without anyone manually triggering it.
 */
export async function runContinuousLearningCycle(): Promise<{ farms: number; verified: number; followedUp: number }> {
  const farmsRes = await query(`SELECT id FROM farms`);
  let verified = 0;
  let followedUp = 0;

  for (const farm of farmsRes.rows) {
    const log = await query(`INSERT INTO ai_analysis_logs (farm_id, analysis_type, status) VALUES ($1, 'continuous_learning_cycle', 'running') RETURNING id`, [farm.id]);
    try {
      const verification = await runOutcomeVerification(farm.id);
      const followThrough = await runAdviceFollowThroughChecks(farm.id);
      verified += verification.verified;
      followedUp += followThrough.checked;
      await query(`UPDATE ai_analysis_logs SET completed_at=now(), status='completed', metadata=$1 WHERE id=$2`,
        [JSON.stringify({ verified: verification.verified, followedUp: followThrough.checked }), log.rows[0].id]);
    } catch (err: any) {
      await query(`UPDATE ai_analysis_logs SET completed_at=now(), status='failed', error=$1 WHERE id=$2`, [err.message, log.rows[0].id]);
    }
  }

  return { farms: farmsRes.rows.length, verified, followedUp };
}

export async function runOutcomeVerification(farmId?: string): Promise<{ verified: number; outcomes: Array<{ insightId: string; outcome: string }> }> {
  let insights;
  const sql = farmId
    ? `SELECT i.* FROM ai_insights i WHERE i.farm_id = $1 AND i.created_at >= now() - interval '7 days' AND i.type IN ('warning', 'prediction', 'alert')`
    : `SELECT i.* FROM ai_insights i WHERE i.created_at >= now() - interval '7 days' AND i.type IN ('warning', 'prediction', 'alert')`;
  const params = farmId ? [farmId] : [];
  const r = await query(sql, params);
  insights = r.rows;

  const outcomes: Array<{ insightId: string; outcome: string }> = [];
  let verified = 0;

  for (const insight of insights) {
    let outcome: 'success' | 'failure' | 'partial' | 'unknown' = 'unknown';
    try {
      const metadata = insight.metadata || {};
      if (insight.category === 'milk_production' && metadata.metrics?.today_liters) {
        outcome = await verifyMilkProductionPrediction(insight.farm_id, insight.id, Number(metadata.metrics.today_liters), insight.created_at);
      } else if (insight.category === 'health') {
        outcome = await verifyDiseaseRiskPrediction(insight.farm_id, insight.id, insight.severity, insight.created_at);
      } else if (insight.category === 'feed_nutrition') {
        outcome = await verifyFeedShortagePrediction(insight.farm_id, insight.id, metadata.metrics?.days_remaining || 7, insight.created_at);
      }

      if (outcome !== 'unknown') {
        await recordOutcome({
          insightId: insight.id,
          farmId: insight.farm_id,
          signalType: insight.type,
          source: 'auto_verifier',
          category: insight.category,
          predictedAt: insight.created_at,
          checkDate: new Date().toISOString().slice(0, 10),
          outcome,
          predictedValue: metadata.metrics?.today_liters || metadata.metrics?.days_remaining,
        });
        outcomes.push({ insightId: insight.id, outcome });
        verified++;
      }
    } catch (err) {
      // Skip failed verifications
    }
  }

  return { verified, outcomes };
}
