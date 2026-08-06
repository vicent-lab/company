import { Router } from 'express';
import { requireAuth, resolveFarmId } from '../middleware/auth.js';
import { asyncHandler } from '../lib/errors.js';
import { getWeatherForPeriod, getWeatherObservation, WeatherPeriod } from '../ai/weather-station.js';

const router = Router();
router.use(requireAuth);

const PERIODS: WeatherPeriod[] = ['today', 'yesterday', 'week', 'month', 'forecast'];

const RAIN_CHANCE_BY_CONDITION: Record<string, number> = {
  Sunny: 5, Clear: 5, Breezy: 10, 'Partly cloudy': 20, Cloudy: 35, 'Light rain': 60, 'Heavy rain': 85,
};

function recommendationFor(obs: Awaited<ReturnType<typeof getWeatherObservation>>): string {
  if (obs.heatStress !== 'none') {
    return `Heat stress risk (THI ${obs.thi.toFixed(1)}, ${obs.heatStress}): move grazing herds to shaded barns during 11am–4pm, increase water point access, and shift milking to cooler morning/evening hours.`;
  }
  if (obs.coldStress !== 'none') {
    return `Cold stress risk (${obs.temperatureC.toFixed(1)}°C): move exposed cows into sheltered barns and increase ration energy density.`;
  }
  return 'Cool morning (6–9am) is ideal for grazing; bring the herd in before the afternoon heat peak.';
}

router.get('/', asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const period = PERIODS.includes(req.query.period as WeatherPeriod) ? (req.query.period as WeatherPeriod) : 'today';
  const obs = await getWeatherForPeriod(farmId, period);

  // Simple 7-day outlook derived from today's reading — no external forecast API wired up.
  const forecast = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const baseChance = RAIN_CHANCE_BY_CONDITION[obs.condition] ?? 15;
  const rainChance = forecast.map((_, i) => Math.max(5, Math.min(95, Math.round(baseChance + (i - 3) * 6))));

  res.json({
    temp: Math.round(obs.temperatureC * 10) / 10,
    condition: obs.condition,
    humidity: Math.round(obs.humidityPct),
    wind: Math.round(obs.windKph),
    rainMm: obs.rainMm,
    rainChance,
    forecast,
    thi: Math.round(obs.thi * 10) / 10,
    heatStress: obs.heatStress,
    coldStress: obs.coldStress,
    recommendation: recommendationFor(obs),
    period,
  });
}));

export default router;
