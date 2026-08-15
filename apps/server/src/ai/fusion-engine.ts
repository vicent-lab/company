/**
 * Multi-Intelligence Fusion Engine
 * 
 * Combines 9 intelligence sources into unified, high-confidence recommendations:
 * 1. Rule-Based Expert System    - Veterinary protocols, farm SOPs
 * 2. Machine Learning            - Pattern recognition, anomaly detection
 * 3. Predictive Analytics        - Forecasting, trend projection
 * 4. Statistical Analysis        - Z-scores, distributions, significance
 * 5. Business Intelligence       - KPIs, benchmarks, financial metrics
 * 6. Veterinary Knowledge        - Disease patterns, treatment protocols
 * 7. Weather Intelligence        - Heat stress, grazing conditions
 * 8. Financial Analysis          - ROI, cost-benefit, cash flow
 * 9. Risk Analysis               - Probability × impact assessment
 */

import { query } from '../db/index.js';
import { buildPlainExplanation, urgencyToPriority } from './plain-language.js';
import { getWeatherObservation } from './weather-station.js';

// ---------- Types ----------
export interface IntelligenceSignal {
  source: IntelligenceSource;
  signal_type: string;
  confidence: number;
  metrics: Record<string, any>;
  evidence: any[];
}

export type IntelligenceSource = 
  | 'rule_based'
  | 'machine_learning'
  | 'predictive'
  | 'statistical'
  | 'business'
  | 'veterinary'
  | 'weather'
  | 'financial'
  | 'risk';

export interface FusedRecommendation {
  title: string;
  description: string;
  action_items: { label: string; done: boolean }[];
  severity: 'low' | 'medium' | 'high' | 'critical';
  priority: number;
  confidence: number;
  intelligence_sources: IntelligenceSource[];
  signals: IntelligenceSignal[];
  risk_score: number;
  expected_roi?: number;
  category: string;
  related_cow_id?: string | null;
  urgency_score: number;
  urgency_reason: string;
  metadata: Record<string, any>;
}

// ---------- Intelligence Source Weights ----------
const SOURCE_WEIGHTS_BASE: Record<IntelligenceSource, number> = {
  rule_based: 0.85,      // High trust - explicit veterinary protocols
  machine_learning: 0.70, // Medium trust - pattern-based
  predictive: 0.75,       // Good for forecasting
  statistical: 0.80,      // Strong mathematical basis
  business: 0.65,         // Contextual, needs validation
  veterinary: 0.90,       // Highest trust - domain expertise
  weather: 0.60,          // External factor, moderate trust
  financial: 0.75,        // Quantitative, reliable
  risk: 0.85,             // Composite measure, high value
};

const WEIGHT_CACHE: Map<string, number> = new Map();

// Shrinkage prior: a rule with little or no farm-local feedback leans on how it's
// performed across every other farm, via getGlobalWeightOverride below.
const GLOBAL_PRIOR_STRENGTH = 5;

export async function getSourceWeight(farmId: string, source: IntelligenceSource, ruleId: string): Promise<number> {
  const cacheKey = `${farmId}:${ruleId}`;
  if (WEIGHT_CACHE.has(cacheKey)) return WEIGHT_CACHE.get(cacheKey)!;

  try {
    const { query } = await import('../db/index.js');
    const { getGlobalWeightOverride } = await import('./learning-engine.js');
    const [r, globalWeight] = await Promise.all([
      query(`SELECT weight_override, total_feedback FROM ai_calibration WHERE farm_id=$1 AND rule_id=$2 LIMIT 1`, [farmId, ruleId]),
      getGlobalWeightOverride(ruleId),
    ]);
    const row = r.rows[0];
    const n = row ? Number(row.total_feedback) || 0 : 0;
    const farmOverride = row?.weight_override != null ? Number(row.weight_override) : globalWeight;
    const override = (n * farmOverride + GLOBAL_PRIOR_STRENGTH * globalWeight) / (n + GLOBAL_PRIOR_STRENGTH);
    const weight = (SOURCE_WEIGHTS_BASE[source] || 0.7) * override;
    WEIGHT_CACHE.set(cacheKey, weight);
    return weight;
  } catch {
    return SOURCE_WEIGHTS_BASE[source] || 0.7;
  }
}

export function invalidateWeightCache(farmId: string, ruleId: string): void {
  const cacheKey = `${farmId}:${ruleId}`;
  WEIGHT_CACHE.delete(cacheKey);
}

// ---------- Intelligence Modules ----------

/**
 * 1. Rule-Based Expert System
 * Encodes veterinary protocols, farm SOPs, regulatory requirements
 */
export async function analyzeRuleBased(farmId: string): Promise<IntelligenceSignal[]> {
  const signals: IntelligenceSignal[] = [];

  // Rule: Vaccination schedule compliance
  const vaccCompliance = await query(`
    SELECT 
      COUNT(*) FILTER (WHERE administered_on IS NOT NULL)::float / 
      NULLIF(COUNT(*), 0) AS compliance_rate,
      COUNT(*) AS total_vaccinations,
      COUNT(*) FILTER (WHERE administered_on IS NOT NULL) AS administered
    FROM vaccinations v
    JOIN cows c ON c.id = v.cow_id
    WHERE c.farm_id = $1 AND c.status = 'active'
  `, [farmId]);

  const compliance = Number(vaccCompliance.rows[0]?.compliance_rate || 0);
  if (compliance < 0.8) {
    signals.push({
      source: 'rule_based',
      signal_type: 'vaccination_compliance_low',
      confidence: 0.95,
      metrics: { compliance_rate: compliance, total: vaccCompliance.rows[0]?.total_vaccinations },
      evidence: vaccCompliance.rows,
    });
  }

  // Rule: Dry period minimum (45 days before calving)
  const dryPeriod = await query(`
    SELECT c.cow_code, br.expected_calving_on, 
           CURRENT_DATE - (br.expected_calving_on - INTERVAL '60 days') AS dry_start,
           br.expected_calving_on - CURRENT_DATE AS days_to_calving
    FROM cows c
    JOIN breeding_records br ON br.cow_id = c.id
    WHERE c.farm_id = $1 AND c.status = 'active' AND c.is_pregnant
      AND br.expected_calving_on - CURRENT_DATE < 45
      AND NOT EXISTS (
        SELECT 1 FROM breeding_records br2 
        WHERE br2.cow_id = c.id 
        AND br2.expected_calving_on - INTERVAL '60 days' <= CURRENT_DATE
      )
  `, [farmId]);

  if (dryPeriod.rows.length > 0) {
    signals.push({
      source: 'rule_based',
      signal_type: 'dry_period_insufficient',
      confidence: 0.92,
      metrics: { cows_affected: dryPeriod.rows.length, cows: dryPeriod.rows.map((r: any) => r.cow_code) },
      evidence: dryPeriod.rows,
    });
  }

  // Rule: Milk withdrawal period after treatment
  const withdrawalCheck = await query(`
    SELECT c.cow_code, t.diagnosed_on, t.treatment_plan,
           CURRENT_DATE - t.diagnosed_on AS days_since_treatment
    FROM treatments t
    JOIN cows c ON c.id = t.cow_id
    WHERE c.farm_id = $1 AND c.status = 'active' AND c.is_milking
      AND t.diagnosed_on >= CURRENT_DATE - INTERVAL '14 days'
  `, [farmId]);

  if (withdrawalCheck.rows.length > 0) {
    signals.push({
      source: 'rule_based',
      signal_type: 'milk_withdrawal_monitoring',
      confidence: 0.88,
      metrics: { cows_in_withdrawal: withdrawalCheck.rows.length },
      evidence: withdrawalCheck.rows,
    });
  }

  return signals;
}

/**
 * 2. Machine Learning
 * Pattern recognition, anomaly detection, clustering
 */
export async function analyzeMachineLearning(farmId: string): Promise<IntelligenceSignal[]> {
  const signals: IntelligenceSignal[] = [];

  // Anomaly: Milk yield deviation per cow (z-score based)
  const yieldAnomalies = await query(`
    WITH cow_stats AS (
      SELECT cow_id,
             AVG(morning_liters + afternoon_liters + evening_liters) AS avg_yield,
             STDDEV(morning_liters + afternoon_liters + evening_liters) AS std_yield,
             COUNT(*) AS record_count
      FROM milk_records
      WHERE farm_id = $1 AND recorded_on >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY cow_id
    ),
    recent AS (
      SELECT cow_id,
             AVG(morning_liters + afternoon_liters + evening_liters) AS recent_avg
      FROM milk_records
      WHERE farm_id = $1 AND recorded_on >= CURRENT_DATE - INTERVAL '7 days'
      GROUP BY cow_id
    )
    SELECT c.cow_code, cs.avg_yield, cs.std_yield, r.recent_avg,
           CASE WHEN cs.std_yield > 0 
                THEN (r.recent_avg - cs.avg_yield) / cs.std_yield 
                ELSE 0 END AS z_score
    FROM cow_stats cs
    JOIN recent r ON r.cow_id = cs.cow_id
    JOIN cows c ON c.id = cs.cow_id
    WHERE cs.record_count >= 5
      AND ABS(CASE WHEN cs.std_yield > 0
                   THEN (r.recent_avg - cs.avg_yield) / cs.std_yield
                   ELSE 0 END) > 1.5
    ORDER BY ABS(CASE WHEN cs.std_yield > 0 THEN (r.recent_avg - cs.avg_yield) / cs.std_yield ELSE 0 END) DESC
    LIMIT 10
  `, [farmId]);

  if (yieldAnomalies.rows.length > 0) {
    signals.push({
      source: 'machine_learning',
      signal_type: 'yield_anomaly_detected',
      confidence: 0.78,
      metrics: { 
        anomaly_count: yieldAnomalies.rows.length,
        anomalies: yieldAnomalies.rows.map((r: any) => ({
          cow_code: r.cow_code,
          z_score: Number(r.z_score).toFixed(2),
          expected: Number(r.avg_yield).toFixed(1),
          actual: Number(r.recent_avg).toFixed(1),
        }))
      },
      evidence: yieldAnomalies.rows,
    });
  }

  // Clustering: Identify groups of cows with similar declining patterns
  const clusterCheck = await query(`
    WITH daily_totals AS (
      SELECT recorded_on, 
             SUM(morning_liters + afternoon_liters + evening_liters) AS daily_total,
             COUNT(*) AS recording_cows
      FROM milk_records
      WHERE farm_id = $1 AND recorded_on >= CURRENT_DATE - INTERVAL '14 days'
      GROUP BY recorded_on
    ),
    trend AS (
      SELECT recorded_on, daily_total, moving_avg,
             LAG(moving_avg, 7) OVER (ORDER BY recorded_on) AS prev_avg
      FROM (
        SELECT recorded_on, daily_total,
               AVG(daily_total) OVER (ORDER BY recorded_on ROWS BETWEEN 3 PRECEDING AND CURRENT ROW) AS moving_avg
        FROM daily_totals
      ) sub
    )
    SELECT COUNT(*) FILTER (WHERE moving_avg < prev_avg * 0.9) AS declining_days,
           AVG(moving_avg) AS current_avg,
           AVG(prev_avg) AS previous_avg
    FROM trend
  `, [farmId]);

  const decliningDays = Number(clusterCheck.rows[0]?.declining_days || 0);
  if (decliningDays >= 3) {
    signals.push({
      source: 'machine_learning',
      signal_type: 'herd_pattern_decline',
      confidence: 0.72,
      metrics: { 
        declining_days: decliningDays,
        current_avg: Number(clusterCheck.rows[0]?.current_avg || 0).toFixed(0),
        previous_avg: Number(clusterCheck.rows[0]?.previous_avg || 0).toFixed(0),
      },
      evidence: clusterCheck.rows,
    });
  }

  return signals;
}

/**
 * 3. Predictive Analytics
 * Forecasting, trend projection, time-series analysis
 */
export async function analyzePredictive(farmId: string): Promise<IntelligenceSignal[]> {
  const signals: IntelligenceSignal[] = [];

  // Forecast: 30-day milk production using linear regression on recent trend
  const forecast = await query(`
    WITH daily AS (
      SELECT recorded_on,
             SUM(morning_liters + afternoon_liters + evening_liters) AS total,
             EXTRACT(EPOCH FROM recorded_on) / 86400 AS day_epoch
      FROM milk_records
      WHERE farm_id = $1 AND recorded_on >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY recorded_on
    ),
    stats AS (
      SELECT AVG(day_epoch) AS avg_x, AVG(total) AS avg_y,
             VAR_POP(day_epoch) AS var_x,
             COUNT(*) AS n
      FROM daily
    ),
    regression AS (
      SELECT 
        SUM((d.day_epoch - (SELECT avg_x FROM stats)) * (d.total - (SELECT avg_y FROM stats))) /
        NULLIF((SELECT var_x FROM stats) * (SELECT n FROM stats), 0) AS slope,
        (SELECT avg_y FROM stats) AS avg_y,
        (SELECT avg_x FROM stats) AS avg_x
      FROM daily d
    )
    SELECT slope, avg_y AS current_avg,
           slope * (EXTRACT(EPOCH FROM (CURRENT_DATE + INTERVAL '30 days')) / 86400) + avg_y - slope * avg_x AS forecast_30d,
           CASE WHEN slope < 0 THEN 'declining' WHEN slope > 0 THEN 'increasing' ELSE 'stable' END AS trend_direction
    FROM regression
  `, [farmId]);

  if (forecast.rows.length > 0 && forecast.rows[0].slope) {
    const slope = Number(forecast.rows[0].slope);
    const currentAvg = Number(forecast.rows[0].current_avg || 0);
    const forecast30d = Number(forecast.rows[0].forecast_30d || 0);
    const projectedChange = currentAvg > 0 ? ((forecast30d - currentAvg) / currentAvg * 100) : 0;

    if (Math.abs(projectedChange) > 5) {
      signals.push({
        source: 'predictive',
        signal_type: 'production_forecast',
        confidence: 0.75,
        metrics: {
          trend_direction: forecast.rows[0].trend_direction,
          current_daily_avg: currentAvg.toFixed(0),
          forecast_30d: forecast30d.toFixed(0),
          projected_change_pct: projectedChange.toFixed(1),
          daily_slope: (slope * 86400).toFixed(2), // Convert to L/day change
        },
        evidence: forecast.rows,
      });
    }
  }

  // Predict: Feed requirement for next 14 days based on herd composition
  const feedForecast = await query(`
    SELECT 
      (SELECT COUNT(*) FROM cows WHERE farm_id = $1 AND is_milking AND status = 'active') AS milking,
      (SELECT COUNT(*) FROM cows WHERE farm_id = $1 AND is_pregnant AND status = 'active') AS pregnant,
      (SELECT COUNT(*) FROM cows WHERE farm_id = $1 AND status = 'active' AND date_of_birth >= CURRENT_DATE - INTERVAL '1 year') AS young_stock
  `, [farmId]);

  // Simplified feed requirement prediction
  const milking = Number(feedForecast.rows[0]?.milking || 0);
  const pregnant = Number(feedForecast.rows[0]?.pregnant || 0);
  const youngStock = Number(feedForecast.rows[0]?.young_stock || 0);
  const predictedFeedNeed = milking * 25 + pregnant * 5 + youngStock * 8; // kg/day estimate

  const currentStock = await query(`
    SELECT COALESCE(SUM(fi.quantity), 0) AS current_stock
    FROM feed_inventory fi
    JOIN feed_types ft ON ft.id = fi.feed_type_id
    WHERE ft.farm_id = $1
  `, [farmId]);

  const stock = Number(currentStock.rows[0]?.current_stock || 0);
  const daysOfFeed = predictedFeedNeed > 0 ? stock / predictedFeedNeed : 999;

  if (daysOfFeed < 14) {
    signals.push({
      source: 'predictive',
      signal_type: 'feed_shortage_predicted',
      confidence: 0.82,
      metrics: {
        predicted_daily_need_kg: predictedFeedNeed,
        current_stock_kg: stock,
        days_remaining: daysOfFeed.toFixed(1),
        milking_cows: milking,
        pregnant_cows: pregnant,
      },
      evidence: [{ predicted_need: predictedFeedNeed, stock, days_of_feed: daysOfFeed }],
    });
  }

  return signals;
}

/**
 * 4. Statistical Analysis
 * Z-scores, distributions, significance testing, control charts
 */
export async function analyzeStatistical(farmId: string): Promise<IntelligenceSignal[]> {
  const signals: IntelligenceSignal[] = [];

  // Control chart: Milk production outside 3-sigma limits
  const controlChart = await query(`
    WITH stats AS (
      SELECT AVG(daily_total) AS mean, STDDEV(daily_total) AS std
      FROM (
        SELECT recorded_on, SUM(morning_liters + afternoon_liters + evening_liters) AS daily_total
        FROM milk_records
        WHERE farm_id = $1 AND recorded_on >= CURRENT_DATE - INTERVAL '60 days'
          AND recorded_on < CURRENT_DATE - INTERVAL '7 days'
        GROUP BY recorded_on
      ) sub
    ),
    recent AS (
      SELECT recorded_on, SUM(morning_liters + afternoon_liters + evening_liters) AS daily_total
      FROM milk_records
      WHERE farm_id = $1 AND recorded_on >= CURRENT_DATE - INTERVAL '7 days'
      GROUP BY recorded_on
    )
    SELECT r.recorded_on, r.daily_total, s.mean, s.std,
           (r.daily_total - s.mean) / NULLIF(s.std, 0) AS z_score,
           CASE WHEN ABS((r.daily_total - s.mean) / NULLIF(s.std, 0)) > 2 THEN 'out_of_control' ELSE 'in_control' END AS status
    FROM recent r, stats s
  `, [farmId]);

  const outOfControl = controlChart.rows.filter((r: any) => r.status === 'out_of_control');
  if (outOfControl.length > 0) {
    signals.push({
      source: 'statistical',
      signal_type: 'production_out_of_control',
      confidence: 0.85,
      metrics: {
        out_of_control_days: outOfControl.length,
        control_limit_breaches: outOfControl.map((r: any) => ({
          date: r.recorded_on,
          actual: Number(r.daily_total).toFixed(0),
          mean: Number(r.mean).toFixed(0),
          z_score: Number(r.z_score).toFixed(2),
        })),
      },
      evidence: controlChart.rows,
    });
  }

  // Distribution analysis: Body condition score distribution
  const bcsDistribution = await query(`
    SELECT 
      COUNT(*) FILTER (WHERE body_condition_score BETWEEN 1 AND 2) AS thin,
      COUNT(*) FILTER (WHERE body_condition_score BETWEEN 3 AND 4) AS ideal,
      COUNT(*) FILTER (WHERE body_condition_score >= 5) AS fat,
      COUNT(*) AS total,
      AVG(body_condition_score) AS avg_bcs
    FROM health_records
    WHERE farm_id = $1 
      AND recorded_on >= CURRENT_DATE - INTERVAL '30 days'
      AND body_condition_score IS NOT NULL
  `, [farmId]);

  const bcs = bcsDistribution.rows[0];
  if (bcs && Number(bcs.total) > 0) {
    const thinPct = Number(bcs.thin) / Number(bcs.total);
    if (thinPct > 0.15) {
      signals.push({
        source: 'statistical',
        signal_type: 'bcs_distribution_skewed',
        confidence: 0.80,
        metrics: {
          avg_bcs: Number(bcs.avg_bcs).toFixed(2),
          thin_pct: (thinPct * 100).toFixed(1),
          ideal_pct: ((Number(bcs.ideal) / Number(bcs.total)) * 100).toFixed(1),
          fat_pct: ((Number(bcs.fat) / Number(bcs.total)) * 100).toFixed(1),
        },
        evidence: bcsDistribution.rows,
      });
    }
  }

  return signals;
}

/**
 * 5. Business Intelligence
 * KPIs, benchmarks, operational metrics, efficiency ratios
 */
export async function analyzeBusiness(farmId: string): Promise<IntelligenceSignal[]> {
  const signals: IntelligenceSignal[] = [];

  // KPI: Milk per worker efficiency
  const workerEfficiency = await query(`
    WITH milk_total AS (
      SELECT COALESCE(SUM(morning_liters + afternoon_liters + evening_liters), 0) AS total_milk
      FROM milk_records
      WHERE farm_id = $1 AND recorded_on = CURRENT_DATE
    ),
    worker_count AS (
      SELECT COUNT(*) AS workers FROM employees WHERE farm_id = $1 AND is_active
    )
    SELECT mt.total_milk, wc.workers,
           CASE WHEN wc.workers > 0 THEN mt.total_milk / wc.workers ELSE 0 END AS milk_per_worker
    FROM milk_total mt, worker_count wc
  `, [farmId]);

  const milkPerWorker = Number(workerEfficiency.rows[0]?.milk_per_worker || 0);
  if (milkPerWorker > 0 && milkPerWorker < 200) { // Below benchmark
    signals.push({
      source: 'business',
      signal_type: 'labor_efficiency_low',
      confidence: 0.68,
      metrics: {
        milk_per_worker: milkPerWorker.toFixed(0),
        benchmark: 200,
        total_workers: workerEfficiency.rows[0]?.workers || 0,
      },
      evidence: workerEfficiency.rows,
    });
  }

  // KPI: Feed cost per liter of milk
  const feedCostPerLiter = await query(`
    WITH feed_cost AS (
      SELECT COALESCE(SUM(e.amount), 0) AS monthly_feed_cost
      FROM expenses e
      WHERE e.farm_id = $1 AND e.category ILIKE '%feed%'
        AND e.incurred_on >= CURRENT_DATE - INTERVAL '30 days'
    ),
    milk_prod AS (
      SELECT COALESCE(SUM(morning_liters + afternoon_liters + evening_liters), 0) AS monthly_milk
      FROM milk_records
      WHERE farm_id = $1 AND recorded_on >= CURRENT_DATE - INTERVAL '30 days'
    )
    SELECT fc.monthly_feed_cost, mp.monthly_milk,
           CASE WHEN mp.monthly_milk > 0 THEN fc.monthly_feed_cost / mp.monthly_milk ELSE 0 END AS cost_per_liter
    FROM feed_cost fc, milk_prod mp
  `, [farmId]);

  const costPerLiter = Number(feedCostPerLiter.rows[0]?.cost_per_liter || 0);
  if (costPerLiter > 0.35) { // Above benchmark
    signals.push({
      source: 'business',
      signal_type: 'feed_cost_high',
      confidence: 0.72,
      metrics: {
        cost_per_liter: costPerLiter.toFixed(2),
        benchmark: 0.30,
        monthly_feed_cost: Number(feedCostPerLiter.rows[0]?.monthly_feed_cost || 0).toFixed(0),
      },
      evidence: feedCostPerLiter.rows,
    });
  }

  // KPI: conception rate benchmark
  const conceptionRate = await query(`
    SELECT 
      COUNT(*) FILTER (WHERE lower(result) = 'pregnant')::float /
      NULLIF(COUNT(*), 0) AS conception_rate,
      COUNT(*) AS total_services
    FROM breeding_records br
    JOIN cows c ON c.id = br.cow_id
    WHERE c.farm_id = $1 AND br.breeding_date >= CURRENT_DATE - INTERVAL '180 days'
  `, [farmId]);

  const rate = Number(conceptionRate.rows[0]?.conception_rate || 0);
  if (rate > 0 && rate < 0.40) {
    signals.push({
      source: 'business',
      signal_type: 'conception_rate_below_benchmark',
      confidence: 0.75,
      metrics: {
        conception_rate: (rate * 100).toFixed(1),
        benchmark: 50,
        total_services: conceptionRate.rows[0]?.total_services,
      },
      evidence: conceptionRate.rows,
    });
  }

  return signals;
}

/**
 * 6. Veterinary Knowledge
 * Disease patterns, treatment protocols, herd health management
 */
export async function analyzeVeterinary(farmId: string): Promise<IntelligenceSignal[]> {
  const signals: IntelligenceSignal[] = [];

  // Vet: Mastitis risk assessment (SCC proxy via milk temperature + yield drop)
  const mastitisRisk = await query(`
    SELECT c.cow_code, c.name, mr.temperature_c,
           mr2.avg_yield AS recent_avg,
           h.lameness_score, h.body_condition_score
    FROM cows c
    JOIN milk_records mr ON mr.cow_id = c.id AND mr.recorded_on = CURRENT_DATE
    LEFT JOIN LATERAL (
      SELECT AVG(morning_liters + afternoon_liters + evening_liters) AS avg_yield
      FROM milk_records WHERE cow_id = c.id 
        AND recorded_on >= CURRENT_DATE - INTERVAL '7 days'
    ) mr2 ON true
    LEFT JOIN LATERAL (
      SELECT lameness_score, body_condition_score FROM health_records 
      WHERE cow_id = c.id ORDER BY recorded_on DESC LIMIT 1
    ) h ON true
    WHERE c.farm_id = $1 AND c.status = 'active' AND c.is_milking
      AND (mr.temperature_c > 39.0 OR mr.temperature_c IS NULL)
    LIMIT 20
  `, [farmId]);

  const feverCows = mastitisRisk.rows.filter((r: any) => Number(r.temperature_c) > 39.0);
  if (feverCows.length > 0) {
    signals.push({
      source: 'veterinary',
      signal_type: 'mastitis_risk_elevated',
      confidence: 0.88,
      metrics: {
        cows_with_fever: feverCows.length,
        fever_cows: feverCows.map((r: any) => r.cow_code),
        avg_temperature: (feverCows.reduce((s: number, r: any) => s + Number(r.temperature_c), 0) / feverCows.length).toFixed(1),
      },
      evidence: feverCows,
    });
  }

  // Vet: Lameness prevalence
  const lamenessCheck = await query(`
    SELECT 
      COUNT(*) FILTER (WHERE lameness_score >= 3) AS severe_lame,
      COUNT(*) FILTER (WHERE lameness_score >= 2 AND lameness_score < 3) AS mild_lame,
      COUNT(*) AS total_examined,
      AVG(lameness_score) AS avg_score
    FROM health_records
    WHERE farm_id = $1 AND recorded_on >= CURRENT_DATE - INTERVAL '60 days'
      AND lameness_score IS NOT NULL
  `, [farmId]);

  const lameness = lamenessCheck.rows[0];
  if (lameness && Number(lameness.total_examined) > 0) {
    const severePct = Number(lameness.severe_lame) / Number(lameness.total_examined);
    if (severePct > 0.05) { // >5% severe lameness is a welfare concern
      signals.push({
        source: 'veterinary',
        signal_type: 'lameness_prevalence_high',
        confidence: 0.90,
        metrics: {
          severe_lameness_pct: (severePct * 100).toFixed(1),
          mild_lameness_pct: ((Number(lameness.mild_lame) / Number(lameness.total_examined)) * 100).toFixed(1),
          avg_lameness_score: Number(lameness.avg_score).toFixed(2),
          total_examined: lameness.total_examined,
        },
        evidence: lamenessCheck.rows,
      });
    }
  }

  // Vet: Metabolic disease risk (ketosis/acidosis patterns)
  const metabolicRisk = await query(`
    SELECT 
      COUNT(*) FILTER (WHERE ai_detected_disease IN ('ketosis', 'acidosis')) AS metabolic_cases,
      COUNT(*) AS total_ai_checks,
      COUNT(*) FILTER (WHERE body_condition_score >= 4) AS overconditioned
    FROM health_records
    WHERE farm_id = $1 AND recorded_on >= CURRENT_DATE - INTERVAL '30 days'
  `, [farmId]);

  const metabolic = metabolicRisk.rows[0];
  if (metabolic && Number(metabolic.metabolic_cases) > 0) {
    signals.push({
      source: 'veterinary',
      signal_type: 'metabolic_disease_detected',
      confidence: 0.85,
      metrics: {
        metabolic_cases: metabolic.metabolic_cases,
        overconditioned_cows: metabolic.overconditioned,
        detection_rate: ((Number(metabolic.metabolic_cases) / Math.max(1, Number(metabolic.total_ai_checks))) * 100).toFixed(1),
      },
      evidence: metabolicRisk.rows,
    });
  }

  return signals;
}

/**
 * 7. Weather Intelligence
 * Heat stress index, grazing conditions, environmental factors
 */
export async function analyzeWeather(farmId: string): Promise<IntelligenceSignal[]> {
  const signals: IntelligenceSignal[] = [];

  const obs = await getWeatherObservation(farmId);
  const { thi, temperatureC: temp, humidityPct: humidity } = obs;

  if (obs.heatStress !== 'none') {
    signals.push({
      source: 'weather',
      signal_type: 'heat_stress_risk',
      confidence: 0.80,
      metrics: {
        thi: thi.toFixed(1),
        temperature_c: temp.toFixed(1),
        humidity_pct: humidity.toFixed(0),
        risk_level: obs.heatStress,
      },
      evidence: [{ thi, temp, humidity }],
    });
  }

  if (obs.coldStress !== 'none') {
    signals.push({
      source: 'weather',
      signal_type: 'cold_stress_risk',
      confidence: 0.75,
      metrics: {
        temperature_c: temp.toFixed(1),
        risk_level: obs.coldStress,
        energy_requirement_increase_pct: Math.round((5 - temp) * 2).toString(),
      },
      evidence: [{ temp }],
    });
  }

  return signals;
}

/**
 * 8. Financial Analysis
 * ROI, cost-benefit, cash flow, margin analysis
 */
export async function analyzeFinancial(farmId: string): Promise<IntelligenceSignal[]> {
  const signals: IntelligenceSignal[] = [];

  // Cash flow analysis
  const cashFlow = await query(`
    WITH monthly AS (
      SELECT 
        DATE_TRUNC('month', received_on) AS month,
        COALESCE(SUM(amount), 0) AS income
      FROM income
      WHERE farm_id = $1 AND received_on >= CURRENT_DATE - INTERVAL '6 months'
      GROUP BY DATE_TRUNC('month', received_on)
    ),
    expenses_monthly AS (
      SELECT 
        DATE_TRUNC('month', incurred_on) AS month,
        COALESCE(SUM(amount), 0) AS expenses
      FROM expenses
      WHERE farm_id = $1 AND incurred_on >= CURRENT_DATE - INTERVAL '6 months'
      GROUP BY DATE_TRUNC('month', incurred_on)
    )
    SELECT i.month, i.income, e.expenses, i.income - e.expenses AS net,
           CASE WHEN i.income > 0 THEN (i.income - e.expenses) / i.income * 100 ELSE 0 END AS margin_pct
    FROM monthly i
    LEFT JOIN expenses_monthly e ON e.month = i.month
    ORDER BY i.month DESC
    LIMIT 6
  `, [farmId]);

  const recentMonths = cashFlow.rows.slice(0, 3);
  const avgMargin = recentMonths.reduce((s: number, r: any) => s + Number(r.margin_pct), 0) / Math.max(1, recentMonths.length);

  if (avgMargin < 15) {
    signals.push({
      source: 'financial',
      signal_type: 'margin_below_target',
      confidence: 0.82,
      metrics: {
        avg_margin_pct: avgMargin.toFixed(1),
        target_margin: 25,
        months_analyzed: recentMonths.length,
        recent_cash_flows: recentMonths.map((r: any) => ({
          month: r.month,
          income: Number(r.income).toFixed(0),
          expenses: Number(r.expenses).toFixed(0),
          net: Number(r.net).toFixed(0),
        })),
      },
      evidence: cashFlow.rows,
    });
  }

  // ROI on veterinary spend
  const vetROI = await query(`
    WITH vet_spend AS (
      SELECT COALESCE(SUM(amount), 0) AS vet_cost
      FROM expenses WHERE farm_id = $1 AND category ILIKE '%vet%'
        AND incurred_on >= CURRENT_DATE - INTERVAL '90 days'
    ),
    milk_revenue AS (
      SELECT COALESCE(SUM(morning_liters + afternoon_liters + evening_liters), 0) * 0.45 AS revenue
      FROM milk_records WHERE farm_id = $1 
        AND recorded_on >= CURRENT_DATE - INTERVAL '90 days'
    )
    SELECT vet_cost, revenue,
           CASE WHEN vet_cost > 0 THEN (revenue / vet_cost) ELSE 0 END AS roi_ratio
    FROM vet_spend, milk_revenue
  `, [farmId]);

  const roi = Number(vetROI.rows[0]?.roi_ratio || 0);
  if (roi > 0 && roi < 3) {
    signals.push({
      source: 'financial',
      signal_type: 'vet_roi_low',
      confidence: 0.70,
      metrics: {
        vet_spend_90d: Number(vetROI.rows[0]?.vet_cost || 0).toFixed(0),
        revenue_90d: Number(vetROI.rows[0]?.revenue || 0).toFixed(0),
        roi_ratio: roi.toFixed(2),
        target_roi: 5,
      },
      evidence: vetROI.rows,
    });
  }

  // Cost per cow analysis
  const costPerCow = await query(`
    SELECT 
      COALESCE(SUM(amount), 0) / NULLIF((SELECT COUNT(*) FROM cows WHERE farm_id = $1 AND status = 'active'), 0) AS cost_per_cow
    FROM expenses
    WHERE farm_id = $1 AND incurred_on >= CURRENT_DATE - INTERVAL '30 days'
  `, [farmId]);

  const cpc = Number(costPerCow.rows[0]?.cost_per_cow || 0);
  if (cpc > 500) { // High cost per cow threshold
    signals.push({
      source: 'financial',
      signal_type: 'cost_per_cow_high',
      confidence: 0.75,
      metrics: {
        cost_per_cow: cpc.toFixed(0),
        benchmark: 400,
      },
      evidence: costPerCow.rows,
    });
  }

  return signals;
}

/**
 * 9. Risk Analysis
 * Probability × impact assessment, scenario analysis
 */
export async function analyzeRisk(farmId: string): Promise<IntelligenceSignal[]> {
  const signals: IntelligenceSignal[] = [];

  // Composite risk: Disease outbreak probability
  const diseaseRisk = await query(`
    WITH risk_factors AS (
      SELECT 
        (SELECT COUNT(*)::float FROM cows WHERE farm_id = $1 AND health <> 'healthy') / 
          NULLIF((SELECT COUNT(*) FROM cows WHERE farm_id = $1 AND status = 'active'), 0) AS sick_ratio,
        (SELECT COUNT(*)::float FROM health_records hr
         JOIN cows c ON c.id = hr.cow_id
         WHERE c.farm_id = $1 AND hr.body_condition_score < 2
           AND hr.recorded_on >= CURRENT_DATE - INTERVAL '60 days') /
          NULLIF((SELECT COUNT(*) FROM cows WHERE farm_id = $1 AND status = 'active'), 0) AS thin_ratio,
        (SELECT COUNT(*)::float FROM vaccinations v
         JOIN cows c ON c.id = v.cow_id
         WHERE c.farm_id = $1 AND v.administered_on IS NULL AND v.due_on <= CURRENT_DATE) /
          NULLIF((SELECT COUNT(*) FROM vaccinations v
         JOIN cows c ON c.id = v.cow_id
         WHERE c.farm_id = $1), 0) AS vacc_gap_ratio,
        (SELECT COUNT(*)::float FROM cows WHERE farm_id = $1 AND barn_id IS NOT NULL) /
          NULLIF((SELECT COUNT(*) FROM barns WHERE farm_id = $1), 0) AS crowding_ratio
    )
    SELECT 
      sick_ratio, thin_ratio, vacc_gap_ratio, crowding_ratio,
      (COALESCE(sick_ratio, 0) * 0.4 + COALESCE(thin_ratio, 0) * 0.2 + 
       COALESCE(vacc_gap_ratio, 0) * 0.25 + COALESCE(crowding_ratio, 0) * 0.15) AS composite_risk
    FROM risk_factors
  `, [farmId]);

  const risk = Number(diseaseRisk.rows[0]?.composite_risk || 0);
  if (risk > 0.15) {
    signals.push({
      source: 'risk',
      signal_type: 'disease_outbreak_risk',
      confidence: 0.85,
      metrics: {
        composite_risk_score: (risk * 100).toFixed(1),
        risk_level: risk > 0.4 ? 'critical' : risk > 0.25 ? 'high' : 'moderate',
        sick_ratio: (Number(diseaseRisk.rows[0]?.sick_ratio || 0) * 100).toFixed(1),
        thin_ratio: (Number(diseaseRisk.rows[0]?.thin_ratio || 0) * 100).toFixed(1),
        vacc_gap_ratio: (Number(diseaseRisk.rows[0]?.vacc_gap_ratio || 0) * 100).toFixed(1),
      },
      evidence: diseaseRisk.rows,
    });
  }

  // Financial risk: Cash runway
  const cashRunway = await query(`
    WITH current_cash AS (
      SELECT 
        COALESCE((SELECT SUM(amount) FROM income WHERE farm_id = $1 AND received_on >= CURRENT_DATE - INTERVAL '30 days'), 0) -
        COALESCE((SELECT SUM(amount) FROM expenses WHERE farm_id = $1 AND incurred_on >= CURRENT_DATE - INTERVAL '30 days'), 0) AS monthly_burn,
        COALESCE((SELECT SUM(amount) FROM income WHERE farm_id = $1 AND received_on >= CURRENT_DATE - INTERVAL '90 days'), 0) / 3 AS avg_monthly_income
    )
    SELECT monthly_burn, avg_monthly_income,
           CASE WHEN monthly_burn < 0 THEN avg_monthly_income / ABS(monthly_burn) * 30 ELSE 999 END AS runway_days
    FROM current_cash
  `, [farmId]);

  const runway = Number(cashRunway.rows[0]?.runway_days || 999);
  if (runway < 60 && runway < 999) {
    signals.push({
      source: 'risk',
      signal_type: 'cash_runway_short',
      confidence: 0.88,
      metrics: {
        runway_days: runway.toFixed(0),
        safe_runway: 90,
        monthly_burn: Number(cashRunway.rows[0]?.monthly_burn || 0).toFixed(0),
      },
      evidence: cashRunway.rows,
    });
  }

  // Operational risk: Key person dependency
  const keyPersonRisk = await query(`
    WITH critical_roles AS (
      SELECT job_title, COUNT(*) AS count
      FROM employees WHERE farm_id = $1 AND is_active
      GROUP BY job_title
      HAVING COUNT(*) = 1
    )
    SELECT COUNT(*) AS single_point_roles,
           STRING_AGG(job_title, ', ') AS critical_roles
    FROM critical_roles
  `, [farmId]);

  const singlePoints = Number(keyPersonRisk.rows[0]?.single_point_roles || 0);
  if (singlePoints >= 2) {
    signals.push({
      source: 'risk',
      signal_type: 'key_person_dependency',
      confidence: 0.78,
      metrics: {
        single_point_roles: singlePoints,
        critical_roles: keyPersonRisk.rows[0]?.critical_roles,
      },
      evidence: keyPersonRisk.rows,
    });
  }

  return signals;
}

// ---------- Fusion Engine ----------

/**
 * Fuses all intelligence signals into unified recommendations.
 * Uses weighted scoring, cross-source validation, and conflict resolution.
 */
export async function fuseIntelligence(farmId: string): Promise<FusedRecommendation[]> {
  // Collect signals from all 9 sources
  const [ruleSignals, mlSignals, predSignals, statSignals, bizSignals, vetSignals, weatherSignals, finSignals, riskSignals] = await Promise.all([
    analyzeRuleBased(farmId),
    analyzeMachineLearning(farmId),
    analyzePredictive(farmId),
    analyzeStatistical(farmId),
    analyzeBusiness(farmId),
    analyzeVeterinary(farmId),
    analyzeWeather(farmId),
    analyzeFinancial(farmId),
    analyzeRisk(farmId),
  ]);

  const allSignals = [
    ...ruleSignals, ...mlSignals, ...predSignals, ...statSignals,
    ...bizSignals, ...vetSignals, ...weatherSignals, ...finSignals, ...riskSignals,
  ];

  if (allSignals.length === 0) return [];

  // Group signals by related entity (cow or farm-wide)
  const signalGroups = groupSignals(allSignals);

  // Fuse each group into a recommendation (with async learned weights)
  const recommendations: FusedRecommendation[] = [];
  for (const group of signalGroups) {
    const fused = await fuseGroup(farmId, group);
    recommendations.push(createRecommendation(fused));
  }

  // Rank by urgency first — how soon this needs a human decision — not just how bad it
  // is. A high-severity but distant issue (margin trending down over a quarter) should
  // not bury a lower-severity issue with a real deadline (feed runs out in 2 days).
  // Confidence is the tie-breaker among equally urgent items.
  return recommendations
    .sort((a, b) => b.urgency_score - a.urgency_score || b.confidence * b.priority - a.confidence * a.priority);
}

interface SignalGroup {
  key: string;
  signals: IntelligenceSignal[];
  related_cow_id?: string | null;
}

function groupSignals(signals: IntelligenceSignal[]): SignalGroup[] {
  const groups: Map<string, SignalGroup> = new Map();

  for (const signal of signals) {
    // Create grouping key based on cow_id or signal_type
    const cowId = signal.metrics?.cow_id || signal.evidence?.[0]?.cow_id || signal.metrics?.cow_code;
    const key = cowId ? `cow:${cowId}` : `farm:${signal.signal_type}`;

    if (!groups.has(key)) {
      groups.set(key, { key, signals: [], related_cow_id: cowId || null });
    }
    groups.get(key)!.signals.push(signal);
  }

  return Array.from(groups.values());
}

interface FusedGroup {
  signals: IntelligenceSignal[];
  weighted_confidence: number;
  source_diversity: number;
  agreement_score: number;
  risk_amplification: number;
}

async function fuseGroup(farmId: string, group: SignalGroup): Promise<FusedGroup> {
  const signals = group.signals;

  // Weighted confidence: sum of (signal_confidence × source_weight)
  let weightedConfidence = 0;
  let totalWeight = 0;
  for (const s of signals) {
    const ruleId = s.metrics?.rule_id || `${s.source}_${s.signal_type}`;
    const weight = await getSourceWeight(farmId, s.source, ruleId);
    weightedConfidence += s.confidence * weight;
    totalWeight += weight;
  }
  weightedConfidence = totalWeight > 0 ? weightedConfidence / totalWeight : 0;

  // Source diversity bonus: more independent sources = higher confidence
  const uniqueSources = new Set(signals.map(s => s.source));
  const diversityBonus = Math.min(uniqueSources.size / 3, 1) * 0.15; // Max +15% for 3+ sources

  // Agreement score: how consistent are the signals?
  const agreementScore = calculateAgreement(signals);

  // Risk amplification: if multiple signals point to same risk, amplify
  const riskAmplification = calculateRiskAmplification(signals);

  return {
    signals,
    weighted_confidence: Math.min(1, weightedConfidence + diversityBonus * agreementScore),
    source_diversity: uniqueSources.size,
    agreement_score: agreementScore,
    risk_amplification: riskAmplification,
  };
}

function calculateAgreement(signals: IntelligenceSignal[]): number {
  if (signals.length <= 1) return 1.0;

  // Check if signals are directionally consistent
  const directions = signals.map(s => {
    const type = s.signal_type;
    if (type.includes('low') || type.includes('decline') || type.includes('risk') || type.includes('below') || type.includes('high') || type.includes('insufficient')) return -1;
    if (type.includes('high') || type.includes('above') || type.includes('elevated')) return 1;
    return 0;
  });

  const positive = directions.filter(d => d > 0).length;
  const negative = directions.filter(d => d < 0).length;
  const total = directions.filter(d => d !== 0).length;

  if (total === 0) return 0.5;
  return Math.max(positive, negative) / total;
}

function calculateRiskAmplification(signals: IntelligenceSignal[]): number {
  const riskSignals = signals.filter(s => 
    s.source === 'risk' || s.signal_type.includes('risk')
  );
  if (riskSignals.length === 0) return 1.0;

  // Amplify based on number of risk signals
  return 1 + (riskSignals.length - 1) * 0.2;
}

function createRecommendation(fused: FusedGroup): FusedRecommendation {
  const signals = fused.signals;
  const primarySignal = signals.reduce((a, b) => a.confidence > b.confidence ? a : b);

  // Determine severity based on fused confidence and risk amplification
  const adjustedConfidence = Math.min(1, fused.weighted_confidence * fused.risk_amplification);
  let severity: 'low' | 'medium' | 'high' | 'critical' = 'low';
  if (adjustedConfidence > 0.85 || signals.some(s => s.source === 'veterinary' && s.confidence > 0.85)) severity = 'critical';
  else if (adjustedConfidence > 0.70) severity = 'high';
  else if (adjustedConfidence > 0.50) severity = 'medium';

  // Build title from signals
  const title = buildFusedTitle(signals, primarySignal);

  // Plain-language reasoning: what's happening, why it matters, how confident we are,
  // and how urgent it is — the four things a farmer actually needs answered, in that
  // order. The old per-signal technical dump is kept too, but as evidence for the
  // detail view, not as the headline description.
  const explanation = buildPlainExplanation(signals, severity, fused.source_diversity, fused.agreement_score, fused.weighted_confidence);
  const actionItems = buildFusedActions(signals);

  // Calculate expected ROI if financial signals present
  const finSignals = signals.filter(s => s.source === 'financial');
  const expectedROI = finSignals.length > 0 ? calculateExpectedROI(finSignals) : undefined;

  return {
    title,
    description: explanation.description,
    action_items: actionItems,
    severity,
    priority: urgencyToPriority(explanation.urgency.score),
    confidence: Math.round(adjustedConfidence * 100) / 100,
    intelligence_sources: Array.from(new Set(signals.map(s => s.source))),
    signals: signals.map(s => ({
      source: s.source,
      signal_type: s.signal_type,
      confidence: s.confidence,
      metrics: s.metrics,
      evidence: s.evidence,
    })),
    risk_score: Math.round(fused.risk_amplification * 100) / 100,
    expected_roi: expectedROI,
    category: categorizeSignals(signals),
    related_cow_id: signals[0]?.metrics?.cow_id || signals[0]?.evidence?.[0]?.cow_id || null,
    urgency_score: explanation.urgency.score,
    urgency_reason: explanation.urgency.reason,
    metadata: {
      source_count: fused.source_diversity,
      agreement_score: Math.round(fused.agreement_score * 100) / 100,
      risk_amplification: Math.round(fused.risk_amplification * 100) / 100,
      signal_count: signals.length,
      why_it_matters: explanation.whyItMatters,
      confidence_note: explanation.confidenceNote,
      urgency_score: explanation.urgency.score,
      urgency_reason: explanation.urgency.reason,
      days_to_impact: explanation.urgency.daysToImpact,
      technical_evidence: explanation.technicalEvidence,
    },
  };
}

function buildFusedTitle(signals: IntelligenceSignal[], primary: IntelligenceSignal): string {
  const sourceLabels: Record<string, string> = {
    rule_based: 'Protocol',
    machine_learning: 'ML Pattern',
    predictive: 'Forecast',
    statistical: 'Statistical',
    business: 'KPI',
    veterinary: 'Clinical',
    weather: 'Environmental',
    financial: 'Financial',
    risk: 'Risk Assessment',
  };

  const sources = Array.from(new Set(signals.map(s => sourceLabels[s.source] || s.source))).join(', ');
  
  const titleTemplates: Record<string, string> = {
    mastitis_risk_elevated: 'Mastitis outbreak risk — clinical + environmental signals',
    disease_outbreak_risk: 'Disease outbreak risk — multi-factor assessment',
    production_forecast: 'Production forecast deviation detected',
    yield_anomaly_detected: 'Milk yield anomaly — pattern recognition alert',
    feed_shortage_predicted: 'Feed shortage predicted — supply chain risk',
    heat_stress_risk: 'Heat stress risk — environmental + production impact',
    margin_below_target: 'Profit margin below target — financial + operational analysis',
    lameness_prevalence_high: 'Lameness prevalence above welfare threshold',
    cash_runway_short: 'Cash runway concern — financial risk assessment',
  };

  const template = titleTemplates[primary.signal_type];
  if (template) return `[${sources}] ${template}`;

  return `[${sources}] ${primary.signal_type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}`;
}

function buildFusedActions(signals: IntelligenceSignal[]): { label: string; done: boolean }[] {
  const actionMap: Record<string, string[]> = {
    mastitis_risk_elevated: ['Conduct CMT test on flagged cows', 'Review milking hygiene protocol', 'Check milking equipment function', 'Isolate suspected cases'],
    disease_outbreak_risk: ['Implement enhanced biosecurity', 'Review vaccination status', 'Increase monitoring frequency', 'Consult veterinarian for prevention plan'],
    production_forecast: ['Audit feed quality and ration', 'Check for environmental stressors', 'Review herd health status', 'Adjust management practices'],
    yield_anomaly_detected: ['Physical examination of flagged cows', 'Review recent feed changes', 'Check water intake and quality', 'Assess environmental conditions'],
    feed_shortage_predicted: ['Place emergency feed order', 'Review ration allocation', 'Identify alternative suppliers', 'Adjust feeding schedule if needed'],
    heat_stress_risk: ['Move grazing herds to shaded barns during peak heat (11am–4pm)', 'Activate cooling systems and fans', 'Shift milking and feeding times to cooler hours', 'Increase water point availability', 'Monitor at-risk cows closely'],
    margin_below_target: ['Audit major expense categories', 'Review milk price contracts', 'Assess feed efficiency', 'Consider cost reduction measures'],
    lameness_prevalence_high: ['Schedule hoof trimming', 'Assess flooring and bedding', 'Review footbath protocol', 'Identify and treat affected cows'],
    cash_runway_short: ['Accelerate receivables collection', 'Defer non-essential expenses', 'Review payment terms with suppliers', 'Explore short-term financing'],
    vaccination_compliance_low: ['Review vaccination schedule for gaps', 'Verify cold-chain storage of vaccines', 'Book administration during low-stress hours', 'Assign a named owner for compliance tracking'],
    dry_period_insufficient: ['Confirm expected calving dates against dry-off dates', 'Schedule dry-off for affected cows immediately', 'Adjust ration for the dry period', 'Flag for early vet review before calving'],
    milk_withdrawal_monitoring: ['Confirm withdrawal end dates for each treated cow', 'Segregate withdrawal-period milk from the saleable tank', 'Double-check treatment records against milking rosters'],
    herd_pattern_decline: ['Check feed and water delivery for the whole herd', 'Review recent ration or supplier changes', 'Rule out a shared environmental stressor (heat, ventilation)', 'Compare decline timing against any routine changes'],
    production_out_of_control: ['Identify what changed on the out-of-control day(s)', 'Check milking equipment calibration', 'Review whether a specific group or barn is driving the swing'],
    bcs_distribution_skewed: ['Reassess ration energy density for thin cows', 'Separate thin cows into a recovery group', 'Schedule a body-condition recheck in 2-3 weeks'],
    labor_efficiency_low: ['Review shift coverage against herd size', 'Time-audit the milking routine for bottlenecks', 'Check whether absenteeism is driving the gap'],
    feed_cost_high: ['Get competing quotes from alternate suppliers', 'Audit ration for over-formulated or wasted components', 'Review bulk-purchase and storage-loss practices'],
    conception_rate_below_benchmark: ['Review heat-detection accuracy and timing', 'Check semen handling and AI technician performance', 'Schedule a vet reproductive-health review of repeat-breeders'],
    metabolic_disease_detected: ['Reassess transition-cow ration and energy balance', 'Test at-risk fresh cows for subclinical ketosis', 'Review body condition at dry-off — over-conditioned cows are highest risk'],
    cold_stress_risk: ['Move exposed cows into sheltered barns', 'Increase energy density of the ration during cold snaps', 'Check shelter and bedding for draft exposure', 'Ensure water sources haven\'t frozen'],
    vet_roi_low: ['Break down vet spend by reactive vs. preventive care', 'Review whether recurring issues point to a root cause vet visits aren\'t fixing', 'Discuss a preventive-care plan with your vet'],
    cost_per_cow_high: ['Break expenses down by category to find the outlier', 'Compare against the farm\'s own trailing average, not just the benchmark', 'Check for one-off costs inflating this period'],
    key_person_dependency: ['Identify a backup or cross-train a second person for each single-point role', 'Document the role\'s routine tasks so someone else could step in', 'Flag critical roles when planning leave schedules'],
  };

  const actions: { label: string; done: boolean }[] = [];
  const seen = new Set<string>();

  for (const signal of signals) {
    const signalActions = actionMap[signal.signal_type] || ['Investigate and address root cause'];
    for (const action of signalActions) {
      if (!seen.has(action)) {
        seen.add(action);
        actions.push({ label: action, done: false });
      }
    }
  }

  return actions.slice(0, 8);
}

function categorizeSignals(signals: IntelligenceSignal[]): string {
  const allowed = new Set(['health', 'milk_production', 'feed_nutrition', 'breeding', 'financial', 'infrastructure', 'team_management', 'sustainability', 'general']);
  const categories = signals.map(s => {
    if (['veterinary', 'rule_based'].includes(s.source)) return 'health';
    if (['machine_learning', 'statistical', 'predictive'].includes(s.source)) return 'milk_production';
    if (['financial', 'business'].includes(s.source)) return 'financial';
    if (['weather'].includes(s.source)) return 'sustainability';
    if (['risk'].includes(s.source)) return 'general';
    return 'general';
  });

  const counts: Record<string, number> = {};
  for (const c of categories) {
    const mapped = allowed.has(c) ? c : 'general';
    counts[mapped] = (counts[mapped] || 0) + 1;
  }
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return top ? top[0] : 'general';
}

function calculateExpectedROI(finSignals: IntelligenceSignal[]): number {
  // Simplified ROI estimation based on financial signals
  let roi = 0;
  for (const s of finSignals) {
    if (s.signal_type === 'margin_below_target') {
      roi += 15; // Potential margin improvement
    }
    if (s.signal_type === 'feed_cost_high') {
      roi += 10; // Feed cost savings
    }
    if (s.signal_type === 'cost_per_cow_high') {
      roi += 8; // Cost reduction potential
    }
  }
  return Math.min(roi, 50); // Cap at 50%
}
