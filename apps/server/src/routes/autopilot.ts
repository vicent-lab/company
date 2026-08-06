import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/index.js';
import { requireAuth, requirePermission, resolveFarmId, audit } from '../middleware/auth.js';
import { asyncHandler } from '../lib/errors.js';
import { HttpError } from '../lib/errors.js';

const router = Router();
router.use(requireAuth);

const AUTOPILOT_RULES = [
  {
    id: 'auto_reorder_feed',
    description: 'Reorders feed when stock is below reorder level for 2+ days',
    risk: 'low',
    maxAmountUGX: 5_000_000,
    allowedCategories: ['feed', 'inventory'],
    requiresApproval: false,
  },
  {
    id: 'auto_schedule_checkup',
    description: 'Schedules vet checkup for cows flagged as sick for 3+ days',
    risk: 'medium',
    maxAmountUGX: 2_000_000,
    allowedCategories: ['health'],
    requiresApproval: true,
  },
  {
    id: 'auto_acknowledge_low_risk',
    description: 'Acknowledges low-risk AI insights automatically',
    risk: 'low',
    maxAmountUGX: 0,
    allowedCategories: ['general', 'review'],
    requiresApproval: false,
  },
];

export async function evaluateAutopilot(farmId: string, insightId: string) {
  const insight = await query(`SELECT * FROM ai_insights WHERE id=$1 AND farm_id=$2`, [insightId, farmId]);
  if (!insight.rows.length) return { executed: false, reason: 'Insight not found' };

  const row = insight.rows[0];
  const metadata = row.metadata || {};
  const category = row.category;
  const risk = row.severity === 'critical' ? 'high' : row.severity === 'high' ? 'medium' : 'low';

  const matching = AUTOPILOT_RULES.find((r) => r.allowedCategories.includes(category) && r.risk === risk);
  if (!matching) return { executed: false, reason: 'No matching autopilot rule' };

  if (matching.requiresApproval) return { executed: false, reason: 'Requires farmer approval', rule: matching.id, approvalRequired: true };

  try {
    await query(`UPDATE ai_insights SET status='resolved', resolved_at=now(), metadata=$3 WHERE id=$1 AND farm_id=$2`, [insightId, farmId, JSON.stringify({ ...metadata, autopilot: true, executed_by: 'autopilot_engine', executed_at: new Date().toISOString() })]);
    await query(`INSERT INTO ai_autopilot_log (farm_id, insight_id, rule_id, executed, requires_approval, executed_by) VALUES ($1,$2,$3,true,$4,$5)`, [farmId, insightId, matching.id, false, 'system']);
    return { executed: true, rule: matching.id, reason: matching.description };
  } catch {
    return { executed: false, reason: 'Database error' };
  }
}

router.get('/autopilot-rules', asyncHandler(async (req, res) => {
  res.json({ data: AUTOPILOT_RULES });
}));

router.post('/insights/:id/autopilot', asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const insightId = req.params.id;
  const result = await evaluateAutopilot(farmId, insightId);
  if (result.executed) {
    await audit(req.user, 'autopilot_executed', 'ai_insight', insightId, { rule: result.rule });
  }
  res.json(result);
}));

router.post('/run', asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const insights = await query(`SELECT id FROM ai_insights WHERE farm_id=$1 AND status='new' AND severity IN ('low','medium') ORDER BY created_at ASC LIMIT 20`, [farmId]);

  const results: any[] = [];
  for (const row of insights.rows) {
    const result = await evaluateAutopilot(farmId, row.id);
    results.push({ insightId: row.id, ...result });
  }

  await audit(req.user, 'autopilot_batch_run', 'farm', farmId, { processed: results.length, executed: results.filter((r) => r.executed).length });
  res.json({ processed: results.length, executed: results.filter((r) => r.executed).length, results });
}));

export default router;
