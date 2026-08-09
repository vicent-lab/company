import { query } from '../../db/index.js';
import { FarmKnowledgeEngine } from '../knowledge/farm-data.js';
import { type AgentResult } from './types.js';

export class WeatherAgent {
  constructor(private knowledge: FarmKnowledgeEngine) {}

  async analyze(question: string): Promise<AgentResult> {
    const weather = await this.knowledge.getWeatherImpact();
    const forecast = await query(`SELECT observed_at AS forecast_date, temperature_c AS temp_max_c, temperature_c AS temp_min_c, humidity_pct, rain_mm AS rain_probability, wind_kph, condition FROM weather_observations WHERE farm_id=$1 AND observed_at >= CURRENT_DATE AND observed_at <= CURRENT_DATE + INTERVAL '7 days' ORDER BY observed_at ASC LIMIT 7`, [this.knowledge['farmId']]);

    const evidence: string[] = [];
    const reasoning: string[] = [];
    const recommendedActions: string[] = [];
    const risksList: string[] = [];

    if (!weather.current) {
      return {
        agent: 'weather',
        title: 'Weather data unavailable',
        summary: 'No weather data available for analysis.',
        severity: 'low',
        confidence: 0.3,
        evidence: ['No weather observations recorded'],
        reasoning: ['Cannot assess weather impact without data'],
        risks: [],
        recommended_actions: ['Ensure weather data is being recorded'],
        expected_outcome: 'Weather data enables proactive management decisions.',
        data: weather,
      };
    }

    evidence.push(`Temperature: ${weather.current.temperature_c}°C`);
    evidence.push(`Humidity: ${weather.current.humidity_pct}%`);
    evidence.push(`THI: ${weather.thi?.toFixed(1)}`);
    if (weather.current.rain_mm) evidence.push(`Rainfall: ${weather.current.rain_mm}mm`);
    if (weather.current.wind_kph) evidence.push(`Wind: ${weather.current.wind_kph} km/h`);
    if (forecast.rows.length > 0) {
      evidence.push(`7-day forecast available: ${forecast.rows.length} days`);
    }

    if (weather.thi && weather.thi >= 72) {
      risksList.push(`Heat stress risk: THI ${weather.thi.toFixed(1)} (threshold 72)`);
      reasoning.push('High temperature-humidity index reduces feed intake and milk production');
      recommendedActions.push('Increase water availability');
      recommendedActions.push('Provide shade and ventilation');
      recommendedActions.push('Reduce feeding during peak heat hours');
      recommendedActions.push('Monitor cows for heat stress signs');
    }

    if (weather.current.rain_mm > 20) {
      risksList.push(`Heavy rainfall: ${weather.current.rain_mm}mm`);
      reasoning.push('Heavy rain affects grazing and increases foot rot risk');
      recommendedActions.push('Check drainage systems');
      recommendedActions.push('Move cattle to covered areas');
      recommendedActions.push('Monitor for foot rot and skin issues');
    }

    const hotDays = forecast.rows.filter((f: any) => Number(f.temp_max_c) >= 30);
    if (hotDays.length > 0) {
      reasoning.push(`Upcoming hot days: ${hotDays.length} days above 30°C`);
      recommendedActions.push('Prepare cooling measures for upcoming heat');
    }

    const severity = weather.thi && weather.thi >= 80 ? 'critical' : weather.thi && weather.thi >= 72 ? 'high' : weather.current.rain_mm > 20 ? 'medium' : 'low';
    const confidence = 0.85;

    return {
      agent: 'weather',
      title: `Weather impact: ${weather.impact}`,
      summary: weather.impact,
      severity,
      confidence,
      evidence,
      reasoning,
      risks: risksList,
      recommended_actions: recommendedActions.length ? recommendedActions : ['No specific weather actions needed'],
      expected_outcome: 'Proactive weather management minimizes stress and maintains productivity.',
      data: { ...weather, forecast: forecast.rows },
    };
  }
}
