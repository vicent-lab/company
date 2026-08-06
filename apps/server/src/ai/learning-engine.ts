import { query } from '../db/index.js';

export interface LearningUpdate {
  ruleId: string;
  farmId: string;
  feedback: 'positive' | 'negative' | 'neutral';
  signalType: string;
  source: string;
  category: string;
  predictedOutcome?: string;
  actualOutcome?: string;
  confidenceDelta?: number;
  /** True when this outcome was recorded because the farmer followed the advice
   *  (completed the action items) and we re-checked the result — as opposed to
   *  passive prediction verification or explicit accuracy feedback. */
  adviceFollowed?: boolean;
}

export interface CalibrationState {
  farmId: string;
  ruleId: string;
  totalFeedback: number;
  positiveFeedback: number;
  negativeFeedback: number;
  neutralFeedback: number;
  accuracy: number;
  weightOverride: number;
  suppressedUntil: string | null;
}

export async function recordOutcome(update: LearningUpdate): Promise<void> {
  const { farmId, ruleId, feedback, signalType, source, category, predictedOutcome, actualOutcome } = update;

  await query(`
    INSERT INTO ai_calibration (farm_id, rule_id, rule_version, total_feedback, positive_feedback, negative_feedback, neutral_feedback, accuracy, weight_override, suppressed_until)
    VALUES ($1, $2, 1, 1, $3, $4, $5, 0.75, 1.0, NULL)
    ON CONFLICT (farm_id, rule_id, rule_version) DO UPDATE SET
      total_feedback = ai_calibration.total_feedback + 1,
      positive_feedback = ai_calibration.positive_feedback + $3,
      negative_feedback = ai_calibration.negative_feedback + $4,
      neutral_feedback = ai_calibration.neutral_feedback + $5,
      updated_at = now()
  `, [farmId, ruleId, feedback === 'positive' ? 1 : 0, feedback === 'negative' ? 1 : 0, feedback === 'neutral' ? 1 : 0]);

  await query(`
    INSERT INTO ai_learning_events (farm_id, rule_id, signal_type, source, category, feedback, predicted_outcome, actual_outcome, confidence_delta, advice_followed, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
  `, [farmId, ruleId, signalType, source, category, feedback, predictedOutcome || null, actualOutcome || null, update.confidenceDelta || null, update.adviceFollowed ?? null]);
}

export async function getCalibration(farmId: string, ruleId?: string): Promise<CalibrationState[]> {
  const sql = ruleId
    ? `SELECT * FROM ai_calibration WHERE farm_id=$1 AND rule_id=$2 ORDER BY updated_at DESC`
    : `SELECT * FROM ai_calibration WHERE farm_id=$1 ORDER BY updated_at DESC`;
  const params = ruleId ? [farmId, ruleId] : [farmId];
  const r = await query(sql, params);
  return r.rows.map((row: any) => ({
    farmId: row.farm_id,
    ruleId: row.rule_id,
    totalFeedback: Number(row.total_feedback) || 0,
    positiveFeedback: Number(row.positive_feedback) || 0,
    negativeFeedback: Number(row.negative_feedback) || 0,
    neutralFeedback: Number(row.neutral_feedback) || 0,
    accuracy: Number(row.accuracy) || 0.75,
    weightOverride: Number(row.weight_override) || 1.0,
    suppressedUntil: row.suppressed_until || null,
  }));
}

export async function computeAccuracy(farmId: string, ruleId: string): Promise<number> {
  const r = await query(`
    SELECT 
      positive_feedback,
      negative_feedback,
      neutral_feedback,
      total_feedback
    FROM ai_calibration
    WHERE farm_id = $1 AND rule_id = $2
  `, [farmId, ruleId]);

  const row = r.rows[0];
  if (!row || Number(row.total_feedback) === 0) return 0.75;

  const total = Number(row.total_feedback);
  const positive = Number(row.positive_feedback);
  const negative = Number(row.negative_feedback);

  return Math.round((positive / total) * 100) / 100;
}

export async function updateWeightOverride(farmId: string, ruleId: string, weight: number): Promise<void> {
  await query(`
    UPDATE ai_calibration
    SET weight_override = LEAST(GREATEST($3, 0.5), 2.0), updated_at = now()
    WHERE farm_id = $1 AND rule_id = $2
  `, [farmId, ruleId, weight]);
}

export async function suppressRule(farmId: string, ruleId: string, days: number = 30): Promise<void> {
  await query(`
    UPDATE ai_calibration
    SET suppressed_until = now() + interval '${days} days', updated_at = now()
    WHERE farm_id = $1 AND rule_id = $2
  `, [farmId, ruleId]);
}

export interface GlobalCalibration {
  accuracy: number;
  weight: number;
  farmCount: number;
}

/**
 * Cross-farm consensus for a rule: how well has this rule performed, and how much
 * should it be weighted, across every farm that has given it feedback? Used as the
 * shrinkage prior for farms with little or no history of their own.
 */
export async function getGlobalCalibration(ruleId: string): Promise<GlobalCalibration> {
  const r = await query(`
    SELECT
      COALESCE(AVG(accuracy), 0.75) as avg_accuracy,
      COALESCE(AVG(weight_override), 1.0) as avg_weight,
      COUNT(*) as farm_count
    FROM ai_calibration
    WHERE rule_id = $1 AND total_feedback > 0
  `, [ruleId]);

  const row = r.rows[0];
  const farmCount = Number(row?.farm_count) || 0;
  if (!row || farmCount === 0) return { accuracy: 0.75, weight: 1.0, farmCount: 0 };
  return { accuracy: Number(row.avg_accuracy), weight: Number(row.avg_weight), farmCount };
}

export async function getGlobalAccuracy(ruleId: string): Promise<number> {
  return (await getGlobalCalibration(ruleId)).accuracy;
}

export async function getGlobalWeightOverride(ruleId: string): Promise<number> {
  return (await getGlobalCalibration(ruleId)).weight;
}

export async function getLearningStats(farmId: string): Promise<{
  totalRulesLearned: number;
  averageAccuracy: number;
  suppressedRules: number;
  improvementsThisMonth: number;
}> {
  const stats = await query(`
    SELECT 
      COUNT(*) as total_rules,
      COALESCE(AVG(accuracy), 0.75) as avg_accuracy,
      COUNT(*) FILTER (WHERE suppressed_until > now()) as suppressed_count
    FROM ai_calibration
    WHERE farm_id = $1
  `, [farmId]);

  const improvements = await query(`
    SELECT COUNT(*) as count
    FROM ai_learning_events
    WHERE farm_id = $1 
      AND feedback = 'positive'
      AND created_at >= date_trunc('month', current_date)
  `, [farmId]);

  const row = stats.rows[0] || {};
  return {
    totalRulesLearned: Number(row.total_rules) || 0,
    averageAccuracy: Number(row.avg_accuracy) || 0.75,
    suppressedRules: Number(row.suppressed_count) || 0,
    improvementsThisMonth: Number(improvements.rows[0]?.count) || 0,
  };
}
