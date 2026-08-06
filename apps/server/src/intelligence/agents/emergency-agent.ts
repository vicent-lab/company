import { query } from '../../db/index.js';
import { FarmKnowledgeEngine } from '../knowledge/farm-data.js';
import { type AgentResult } from './types.js';

export class EmergencyResponseAgent {
  constructor(private knowledge: FarmKnowledgeEngine) {}

  async analyze(question: string): Promise<AgentResult> {
    const [criticalHealth, criticalFeed, criticalWeather] = await Promise.all([
      query(`SELECT count(*)::int AS n FROM cows WHERE farm_id=$1 AND status='active' AND health IN ('sick','under_treatment')`, [this.knowledge['farmId']]),
      query(`SELECT COALESCE(SUM(fi.quantity),0) AS stock, (SELECT count(*) FILTER (WHERE is_milking AND status='active') FROM cows WHERE farm_id=$1) AS milking FROM feed_inventory fi JOIN feed_types ft ON ft.id=fi.feed_type_id WHERE ft.farm_id=$1`, [this.knowledge['farmId']]),
      query(`SELECT temperature_c, humidity_pct FROM weather_observations WHERE farm_id=$1 ORDER BY observed_at DESC LIMIT 1`, [this.knowledge['farmId']]),
    ]);

    const sickCount = Number(criticalHealth.rows[0]?.n || 0);
    const feedStock = Number(criticalFeed.rows[0]?.stock || 0);
    const milking = Number(criticalFeed.rows[0]?.milking || 0);
    const dailyNeed = milking * 25;
    const feedDays = dailyNeed > 0 ? feedStock / dailyNeed : 999;
    const weather = criticalWeather.rows[0];
    const thi = weather ? (weather.temperature_c * 9) / 5 + 32 - ((0.55 - 0.55 * (weather.humidity_pct / 100)) * (((weather.temperature_c * 9) / 5 + 32) - 58)) : null;

    const emergencies: string[] = [];
    const evidence: string[] = [];
    const reasoning: string[] = [];
    const recommendedActions: string[] = [];

    evidence.push(`Sick/under treatment cows: ${sickCount}`);
    evidence.push(`Feed days remaining: ${feedDays.toFixed(1)}`);
    if (thi != null) evidence.push(`Current THI: ${thi.toFixed(1)}`);

    if (sickCount > 3) {
      emergencies.push(`MASS HEALTH ISSUE: ${sickCount} cows sick/under treatment`);
      reasoning.push('Multiple sick animals may indicate disease outbreak — immediate veterinary intervention required');
      recommendedActions.push('Call veterinarian immediately');
      recommendedActions.push('Isolate sick animals');
      recommendedActions.push('Implement biosecurity measures');
    }

    if (feedDays < 3) {
      emergencies.push(`FEED CRISIS: Only ${feedDays.toFixed(1)} days of feed remaining`);
      reasoning.push('Critical feed shortage — immediate action required to prevent starvation');
      recommendedActions.push('Emergency feed order — multiple suppliers');
      recommendedActions.push('Consider emergency feed sources');
    }

    if (thi != null && thi >= 80) {
      emergencies.push(`EXTREME HEAT: THI ${thi.toFixed(1)} — severe heat stress`);
      reasoning.push('Extreme heat stress can cause rapid health deterioration and death');
      recommendedActions.push('Immediate cooling measures');
      recommendedActions.push('Increase water availability');
      recommendedActions.push('Cancel non-essential outdoor activities');
    }

    const severity = emergencies.length > 1 ? 'critical' : emergencies.length === 1 ? 'high' : 'low';
    const confidence = 0.9;

    return {
      agent: 'emergency_response',
      title: emergencies.length > 0 ? `EMERGENCY: ${emergencies.length} critical issue(s)` : 'No emergencies detected',
      summary: emergencies.length > 0 ? emergencies.join('. ') : 'All systems normal. No immediate emergencies.',
      severity,
      confidence,
      evidence,
      reasoning,
      risks: emergencies,
      recommended_actions: recommendedActions.length ? recommendedActions : ['Continue monitoring'],
      expected_outcome: 'Rapid emergency response minimizes losses and protects animal welfare.',
      data: { sickCount, feedDays, thi, emergencies },
    };
  }
}
