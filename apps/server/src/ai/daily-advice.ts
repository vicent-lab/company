import { query } from '../db/index.js';
import { getWeatherObservation, computeThi } from './weather-station.js';

export interface DailyAdvice {
  greeting: string;
  farmScore: number;
  priorityTasks: { label: string; done: boolean; severity?: string }[];
  urgentAlerts: { title: string; description: string; severity?: string }[];
  healthWarnings: { title: string; description: string; cowId?: string; severity?: string }[];
  milkProductionAnalysis: { title: string; description: string; metrics?: Record<string, any> };
  feedRecommendations: { title: string; description: string; severity?: string }[];
  breedingRecommendations: { title: string; description: string; cowId?: string; severity?: string }[];
  financialSummary: { title: string; description: string; metrics?: Record<string, any> };
  inventoryWarnings: { title: string; description: string; severity?: string }[];
  weatherAdvice: { title: string; description: string; metrics?: Record<string, any> };
  employeeTasks: { title: string; description: string; assignedTo?: string; dueDate?: string }[];
  suggestedImprovements: { title: string; description: string }[];
  endOfDayChecklist: { label: string; done: boolean }[];
  estimatedProfitUgx: number;
}

function pick<T>(arr: T[], n: number): T[] {
  const out: T[] = [];
  for (let i = 0; i < n && i < arr.length; i++) out.push(arr[i]);
  return out;
}

// pg returns DATE columns as JS Date objects, which stringify into a template literal
// as a verbose "Tue Jul 21 2026 00:00:00 GMT+0300 (East Africa Time)" — readable to a
// machine, not to a farmer. This is what the advice text should say instead.
function daysAgoLabel(d: Date | string): string {
  const diffDays = Math.round((Date.now() - new Date(d).getTime()) / 86_400_000);
  if (diffDays <= 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  return `${diffDays} days ago`;
}

export async function generateDailyAdvice(farmId: string, userName?: string): Promise<DailyAdvice> {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? `Good morning${userName ? ' ' + userName : ''}.` : hour < 17 ? `Good afternoon${userName ? ' ' + userName : ''}.` : `Good evening${userName ? ' ' + userName : ''}.`;

  const [
    totalCowsRes,
    milkingRes,
    pregnantRes,
    sickRes,
    todayMilkRes,
    avgMilkRes,
    feedStockRes,
    vaccinationsDueRes,
    treatmentsRes,
    healthRes,
    breedingRes,
    tasksRes,
    dailyActRes,
    employeesRes,
    financeRes,
    weatherRes,
    inventoryRes,
    recentMilkTrendRes,
  ] = await Promise.all([
    query(`SELECT count(*)::int AS total FROM cows WHERE farm_id=$1 AND status='active'`, [farmId]),
    query(`SELECT count(*)::int AS total FROM cows WHERE farm_id=$1 AND is_milking AND status='active'`, [farmId]),
    query(`SELECT count(*)::int AS total FROM cows WHERE farm_id=$1 AND is_pregnant AND status='active'`, [farmId]),
    query(`SELECT count(*)::int AS total FROM cows WHERE farm_id=$1 AND health <> 'healthy' AND status='active'`, [farmId]),
    query(`SELECT COALESCE(SUM(morning_liters + afternoon_liters + evening_liters), 0) AS total FROM milk_records WHERE farm_id=$1 AND recorded_on = CURRENT_DATE`, [farmId]),
    query(`SELECT COALESCE(AVG(morning_liters + afternoon_liters + evening_liters), 0) AS avg FROM milk_records mr JOIN cows c ON c.id = mr.cow_id WHERE c.farm_id=$1`, [farmId]),
    query(`SELECT COALESCE(SUM(fi.quantity), 0) AS stock FROM feed_inventory fi JOIN feed_types ft ON ft.id = fi.feed_type_id WHERE ft.farm_id=$1`, [farmId]),
    query(`SELECT v.id, v.cow_id, c.cow_code, v.vaccine_name, v.due_on FROM vaccinations v JOIN cows c ON c.id = v.cow_id WHERE c.farm_id=$1 AND v.administered_on IS NULL AND v.due_on <= CURRENT_DATE + INTERVAL '7 days' ORDER BY v.due_on ASC LIMIT 10`, [farmId]),
    query(`SELECT t.id, t.cow_id, c.cow_code, t.disease_id, t.diagnosis, t.diagnosed_on FROM treatments t JOIN cows c ON c.id = t.cow_id WHERE c.farm_id=$1 AND t.diagnosed_on >= CURRENT_DATE - INTERVAL '14 days' ORDER BY t.diagnosed_on DESC LIMIT 10`, [farmId]),
    query(`SELECT c.id, c.cow_code, c.health, c.is_pregnant, COALESCE(hr.body_condition_score, NULL) AS body_condition_score FROM cows c LEFT JOIN LATERAL (SELECT body_condition_score FROM health_records WHERE cow_id=c.id ORDER BY recorded_on DESC LIMIT 1) hr ON true WHERE c.farm_id=$1 AND c.health <> 'healthy' AND c.status='active' ORDER BY c.updated_at DESC LIMIT 10`, [farmId]),
    query(`SELECT br.id, br.cow_id, c.cow_code, br.method, br.expected_calving_on FROM breeding_records br JOIN cows c ON c.id = br.cow_id WHERE c.farm_id=$1 AND br.expected_calving_on BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days' ORDER BY br.expected_calving_on ASC LIMIT 10`, [farmId]),
    query(`SELECT t.id, t.title, t.description, t.priority, t.due_date, t.status, e.job_title AS assigned_to FROM tasks t LEFT JOIN employees e ON e.id = t.assigned_to WHERE t.farm_id=$1 AND t.status NOT IN ('completed','cancelled') ORDER BY t.priority DESC, t.due_date ASC NULLS LAST LIMIT 10`, [farmId]),
    query(`SELECT da.id, da.activity_type, da.description, e.job_title AS employee_name FROM daily_activities da LEFT JOIN employees e ON e.id = da.employee_id WHERE da.farm_id=$1 AND da.activity_date = CURRENT_DATE ORDER BY da.created_at DESC LIMIT 10`, [farmId]),
    query(`SELECT count(*)::int AS total FROM employees WHERE farm_id=$1 AND is_active`, [farmId]),
    query(
      `SELECT
         (SELECT COALESCE(SUM(amount),0) FROM income WHERE farm_id=$1 AND received_on >= date_trunc('month', current_date)) AS income,
         (SELECT COALESCE(SUM(amount),0) FROM expenses WHERE farm_id=$1 AND incurred_on >= date_trunc('month', current_date)) AS expenses`,
      [farmId]
    ),
    getWeatherObservation(farmId).then((o) => ({ rows: [{ temp: o.temperatureC, humidity: o.humidityPct }] })),
    query(`SELECT i.id, i.item_name, i.category, i.quantity, i.reorder_level FROM inventory i WHERE i.farm_id=$1 AND i.quantity <= i.reorder_level ORDER BY i.quantity / NULLIF(i.reorder_level, 0) ASC LIMIT 10`, [farmId]),
    query(`SELECT recorded_on, SUM(morning_liters + afternoon_liters + evening_liters) AS total FROM milk_records WHERE farm_id=$1 AND recorded_on >= CURRENT_DATE - INTERVAL '7 days' GROUP BY recorded_on ORDER BY recorded_on DESC LIMIT 7`, [farmId]),
  ]);

  const totalCows = Number(totalCowsRes.rows[0]?.total || 0);
  const milking = Number(milkingRes.rows[0]?.total || 0);
  const pregnant = Number(pregnantRes.rows[0]?.total || 0);
  const sick = Number(sickRes.rows[0]?.total || 0);
  const todayMilk = Number(todayMilkRes.rows[0]?.total || 0);
  const farmAvgMilk = Number(avgMilkRes.rows[0]?.avg || 0);
  const feedStock = Number(feedStockRes.rows[0]?.stock || 0);
  const monthlyIncome = Number(financeRes.rows[0]?.income || 0);
  const monthlyExpenses = Number(financeRes.rows[0]?.expenses || 0);
  const monthlyProfit = monthlyIncome - monthlyExpenses;
  const estimatedProfitToday = milking > 0 ? Math.round(monthlyProfit / 30) : 0;
  const daysOfFeed = milking * 25 + pregnant * 5 > 0 ? feedStock / (milking * 25 + pregnant * 5) : 999;

  // Build sections
  const priorityTasks: DailyAdvice['priorityTasks'] = [];
  const urgentAlerts: DailyAdvice['urgentAlerts'] = [];
  const healthWarnings: DailyAdvice['healthWarnings'] = [];
  const feedRecs: DailyAdvice['feedRecommendations'] = [];
  const breedingRecs: DailyAdvice['breedingRecommendations'] = [];
  const employeeTasks: DailyAdvice['employeeTasks'] = [];
  const endOfDayChecklist: DailyAdvice['endOfDayChecklist'] = [];

  // Vaccinations due
  for (const v of vaccinationsDueRes.rows) {
    const label = `Vaccinate ${v.cow_code} — ${v.vaccine_name}`;
    priorityTasks.push({ label, done: false, severity: 'high' });
    urgentAlerts.push({ title: 'Vaccination due', description: `${v.cow_code}: ${v.vaccine_name} due on ${v.due_on}`, severity: 'high' });
  }

  // Treatments active
  for (const t of treatmentsRes.rows) {
    healthWarnings.push({ title: `Active treatment: ${t.diagnosis || 'ongoing'}`, description: `${t.cow_code} was diagnosed ${daysAgoLabel(t.diagnosed_on)}. Follow the treatment plan.`, cowId: t.cow_id, severity: 'high' });
  }

  // Sick cows
  for (const h of healthRes.rows) {
    if (!treatmentsRes.rows.find((t: any) => t.cow_id === h.id)) {
      healthWarnings.push({ title: `Health issue: ${h.health}`, description: `${h.cow_code} requires attention.`, cowId: h.id, severity: 'medium' });
    }
  }

  // Breeding / calving soon
  for (const b of breedingRes.rows) {
    breedingRecs.push({ title: `Calving expected for ${b.cow_code}`, description: `Expected on ${b.expected_calving_on}. Prepare calving pen.`, cowId: b.cow_id, severity: 'critical' });
    priorityTasks.push({ label: `Prepare calving for ${b.cow_code}`, done: false, severity: 'critical' });
    endOfDayChecklist.push({ label: `Check calving pen for ${b.cow_code}`, done: false });
  }

  // Feed stock warning
  if (daysOfFeed < 14) {
    feedRecs.push({ title: 'Feed stock running low', description: `At current consumption, feed will last ${daysOfFeed.toFixed(1)} days.`, severity: daysOfFeed < 7 ? 'critical' : 'high' });
    priorityTasks.push({ label: `Order feed — ${daysOfFeed.toFixed(0)} days remaining`, done: false, severity: daysOfFeed < 7 ? 'critical' : 'high' });
  }

  // Tasks
  for (const t of tasksRes.rows) {
    employeeTasks.push({ title: t.title, description: t.description || '', assignedTo: t.assigned_to || undefined, dueDate: t.due_date || undefined });
  }

  // Weather
  const weatherTemp = Number(weatherRes.rows[0]?.temp || 26);
  const weatherHumidity = Number(weatherRes.rows[0]?.humidity || 65);
  const thi = computeThi(weatherTemp, weatherHumidity);
  const weatherAdvice: DailyAdvice['weatherAdvice'] = {
    title: thi > 72 ? 'Heat stress risk' : weatherTemp < 5 ? 'Cold stress risk' : 'Conditions favorable',
    description: thi > 72 ? `THI is ${thi.toFixed(1)}. Provide shade, ensure water availability, adjust milking times.` : weatherTemp < 5 ? `Temperature ${weatherTemp.toFixed(1)}°C. Ensure warm bedding and extra energy feed.` : `Temperature ${weatherTemp.toFixed(1)}°C, humidity ${weatherHumidity.toFixed(0)}%. Normal grazing conditions.`,
    metrics: { temperature_c: weatherTemp, humidity_pct: weatherHumidity, thi: thi.toFixed(1) },
  };
  if (thi > 72) priorityTasks.push({ label: 'Activate heat stress mitigation', done: false, severity: 'high' });

  // Inventory warnings
  const inventoryWarnings: DailyAdvice['inventoryWarnings'] = inventoryRes.rows.map((inv: any) => ({
    title: `Low stock: ${inv.item_name}`,
    description: `${inv.category}: ${inv.quantity} remaining (reorder at ${inv.reorder_level})`,
    severity: 'high',
  }));

  // Milk production analysis
  const milkDrop = farmAvgMilk > 0 && todayMilk < farmAvgMilk * milking * 0.9;
  const milkProductionAnalysis: DailyAdvice['milkProductionAnalysis'] = {
    title: milkDrop ? 'Milk production dropped' : 'Milk production stable',
    description: milkDrop ? `Today: ${todayMilk.toFixed(0)} L vs avg ${(farmAvgMilk * milking).toFixed(0)} L. Drop of ${((1 - todayMilk / (farmAvgMilk * milking)) * 100).toFixed(1)}%.` : `Today: ${todayMilk.toFixed(0)} L from ${milking} cows (avg ${farmAvgMilk.toFixed(1)} L/cow).`,
    metrics: { todayLiters: todayMilk, avgLitersPerCow: farmAvgMilk, totalMilking: milking },
  };
  if (milkDrop) priorityTasks.push({ label: `Investigate milk drop — ${((1 - todayMilk / (farmAvgMilk * milking)) * 100).toFixed(0)}% below avg`, done: false, severity: 'high' });

  // Suggested improvements
  const suggestedImprovements: DailyAdvice['suggestedImprovements'] = [];
  if (sick > 0) suggestedImprovements.push({ title: 'Review herd health protocols', description: `${sick} cows not healthy. Consider preventive care and biosecurity review.` });
  if (daysOfFeed < 14 && daysOfFeed > 0) suggestedImprovements.push({ title: 'Diversify feed suppliers', description: 'Reduce risk of stockouts by securing backup suppliers.' });
  if (estimatedProfitToday < 0) suggestedImprovements.push({ title: 'Reduce daily variable costs', description: 'Profit projection negative. Review feed and energy use.' });

  // End of day checklist
  endOfDayChecklist.push(
    { label: 'Verify all milking records entered', done: false },
    { label: 'Check barn temperatures and ventilation', done: false },
    { label: 'Secure feed storage and water points', done: false },
    { label: 'Review next day schedule and alerts', done: false },
  );

  // Health warnings with treatments
  const allHealthWarnings = [...healthWarnings];
  for (const t of treatmentsRes.rows) {
    allHealthWarnings.push({ title: `Treatment active: ${t.diagnosis || 'ongoing'}`, description: `${t.cow_code} — ${t.diagnosis} (diagnosed ${daysAgoLabel(t.diagnosed_on)})`, cowId: t.cow_id, severity: 'high' });
  }

  // Financial summary
  const profitMargin = monthlyIncome > 0 ? ((monthlyProfit / monthlyIncome) * 100).toFixed(1) : '0';
  const financialSummary: DailyAdvice['financialSummary'] = {
    title: 'Monthly financial snapshot',
    description: `Income: ${monthlyIncome.toLocaleString()} UGX | Expenses: ${monthlyExpenses.toLocaleString()} UGX | Profit: ${monthlyProfit.toLocaleString()} UGX (${profitMargin}% margin)`,
    metrics: { income: monthlyIncome, expenses: monthlyExpenses, profit: monthlyProfit, marginPct: Number(profitMargin), estimatedProfitToday },
  };

  // Farm score calculation
  let score = 100;
  score -= sick * 5;
  score -= Math.max(0, 14 - daysOfFeed) * 3;
  score -= milkDrop ? 10 : 0;
  score -= vaccinationsDueRes.rows.length * 3;
  score -= sick > 0 ? 5 : 0;
  score += totalCows > 0 ? 5 : 0;
  score = Math.max(0, Math.min(100, score));

  return {
    greeting,
    farmScore: score,
    priorityTasks,
    urgentAlerts,
    healthWarnings: allHealthWarnings,
    milkProductionAnalysis,
    feedRecommendations: feedRecs,
    breedingRecommendations: breedingRecs,
    financialSummary,
    inventoryWarnings,
    weatherAdvice,
    employeeTasks,
    suggestedImprovements,
    endOfDayChecklist,
    estimatedProfitUgx: Math.max(0, estimatedProfitToday),
  };
}
