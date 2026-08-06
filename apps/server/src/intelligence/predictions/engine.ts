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
      case 'all':
      default:
        predictions.push(...await this.predictMilkYield());
        predictions.push(...await this.predictDiseaseOutbreak());
        predictions.push(...await this.predictFeedShortage());
        predictions.push(...await this.predictCashFlow());
        predictions.push(...await this.predictCalving());
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
      predictions.push({
        type: 'milk_yield',
        description: '7-day milk production forecast',
        predicted_value: avg,
        confidence: 0.75,
        timeframe: 'Next 7 days',
        basis: `Based on 7-day moving average of ${recent.length} days`,
        recommendation: avg < 100 ? 'Investigate declining production — check health and nutrition' : 'Maintain current practices',
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
}
