import { query } from '../../db/index.js';
import { FarmKnowledgeEngine } from '../knowledge/farm-data.js';

export interface Prediction {
  type: string;
  description: string;
  predicted_value: number | string;
  confidence: number;
  timeframe: string;
  basis: string;
  recommendation: string;
}

export class PredictionEngine {
  constructor(private knowledge: FarmKnowledgeEngine) {}

  async predict(type: string): Promise<Prediction[]> {
    const predictions: Prediction[] = [];

    switch (type) {
      case 'milk':
        predictions.push(...await this.predictMilkYield());
        break;
      case 'disease':
        predictions.push(...await this.predictDiseaseOutbreak());
        break;
      case 'feed':
        predictions.push(...await this.predictFeedShortage());
        break;
      case 'finance':
        predictions.push(...await this.predictCashFlow());
        break;
      case 'calving':
        predictions.push(...await this.predictCalving());
        break;
      case 'pregnancy':
        predictions.push(...await this.predictPregnancySuccess());
        break;
      case 'equipment':
        predictions.push(...await this.predictEquipmentFailure());
        break;
      case 'heat_stress':
        predictions.push(...await this.predictHeatStress());
        break;
      case 'inventory':
        predictions.push(...await this.predictInventoryDepletion());
        break;
      case 'employee':
        predictions.push(...await this.predictEmployeeWorkload());
        break;
      case 'water':
        predictions.push(...await this.predictWaterRequirements());
        break;
      case 'profit':
        predictions.push(...await this.predictProfit());
        break;
      case 'animal_stress':
        predictions.push(...await this.predictAnimalStress());
        break;
      case 'medicine':
        predictions.push(...await this.predictMedicineShortage());
        break;
      case 'all':
      default:
        predictions.push(...await this.predictMilkYield());
        predictions.push(...await this.predictDiseaseOutbreak());
        predictions.push(...await this.predictFeedShortage());
        predictions.push(...await this.predictCashFlow());
        predictions.push(...await this.predictCalving());
        predictions.push(...await this.predictPregnancySuccess());
        predictions.push(...await this.predictEquipmentFailure());
        predictions.push(...await this.predictHeatStress());
        predictions.push(...await this.predictInventoryDepletion());
        predictions.push(...await this.predictEmployeeWorkload());
        predictions.push(...await this.predictWaterRequirements());
        predictions.push(...await this.predictProfit());
        predictions.push(...await this.predictAnimalStress());
        predictions.push(...await this.predictMedicineShortage());
        break;
    }

    return predictions;
  }

  private async predictMilkYield(): Promise<Prediction[]> {
    const trend = await this.knowledge.getMilkAnalysis();
    const predictions: Prediction[] = [];

    if (trend.trend?.length >= 7) {
      const recent = trend.trend.slice(-7);
      const avg = recent.reduce((s, r) => s + Number(r.total), 0) / recent.length;
      const prev = recent.length >= 14 ? recent.slice(-14, -7) : recent;
      const prevAvg = prev.reduce((s, r) => s + Number(r.total), 0) / prev.length;
      const change = prevAvg > 0 ? ((avg - prevAvg) / prevAvg) * 100 : 0;

      predictions.push({
        type: 'milk_yield',
        description: '7-day milk production forecast',
        predicted_value: avg,
        confidence: 0.75,
        timeframe: 'Next 7 days',
        basis: `Based on 7-day moving average. Trend: ${change >= 0 ? '+' : ''}${change.toFixed(1)}% vs previous week.`,
        recommendation: avg < 100 ? 'Investigate declining production — check health and nutrition' : change < -5 ? 'Monitor declining trend — review feeding and health' : 'Maintain current practices',
      });
    }

    return predictions;
  }

  private async predictDiseaseOutbreak(): Promise<Prediction[]> {
    const health = await this.knowledge.getHealthAnalysis();
    const predictions: Prediction[] = [];

    if (health.sickCows.length > 2) {
      predictions.push({
        type: 'disease_outbreak',
        description: 'Disease outbreak risk',
        predicted_value: 'High',
        confidence: 0.8,
        timeframe: 'Next 48-72 hours',
        basis: `${health.sickCows.length} cows currently sick — potential contagious disease`,
        recommendation: 'Isolate sick animals, consult veterinarian, implement biosecurity measures',
      });
    }

    return predictions;
  }

  private async predictFeedShortage(): Promise<Prediction[]> {
    const overview = await this.knowledge.getOverview();
    const predictions: Prediction[] = [];

    if (overview.feed_days_remaining < 14) {
      predictions.push({
        type: 'feed_shortage',
        description: 'Feed shortage prediction',
        predicted_value: `${overview.feed_days_remaining.toFixed(1)} days`,
        confidence: 0.9,
        timeframe: 'Based on current consumption',
        basis: `Current stock: ${overview.feed_days_remaining.toFixed(1)} days at current consumption rate`,
        recommendation: overview.feed_days_remaining < 7 ? 'Order feed immediately' : 'Schedule feed order within 3-5 days',
      });
    }

    return predictions;
  }

  private async predictCashFlow(): Promise<Prediction[]> {
    const finance = await this.knowledge.getFinancialAnalysis();
    const predictions: Prediction[] = [];

    predictions.push({
      type: 'cash_flow',
      description: 'Monthly profit projection',
      predicted_value: finance.net_profit,
      confidence: 0.7,
      timeframe: 'This month',
      basis: `Current income: ${finance.income.toFixed(2)}, expenses: ${finance.expenses.toFixed(2)}`,
      recommendation: finance.net_profit < 0 ? 'Immediate cost reduction required' : 'Maintain current financial management',
    });

    return predictions;
  }

  private async predictCalving(): Promise<Prediction[]> {
    const breeding = await this.knowledge.getBreedingAnalysis();
    const predictions: Prediction[] = [];

    if (breeding.calvingSoon?.length) {
      predictions.push({
        type: 'calving',
        description: 'Upcoming calvings',
        predicted_value: `${breeding.calvingSoon.length} calvings expected`,
        confidence: 0.85,
        timeframe: 'Next 14 days',
        basis: `${breeding.calvingSoon.length} cows with expected calving dates within 14 days`,
        recommendation: 'Prepare calving facilities, ensure veterinary standby',
      });
    }

    return predictions;
  }

  private async predictPregnancySuccess(): Promise<Prediction[]> {
    const breeding = await this.knowledge.getBreedingAnalysis();
    const predictions: Prediction[] = [];

    if (breeding.candidates?.length > 0) {
      const avgSuccessRate = 0.65;
      const expectedSuccess = Math.round(breeding.candidates.length * avgSuccessRate);
      predictions.push({
        type: 'pregnancy_success',
        description: 'Pregnancy success prediction',
        predicted_value: `${expectedSuccess}/${breeding.candidates.length}`,
        confidence: 0.7,
        timeframe: 'Next 30 days',
        basis: `Based on ${breeding.candidates.length} candidates and industry average ${avgSuccessRate * 100}% success rate`,
        recommendation: 'Schedule pregnancy checks to confirm',
      });
    }

    return predictions;
  }

  private async predictEquipmentFailure(): Promise<Prediction[]> {
    const overdueMaintenance = await query(`SELECT count(*)::int AS overdue FROM tasks WHERE farm_id=$1 AND category='maintenance' AND status NOT IN ('completed','cancelled') AND due_date < CURRENT_DATE`, [this.knowledge['farmId']]);

    const predictions: Prediction[] = [];
    const overdue = overdueMaintenance.rows[0]?.overdue || 0;

    if (overdue > 0) {
      predictions.push({
        type: 'equipment_failure',
        description: 'Equipment failure risk',
        predicted_value: `${overdue} overdue`,
        confidence: 0.75,
        timeframe: 'Next 30 days',
        basis: `${overdue} overdue maintenance tasks increase failure risk`,
        recommendation: 'Schedule overdue maintenance immediately',
      });
    }

    return predictions;
  }

  private async predictHeatStress(): Promise<Prediction[]> {
    const weather = await this.knowledge.getWeatherImpact();
    const predictions: Prediction[] = [];

    if (weather.thi && weather.thi >= 68) {
      const affectedCows = Math.round((weather.thi - 68) / 4 * 100);
      predictions.push({
        type: 'heat_stress',
        description: 'Heat stress prediction',
        predicted_value: `${Math.min(affectedCows, 100)}% of herd affected`,
        confidence: 0.8,
        timeframe: 'Today',
        basis: `Current THI: ${weather.thi.toFixed(1)}. Above threshold of 68.`,
        recommendation: 'Increase water availability, provide shade, reduce feeding during peak heat',
      });
    }

    return predictions;
  }

  private async predictInventoryDepletion(): Promise<Prediction[]> {
    const overview = await this.knowledge.getOverview();
    const predictions: Prediction[] = [];

    if (overview.feed_days_remaining < 30) {
      predictions.push({
        type: 'inventory_depletion',
        description: 'Inventory depletion forecast',
        predicted_value: `${overview.feed_days_remaining.toFixed(1)} days`,
        confidence: 0.85,
        timeframe: 'Based on current consumption',
        basis: `Feed inventory at ${overview.feed_days_remaining.toFixed(1)} days`,
        recommendation: overview.feed_days_remaining < 14 ? 'Order immediately' : 'Schedule order within 2 weeks',
      });
    }

    return predictions;
  }

  private async predictEmployeeWorkload(): Promise<Prediction[]> {
    const [taskStats, attendance] = await Promise.all([
      query(`SELECT count(*)::int AS pending FROM tasks WHERE farm_id=$1 AND status='pending'`, [this.knowledge['farmId']]),
      query(`SELECT count(*)::int AS absent FROM attendance a JOIN employees e ON e.id=a.employee_id WHERE e.farm_id=$1 AND a.attended_on >= CURRENT_DATE - INTERVAL '7 days' AND a.status='absent'`, [this.knowledge['farmId']]),
    ]);

    const predictions: Prediction[] = [];
    const pending = taskStats.rows[0]?.pending || 0;
    const absent = attendance.rows[0]?.absent || 0;

    if (pending > 15 || absent > 3) {
      predictions.push({
        type: 'employee_workload',
        description: 'Employee workload risk',
        predicted_value: pending > 15 ? 'High task backlog' : 'High absenteeism',
        confidence: 0.75,
        timeframe: 'Next 7 days',
        basis: `${pending} pending tasks, ${absent} absences in last 7 days`,
        recommendation: 'Redistribute tasks, review staffing levels, address attendance issues',
      });
    }

    return predictions;
  }

  private async predictWaterRequirements(): Promise<Prediction[]> {
    const overview = await this.knowledge.getOverview();
    const weather = await this.knowledge.getWeatherImpact();
    const predictions: Prediction[] = [];

    const baseWater = overview.milking_cows * 100;
    const heatAdjustment = weather.thi && weather.thi >= 72 ? 1.3 : 1.0;
    const predictedWater = baseWater * heatAdjustment;

    predictions.push({
      type: 'water_requirements',
      description: 'Daily water requirement forecast',
      predicted_value: `${predictedWater.toFixed(0)} L/day`,
      confidence: 0.8,
      timeframe: 'Today',
      basis: `${overview.milking_cows} milking cows × 100 L/base + ${heatAdjustment > 1 ? '30% heat adjustment' : 'no adjustment'}`,
      recommendation: heatAdjustment > 1 ? 'Ensure extra water sources are available' : 'Maintain current water supply',
    });

    return predictions;
  }

  private async predictProfit(): Promise<Prediction[]> {
    const finance = await this.knowledge.getFinancialAnalysis();
    const predictions: Prediction[] = [];

    predictions.push({
      type: 'profit',
      description: 'Monthly profit prediction',
      predicted_value: finance.net_profit,
      confidence: 0.7,
      timeframe: 'This month',
      basis: `Current margin: ${finance.margin_pct.toFixed(1)}%. Based on current income/expense trends.`,
      recommendation: finance.net_profit < 0 ? 'Immediate cost reduction and revenue boost needed' : finance.margin_pct < 15 ? 'Optimize top expenses to improve margin' : 'Maintain current practices',
    });

    return predictions;
  }

  private async predictAnimalStress(): Promise<Prediction[]> {
    const [health, weather] = await Promise.all([
      this.knowledge.getHealthAnalysis(),
      this.knowledge.getWeatherImpact(),
    ]);

    const predictions: Prediction[] = [];
    const stressFactors = [];

    if (health.sickCows.length > 0) stressFactors.push('health issues');
    if (weather.thi && weather.thi >= 72) stressFactors.push('heat stress');
    if (weather.current?.rain_mm > 20) stressFactors.push('wet conditions');

    if (stressFactors.length > 0) {
      const affected = Math.round((stressFactors.length / 3) * 100);
      predictions.push({
        type: 'animal_stress',
        description: 'Animal stress level prediction',
        predicted_value: `${affected}% of herd`,
        confidence: 0.7,
        timeframe: 'Today',
        basis: `Stress factors: ${stressFactors.join(', ')}`,
        recommendation: 'Address stress factors: improve comfort, reduce heat stress, treat health issues',
      });
    }

    return predictions;
  }

  private async predictMedicineShortage(): Promise<Prediction[]> {
    const inventory = await this.knowledge.getInventoryAnalysis();
    const predictions: Prediction[] = [];

    const lowMedicines = (inventory.medicines || []).filter((m: any) => Number(m.quantity) < 10);
    if (lowMedicines.length > 0) {
      predictions.push({
        type: 'medicine_shortage',
        description: 'Medicine shortage risk',
        predicted_value: `${lowMedicines.length} medicines low`,
        confidence: 0.8,
        timeframe: 'Next 7-14 days',
        basis: `${lowMedicines.length} medicines below safe threshold`,
        recommendation: 'Order low medicines immediately',
      });
    }

    return predictions;
  }
}
