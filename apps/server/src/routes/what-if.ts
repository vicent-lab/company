import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/index.js';
import { requireAuth, resolveFarmId } from '../middleware/auth.js';
import { asyncHandler } from '../lib/errors.js';

const router = Router();
router.use(requireAuth);

interface WhatIfRequest {
  scenario: 'reduce_feed' | 'increase_feed' | 'sell_cows' | 'delay_vaccination' | 'change_milking_schedule';
  parameters: Record<string, number | string>;
}

interface WhatIfResult {
  scenario: string;
  riskScore: number;
  estimatedImpactUGX: number;
  recommendations: string[];
  affectedCows: number;
  timeline: string;
  confidence: number;
}

function simulateReduceFeed(params: Record<string, number | string>, farmId: string): WhatIfResult {
  const pct = Number(params.reduction_pct || 10);
  const affected = Math.max(1, Math.round(pct * 1.2));
  const impact = Math.round(affected * 35_000);
  return {
    scenario: 'reduce_feed',
    riskScore: Math.min(100, pct * 2.5),
    estimatedImpactUGX: -impact,
    recommendations: [
      `Reduce concentrate by ${pct}% for ${affected} lactating cows.`,
      'Monitor BCS weekly to catch negative energy balance early.',
      'Increase forage quality to compensate for lower concentrate.',
      'Review milk protein % — may drop within 7–10 days.',
    ],
    affectedCows: affected,
    timeline: 'Impact visible within 7–14 days',
    confidence: 0.78,
  };
}

function simulateSellCows(params: Record<string, number | string>, farmId: string): WhatIfResult {
  const count = Number(params.count || 5);
  const impact = count * 1_200_000;
  return {
    scenario: 'sell_cows',
    riskScore: 20,
    estimatedImpactUGX: impact,
    recommendations: [
      `Sell ${count} low-performing cows to optimize herd averages.`,
      'Target cows with lowest productivity scores first.',
      'Reinvest proceeds into genetics or feed improvements.',
      'Review replacement heifer inventory before committing.',
    ],
    affectedCows: count,
    timeline: 'Immediate capital injection',
    confidence: 0.85,
  };
}

function simulateDelayVaccination(params: Record<string, number | string>, farmId: string): WhatIfResult {
  const days = Number(params.delay_days || 14);
  const risk = Math.min(100, days * 1.8);
  return {
    scenario: 'delay_vaccination',
    riskScore: risk,
    estimatedImpactUGX: Math.round(risk * 12_000),
    recommendations: [
      `Delaying vaccination by ${days} days increases disease susceptibility.`,
      'Isolate newly introduced or returning animals during delay.',
      'Boost dry cow nutrition to support immune status.',
      'Schedule catch-up as soon as possible — priority for calves and fresh cows.',
    ],
    affectedCows: 0,
    timeline: `+${days} days elevated risk`,
    confidence: 0.82,
  };
}

const SCENARIO_SIMULATORS: Record<string, (params: Record<string, number | string>, farmId: string) => WhatIfResult> = {
  reduce_feed: simulateReduceFeed,
  sell_cows: simulateSellCows,
  delay_vaccination: simulateDelayVaccination,
  increase_feed: simulateReduceFeed,
  change_milking_schedule: (_p, _f) => ({
    scenario: 'change_milking_schedule',
    riskScore: 15,
    estimatedImpactUGX: 180_000,
    recommendations: ['Shifting milking by 1–2h can improve resting windows.', 'Avoid afternoon heat window (2–4pm) in summer.'],
    affectedCows: 0,
    timeline: '1–2 week adjustment period',
    confidence: 0.65,
  }),
};

router.post('/what-if', asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const { scenario, parameters } = req.body || {};
  if (!scenario) return res.status(400).json({ error: 'scenario is required' });

  const simulator = SCENARIO_SIMULATORS[scenario];
  if (! simulator) return res.status(400).json({ error: `Unknown scenario: ${scenario}` });

  const result = simulator(parameters || {}, farmId);
  await query(`INSERT INTO ai_whatif_logs (farm_id, scenario, parameters, result, user_id) VALUES ($1,$2,$3,$4,$5)`, [farmId, scenario, JSON.stringify(parameters || {}), JSON.stringify(result), req.user?.id || null]);
  res.json({ data: result });
}));

router.get('/scenarios', asyncHandler(async (_req, res) => {
  res.json({ data: [
    { id: 'reduce_feed', label: 'Reduce feed', description: 'Cut concentrate or total feed by X%', params: ['reduction_pct'] },
    { id: 'sell_cows', label: 'Sell cows', description: 'Sell N lowest-producing cows', params: ['count'] },
    { id: 'delay_vaccination', label: 'Delay vaccination', description: 'Postpone vaccination by N days', params: ['delay_days'] },
    { id: 'increase_feed', label: 'Increase feed', description: 'Boost feed to improve yield by X%', params: ['increase_pct'] },
    { id: 'change_milking_schedule', label: 'Change milking schedule', description: 'Shift milking window by 1–2 hours', params: [] },
  ] });
}));

export default router;
