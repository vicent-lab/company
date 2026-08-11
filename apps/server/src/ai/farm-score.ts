import { query } from '../db/index.js';

export interface Deduction {
  points: number;
  reason: string;
  recommendation: string;
}

export interface CategoryScore {
  score: number;
  deductions: Deduction[];
}

export interface FarmScoreCategories {
  health: CategoryScore;
  nutrition: CategoryScore;
  breeding: CategoryScore;
  finance: CategoryScore;
  milkProduction: CategoryScore;
  inventory: CategoryScore;
  biosecurity: CategoryScore;
  workerPerformance: CategoryScore;
  animalWelfare: CategoryScore;
}

export interface FarmScoreResult {
  date: string;
  categories: FarmScoreCategories;
  overall: number;
}

// Weighted average of category scores into "Overall Farm Health": weights mirror the AI
// Advisor's own prioritization philosophy (AI_REASONING_ENGINE.md ss3.2) — animal welfare
// and irreversible-harm categories (health, biosecurity) count for more than efficiency
// categories (inventory, worker performance).
const OVERALL_WEIGHTS: Record<keyof FarmScoreCategories, number> = {
  health: 1.5,
  animalWelfare: 1.3,
  biosecurity: 1.2,
  milkProduction: 1.0,
  breeding: 1.0,
  nutrition: 1.0,
  finance: 0.9,
  inventory: 0.7,
  workerPerformance: 0.7,
};

function capped(perItem: number, count: number, cap: number): number {
  return Math.min(perItem * Math.max(0, count), cap);
}

function finalize(deductions: Deduction[]): CategoryScore {
  const positive = deductions.filter((d) => d.points > 0);
  const lost = positive.reduce((s, d) => s + d.points, 0);
  const score = Math.max(0, Math.min(100, Math.round(100 - lost)));
  return { score, deductions: positive.sort((a, b) => b.points - a.points) };
}

async function scoreHealth(farmId: string): Promise<CategoryScore> {
  const [cowsRes, vaccRes, alertsRes] = await Promise.all([
    query(`SELECT count(*) FILTER (WHERE health='sick') AS sick, count(*) FILTER (WHERE health='under_treatment') AS under_treatment FROM cows WHERE farm_id=$1 AND status='active'`, [farmId]),
    query(`SELECT count(*)::int AS overdue FROM vaccinations v JOIN cows c ON c.id=v.cow_id WHERE c.farm_id=$1 AND v.administered_on IS NULL AND v.due_on <= CURRENT_DATE`, [farmId]),
    query(`SELECT count(*)::int AS unresolved FROM emergency_health_alerts WHERE farm_id=$1 AND resolved=false`, [farmId]),
  ]);

  const sick = Number(cowsRes.rows[0]?.sick || 0);
  const underTreatment = Number(cowsRes.rows[0]?.under_treatment || 0);
  const overdueVacc = Number(vaccRes.rows[0]?.overdue || 0);
  const unresolvedAlerts = Number(alertsRes.rows[0]?.unresolved || 0);

  const deductions: Deduction[] = [
    { points: capped(3, sick, 30), reason: `${sick} cow(s) currently sick`, recommendation: 'Schedule veterinary examinations for sick cows and isolate as needed.' },
    { points: capped(2, underTreatment, 20), reason: `${underTreatment} cow(s) under treatment`, recommendation: 'Follow up on active treatment plans to confirm recovery.' },
    { points: capped(3, overdueVacc, 20), reason: `${overdueVacc} vaccination(s) overdue`, recommendation: 'Catch up on overdue vaccinations to reduce disease risk.' },
    { points: capped(2, unresolvedAlerts, 20), reason: `${unresolvedAlerts} unresolved emergency health alert(s)`, recommendation: 'Acknowledge and resolve open emergency health alerts.' },
  ];
  return finalize(deductions);
}

async function scoreNutrition(farmId: string): Promise<CategoryScore> {
  const [stockRes, headcountRes, feedCostRes, milkRes] = await Promise.all([
    query(`SELECT COALESCE(SUM(fi.quantity),0) AS stock FROM feed_inventory fi JOIN feed_types ft ON ft.id=fi.feed_type_id WHERE ft.farm_id=$1`, [farmId]),
    query(`SELECT count(*) FILTER (WHERE is_milking AND status='active') AS milking, count(*) FILTER (WHERE is_pregnant AND status='active') AS pregnant FROM cows WHERE farm_id=$1`, [farmId]),
    query(`SELECT COALESCE(SUM(amount),0) AS cost FROM expenses WHERE farm_id=$1 AND category ILIKE '%feed%' AND incurred_on >= CURRENT_DATE - INTERVAL '30 days'`, [farmId]),
    query(`SELECT COALESCE(SUM(morning_liters+afternoon_liters+evening_liters),0) AS milk FROM milk_records WHERE farm_id=$1 AND recorded_on >= CURRENT_DATE - INTERVAL '30 days'`, [farmId]),
  ]);

  const stock = Number(stockRes.rows[0]?.stock || 0);
  const milking = Number(headcountRes.rows[0]?.milking || 0);
  const pregnant = Number(headcountRes.rows[0]?.pregnant || 0);
  const dailyNeed = milking * 25 + pregnant * 5;
  const daysOfFeed = dailyNeed > 0 ? stock / dailyNeed : 999;

  const feedCost = Number(feedCostRes.rows[0]?.cost || 0);
  const milkVolume = Number(milkRes.rows[0]?.milk || 0);
  const costPerLiter = milkVolume > 0 ? feedCost / milkVolume : 0;

  const deductions: Deduction[] = [];
  if (daysOfFeed < 3) deductions.push({ points: 40, reason: `Feed stock will last only ${daysOfFeed.toFixed(1)} day(s)`, recommendation: 'Place an emergency feed order and confirm supplier delivery ETAs.' });
  else if (daysOfFeed < 7) deductions.push({ points: 25, reason: `Feed stock will last ${daysOfFeed.toFixed(1)} days`, recommendation: 'Order feed soon to stay ahead of the reorder point.' });
  else if (daysOfFeed < 14) deductions.push({ points: 10, reason: `Feed stock will last ${daysOfFeed.toFixed(1)} days`, recommendation: 'Plan the next feed order within the next week.' });

  if (milkVolume > 0 && costPerLiter > 0.35) {
    deductions.push({ points: 10, reason: `Feed cost per liter ($${costPerLiter.toFixed(2)}) exceeds the $0.30 benchmark`, recommendation: 'Audit ration composition and negotiate bulk feed pricing.' });
  }
  return finalize(deductions);
}

async function scoreBreeding(farmId: string): Promise<CategoryScore> {
  const [unconfirmedRes, conceptionRes, calvingRes] = await Promise.all([
    query(`SELECT count(*)::int AS unconfirmed FROM breeding_records br JOIN cows c ON c.id=br.cow_id WHERE c.farm_id=$1 AND br.result IS NULL AND br.breeding_date < CURRENT_DATE - INTERVAL '45 days'`, [farmId]),
    query(`SELECT count(*) FILTER (WHERE lower(result)='pregnant') AS pregnant, count(*) AS total FROM breeding_records br JOIN cows c ON c.id=br.cow_id WHERE c.farm_id=$1 AND br.breeding_date >= CURRENT_DATE - INTERVAL '180 days'`, [farmId]),
    query(`SELECT AVG(difficulty_score) AS avg_diff FROM calving_records WHERE farm_id=$1 AND calving_date >= CURRENT_DATE - INTERVAL '180 days'`, [farmId]),
  ]);

  const unconfirmed = Number(unconfirmedRes.rows[0]?.unconfirmed || 0);
  const pregnant = Number(conceptionRes.rows[0]?.pregnant || 0);
  const totalServices = Number(conceptionRes.rows[0]?.total || 0);
  const conceptionRate = totalServices > 0 ? pregnant / totalServices : null;
  const avgDifficulty = calvingRes.rows[0]?.avg_diff != null ? Number(calvingRes.rows[0].avg_diff) : null;

  const deductions: Deduction[] = [
    { points: capped(4, unconfirmed, 24), reason: `${unconfirmed} pregnancy check(s) overdue (>45 days since service)`, recommendation: 'Schedule pregnancy checks and record results promptly.' },
  ];
  if (conceptionRate != null) {
    if (conceptionRate < 0.40) deductions.push({ points: 20, reason: `Conception rate is ${(conceptionRate * 100).toFixed(0)}% (target ≥50%)`, recommendation: 'Review sire selection, heat detection timing, and nutrition around breeding.' });
    else if (conceptionRate < 0.50) deductions.push({ points: 10, reason: `Conception rate is ${(conceptionRate * 100).toFixed(0)}% (target ≥50%)`, recommendation: 'Tighten heat detection timing to lift conception rate toward target.' });
  }
  if (avgDifficulty != null && avgDifficulty > 3) {
    deductions.push({ points: 10, reason: `Average calving difficulty score is ${avgDifficulty.toFixed(1)}/5`, recommendation: 'Review dry-cow nutrition and consider calving-ease genetics.' });
  }
  return finalize(deductions);
}

async function scoreFinance(farmId: string): Promise<CategoryScore> {
  const [incomeRes, expensesRes, lastMonthExpensesRes] = await Promise.all([
    query(`SELECT COALESCE(SUM(amount),0) AS v FROM income WHERE farm_id=$1 AND received_on >= date_trunc('month', current_date)`, [farmId]),
    query(`SELECT COALESCE(SUM(amount),0) AS v FROM expenses WHERE farm_id=$1 AND incurred_on >= date_trunc('month', current_date)`, [farmId]),
    query(`SELECT COALESCE(SUM(amount),0) AS v FROM expenses WHERE farm_id=$1 AND incurred_on >= date_trunc('month', current_date - interval '1 month') AND incurred_on < date_trunc('month', current_date)`, [farmId]),
  ]);

  const income = Number(incomeRes.rows[0]?.v || 0);
  const expenses = Number(expensesRes.rows[0]?.v || 0);
  const lastMonthExpenses = Number(lastMonthExpensesRes.rows[0]?.v || 0);

  const deductions: Deduction[] = [];
  if (income > 0) {
    const marginPct = ((income - expenses) / income) * 100;
    if (marginPct < 5) deductions.push({ points: 40, reason: `Profit margin is ${marginPct.toFixed(1)}% this month`, recommendation: 'Audit top expense categories and review milk pricing contracts.' });
    else if (marginPct < 15) deductions.push({ points: 25, reason: `Profit margin is ${marginPct.toFixed(1)}% this month`, recommendation: 'Look for cost reductions in feed and vet spend to lift margin.' });
    else if (marginPct < 25) deductions.push({ points: 10, reason: `Profit margin is ${marginPct.toFixed(1)}% this month`, recommendation: 'Margin is below target — review pricing and expense trends monthly.' });
  }
  if (lastMonthExpenses > 0) {
    const growthPct = ((expenses - lastMonthExpenses) / lastMonthExpenses) * 100;
    if (growthPct > 20) deductions.push({ points: 10, reason: `Expenses rose ${growthPct.toFixed(0)}% vs last month`, recommendation: 'Investigate the expense categories driving the increase.' });
  }
  return finalize(deductions);
}

async function scoreMilkProduction(farmId: string): Promise<CategoryScore> {
  const [todayRes, avgRes, milkingRes, trendRes] = await Promise.all([
    query(`SELECT COALESCE(SUM(morning_liters+afternoon_liters+evening_liters),0) AS total FROM milk_records WHERE farm_id=$1 AND recorded_on=CURRENT_DATE`, [farmId]),
    query(`SELECT COALESCE(AVG(morning_liters+afternoon_liters+evening_liters),0) AS avg FROM milk_records mr JOIN cows c ON c.id=mr.cow_id WHERE c.farm_id=$1`, [farmId]),
    query(`SELECT count(*)::int AS milking FROM cows WHERE farm_id=$1 AND is_milking AND status='active'`, [farmId]),
    query(`
      WITH daily AS (
        SELECT recorded_on, SUM(morning_liters+afternoon_liters+evening_liters) AS total
        FROM milk_records WHERE farm_id=$1 AND recorded_on >= CURRENT_DATE - INTERVAL '14 days'
        GROUP BY recorded_on
      )
      SELECT
        AVG(total) FILTER (WHERE recorded_on >= CURRENT_DATE - INTERVAL '7 days') AS recent_avg,
        AVG(total) FILTER (WHERE recorded_on < CURRENT_DATE - INTERVAL '7 days') AS prev_avg
      FROM daily
    `, [farmId]),
  ]);

  const today = Number(todayRes.rows[0]?.total || 0);
  const avgPerCow = Number(avgRes.rows[0]?.avg || 0);
  const milking = Number(milkingRes.rows[0]?.milking || 0);
  const expectedToday = avgPerCow * milking;
  const dropPct = expectedToday > 0 ? (1 - today / expectedToday) * 100 : 0;

  const recentAvg = trendRes.rows[0]?.recent_avg != null ? Number(trendRes.rows[0].recent_avg) : null;
  const prevAvg = trendRes.rows[0]?.prev_avg != null ? Number(trendRes.rows[0].prev_avg) : null;
  const trendDropPct = prevAvg && prevAvg > 0 && recentAvg != null ? (1 - recentAvg / prevAvg) * 100 : 0;

  const deductions: Deduction[] = [];
  if (expectedToday > 0) {
    if (dropPct > 20) deductions.push({ points: 35, reason: `Today's output is ${dropPct.toFixed(0)}% below the per-cow average`, recommendation: 'Investigate feed changes, health issues, or heat stress affecting the herd.' });
    else if (dropPct > 10) deductions.push({ points: 20, reason: `Today's output is ${dropPct.toFixed(0)}% below the per-cow average`, recommendation: 'Check for early signs of illness or ration changes across the herd.' });
  }
  if (prevAvg && prevAvg > 0 && trendDropPct > 10) {
    deductions.push({ points: 15, reason: `7-day production trend is down ${trendDropPct.toFixed(0)}% vs the previous week`, recommendation: 'Audit ration quality and check for early illness across the herd.' });
  }
  return finalize(deductions);
}

async function scoreInventory(farmId: string): Promise<CategoryScore> {
  const r = await query(`
    SELECT
      count(*) FILTER (WHERE quantity <= reorder_level) AS low_stock,
      count(*) FILTER (WHERE expiry_date IS NOT NULL AND expiry_date <= CURRENT_DATE + INTERVAL '14 days') AS expiring
    FROM inventory WHERE farm_id=$1
  `, [farmId]);

  const lowStock = Number(r.rows[0]?.low_stock || 0);
  const expiring = Number(r.rows[0]?.expiring || 0);

  const deductions: Deduction[] = [
    { points: capped(8, lowStock, 40), reason: `${lowStock} inventory item(s) at or below reorder level`, recommendation: 'Reorder low-stock items and review reorder thresholds.' },
    { points: capped(5, expiring, 20), reason: `${expiring} item(s) expiring within 14 days`, recommendation: "Use or rotate stock nearing expiry (FIFO) before it's wasted." },
  ];
  return finalize(deductions);
}

async function scoreBiosecurity(farmId: string): Promise<CategoryScore> {
  const [vaccRes, parasiteRes, medRes] = await Promise.all([
    query(`SELECT count(*) FILTER (WHERE administered_on IS NOT NULL) AS administered, count(*) AS total FROM vaccinations v JOIN cows c ON c.id=v.cow_id WHERE c.farm_id=$1`, [farmId]),
    query(`SELECT count(*)::int AS overdue FROM parasite_control_schedules WHERE farm_id=$1 AND administered_on IS NULL AND scheduled_on < CURRENT_DATE`, [farmId]),
    query(`SELECT count(*)::int AS expired FROM medicine_inventory WHERE farm_id=$1 AND expiry_date IS NOT NULL AND expiry_date < CURRENT_DATE AND quantity_on_hand > 0`, [farmId]),
  ]);

  const administered = Number(vaccRes.rows[0]?.administered || 0);
  const totalVacc = Number(vaccRes.rows[0]?.total || 0);
  const compliance = totalVacc > 0 ? administered / totalVacc : null;
  const overdueParasite = Number(parasiteRes.rows[0]?.overdue || 0);
  const expiredMed = Number(medRes.rows[0]?.expired || 0);

  const deductions: Deduction[] = [
    { points: capped(5, overdueParasite, 20), reason: `${overdueParasite} parasite control treatment(s) overdue`, recommendation: 'Complete overdue parasite control treatments to prevent spread.' },
    { points: capped(5, expiredMed, 15), reason: `${expiredMed} expired medicine batch(es) still in stock`, recommendation: 'Dispose of expired medicine safely and audit storage conditions.' },
  ];
  if (compliance != null) {
    if (compliance < 0.6) deductions.push({ points: 35, reason: `Vaccination compliance is ${(compliance * 100).toFixed(0)}%`, recommendation: 'Catch up on overdue vaccinations and review the schedule with your vet.' });
    else if (compliance < 0.8) deductions.push({ points: 20, reason: `Vaccination compliance is ${(compliance * 100).toFixed(0)}%`, recommendation: 'Close the remaining vaccination gap to reach full compliance.' });
  }
  return finalize(deductions);
}

async function scoreWorkerPerformance(farmId: string): Promise<CategoryScore> {
  const [attendanceRes, tasksRes, reviewsRes, trainingRes] = await Promise.all([
    query(`SELECT count(*)::int AS absences FROM attendance a JOIN employees e ON e.id=a.employee_id WHERE e.farm_id=$1 AND a.status='absent' AND a.attended_on >= CURRENT_DATE - INTERVAL '14 days'`, [farmId]),
    query(`SELECT count(*)::int AS overdue FROM tasks WHERE farm_id=$1 AND status NOT IN ('completed','cancelled') AND due_date < CURRENT_DATE`, [farmId]),
    query(`SELECT AVG(rating) AS avg_rating, count(*) AS n FROM performance_reviews WHERE farm_id=$1 AND status <> 'draft' AND period_end >= CURRENT_DATE - INTERVAL '180 days'`, [farmId]),
    query(`SELECT count(*)::int AS overdue FROM training_records WHERE farm_id=$1 AND status='scheduled' AND scheduled_on < CURRENT_DATE`, [farmId]),
  ]);

  const absences = Number(attendanceRes.rows[0]?.absences || 0);
  const overdueTasks = Number(tasksRes.rows[0]?.overdue || 0);
  const avgRating = reviewsRes.rows[0]?.n > 0 && reviewsRes.rows[0]?.avg_rating != null ? Number(reviewsRes.rows[0].avg_rating) : null;
  const overdueTraining = Number(trainingRes.rows[0]?.overdue || 0);

  const deductions: Deduction[] = [
    { points: capped(3, absences, 24), reason: `${absences} absence(s) recorded in the last 14 days`, recommendation: 'Follow up on attendance patterns and review shift coverage.' },
    { points: capped(3, overdueTasks, 21), reason: `${overdueTasks} task(s) overdue`, recommendation: 'Reallocate workload and clear the overdue task backlog.' },
    { points: capped(3, overdueTraining, 15), reason: `${overdueTraining} training session(s) overdue`, recommendation: 'Reschedule and complete overdue training sessions.' },
  ];
  if (avgRating != null) {
    if (avgRating < 3.0) deductions.push({ points: 20, reason: `Average performance rating is ${avgRating.toFixed(1)}/5`, recommendation: 'Schedule check-ins and targeted training for underperforming roles.' });
    else if (avgRating < 4.0) deductions.push({ points: 10, reason: `Average performance rating is ${avgRating.toFixed(1)}/5`, recommendation: 'Identify coaching opportunities to lift performance ratings.' });
  }
  return finalize(deductions);
}

async function scoreAnimalWelfare(farmId: string): Promise<CategoryScore> {
  const [healthRes, barnsRes, waterRes] = await Promise.all([
    query(`SELECT count(*) FILTER (WHERE lameness_score >= 3) AS severe_lame, count(*) FILTER (WHERE body_condition_score BETWEEN 1 AND 2) AS thin, count(*) AS total FROM health_records WHERE farm_id=$1 AND recorded_on >= CURRENT_DATE - INTERVAL '60 days'`, [farmId]),
    query(`
      SELECT count(*)::int AS overcrowded FROM (
        SELECT b.id FROM barns b LEFT JOIN cows c ON c.barn_id=b.id AND c.status='active'
        WHERE b.farm_id=$1 AND b.capacity IS NOT NULL AND b.capacity > 0
        GROUP BY b.id, b.capacity
        HAVING count(c.id)::float / b.capacity >= 0.95
      ) overcrowded_barns
    `, [farmId]),
    query(`SELECT count(*)::int AS low_water FROM cows WHERE farm_id=$1 AND is_milking AND status='active' AND water_intake_liters > 0 AND water_intake_liters < 80`, [farmId]),
  ]);

  const severeLame = Number(healthRes.rows[0]?.severe_lame || 0);
  const thin = Number(healthRes.rows[0]?.thin || 0);
  const totalExamined = Number(healthRes.rows[0]?.total || 0);
  const overcrowded = Number(barnsRes.rows[0]?.overcrowded || 0);
  const lowWater = Number(waterRes.rows[0]?.low_water || 0);

  const deductions: Deduction[] = [
    { points: capped(15, overcrowded, 30), reason: `${overcrowded} barn(s) at or above 95% capacity`, recommendation: 'Redistribute the herd or plan barn expansion to reduce overcrowding.' },
    { points: capped(3, lowWater, 15), reason: `${lowWater} milking cow(s) with low recorded water intake`, recommendation: 'Check water point flow rates and troughs for the affected cows.' },
  ];
  if (totalExamined > 0) {
    const severeLamePct = severeLame / totalExamined;
    const thinPct = thin / totalExamined;
    if (severeLamePct > 0.05) deductions.push({ points: 25, reason: `Severe lameness affects ${(severeLamePct * 100).toFixed(0)}% of examined cows`, recommendation: 'Schedule hoof trimming and review flooring/bedding conditions.' });
    else if (severeLamePct > 0.02) deductions.push({ points: 12, reason: `Severe lameness affects ${(severeLamePct * 100).toFixed(0)}% of examined cows`, recommendation: 'Monitor lameness trend and review footbath protocol.' });
    if (thinPct > 0.15) deductions.push({ points: 20, reason: `${(thinPct * 100).toFixed(0)}% of examined cows have a low body condition score`, recommendation: 'Review ration energy density for thin cows and reassess groupings.' });
  }
  return finalize(deductions);
}

function computeOverall(categories: FarmScoreCategories): number {
  let weightedSum = 0;
  let totalWeight = 0;
  for (const key of Object.keys(OVERALL_WEIGHTS) as (keyof FarmScoreCategories)[]) {
    const weight = OVERALL_WEIGHTS[key];
    weightedSum += categories[key].score * weight;
    totalWeight += weight;
  }
  return Math.max(0, Math.min(100, Math.round(weightedSum / totalWeight)));
}

export async function computeFarmScore(farmId: string): Promise<FarmScoreResult> {
  const [health, nutrition, breeding, finance, milkProduction, inventory, biosecurity, workerPerformance, animalWelfare] = await Promise.all([
    scoreHealth(farmId),
    scoreNutrition(farmId),
    scoreBreeding(farmId),
    scoreFinance(farmId),
    scoreMilkProduction(farmId),
    scoreInventory(farmId),
    scoreBiosecurity(farmId),
    scoreWorkerPerformance(farmId),
    scoreAnimalWelfare(farmId),
  ]);

  const categories: FarmScoreCategories = { health, nutrition, breeding, finance, milkProduction, inventory, biosecurity, workerPerformance, animalWelfare };
  const overall = computeOverall(categories);

  return { date: new Date().toISOString().slice(0, 10), categories, overall };
}

export async function snapshotFarmScore(farmId: string): Promise<FarmScoreResult> {
  const result = await computeFarmScore(farmId);
  const c = result.categories;
  await query(`
    INSERT INTO ai_farm_scores (
      farm_id, score_date, health_score, nutrition_score, breeding_score, finance_score,
      milk_production_score, inventory_score, biosecurity_score, worker_performance_score,
      animal_welfare_score, overall_score, breakdown
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    ON CONFLICT (farm_id, score_date) DO UPDATE SET
      health_score=$3, nutrition_score=$4, breeding_score=$5, finance_score=$6,
      milk_production_score=$7, inventory_score=$8, biosecurity_score=$9, worker_performance_score=$10,
      animal_welfare_score=$11, overall_score=$12, breakdown=$13
  `, [
    farmId, result.date, c.health.score, c.nutrition.score, c.breeding.score, c.finance.score,
    c.milkProduction.score, c.inventory.score, c.biosecurity.score, c.workerPerformance.score,
    c.animalWelfare.score, result.overall, JSON.stringify(c),
  ]);
  return result;
}

export async function snapshotAllFarmScores(): Promise<{ farms: number }> {
  const farmsRes = await query(`SELECT id FROM farms`);
  for (const farm of farmsRes.rows) {
    try {
      await snapshotFarmScore(farm.id);
    } catch (err) {
      console.error(`Farm score snapshot failed for farm ${farm.id}:`, err);
    }
  }
  return { farms: farmsRes.rows.length };
}

export interface FarmScoreHistoryPoint {
  date: string;
  health: number;
  nutrition: number;
  breeding: number;
  finance: number;
  milkProduction: number;
  inventory: number;
  biosecurity: number;
  workerPerformance: number;
  animalWelfare: number;
  overall: number;
}

export async function getFarmScoreHistory(farmId: string, days = 30): Promise<FarmScoreHistoryPoint[]> {
  const r = await query(`
    SELECT score_date, health_score, nutrition_score, breeding_score, finance_score,
           milk_production_score, inventory_score, biosecurity_score, worker_performance_score,
           animal_welfare_score, overall_score
    FROM ai_farm_scores
    WHERE farm_id=$1 AND score_date >= CURRENT_DATE - ($2 || ' days')::interval
    ORDER BY score_date ASC
  `, [farmId, String(days)]);

  return r.rows.map((row: any) => ({
    date: row.score_date,
    health: row.health_score,
    nutrition: row.nutrition_score,
    breeding: row.breeding_score,
    finance: row.finance_score,
    milkProduction: row.milk_production_score,
    inventory: row.inventory_score,
    biosecurity: row.biosecurity_score,
    workerPerformance: row.worker_performance_score,
    animalWelfare: row.animal_welfare_score,
    overall: row.overall_score,
  }));
}
