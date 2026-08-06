import { query } from '../../db/index.js';
import { FarmKnowledgeEngine } from '../knowledge/farm-data.js';
import { ProactiveAlertEngine, ProactiveAlert } from '../alerts/engine.js';

export interface DailyBriefing {
  generated_at: string;
  farm_health_score: number;
  sections: {
    overview: Record<string, any>;
    milk: Record<string, any>;
    health: Record<string, any>;
    finance: Record<string, any>;
    inventory: Record<string, any>;
    breeding: Record<string, any>;
    weather: Record<string, any>;
    tasks: Record<string, any>;
  };
  alerts: Array<{ type: string; severity: string; title: string; message: string; action_required: string }>;
  priorities: string[];
}

export class DailyBriefingGenerator {
  private farmId: string;
  private knowledge: FarmKnowledgeEngine;
  private alertEngine: ProactiveAlertEngine;

  constructor(farmId: string) {
    this.farmId = farmId;
    this.knowledge = new FarmKnowledgeEngine(farmId);
    this.alertEngine = new ProactiveAlertEngine(farmId);
  }

  async generate(): Promise<DailyBriefing> {
    const [overview, milk, health, finance, inventory, breeding, weather, tasks, alerts] = await Promise.all([
      this.knowledge.getOverview(),
      this.knowledge.getMilkAnalysis(),
      this.knowledge.getHealthAnalysis(),
      this.knowledge.getFinancialAnalysis(),
      this.knowledge.getInventoryAnalysis(),
      this.knowledge.getBreedingAnalysis(),
      this.knowledge.getWeatherImpact(),
      this.knowledge.getActiveTasks(),
      this.alertEngine.detectAlerts(),
    ]);

    const priorities = this.determinePriorities(overview, health, alerts, tasks);

    const healthScore = this.computeHealthScore(overview, health, alerts);

    await query(`INSERT INTO ai_analysis_logs (farm_id, analysis_type, status) VALUES ($1, 'daily_briefing', 'completed')`, [this.farmId]);

    return {
      generated_at: new Date().toISOString(),
      farm_health_score: healthScore,
      sections: { overview, milk, health, finance, inventory, breeding, weather, tasks },
      alerts: alerts.map((a: any) => ({ type: a.type, severity: a.severity, title: a.title, message: a.message, action_required: a.action_required })),
      priorities,
    };
  }

  private computeHealthScore(overview: any, health: any, alerts: ProactiveAlert[]): number {
    let score = 100;
    score -= overview.sick_cows * 5;
    score -= overview.overdue_vaccinations * 3;
    score -= health.riskCows.length * 4;
    if (overview.feed_days_remaining < 7) score -= 10;
    if (overview.current_thi != null && overview.current_thi >= 72) score -= 5;
    if (overview.net_profit_this_month < 0) score -= 10;
    const criticalAlerts = alerts.filter((a) => a.severity === 'critical').length;
    score -= criticalAlerts * 15;
    return Math.max(0, Math.min(100, score));
  }

  private determinePriorities(overview: any, health: any, alerts: ProactiveAlert[], tasks: any[]): string[] {
    const priorities: string[] = [];
    if (overview.sick_cows > 0) priorities.push(`Attend to ${overview.sick_cows} sick cow(s)`);
    if (overview.feed_days_remaining < 7) priorities.push(`Order feed — ${overview.feed_days_remaining.toFixed(1)} days remaining`);
    if (overview.current_thi != null && overview.current_thi >= 72) priorities.push('Mitigate heat stress');
    if (overview.overdue_vaccinations > 0) priorities.push(`Catch up on ${overview.overdue_vaccinations} overdue vaccinations`);
    if (overview.net_profit_this_month < 0) priorities.push('Review expenses — negative profit');
    if (health.riskCows.length > 0) priorities.push(`Examine ${health.riskCows.length} at-risk cow(s)`);
    if (tasks.length > 0) priorities.push(`Complete ${tasks.length} active task(s)`);
    if (priorities.length === 0) priorities.push('No urgent priorities — continue routine management');
    return priorities.slice(0, 5);
  }
}
