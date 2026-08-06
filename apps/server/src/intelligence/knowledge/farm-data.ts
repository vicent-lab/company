import { query } from '../../db/index.js';

export interface CowProfile {
  id: string;
  cow_code: string;
  name: string | null;
  breed: string | null;
  gender: string;
  status: string;
  health: string;
  is_milking: boolean;
  is_pregnant: boolean;
  date_of_birth: string | null;
  weight_kg: number | null;
  barn_id: string | null;
  barn_name?: string;
}

export interface MilkRecord {
  id: string;
  cow_id: string;
  recorded_on: string;
  morning_liters: number;
  afternoon_liters: number;
  evening_liters: number;
  total: number;
  fat_percent: number | null;
  snf_percent: number | null;
  temperature_c: number | null;
  cow_code?: string;
  cow_name?: string;
}

export interface HealthRecord {
  id: string;
  cow_id: string;
  recorded_on: string;
  health_status: string;
  body_condition_score: number | null;
  lameness_score: number | null;
  ai_detected_disease: string | null;
  ai_confidence: number | null;
  cow_code?: string;
  cow_name?: string;
}

export interface TreatmentRecord {
  id: string;
  cow_id: string;
  disease: string | null;
  treatment_type: string | null;
  medicine_name: string | null;
  dosage: string | null;
  administered_on: string | null;
  veterinarian_name: string | null;
  notes: string | null;
  cow_code?: string;
}

export interface VaccinationRecord {
  id: string;
  cow_id: string;
  vaccine_name: string;
  administered_on: string | null;
  due_on: string | null;
  status: string;
  cow_code?: string;
}

export interface BreedingRecord {
  id: string;
  cow_id: string;
  method: string;
  serviced_on: string;
  expected_calving_on: string | null;
  result: string | null;
  cow_code?: string;
  cow_name?: string;
}

export interface FeedInventory {
  id: string;
  feed_type_id: string;
  feed_type_name: string;
  quantity: number;
  unit_cost: number | null;
  days_remaining: number | null;
}

export interface FinancialSummary {
  total_income: number;
  total_expenses: number;
  net_profit: number;
  margin_pct: number;
  income_by_category: Record<string, number>;
  expenses_by_category: Record<string, number>;
}

export interface EmployeeRecord {
  id: string;
  name: string;
  job_title: string | null;
  is_active: boolean;
}

export interface TaskRecord {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_date: string | null;
  assigned_to_name: string | null;
}

export interface WeatherData {
  temperature_c: number;
  humidity_pct: number;
  wind_kph: number | null;
  rain_mm: number | null;
  condition: string;
  observed_at: string;
}

export interface FarmOverview {
  total_cows: number;
  milking_cows: number;
  pregnant_cows: number;
  sick_cows: number;
  today_milk_liters: number;
  week_milk_liters: number;
  month_milk_liters: number;
  feed_days_remaining: number;
  current_thi: number | null;
  net_profit_this_month: number;
  active_tasks: number;
  overdue_vaccinations: number;
  recent_health_issues: number;
}

export class FarmKnowledgeEngine {
  private farmId: string;

  constructor(farmId: string) {
    this.farmId = farmId;
  }

  async getOverview(): Promise<FarmOverview> {
    const [
      cowStats,
      todayMilk,
      weekMilk,
      monthMilk,
      feedDays,
      weather,
      finance,
      tasks,
      vacc,
      health,
    ] = await Promise.all([
      query(`SELECT count(*) FILTER (WHERE status='active') AS total,
                    count(*) FILTER (WHERE status='active' AND is_milking) AS milking,
                    count(*) FILTER (WHERE status='active' AND is_pregnant) AS pregnant,
                    count(*) FILTER (WHERE status='active' AND health <> 'healthy') AS sick
             FROM cows WHERE farm_id=$1`, [this.farmId]),
      query(`SELECT COALESCE(SUM(morning_liters+afternoon_liters+evening_liters),0) AS v FROM milk_records WHERE farm_id=$1 AND recorded_on=CURRENT_DATE`, [this.farmId]),
      query(`SELECT COALESCE(SUM(morning_liters+afternoon_liters+evening_liters),0) AS v FROM milk_records WHERE farm_id=$1 AND recorded_on >= CURRENT_DATE - INTERVAL '7 days'`, [this.farmId]),
      query(`SELECT COALESCE(SUM(morning_liters+afternoon_liters+evening_liters),0) AS v FROM milk_records WHERE farm_id=$1 AND recorded_on >= date_trunc('month', current_date)`, [this.farmId]),
      query(`SELECT COALESCE(SUM(fi.quantity),0) AS stock,
                    (SELECT count(*) FILTER (WHERE is_milking AND status='active') FROM cows WHERE farm_id=$1) AS milking,
                    (SELECT count(*) FILTER (WHERE is_pregnant AND status='active') FROM cows WHERE farm_id=$1) AS pregnant
              FROM feed_inventory fi JOIN feed_types ft ON ft.id=fi.feed_type_id WHERE ft.farm_id=$1`, [this.farmId]).then((r: any) => {
        const stock = Number(r.rows[0]?.stock || 0);
        const milking = Number(r.rows[0]?.milking || 0);
        const pregnant = Number(r.rows[0]?.pregnant || 0);
        const dailyNeed = milking * 25 + pregnant * 5;
        return dailyNeed > 0 ? stock / dailyNeed : 999;
      }),
      query(`SELECT temperature_c, humidity_pct, wind_kph, rain_mm, condition, observed_at FROM weather_observations WHERE farm_id=$1 ORDER BY observed_at DESC LIMIT 1`, [this.farmId]).then((r: any) => r.rows[0] || null),
      query(`SELECT (SELECT COALESCE(SUM(amount),0) FROM income WHERE farm_id=$1 AND received_on >= date_trunc('month', current_date)) AS income,
                    (SELECT COALESCE(SUM(amount),0) FROM expenses WHERE farm_id=$1 AND incurred_on >= date_trunc('month', current_date)) AS expenses`,
            [this.farmId]).then((r: any) => {
        const income = Number(r.rows[0]?.income || 0);
        const expenses = Number(r.rows[0]?.expenses || 0);
        return { net_profit_this_month: income - expenses };
      }),
      query(`SELECT count(*)::int AS n FROM tasks WHERE farm_id=$1 AND status NOT IN ('completed','cancelled')`, [this.farmId]),
      query(`SELECT count(*)::int AS n FROM vaccinations v JOIN cows c ON c.id=v.cow_id WHERE c.farm_id=$1 AND v.administered_on IS NULL AND v.due_on <= CURRENT_DATE`, [this.farmId]),
      query(`SELECT count(*)::int AS n FROM health_records WHERE farm_id=$1 AND recorded_on >= CURRENT_DATE - INTERVAL '7 days' AND health_status <> 'healthy'`, [this.farmId]),
    ]);

    const cow = cowStats.rows[0] || {};
    const thi = weather ? (weather.temperature_c * 9) / 5 + 32 - ((0.55 - 0.55 * (weather.humidity_pct / 100)) * (((weather.temperature_c * 9) / 5 + 32) - 58)) : null;

    return {
      total_cows: Number(cow.total || 0),
      milking_cows: Number(cow.milking || 0),
      pregnant_cows: Number(cow.pregnant || 0),
      sick_cows: Number(cow.sick || 0),
      today_milk_liters: Number(todayMilk.rows[0]?.v || 0),
      week_milk_liters: Number(weekMilk.rows[0]?.v || 0),
      month_milk_liters: Number(monthMilk.rows[0]?.v || 0),
      feed_days_remaining: Number(feedDays),
      current_thi: thi,
      net_profit_this_month: finance.net_profit_this_month,
      active_tasks: Number(tasks.rows[0]?.n || 0),
      overdue_vaccinations: Number(vacc.rows[0]?.n || 0),
      recent_health_issues: Number(health.rows[0]?.n || 0),
    };
  }

  async getCowProfile(cowCodeOrId: string): Promise<CowProfile | null> {
    const r = await query<CowProfile>(`SELECT c.*, b.name AS barn_name FROM cows c LEFT JOIN barns b ON b.id=c.barn_id WHERE c.farm_id=$1 AND (c.cow_code=$2 OR c.id=$2) LIMIT 1`, [this.farmId, cowCodeOrId]);
    if (!r.rows.length) return null;
    return r.rows[0];
  }

  async getCowHistory(cowId: string) {
    const [milk, health, treatments, vaccinations, breeding, calving] = await Promise.all([
      query(`SELECT recorded_on, morning_liters, afternoon_liters, evening_liters, (morning_liters+afternoon_liters+evening_liters) AS total, fat_percent, temperature_c FROM milk_records WHERE farm_id=$1 AND cow_id=$2 ORDER BY recorded_on DESC LIMIT 30`, [this.farmId, cowId]),
      query(`SELECT recorded_on, health_status, body_condition_score, lameness_score, ai_detected_disease, notes FROM health_records WHERE farm_id=$1 AND cow_id=$2 ORDER BY recorded_on DESC LIMIT 20`, [this.farmId, cowId]),
      query(`SELECT t.diagnosed_on, t.disease, t.treatment_type, t.medicine_name, t.dosage, t.veterinarian_name, t.notes FROM treatments t WHERE t.farm_id=$1 AND t.cow_id=$2 ORDER BY t.diagnosed_on DESC LIMIT 20`, [this.farmId, cowId]),
      query(`SELECT vaccine_name, administered_on, due_on, status FROM vaccinations WHERE farm_id=$1 AND cow_id=$2 ORDER BY due_on DESC LIMIT 20`, [this.farmId, cowId]),
      query(`SELECT method, serviced_on, expected_calving_on, result FROM breeding_records WHERE cow_id=$1 ORDER BY serviced_on DESC LIMIT 10`, [this.farmId, cowId]),
      query(`SELECT calved_on, calf_id, complications, notes FROM calving_records WHERE farm_id=$1 AND cow_id=$2 ORDER BY calved_on DESC LIMIT 10`, [this.farmId, cowId]),
    ]);
    return { milk: milk.rows, health: health.rows, treatments: treatments.rows, vaccinations: vaccinations.rows, breeding: breeding.rows, calving: calving.rows };
  }

  async compareCows(cowA: string, cowB: string) {
    const [profileA, profileB, milkA, milkB] = await Promise.all([
      this.getCowProfile(cowA),
      this.getCowProfile(cowB),
      query(`SELECT COALESCE(SUM(morning_liters+afternoon_liters+evening_liters),0) AS total, COALESCE(AVG(morning_liters+afternoon_liters+evening_liters),0) AS avg FROM milk_records WHERE farm_id=$1 AND cow_id=$2`, [this.farmId, cowA]),
      query(`SELECT COALESCE(SUM(morning_liters+afternoon_liters+evening_liters),0) AS total, COALESCE(AVG(morning_liters+afternoon_liters+evening_liters),0) AS avg FROM milk_records WHERE farm_id=$1 AND cow_id=$2`, [this.farmId, cowB]),
    ]);
    return { profileA, profileB, milkA: milkA.rows[0], milkB: milkB.rows[0] };
  }

  async getMilkAnalysis() {
    const [topProducers, decliningCows, trend] = await Promise.all([
      query(`SELECT c.cow_code, c.name, COALESCE(SUM(m.morning_liters+m.afternoon_liters+m.evening_liters),0) AS total_liters, COALESCE(AVG(m.morning_liters+m.afternoon_liters+m.evening_liters),0) AS avg_daily FROM cows c LEFT JOIN milk_records m ON m.cow_id=c.id AND m.recorded_on >= CURRENT_DATE - INTERVAL '30 days' WHERE c.farm_id=$1 AND c.status='active' AND c.is_milking GROUP BY c.id, c.cow_code, c.name ORDER BY total_liters DESC LIMIT 10`, [this.farmId]),
      query(`WITH cow_avg AS (SELECT cow_id, AVG(morning_liters+afternoon_liters+evening_liters) AS avg_30d FROM milk_records WHERE farm_id=$1 AND recorded_on >= CURRENT_DATE - INTERVAL '30 days' GROUP BY cow_id), recent AS (SELECT cow_id, AVG(morning_liters+afternoon_liters+evening_liters) AS avg_7d FROM milk_records WHERE farm_id=$1 AND recorded_on >= CURRENT_DATE - INTERVAL '7 days' GROUP BY cow_id) SELECT c.cow_code, c.name, ca.avg_30d, r.avg_7d, (r.avg_7d - ca.avg_30d) AS change FROM cows c JOIN cow_avg ca ON ca.cow_id=c.id JOIN recent r ON r.cow_id=c.id WHERE c.farm_id=$1 AND c.status='active' AND c.is_milking AND (r.avg_7d - ca.avg_30d) < -2 ORDER BY change ASC LIMIT 10`, [this.farmId]),
      query(`SELECT recorded_on, SUM(morning_liters+afternoon_liters+evening_liters) AS total FROM milk_records WHERE farm_id=$1 AND recorded_on >= CURRENT_DATE - INTERVAL '30 days' GROUP BY recorded_on ORDER BY recorded_on`, [this.farmId]),
    ]);
    return { topProducers: topProducers.rows, decliningCows: decliningCows.rows, trend: trend.rows };
  }

  async getHealthAnalysis() {
    const [sickCows, riskCows] = await Promise.all([
      query(`SELECT c.cow_code, c.name, c.health, hr.recorded_on, hr.ai_detected_disease, hr.body_condition_score, hr.lameness_score FROM cows c LEFT JOIN health_records hr ON hr.cow_id=c.id AND hr.recorded_on=(SELECT max(recorded_on) FROM health_records WHERE cow_id=c.id) WHERE c.farm_id=$1 AND c.status='active' AND c.health <> 'healthy' ORDER BY hr.recorded_on DESC LIMIT 20`, [this.farmId]),
      query(`SELECT c.cow_code, c.name, hr.recorded_on, hr.body_condition_score, hr.lameness_score, hr.ai_detected_disease FROM cows c JOIN health_records hr ON hr.cow_id=c.id WHERE c.farm_id=$1 AND c.status='active' AND (hr.body_condition_score <= 2 OR hr.lameness_score >= 3 OR hr.ai_detected_disease IS NOT NULL) ORDER BY hr.recorded_on DESC LIMIT 20`, [this.farmId]),
    ]);
    return { sickCows: sickCows.rows, riskCows: riskCows.rows };
  }

  async getFinancialAnalysis() {
    const [monthSummary, expenseBreakdown, incomeBreakdown, sixMonthTrend] = await Promise.all([
      query(`SELECT (SELECT COALESCE(SUM(amount),0) FROM income WHERE farm_id=$1 AND received_on >= date_trunc('month', current_date)) AS income, (SELECT COALESCE(SUM(amount),0) FROM expenses WHERE farm_id=$1 AND incurred_on >= date_trunc('month', current_date)) AS expenses`, [this.farmId]),
      query(`SELECT category, SUM(amount) AS total FROM expenses WHERE farm_id=$1 AND incurred_on >= date_trunc('month', current_date) GROUP BY category ORDER BY total DESC LIMIT 10`, [this.farmId]),
      query(`SELECT category, SUM(amount) AS total FROM income WHERE farm_id=$1 AND received_on >= date_trunc('month', current_date) GROUP BY category ORDER BY total DESC LIMIT 10`, [this.farmId]),
      query(`WITH monthly AS (SELECT date_trunc('month', incurred_on) AS m, SUM(amount) AS exp FROM expenses WHERE farm_id=$1 AND incurred_on >= CURRENT_DATE - INTERVAL '6 months' GROUP BY 1) SELECT m, exp FROM monthly ORDER BY m`, [this.farmId]),
    ]);
    const income = Number(monthSummary.rows[0]?.income || 0);
    const expenses = Number(monthSummary.rows[0]?.expenses || 0);
    return {
      income,
      expenses,
      net_profit: income - expenses,
      margin_pct: income > 0 ? ((income - expenses) / income) * 100 : 0,
      expense_breakdown: expenseBreakdown.rows,
      income_breakdown: incomeBreakdown.rows,
      six_month_trend: sixMonthTrend.rows,
    };
  }

  async getInventoryAnalysis() {
    const [feed, medicines, equipment] = await Promise.all([
      query(`SELECT ft.name, fi.quantity, fi.unit_cost, fi.updated_at FROM feed_inventory fi JOIN feed_types ft ON ft.id=fi.feed_type_id WHERE ft.farm_id=$1 ORDER BY fi.updated_at DESC`, [this.farmId]),
      query(`SELECT name, quantity_on_hand AS quantity, expiry_date, created_at AS updated_at FROM medicine_inventory WHERE farm_id=$1 ORDER BY expiry_date ASC LIMIT 20`, [this.farmId]),
      query(`SELECT item_name AS name, category, quantity, reorder_level, expiry_date FROM inventory WHERE farm_id=$1 ORDER BY expiry_date ASC NULLS LAST LIMIT 20`, [this.farmId]),
    ]);
    return { feed: feed.rows, medicines: medicines.rows, equipment: equipment.rows };
  }

  async getEmployeeAnalysis() {
    const [attendance, tasks] = await Promise.all([
      query(`SELECT u.name, a.attended_on AS date, a.check_in, a.check_out, a.status FROM attendance a JOIN employees e ON e.id=a.employee_id JOIN users u ON u.id=e.user_id WHERE a.farm_id=$1 AND a.attended_on >= CURRENT_DATE - INTERVAL '7 days' ORDER BY a.attended_on DESC, a.check_in DESC LIMIT 50`, [this.farmId]),
      query(`SELECT u.name, count(t.id)::int AS task_count, count(t.id) FILTER (WHERE t.status='completed')::int AS completed FROM tasks t JOIN employees e ON e.id=t.assigned_to JOIN users u ON u.id=e.user_id WHERE t.farm_id=$1 AND t.created_at >= CURRENT_DATE - INTERVAL '7 days' GROUP BY u.name ORDER BY task_count DESC LIMIT 20`, [this.farmId]),
    ]);
    return { attendance: attendance.rows, tasks: tasks.rows };
  }

  async getWeatherImpact() {
    const obs = await query(`SELECT temperature_c, humidity_pct, wind_kph, rain_mm, condition, observed_at FROM weather_observations WHERE farm_id=$1 ORDER BY observed_at DESC LIMIT 1`, [this.farmId]);
    const current = obs.rows[0] || null;
    if (!current) return { current: null, impact: 'No weather data available' };
    const thi = (current.temperature_c * 9) / 5 + 32 - ((0.55 - 0.55 * (current.humidity_pct / 100)) * (((current.temperature_c * 9) / 5 + 32) - 58));
    let impact = 'Normal conditions';
    if (thi >= 72) impact = `Heat stress risk (THI ${thi.toFixed(1)}). Reduce feeding during peak heat, increase water availability.`;
    else if (current.rain_mm > 20) impact = 'Heavy rainfall. Check drainage, monitor for foot rot.';
    else if (current.wind_kph > 40) impact = 'High winds. Secure equipment, check shelter integrity.';
    return { current, thi, impact };
  }

  async getBreedingAnalysis() {
    const [pregnant, candidates, calvingSoon] = await Promise.all([
      query(`SELECT c.cow_code, c.name FROM cows c WHERE c.farm_id=$1 AND c.is_pregnant AND c.status='active'`, [this.farmId]),
      query(`SELECT c.cow_code, c.name, br.serviced_on, br.method, (CURRENT_DATE - br.serviced_on) AS days_since FROM breeding_records br JOIN cows c ON c.id=br.cow_id WHERE c.farm_id=$1 AND br.result IS NULL AND br.serviced_on BETWEEN CURRENT_DATE - INTERVAL '90 days' AND CURRENT_DATE - INTERVAL '30 days' AND NOT EXISTS (SELECT 1 FROM breeding_records br2 WHERE br2.cow_id=br.cow_id AND br2.serviced_on > br.serviced_on) ORDER BY br.serviced_on ASC`, [this.farmId]),
      query(`SELECT c.cow_code, c.name, br.expected_calving_on FROM breeding_records br JOIN cows c ON c.id=br.cow_id WHERE c.farm_id=$1 AND br.expected_calving_on BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '14 days' ORDER BY br.expected_calving_on ASC`, [this.farmId]),
    ]);
    return { pregnant: pregnant.rows, candidates: candidates.rows, calvingSoon: calvingSoon.rows };
  }

  async getActiveTasks() {
    const r = await query(`SELECT t.title, t.priority, t.due_date, t.status, u.name AS assigned_to FROM tasks t LEFT JOIN employees e ON e.id=t.assigned_to LEFT JOIN users u ON u.id=e.user_id WHERE t.farm_id=$1 AND t.status NOT IN ('completed','cancelled') ORDER BY t.priority DESC, t.due_date ASC LIMIT 20`, [this.farmId]);
    return r.rows;
  }

  async getRecentActivities() {
    const r = await query(`SELECT da.created_at, da.activity_type, da.description, c.cow_code FROM daily_activities da LEFT JOIN cows c ON c.id=da.related_cow_id WHERE da.farm_id=$1 AND da.activity_date=CURRENT_DATE ORDER BY da.created_at DESC LIMIT 20`, [this.farmId]);
    return r.rows;
  }

  async getTopExpenses() {
    const r = await query(`SELECT category, SUM(amount) AS total FROM expenses WHERE farm_id=$1 AND incurred_on >= date_trunc('month', current_date) GROUP BY category ORDER BY total DESC LIMIT 5`, [this.farmId]);
    return r.rows;
  }
}
