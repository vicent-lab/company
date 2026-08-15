import { query } from '../db/index.js';
import { getWeatherObservation, computeThi } from './weather-station.js';

export interface PredictionItem {
  label: string;
  value: string | number;
  unit?: string;
  confidence: number;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  description?: string;
}

export interface MilkProductionPrediction {
  category: 'milk_production';
  forecast: number[];
  trend: 'increasing' | 'stable' | 'decreasing';
  confidence: number;
  changePct: number;
}

export interface DiseaseRiskPrediction {
  category: 'disease_risk';
  score: number;
  level: 'Low' | 'Moderate' | 'High';
  topRisks: string[];
  confidence: number;
}

export interface PregnancySuccessPrediction {
  category: 'pregnancy_success';
  currentRate: number;
  predictedRate: number;
  confidence: number;
}

export interface CalvingDatePrediction {
  category: 'calving_date';
  upcoming: Array<{ cowId: string; cowCode: string; expectedDate: string; daysUntil: number }>;
  nextMonthCount: number;
  confidence: number;
}

export interface FeedShortagePrediction {
  category: 'feed_shortage';
  riskLevel: 'Low' | 'Moderate' | 'High';
  daysRemaining: number;
  shortageType: string;
  confidence: number;
}

export interface MedicineShortagePrediction {
  category: 'medicine_shortage';
  riskLevel: 'Low' | 'Moderate' | 'High';
  criticalMedicines: Array<{ name: string; stock: number; expiryDate?: string }>;
  confidence: number;
}

export interface EquipmentFailurePrediction {
  category: 'equipment_failure';
  riskScore: number;
  atRiskItems: string[];
  confidence: number;
}

export interface CashFlowPrediction {
  category: 'cash_flow';
  next30Days: number;
  next90Days: number;
  trend: 'improving' | 'stable' | 'declining';
  confidence: number;
}

export interface ProfitPrediction {
  category: 'profit';
  next30Days: number;
  next90Days: number;
  margin: number;
  trend: 'increasing' | 'stable' | 'decreasing';
  confidence: number;
}

export interface CowProductivityPrediction {
  category: 'cow_productivity';
  topPerformers: Array<{ cowId: string; cowCode: string; predictedYield: number }>;
  lowPerformers: Array<{ cowId: string; cowCode: string; predictedYield: number }>;
  herdAverage: number;
  confidence: number;
}

export interface FarmerWorkloadPrediction {
  category: 'farmer_workload';
  score: number;
  pendingTasks: number;
  upcomingDeadlines: number;
  recommendation: string;
  confidence: number;
}

export interface AnimalStressPrediction {
  category: 'animal_stress';
  currentRisk: 'Low' | 'Moderate' | 'High';
  thi: number;
  recommendation: string;
  confidence: number;
}

export interface WaterRequirementsPrediction {
  category: 'water_requirements';
  dailyNeedLiters: number;
  currentAvailability: number;
  riskLevel: 'Low' | 'Moderate' | 'High';
  confidence: number;
}

export type AllPredictions = 
  | MilkProductionPrediction
  | DiseaseRiskPrediction
  | PregnancySuccessPrediction
  | CalvingDatePrediction
  | FeedShortagePrediction
  | MedicineShortagePrediction
  | EquipmentFailurePrediction
  | CashFlowPrediction
  | ProfitPrediction
  | CowProductivityPrediction
  | FarmerWorkloadPrediction
  | AnimalStressPrediction
  | WaterRequirementsPrediction;

export async function generatePredictions(farmId: string): Promise<AllPredictions[]> {
  const [
    totalCowsRes,
    sickRes,
    pregRes,
    milkTrendRes,
    breedingRes,
    feedRes,
    medicineRes,
    expenseRes,
    incomeRes,
    tasksRes,
    attendanceRes,
    weatherRes,
    cowPerfRes,
    historicPregRes,
  ] = await Promise.all([
    query(`SELECT count(*)::int AS n FROM cows WHERE farm_id=$1 AND status='active'`, [farmId]),
    query(`SELECT count(*)::int AS n FROM cows WHERE farm_id=$1 AND health<>'healthy' AND status='active'`, [farmId]),
    query(`SELECT count(*)::int AS n FROM cows WHERE farm_id=$1 AND is_pregnant AND status='active'`, [farmId]),
    query(`SELECT recorded_on, SUM(morning_liters+afternoon_liters+evening_liters) AS total FROM milk_records WHERE farm_id=$1 AND recorded_on >= CURRENT_DATE - INTERVAL '14 days' GROUP BY recorded_on ORDER BY recorded_on ASC`, [farmId]),
    query(`SELECT br.id, br.cow_id, c.cow_code, br.expected_calving_on FROM breeding_records br JOIN cows c ON c.id = br.cow_id WHERE c.farm_id=$1 AND br.expected_calving_on BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '60 days' ORDER BY br.expected_calving_on ASC`, [farmId]),
    query(`SELECT ft.name, fi.quantity, ft.reorder_level FROM feed_inventory fi JOIN feed_types ft ON ft.id=fi.feed_type_id WHERE ft.farm_id=$1`, [farmId]),
    query(`SELECT name, stock_quantity, expiry_date FROM medicines WHERE farm_id=$1 ORDER BY stock_quantity ASC`, [farmId]),
    query(`SELECT category, SUM(amount) AS total FROM expenses WHERE farm_id=$1 AND incurred_on >= CURRENT_DATE - INTERVAL '90 days' GROUP BY category`, [farmId]),
    query(`SELECT category, SUM(amount) AS total FROM income WHERE farm_id=$1 AND received_on >= CURRENT_DATE - INTERVAL '90 days' GROUP BY category`, [farmId]),
    query(`SELECT count(*)::int AS n, count(*) FILTER (WHERE status IN ('pending','in_progress')) AS open_n FROM tasks WHERE farm_id=$1`, [farmId]),
    query(`SELECT count(*)::int AS n FROM attendance a JOIN employees e ON e.id=a.employee_id WHERE e.farm_id=$1 AND a.attended_on >= CURRENT_DATE - INTERVAL '7 days' AND a.status NOT IN ('absent','leave')`, [farmId]),
    getWeatherObservation(farmId).then((o) => ({ rows: [{ temp: o.temperatureC, humidity: o.humidityPct }] })),
    query(`SELECT c.id, c.cow_code, AVG(mr.morning_liters+mr.afternoon_liters+mr.evening_liters) AS avg_yield FROM cows c JOIN milk_records mr ON mr.cow_id=c.id WHERE c.farm_id=$1 AND c.is_milking AND mr.recorded_on >= CURRENT_DATE - INTERVAL '30 days' GROUP BY c.id ORDER BY avg_yield DESC LIMIT 10`, [farmId]),
    query(`SELECT result, count(*)::int AS n FROM breeding_records br JOIN cows c ON c.id=br.cow_id WHERE c.farm_id=$1 AND br.breeding_date >= CURRENT_DATE - INTERVAL '180 days' GROUP BY result`, [farmId]),
  ]);

  const n = Number(totalCowsRes.rows[0]?.n || 0);
  const sick = Number(sickRes.rows[0]?.n || 0);
  const pregnant = Number(pregRes.rows[0]?.n || 0);
  const milkRows = milkTrendRes.rows as any[];
  const expenses = expenseRes.rows as any[];
  const incomes = incomeRes.rows as any[];
  const tasks = tasksRes.rows[0];
  const attendance = attendanceRes.rows[0];
  const weather = weatherRes.rows[0];
  const cowPerf = cowPerfRes.rows as any[];
  const breedingCandidates = breedingRes.rows as any[];
  const feedItems = feedRes.rows as any[];
  const medicines = medicineRes.rows as any[];
  const pregResults = historicPregRes.rows as any[];

  // 1. Milk Production Prediction
  const milkTotals = milkRows.map(r => Number(r.total));
  const recentMilk = milkTotals.slice(-7);
  const olderMilk = milkTotals.slice(0, -7);
  const recentAvg = recentMilk.length ? recentMilk.reduce((a, b) => a + b, 0) / recentMilk.length : 0;
  const olderAvg = olderMilk.length ? olderMilk.reduce((a, b) => a + b, 0) / olderMilk.length : 0;
  const milkTrend = recentAvg > olderAvg * 1.05 ? 'increasing' : recentAvg < olderAvg * 0.95 ? 'decreasing' : 'stable';
  const milkChangePct = olderAvg > 0 ? ((recentAvg - olderAvg) / olderAvg) * 100 : 0;
  const milkForecast = Array.from({ length: 7 }, (_, i) => Math.round(recentAvg * (1 + i * 0.005 * (milkTrend === 'increasing' ? 1 : milkTrend === 'decreasing' ? -1 : 0))));

  const milkPrediction: MilkProductionPrediction = {
    category: 'milk_production',
    forecast: milkForecast,
    trend: milkTrend,
    confidence: milkRows.length > 5 ? 0.78 : 0.55,
    changePct: Math.round(milkChangePct * 10) / 10,
  };

  // 2. Disease Risk
  const sickRatio = n > 0 ? sick / n : 0;
  const diseaseScore = Math.min(100, Math.round((sickRatio * 300) + (milkTrend === 'decreasing' ? 15 : 0)));
  const diseaseLevel: 'Low' | 'Moderate' | 'High' = diseaseScore > 50 ? 'High' : diseaseScore > 25 ? 'Moderate' : 'Low';
  const topRisks: string[] = [];
  if (sick > 0) topRisks.push('Active infections in herd');
  if (milkTrend === 'decreasing') topRisks.push('Production decline may indicate metabolic stress');
  if (diseaseScore > 30) topRisks.push('Elevated body condition variance');

  const diseasePrediction: DiseaseRiskPrediction = {
    category: 'disease_risk',
    score: diseaseScore,
    level: diseaseLevel,
    topRisks,
    confidence: 0.80,
  };

  // 3. Pregnancy Success
  const totalServices = pregResults.reduce((s, r) => s + Number(r.n), 0);
  const pregnantServices = pregResults.find((r: any) => String(r.result).toLowerCase() === 'pregnant')?.n || 0;
  const currentRate = totalServices > 0 ? (pregnantServices / totalServices) * 100 : 30;
  const predictedRate = Math.min(95, Math.round(currentRate * 1.05));

  const pregnancyPrediction: PregnancySuccessPrediction = {
    category: 'pregnancy_success',
    currentRate: Math.round(currentRate * 10) / 10,
    predictedRate,
    confidence: totalServices > 10 ? 0.75 : 0.55,
  };

  // 4. Calving Date
  const calvingUpcoming = breedingCandidates.map((b: any) => ({
    cowId: b.cow_id,
    cowCode: b.cow_code,
    expectedDate: b.expected_calving_on,
    daysUntil: Math.max(0, Math.ceil((new Date(b.expected_calving_on).getTime() - Date.now()) / 86400000)),
  }));
  const nextMonthCalvings = calvingUpcoming.filter(c => c.daysUntil <= 30).length;

  const calvingPrediction: CalvingDatePrediction = {
    category: 'calving_date',
    upcoming: calvingUpcoming.slice(0, 10),
    nextMonthCount: nextMonthCalvings,
    confidence: 0.88,
  };

  // 5. Feed Shortages
  const totalFeedStock = feedItems.reduce((s: number, f: any) => s + Number(f.quantity || 0), 0);
  const dailyFeedNeed = n * 20;
  const feedDaysRemaining = dailyFeedNeed > 0 ? totalFeedStock / dailyFeedNeed : 999;
  const feedRiskLevel: 'Low' | 'Moderate' | 'High' = feedDaysRemaining < 7 ? 'High' : feedDaysRemaining < 14 ? 'Moderate' : 'Low';
  const shortageType = feedItems.find((f: any) => Number(f.quantity || 0) < Number(f.reorder_level || 0))?.name || 'None';

  const feedPrediction: FeedShortagePrediction = {
    category: 'feed_shortage',
    riskLevel: feedRiskLevel,
    daysRemaining: Math.round(feedDaysRemaining),
    shortageType,
    confidence: 0.82,
  };

  // 6. Medicine Shortages
  const criticalMeds = medicines.filter((m: any) => Number(m.stock_quantity) < 10);
  const medRiskLevel: 'Low' | 'Moderate' | 'High' = criticalMeds.length > 2 ? 'High' : criticalMeds.length > 0 ? 'Moderate' : 'Low';

  const medicinePrediction: MedicineShortagePrediction = {
    category: 'medicine_shortage',
    riskLevel: medRiskLevel,
    criticalMedicines: criticalMeds.map((m: any) => ({
      name: m.name,
      stock: Number(m.stock_quantity),
      expiryDate: m.expiry_date,
    })),
    confidence: 0.75,
  };

  // 7. Equipment Failure
  const equipmentExpenses = expenses.filter((e: any) => /equipment|maintenance|repair|parts/i.test(e.category));
  const equipRiskScore = Math.min(100, equipmentExpenses.reduce((s: number, e: any) => s + Number(e.total || 0), 0) > 50000 ? 60 : 20);
  const equipAtRisk = equipmentExpenses.length > 3 ? ['Milking equipment', 'Cooling systems'] : [];

  const equipmentPrediction: EquipmentFailurePrediction = {
    category: 'equipment_failure',
    riskScore: equipRiskScore,
    atRiskItems: equipAtRisk,
    confidence: 0.60,
  };

  // 8. Cash Flow
  const monthlyExpenses = expenses.reduce((s: number, e: any) => s + Number(e.total || 0), 0);
  const monthlyIncome = incomes.reduce((s: number, i: any) => s + Number(i.total || 0), 0);
  const monthlyNet = monthlyIncome - monthlyExpenses;
  const cashFlowTrend: 'improving' | 'stable' | 'declining' = monthlyNet > 0 && monthlyNet > monthlyExpenses * 0.2 ? 'improving' : monthlyNet < 0 ? 'declining' : 'stable';
  const next30CashFlow = monthlyNet + Math.round((Math.random() - 0.5) * monthlyExpenses * 0.3);
  const next90CashFlow = next30CashFlow * 3;

  const cashFlowPrediction: CashFlowPrediction = {
    category: 'cash_flow',
    next30Days: next30CashFlow,
    next90Days: next90CashFlow,
    trend: cashFlowTrend,
    confidence: 0.70,
  };

  // 9. Profit
  const profitMargin = monthlyIncome > 0 ? (monthlyNet / monthlyIncome) * 100 : 0;
  const profitTrend: 'increasing' | 'stable' | 'decreasing' = profitMargin > 20 ? 'increasing' : profitMargin > 10 ? 'stable' : 'decreasing';

  const profitPrediction: ProfitPrediction = {
    category: 'profit',
    next30Days: monthlyNet,
    next90Days: monthlyNet * 3,
    margin: Math.round(profitMargin * 10) / 10,
    trend: profitTrend,
    confidence: 0.72,
  };

  // 10. Cow Productivity
  const topPerformers = cowPerf.slice(0, 3).map((c: any) => ({
    cowId: c.id,
    cowCode: c.cow_code,
    predictedYield: Math.round(Number(c.avg_yield) * (1 + Math.random() * 0.05)),
  }));
  const lowPerformers = cowPerf.slice(-3).reverse().map((c: any) => ({
    cowId: c.id,
    cowCode: c.cow_code,
    predictedYield: Math.round(Number(c.avg_yield) * (1 - Math.random() * 0.05)),
  }));
  const herdAvg = cowPerf.length > 0 ? Math.round(cowPerf.reduce((s: number, c: any) => s + Number(c.avg_yield), 0) / cowPerf.length) : 0;

  const productivityPrediction: CowProductivityPrediction = {
    category: 'cow_productivity',
    topPerformers,
    lowPerformers,
    herdAverage: herdAvg,
    confidence: 0.78,
  };

  // 11. Farmer Workload
  const openTasks = Number(tasks.open_n || 0);
  const workloadScore = Math.min(100, Math.round((openTasks / Math.max(1, n)) * 100 + (attendance?.n || 0) > 30 ? 10 : 0));
  const workloadRec = workloadScore > 70 ? 'Consider delegating tasks or hiring additional staff' : 'Workload is within manageable range';

  const workloadPrediction: FarmerWorkloadPrediction = {
    category: 'farmer_workload',
    score: workloadScore,
    pendingTasks: openTasks,
    upcomingDeadlines: Number(tasks.n || 0) - Number(tasks.open_n || 0),
    recommendation: workloadRec,
    confidence: 0.68,
  };

  // 12. Animal Stress
  const temp = Number(weather.temp || 25);
  const humidity = Number(weather.humidity || 60);
  const thi = computeThi(temp, humidity);
  const stressRisk: 'Low' | 'Moderate' | 'High' = thi > 72 ? 'High' : thi > 65 ? 'Moderate' : 'Low';

  const animalStressPrediction: AnimalStressPrediction = {
    category: 'animal_stress',
    currentRisk: stressRisk,
    thi: Math.round(thi * 10) / 10,
    recommendation: thi > 72 ? 'Activate cooling protocols and adjust feeding times' : thi < 5 ? 'Ensure warm bedding and increase energy density in feed' : 'Conditions are favorable',
    confidence: 0.82,
  };

  // 13. Water Requirements
  const dailyWaterNeed = n * 120;
  const waterAvailability = n * 150 + Math.round(Math.random() * 5000);
  const waterRiskLevel: 'Low' | 'Moderate' | 'High' = dailyWaterNeed > waterAvailability ? 'High' : 'Low';

  const waterPrediction: WaterRequirementsPrediction = {
    category: 'water_requirements',
    dailyNeedLiters: dailyWaterNeed,
    currentAvailability: waterAvailability,
    riskLevel: waterRiskLevel,
    confidence: 0.75,
  };

  return [
    milkPrediction,
    diseasePrediction,
    pregnancyPrediction,
    calvingPrediction,
    feedPrediction,
    medicinePrediction,
    equipmentPrediction,
    cashFlowPrediction,
    profitPrediction,
    productivityPrediction,
    workloadPrediction,
    animalStressPrediction,
    waterPrediction,
  ];
}
