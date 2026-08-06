import { getWeatherObservation, computeThi } from '../../weather-station.js';

export interface WeatherInsight {
  agent: 'weather';
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  actions: string[];
  evidence: Record<string, any>;
  reasoning?: string[];
}

export async function runWeatherAgent(farmId: string): Promise<WeatherInsight[]> {
  const obs = await getWeatherObservation(farmId);
  const thi = computeThi(obs.temperatureC, obs.humidityPct);

  const insights: WeatherInsight[] = [];

  if (thi >= 72) {
    insights.push({
      agent: 'weather',
      title: `Heat stress risk: THI ${thi.toFixed(1)} (threshold 72)`,
      description: `Temperature-humidity index exceeds the heat stress threshold. Milk yield may drop 10-20%.`,
      severity: thi >= 80 ? 'critical' : 'high',
      confidence: 0.9,
      actions: ['Increase water availability', 'Provide shade', 'Reduce feeding during peak heat', 'Monitor for heat stress signs'],
      evidence: { temp: obs.temperatureC, humidity: obs.humidityPct, thi, threshold: 72 },
    });
  }

  if (obs.rainMm > 20) {
    insights.push({
      agent: 'weather',
      title: `Heavy rainfall: ${obs.rainMm}mm`,
      description: `Significant rainfall may affect grazing conditions and mud accumulation.`,
      severity: 'medium',
      confidence: 0.8,
      actions: ['Check drainage', 'Move cattle to covered areas', 'Monitor for foot rot'],
      evidence: { rainfallMm: obs.rainMm, threshold: 20 },
    });
  }

  if (obs.windKph > 40) {
    insights.push({
      agent: 'weather',
      title: `High wind warning: ${obs.windKph} km/h`,
      description: `Strong winds may affect outdoor operations and animal comfort.`,
      severity: 'low',
      confidence: 0.7,
      actions: ['Secure loose equipment', 'Check shelter integrity'],
      evidence: { windSpeedKph: obs.windKph, threshold: 40 },
    });
  }

  return insights;
}
