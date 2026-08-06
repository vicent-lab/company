import { query } from '../db/index.js';

// THI (Temperature-Humidity Index) uses the classic Thom/NRC formula, which is calibrated
// for Fahrenheit input and RH as a 0-1 fraction: THI = Tf - (0.55 - 0.55*RH) * (Tf - 58).
// The farm records temperature in Celsius, so it must be converted before use — feeding
// Celsius straight into this formula silently caps THI far below the 72 "mild stress"
// threshold no matter how hot it actually gets.
export function computeThi(temperatureC: number, humidityPct: number): number {
  const tempF = (temperatureC * 9) / 5 + 32;
  const rh = humidityPct / 100;
  return tempF - (0.55 - 0.55 * rh) * (tempF - 58);
}

export type StressLevel = 'none' | 'moderate' | 'high' | 'severe';

export function heatStressLevel(thi: number): StressLevel {
  if (thi > 80) return 'severe';
  if (thi > 76) return 'high';
  if (thi > 72) return 'moderate';
  return 'none';
}

export function coldStressLevel(temperatureC: number): StressLevel {
  if (temperatureC < 0) return 'severe';
  if (temperatureC < 5) return 'moderate';
  return 'none';
}

export interface WeatherObservation {
  temperatureC: number;
  humidityPct: number;
  windKph: number;
  rainMm: number;
  condition: string;
  thi: number;
  heatStress: StressLevel;
  coldStress: StressLevel;
}

const CONDITIONS = ['Sunny', 'Partly cloudy', 'Cloudy', 'Light rain', 'Heavy rain', 'Clear', 'Breezy'];

function farmSeed(farmId: string): number {
  let h = 0;
  for (const c of farmId) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h);
}

// Deterministic per-farm-per-day "station" reading — there's no real weather API integration
// here, but the seed is stable for a given farm+day so repeated calls agree, and it's wide
// enough that heat and cold stress both occur across the week/farm mix for the demo. Being a
// pure function of the date means past and future days are just as honestly computable as
// today — nothing here is randomly re-rolled per call.
function synthesize(farmId: string, date: Date) {
  const dayOfYear = Math.floor((date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) / 86400000);
  const seed = ((dayOfYear % 7) + (farmSeed(farmId) % 7) + 7) % 7;
  const temperatureC = 17 + seed * 2.5;
  const humidityPct = 55 + seed * 4;
  const windKph = 8 + ((seed * 3) % 5) * 2;
  const rainMm = [0, 0, 2, 8, 14, 4, 0][seed];
  const condition = CONDITIONS[seed];
  return { temperatureC, humidityPct, windKph, rainMm, condition };
}

function toObservation(s: { temperatureC: number; humidityPct: number; windKph: number; rainMm: number; condition: string }): WeatherObservation {
  const thi = computeThi(s.temperatureC, s.humidityPct);
  return {
    ...s,
    thi,
    heatStress: heatStressLevel(thi),
    coldStress: coldStressLevel(s.temperatureC),
  };
}

export async function getWeatherObservation(farmId: string): Promise<WeatherObservation> {
  const existing = await query(
    `SELECT temperature_c, humidity_pct, wind_kph, rain_mm, condition FROM weather_observations WHERE farm_id=$1 AND observed_date=CURRENT_DATE`,
    [farmId]
  );
  let row = existing.rows[0];
  if (!row) {
    const s = synthesize(farmId, new Date());
    const inserted = await query(
      `INSERT INTO weather_observations (farm_id, observed_date, observed_at, temperature_c, humidity_pct, wind_kph, rain_mm, condition)
       VALUES ($1, CURRENT_DATE, now(), $2, $3, $4, $5, $6)
       ON CONFLICT (farm_id, observed_date) DO UPDATE SET observed_at = now()
       RETURNING temperature_c, humidity_pct, wind_kph, rain_mm, condition`,
      [farmId, s.temperatureC, s.humidityPct, s.windKph, s.rainMm, s.condition]
    );
    row = inserted.rows[0];
  }
  return toObservation({
    temperatureC: Number(row.temperature_c),
    humidityPct: Number(row.humidity_pct),
    windKph: Number(row.wind_kph) || 0,
    rainMm: Number(row.rain_mm) || 0,
    condition: row.condition || 'Clear',
  });
}

// Historical/forecast lookups reconstruct the same deterministic formula for any date
// in-memory — nothing is persisted or randomly re-rolled, so "yesterday" and "next
// Tuesday" are just as reproducible as "today" without needing 30 rows of pre-seeded data.
export function getWeatherForDate(farmId: string, date: Date): WeatherObservation {
  return toObservation(synthesize(farmId, date));
}

export function getWeatherAverage(farmId: string, daysBack: number): WeatherObservation {
  const today = new Date();
  let temperatureC = 0, humidityPct = 0, windKph = 0, rainMm = 0;
  for (let i = 0; i < daysBack; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const s = synthesize(farmId, d);
    temperatureC += s.temperatureC;
    humidityPct += s.humidityPct;
    windKph += s.windKph;
    rainMm += s.rainMm;
  }
  return toObservation({
    temperatureC: temperatureC / daysBack,
    humidityPct: humidityPct / daysBack,
    windKph: windKph / daysBack,
    rainMm: +(rainMm / daysBack).toFixed(1),
    condition: 'Mixed',
  });
}

export type WeatherPeriod = 'today' | 'yesterday' | 'week' | 'month' | 'forecast';

// Single dispatcher so the Farm Map's weather layer and its heatmap-driven zone
// recommendations always agree on what "yesterday" or "forecast" means.
export async function getWeatherForPeriod(farmId: string, period: WeatherPeriod): Promise<WeatherObservation> {
  switch (period) {
    case 'yesterday': return getWeatherForDate(farmId, new Date(Date.now() - 86400000));
    case 'week': return getWeatherAverage(farmId, 7);
    case 'month': return getWeatherAverage(farmId, 30);
    case 'forecast': return getWeatherForDate(farmId, new Date(Date.now() + 86400000));
    default: return getWeatherObservation(farmId);
  }
}
