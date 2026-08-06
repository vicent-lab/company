import { query } from '../../db/index.js';
import { FarmKnowledgeEngine } from '../knowledge/farm-data.js';

export interface ProactiveAlert {
  id: string;
  type: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  action_required: string;
  detected_at: string;
}

export class ProactiveAlertEngine {
  private farmId: string;
  private knowledge: FarmKnowledgeEngine;

  constructor(farmId: string) {
    this.farmId = farmId;
    this.knowledge = new FarmKnowledgeEngine(farmId);
  }

  async detectAlerts(): Promise<ProactiveAlert[]> {
    const alerts: ProactiveAlert[] = [];
    const overview = await this.knowledge.getOverview();

    if (overview.sick_cows > 0) {
      alerts.push({
        id: `sick-${Date.now()}`,
        type: 'health',
        severity: overview.sick_cows > 3 ? 'critical' : 'warning',
        title: `${overview.sick_cows} cow(s) need attention`,
        message: `${overview.sick_cows} cow(s) are currently sick or under treatment. Immediate veterinary attention may be needed.`,
        action_required: 'Check health records and schedule veterinary examination if needed.',
        detected_at: new Date().toISOString(),
      });
    }

    if (overview.feed_days_remaining < 3) {
      alerts.push({
        id: `feed-${Date.now()}`,
        type: 'inventory',
        severity: 'critical',
        title: 'Emergency: feed stock critically low',
        message: `Feed inventory will last only ${overview.feed_days_remaining.toFixed(1)} days at current consumption.`,
        action_required: 'Place emergency feed order immediately.',
        detected_at: new Date().toISOString(),
      });
    } else if (overview.feed_days_remaining < 7) {
      alerts.push({
        id: `feed-${Date.now()}`,
        type: 'inventory',
        severity: 'warning',
        title: 'Feed stock low',
        message: `Feed inventory will last ${overview.feed_days_remaining.toFixed(1)} days. Order soon.`,
        action_required: 'Order additional feed within 24-48 hours.',
        detected_at: new Date().toISOString(),
      });
    }

    if (overview.current_thi != null && overview.current_thi >= 72) {
      alerts.push({
        id: `heat-${Date.now()}`,
        type: 'weather',
        severity: overview.current_thi >= 80 ? 'critical' : 'warning',
        title: 'Heat stress risk detected',
        message: `Temperature-humidity index is ${overview.current_thi.toFixed(1)} (threshold 72). Milk yield may drop 10-20%.`,
        action_required: 'Increase water availability, provide shade, reduce feeding during peak heat.',
        detected_at: new Date().toISOString(),
      });
    }

    if (overview.overdue_vaccinations > 0) {
      alerts.push({
        id: `vacc-${Date.now()}`,
        type: 'health',
        severity: 'warning',
        title: `${overview.overdue_vaccinations} overdue vaccination(s)`,
        message: `${overview.overdue_vaccinations} vaccinations are past due.`,
        action_required: 'Schedule vaccinations with your veterinarian.',
        detected_at: new Date().toISOString(),
      });
    }

    if (overview.net_profit_this_month < 0) {
      alerts.push({
        id: `profit-${Date.now()}`,
        type: 'finance',
        severity: 'warning',
        title: 'Negative profit this month',
        message: `Net profit is ${overview.net_profit_this_month.toFixed(2)}. Immediate cost review required.`,
        action_required: 'Review top expense categories and identify quick cost reductions.',
        detected_at: new Date().toISOString(),
      });
    }

    const health = await this.knowledge.getHealthAnalysis();
    if (health.riskCows.length > 0) {
      alerts.push({
        id: `risk-${Date.now()}`,
        type: 'health',
        severity: 'warning',
        title: `${health.riskCows.length} cow(s) at risk`,
        message: `${health.riskCows.length} cow(s) show risk factors: low body condition, lameness, or disease indicators.`,
        action_required: 'Examine at-risk cows and consider veterinary consultation.',
        detected_at: new Date().toISOString(),
      });
    }

    return alerts;
  }
}
