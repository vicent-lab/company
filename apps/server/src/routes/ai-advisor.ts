import { Router } from 'express';
import { query } from '../db/index.js';
import { requireAuth, resolveFarmId, audit } from '../middleware/auth.js';
import { asyncHandler } from '../lib/errors.js';
import { fuseIntelligence, FusedRecommendation } from '../ai/fusion-engine.js';
import { generateDailyAdvice } from '../ai/daily-advice.js';
import { recordOutcome, computeAccuracy, updateWeightOverride, suppressRule, getCalibration, getLearningStats } from '../ai/learning-engine.js';
import { runOutcomeVerification, runAdviceFollowThroughChecks, followUpDelayDays } from '../ai/outcome-verifier.js';
import { generateDetailedExplanation, buildExplanation } from '../ai/explanation-engine.js';
import { buildCommandCenter, executeCommandAction } from '../ai/command-center.js';
import {
  answerMilkDecline, answerCowsNeedingAttention, answerTomorrowPlan, answerCowProfitability,
  answerIncreaseProfit, answerPregnancyCandidates, answerFinancialReport, answerFeedCostIncrease,
} from '../ai/qa-answers.js';

const router = Router();
router.use(requireAuth);

// ---------- Types ----------
interface InsightRow {
  id: string;
  farm_id: string;
  type: string;
  category: string;
  severity: string;
  priority: number;
  title: string;
  description: string;
  action_items: any[];
  related_cow_id: string | null;
  confidence_score: number;
  status: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
  expires_at: string | null;
  metadata: any;
  created_at: string;
  updated_at: string;
}

interface ActionRow {
  id: string;
  farm_id: string;
  insight_id: string;
  title: string;
  description: string | null;
  assigned_to: string | null;
  due_date: string | null;
  completed_at: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

// ---------- Helpers ----------
async function insertInsight(farmId: string, user?: any, ov: Partial<InsightRow> = {}): Promise<InsightRow> {
  const cols = 'farm_id, type, category, severity, priority, title, description, action_items, related_cow_id, confidence_score, status, expires_at, metadata';
  const vals = '$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13';
  const p = [farmId, ov.type, ov.category, ov.severity || 'medium', ov.priority || 2, ov.title, ov.description,
    JSON.stringify(ov.action_items || []), ov.related_cow_id || null,
    ov.confidence_score != null ? Number(ov.confidence_score) : null,
    'new', ov.expires_at || null, JSON.stringify(ov.metadata || {})];
  const sql = `INSERT INTO ai_insights (${cols}) VALUES (${vals}) RETURNING *`;
  const r = await query<InsightRow>(sql, p);
  const row = r.rows[0];
  row.action_items = row.action_items || [];
  if (user) audit(user, 'ai_insight_created', 'ai_insight', row.id, { title: row.title, category: row.category });
  return row;
}

async function insertAction(farmId: string, insightId: string, title: string, description?: string, assignedTo?: string, dueDate?: string, user?: any): Promise<ActionRow> {
  const r = await query<ActionRow>(
    `INSERT INTO ai_actions (farm_id, insight_id, title, description, assigned_to, due_date) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [farmId, insightId, title, description || null, assignedTo || null, dueDate || null]
  );
  if (user) audit(user, 'ai_action_created', 'ai_action', r.rows[0].id, { insight_id: insightId, title });
  return r.rows[0];
}

async function persistEvidence(farmId: string, insightId: string, category: string, signals: any[]) {
  // Store each signal as evidence for audit trail. IntelligenceSignal (fusion-engine.ts)
  // has no category of its own — it's a property of the fused recommendation, not the
  // individual signal — so every evidence row for a given insight shares that insight's
  // category.
  for (const signal of signals) {
    try {
      await query(`INSERT INTO ai_evidence (farm_id, insight_id, rule_id, rule_version, signal, category, severity_hint, priority_hint, cow_id, metrics, supporting_rows, base_confidence, final_confidence, used_in_insight)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [farmId, insightId, `${signal.source}_${signal.signal_type}`, 1, signal.signal_type, category,
         signal.confidence > 0.8 ? 'high' : signal.confidence > 0.6 ? 'medium' : 'low', 2, signal.metadata?.cow_id || null,
         JSON.stringify(signal.metrics), JSON.stringify(signal.evidence || []),
         signal.confidence, signal.confidence, true]);
    } catch (e: any) {
      // Don't let one bad evidence row sink the whole insight — but don't hide it either.
      console.error(`[ai-advisor] failed to persist evidence for insight ${insightId}:`, e.message);
    }
  }
}

// ---------- RUN FUSION ANALYSIS ----------
router.post('/analyze', asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const logResult = await query(`INSERT INTO ai_analysis_logs (farm_id, analysis_type, status) VALUES ($1, 'multi_intelligence_fusion', 'running') RETURNING *`, [farmId]);
  const log = logResult.rows[0];

  try {
    // Run the multi-intelligence fusion engine
    const recommendations = await fuseIntelligence(farmId);

    // Persist recommendations and their evidence
    const inserted: InsightRow[] = [];
    for (const rec of recommendations) {
      const row = await insertInsight(farmId, req.user, {
        type: rec.intelligence_sources.includes('veterinary') && rec.severity === 'critical' ? 'alert' :
               rec.severity === 'critical' ? 'warning' : 'recommendation',
        category: rec.category,
        severity: rec.severity,
        priority: rec.priority,
        title: rec.title,
        description: rec.description,
        action_items: rec.action_items,
        related_cow_id: rec.related_cow_id,
        confidence_score: rec.confidence,
        metadata: {
          ...rec.metadata,
          intelligence_sources: rec.intelligence_sources,
          signals: rec.signals,
          risk_score: rec.risk_score,
          expected_roi: rec.expected_roi,
          fusion_version: '1.0',
          analysis_type: 'multi_intelligence_fusion'
        },
      });
      inserted.push(row);
      
      // Persist evidence for audit trail
      await persistEvidence(farmId, row.id, rec.category, rec.signals);
    }

    await query(`UPDATE ai_analysis_logs SET completed_at=now(), status='completed', insights_generated=$1 WHERE id=$2`, [inserted.length, log.id]);

    res.json({
      ok: true,
      generated: recommendations.length,
      created: inserted.length,
      skipped: 0,
      insights: inserted,
    });
  } catch (err: any) {
    await query(`UPDATE ai_analysis_logs SET completed_at=now(), status='failed', error=$1 WHERE id=$2`, [err.message, log.id]);
    res.status(500).json({ error: 'Analysis failed: ' + err.message });
  }
}));

// ---------- Farm Timeline ----------
// Chronological log of the day's events. Only pulls from tables that carry a real
// TIMESTAMPTZ — several farm tables (vaccinations, feed_consumption, treatments) only
// store a DATE, with no time-of-day at all, so there is no honest clock time to show for
// "vaccination administered" or "feed distributed" unless staff logged it through
// daily_activities (which does have a timestamp). Fabricating a time for those would be
// exactly the kind of made-up precision this app has avoided everywhere else.
router.get('/timeline', asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date)) ? String(req.query.date) : new Date().toISOString().slice(0, 10);

  const [milkRes, activityRes, healthRes, insightRes, actionRes] = await Promise.all([
    // Grouped by hour rather than one row per cow — a 40-cow herd milked in one pass
    // shouldn't produce 40 near-identical timeline entries.
    query(
      `SELECT date_trunc('hour', created_at) AS bucket, min(created_at) AS at, count(*)::int AS cow_count
       FROM milk_records WHERE farm_id=$1 AND created_at::date=$2 GROUP BY 1 ORDER BY 1`,
      [farmId, date]
    ),
    query(
      `SELECT da.created_at AS at, da.activity_type, da.description, c.cow_code
       FROM daily_activities da LEFT JOIN cows c ON c.id = da.related_cow_id
       WHERE da.farm_id=$1 AND da.activity_date=$2 ORDER BY da.created_at LIMIT 20`,
      [farmId, date]
    ),
    query(
      `SELECT hr.created_at AS at, hr.ai_detected_disease, hr.health_status, c.cow_code
       FROM health_records hr JOIN cows c ON c.id = hr.cow_id
       WHERE hr.farm_id=$1 AND hr.recorded_on=$2 ORDER BY hr.created_at LIMIT 20`,
      [farmId, date]
    ),
    query(
      `SELECT created_at AS at, title, severity FROM ai_insights
       WHERE farm_id=$1 AND created_at::date=$2 ORDER BY created_at LIMIT 10`,
      [farmId, date]
    ),
    query(
      `SELECT created_at AS at, title FROM ai_actions
       WHERE farm_id=$1 AND created_at::date=$2 ORDER BY created_at LIMIT 10`,
      [farmId, date]
    ),
  ]);

  const events: { at: string; type: string; label: string }[] = [];
  for (const r of milkRes.rows) {
    events.push({ at: r.at, type: 'milk', label: `Milk recorded for ${r.cow_count} cow${r.cow_count === 1 ? '' : 's'}` });
  }
  for (const r of activityRes.rows) {
    const label = r.description || String(r.activity_type).replace(/_/g, ' ');
    events.push({ at: r.at, type: 'activity', label: r.cow_code ? `${label} — ${r.cow_code}` : label });
  }
  for (const r of healthRes.rows) {
    events.push({
      at: r.at,
      type: 'health',
      label: r.ai_detected_disease ? `AI detected ${r.ai_detected_disease} in ${r.cow_code}` : `Health check recorded for ${r.cow_code} (${r.health_status})`,
    });
  }
  for (const r of insightRes.rows) events.push({ at: r.at, type: 'insight', label: r.title });
  for (const r of actionRes.rows) events.push({ at: r.at, type: 'action', label: r.title });

  events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  res.json({ data: events, date });
}));

// ---------- Daily Advice ----------
router.get('/daily-advice', asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const userName = req.user?.name || (req.query.userName as string) || undefined;
  const advice = await generateDailyAdvice(farmId, userName);
  res.json({ ok: true, data: advice });
}));

// ---------- Daily Action Plan ----------
// Today's highest-priority, still-open insights — same ranking as the insights list
// (priority, then confidence), just capped to what's actually worth acting on today.
router.post('/daily-action-plan', asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const { rows } = await query<InsightRow>(
    `SELECT * FROM ai_insights
     WHERE farm_id=$1 AND status IN ('new','acknowledged','in_progress')
       AND (expires_at IS NULL OR expires_at > now())
     ORDER BY priority DESC, confidence_score DESC NULLS LAST, created_at DESC
     LIMIT 10`,
    [farmId]
  );
  res.json({ ok: true, action_items: rows });
}));

// ---------- Routes (list, get, patch, delete, actions) ----------
router.get('/insights', asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const type = (req.query.type as string) || '';
  const category = (req.query.category as string) || '';
  const severity = (req.query.severity as string) || '';
  const status = (req.query.status as string) || '';
  const relatedCowId = (req.query.relatedCowId as string) || '';
  const minConfidence = Number(req.query.minConfidence || '0');
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;

  const where: string[] = ['farm_id=$1'];
  const p: any[] = [farmId];
  let i = 2;
  if (type) { where.push(`type=$${i++}`); p.push(type); }
  if (category) { where.push(`category=$${i++}`); p.push(category); }
  if (severity) { where.push(`severity=$${i++}`); p.push(severity); }
  if (status) { where.push(`status=$${i++}`); p.push(status); }
  if (relatedCowId) { where.push(`related_cow_id=$${i++}`); p.push(relatedCowId); }
  if (minConfidence > 0) { where.push(`confidence_score >= $${i++}`); p.push(minConfidence / 100); }

  // Rank by urgency first (priority is set from the fusion engine's urgency score, not
  // just severity), then confidence, so the top of the list is "what needs a decision
  // soonest" rather than "what was generated most recently".
  const result = await query<InsightRow>(`SELECT * FROM ai_insights WHERE ${where.join(' AND ')} ORDER BY priority DESC, confidence_score DESC NULLS LAST, created_at DESC LIMIT $${i++} OFFSET $${i++}`, [...p, limit, offset]);

  const insightIds = result.rows.filter(r => r.id).map(r => r.id);
  let actionsMap: Record<string, ActionRow[]> = {};
  if (insightIds.length) {
    const actionsRaw = await query<ActionRow>(`SELECT * FROM ai_actions WHERE insight_id = ANY($1::uuid[])`, [insightIds]);
    for (const a of actionsRaw.rows) {
      if (!actionsMap[a.insight_id]) actionsMap[a.insight_id] = [];
      actionsMap[a.insight_id].push(a);
    }
  }

  // Also fetch evidence for each insight if requested
  const includeEvidence = req.query.includeEvidence === 'true';
  let evidenceMap: Record<string, any[]> = {};
  if (includeEvidence && insightIds.length) {
    const evRaw = await query(`SELECT * FROM ai_evidence WHERE insight_id = ANY($1::uuid[])`, [insightIds]);
    for (const e of evRaw.rows) {
      if (!evidenceMap[e.insight_id]) evidenceMap[e.insight_id] = [];
      evidenceMap[e.insight_id].push(e);
    }
  }

  // Explanation (risk %, plain-language reasons, confidence) is derived from the same
  // evidence rows already fetched above — buildExplanation does no querying of its own,
  // so every card in the list gets it for free instead of one extra query per insight.
  const data = result.rows.map(r => ({
    ...r,
    actions: actionsMap[r.id] || [],
    evidence: includeEvidence ? (evidenceMap[r.id] || []) : undefined,
    explanation: includeEvidence ? buildExplanation(r, evidenceMap[r.id] || []) : undefined,
  }));
  res.json({ data });
}));

router.get('/insights/history', asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const days = Math.min(Number(req.query.days) || 30, 365);
  const result = await query<InsightRow>(`
    SELECT * FROM ai_insights
    WHERE farm_id = $1
      AND created_at >= CURRENT_DATE - ($2 || ' days')::interval
    ORDER BY created_at DESC
    LIMIT 200
  `, [farmId, String(days)]);

  const insightIds = result.rows.filter(r => r.id).map(r => r.id);
  let actionsMap: Record<string, ActionRow[]> = {};
  if (insightIds.length) {
    const actionsRaw = await query<ActionRow>(`SELECT * FROM ai_actions WHERE insight_id = ANY($1::uuid[])`, [insightIds]);
    for (const a of actionsRaw.rows) {
      if (!actionsMap[a.insight_id]) actionsMap[a.insight_id] = [];
      actionsMap[a.insight_id].push(a);
    }
  }

  const data = result.rows.map(r => ({ ...r, actions: actionsMap[r.id] || [] }));
  res.json({ data });
}));

router.get('/insights/:id', asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const result = await query<InsightRow>(`SELECT * FROM ai_insights WHERE id=$1 AND farm_id=$2`, [req.params.id, farmId]);
  if (!result.rows.length) return res.status(404).json({ error: 'Insight not found' });
  const actions = await query<ActionRow>(`SELECT * FROM ai_actions WHERE insight_id=$1`, [req.params.id]);
  const evidence = await query(`SELECT * FROM ai_evidence WHERE insight_id=$1`, [req.params.id]);
  const explanation = await generateDetailedExplanation(req.params.id, farmId);
  res.json({ data: { ...result.rows[0], actions: actions.rows, evidence: evidence.rows, explanation } });
}));

router.patch('/insights/:id', asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const insight = await query<InsightRow>(`SELECT * FROM ai_insights WHERE id=$1 AND farm_id=$2`, [req.params.id, farmId]);
  if (!insight.rows.length) return res.status(404).json({ error: 'Insight not found' });

  const status = req.body?.status;
  const allowed = ['new', 'acknowledged', 'in_progress', 'resolved', 'dismissed'];
  if (status && !allowed.includes(status)) return res.status(400).json({ error: 'Invalid status' });

  const updates: string[] = [];
  const vals: any[] = [];
  let idx = 1;
  if (status) {
    updates.push(`status=$${idx++}`);
    vals.push(status);
    if (status === 'acknowledged') updates.push(`acknowledged_at=$${idx++}`), vals.push(new Date().toISOString());
    else if (status === 'resolved') updates.push(`resolved_at=$${idx++}`), vals.push(new Date().toISOString());
  }
  vals.push(req.params.id);
  const result = await query<InsightRow>(`UPDATE ai_insights SET ${updates.join(', ')} WHERE id=$${idx} RETURNING *`, vals);
  res.json({ data: result.rows[0] });
}));

router.delete('/insights/:id', asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  await query(`DELETE FROM ai_actions WHERE insight_id=$1 OR (SELECT farm_id FROM ai_insights WHERE id=$1) = $2`, [req.params.id, farmId]);
  await query(`DELETE FROM ai_evidence WHERE insight_id=$1`, [req.params.id]);
  await query(`DELETE FROM ai_feedback WHERE insight_id=$1`, [req.params.id]);
  await query(`DELETE FROM ai_insights WHERE id=$1 AND farm_id=$2`, [req.params.id, farmId]);
  res.json({ ok: true });
}));

// ---------- Actions ----------
router.post('/insights/:id/actions', asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const { title, description, assignedTo, dueDate } = req.body || {};
  if (!title?.trim()) return res.status(400).json({ error: 'Title is required' });
  const insight = await query(`SELECT id FROM ai_insights WHERE id=$1 AND farm_id=$2`, [req.params.id, farmId]);
  if (!insight.rows.length) return res.status(404).json({ error: 'Insight not found' });
  const action = await insertAction(farmId, req.params.id, title, description, assignedTo, dueDate, req.user);
  res.status(201).json({ data: action });
}));

router.patch('/actions/:id', asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const action = await query<ActionRow>(`SELECT * FROM ai_actions WHERE id=$1 AND farm_id=$2`, [req.params.id, farmId]);
  if (!action.rows.length) return res.status(404).json({ error: 'Action not found' });
  const updates: string[] = [];
  const vals: any[] = [];
  let idx = 1;
  const body = req.body || {};
  if (body.title) { updates.push(`title=$${idx++}`); vals.push(body.title); }
  if (body.status) {
    if (!['pending', 'in_progress', 'completed', 'cancelled'].includes(body.status)) return res.status(400).json({ error: 'Invalid status' });
    updates.push(`status=$${idx++}`);
    vals.push(body.status);
    if (body.status === 'completed') updates.push(`completed_at=$${idx++}`), vals.push(new Date().toISOString());
  }
  if (body.assignedTo !== undefined) { updates.push(`assigned_to=$${idx++}`); vals.push(body.assignedTo || null); }
  if (body.dueDate !== undefined) { updates.push(`due_date=$${idx++}`); vals.push(body.dueDate || null); }
  vals.push(req.params.id);
  const result = await query<ActionRow>(`UPDATE ai_actions SET ${updates.join(', ')} WHERE id=$${idx} RETURNING *`, vals);
  const updatedAction = result.rows[0];

  // Farmer followed the advice: once every action item on the insight is completed,
  // schedule a follow-up check to see whether it actually helped (see outcome-verifier.ts).
  if (body.status === 'completed') {
    const insightRow = await query(`SELECT category, actions_completed_at FROM ai_insights WHERE id=$1`, [updatedAction.insight_id]);
    const insight = insightRow.rows[0];
    if (insight && !insight.actions_completed_at) {
      const remaining = await query(`SELECT count(*)::int AS n FROM ai_actions WHERE insight_id=$1 AND status NOT IN ('completed', 'cancelled')`, [updatedAction.insight_id]);
      if (Number(remaining.rows[0]?.n || 0) === 0) {
        const delayDays = followUpDelayDays(insight.category);
        await query(
          `UPDATE ai_insights SET actions_completed_at = now(), follow_up_due_at = now() + ($2 || ' days')::interval WHERE id=$1`,
          [updatedAction.insight_id, String(delayDays)]
        );
      }
    }
  }

  res.json({ data: updatedAction });
}));

router.delete('/actions/:id', asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  await query(`DELETE FROM ai_actions WHERE id=$1 AND farm_id=$2`, [req.params.id, farmId]);
  res.json({ ok: true });
}));

// ---------- Feedback ----------
router.post('/insights/:id/feedback', asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const insight = await query(`SELECT * FROM ai_insights WHERE id=$1 AND farm_id=$2`, [req.params.id, farmId]);
  if (!insight.rows.length) return res.status(404).json({ error: 'Insight not found' });

  const { helpful, accurate, urgent, note } = req.body || {};
  const fb = await query(`INSERT INTO ai_feedback (farm_id, insight_id, user_id, helpful, accurate, urgent, note)
    VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [farmId, req.params.id, req.user?.id || null, helpful ?? null, accurate ?? null, urgent ?? null, note || null]);

  const insightRow = insight.rows[0];
  const metadata = insightRow.metadata || {};
  const ruleId = metadata.rule_id || `${insightRow.category}_${insightRow.type}`;

  if (accurate !== null && accurate !== undefined) {
    const feedbackType = accurate === true ? 'positive' : accurate === false ? 'negative' : 'neutral';
    const source = metadata.intelligence_sources?.[0] || 'unknown';
    await recordOutcome({
      farmId,
      ruleId,
      feedback: feedbackType,
      signalType: insightRow.type,
      source,
      category: insightRow.category,
      predictedOutcome: insightRow.title,
      actualOutcome: note || undefined,
    });

    if (accurate === false) {
      const newWeight = Math.max(0.5, (await computeAccuracy(farmId, ruleId)) * 0.8);
      await updateWeightOverride(farmId, ruleId, newWeight);
    }
  }

  res.status(201).json({ data: fb.rows[0], learned: accurate !== null && accurate !== undefined });
}));

// ---------- Continuous Learning ----------
router.get('/learning/calibration', asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const ruleId = (req.query.ruleId as string) || undefined;
  const calibration = await getCalibration(farmId, ruleId);
  res.json({ data: calibration });
}));

router.get('/learning/stats', asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const stats = await getLearningStats(farmId);
  res.json({ data: stats });
}));

router.post('/learning/verify', asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const result = await runOutcomeVerification(farmId);
  res.json({ data: result });
}));

router.post('/insights/:id/outcome', asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const insight = await query(`SELECT * FROM ai_insights WHERE id=$1 AND farm_id=$2`, [req.params.id, farmId]);
  if (!insight.rows.length) return res.status(404).json({ error: 'Insight not found' });

  const { outcome, actualValue, notes } = req.body || {};
  if (!['success', 'failure', 'partial', 'unknown'].includes(outcome)) {
    return res.status(400).json({ error: 'Invalid outcome. Must be success, failure, partial, or unknown' });
  }

  const row = insight.rows[0];
  const metadata = row.metadata || {};
  const ruleId = metadata.rule_id || `${row.category}_${row.type}`;
  const source = metadata.intelligence_sources?.[0] || 'manual';

  await recordOutcome({
    farmId,
    ruleId,
    feedback: outcome === 'success' ? 'positive' : outcome === 'failure' ? 'negative' : 'neutral',
    signalType: row.type,
    source,
    category: row.category,
    predictedOutcome: row.title,
    actualOutcome: notes,
    confidenceDelta: outcome === 'success' ? 0.05 : outcome === 'failure' ? -0.1 : 0,
  });

  if (outcome === 'failure') {
    await suppressRule(farmId, ruleId, 7);
    const newWeight = Math.max(0.5, (await computeAccuracy(farmId, ruleId)) * 0.7);
    await updateWeightOverride(farmId, ruleId, newWeight);
  } else if (outcome === 'success') {
    const newWeight = Math.min(2.0, (await computeAccuracy(farmId, ruleId)) * 1.1);
    await updateWeightOverride(farmId, ruleId, newWeight);
  }

  res.json({ ok: true, learned: true });
}));

router.post('/learning/retrain', asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const result = await runOutcomeVerification(farmId);
  res.json({ ok: true, verified: result.verified, outcomes: result.outcomes });
}));

// Runs the full continuous-learning loop for this farm on demand: verifies whether past
// predictions came true, and checks whether insights the farmer already acted on (all
// action items completed, follow-up window elapsed) actually improved things. This is
// the same cycle the background scheduler runs automatically for every farm.
router.post('/learning/run-cycle', asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const log = await query(`INSERT INTO ai_analysis_logs (farm_id, analysis_type, status) VALUES ($1, 'continuous_learning_cycle', 'running') RETURNING id`, [farmId]);
  try {
    const verification = await runOutcomeVerification(farmId);
    const followThrough = await runAdviceFollowThroughChecks(farmId);
    await query(`UPDATE ai_analysis_logs SET completed_at=now(), status='completed', metadata=$1 WHERE id=$2`,
      [JSON.stringify({ verified: verification.verified, followedUp: followThrough.checked }), log.rows[0].id]);
    res.json({ ok: true, verified: verification.verified, followedUp: followThrough.checked, followThroughOutcomes: followThrough.outcomes });
  } catch (err: any) {
    await query(`UPDATE ai_analysis_logs SET completed_at=now(), status='failed', error=$1 WHERE id=$2`, [err.message, log.rows[0].id]);
    res.status(500).json({ error: 'Continuous learning cycle failed: ' + err.message });
  }
}));

// ---------- ENHANCED CHAT ----------
// Fast-path matchers route common questions straight to the data-driven qa-answers
// engine instead of the generic fallback text below — real numbers, no round-trip
// through a fresh full analysis.
const FAST_PATH: { test: RegExp; fn: (farmId: string) => Promise<string> }[] = [
  { test: /milk.*(drop|declin|falling|down|decreas)|why.*milk.*(low|less)/, fn: answerMilkDecline },
  { test: /which cows?.*(attention|check|today)|cows? need(s)?.*attention|any cows? (sick|at risk)/, fn: answerCowsNeedingAttention },
  { test: /tomorrow|plan for (the )?day/, fn: answerTomorrowPlan },
  { test: /most profitable|profitability (by|per) cow|which cows?.*profit/, fn: answerCowProfitability },
  { test: /increase (my )?profit|improve profit|how (can|do) i (increase|improve|boost) (profit|margin)/, fn: answerIncreaseProfit },
  { test: /pregnan(t|cy) candidate|which cows?.*(breed|inseminat)|breeding candidates?/, fn: answerPregnancyCandidates },
  { test: /financial report|finance summary|how('s| is) my (finances|cash)/, fn: answerFinancialReport },
  { test: /feed cost|why (is|are) feed/, fn: answerFeedCostIncrease },
];

router.post('/chat', asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const question = ((req.body && req.body.question) || '').trim();
  if (!question) return res.status(400).json({ error: 'Question is required' });
  const attachment = req.body?.attachment as { name?: string; type?: string; data?: string } | undefined;
  if (attachment?.data && attachment.data.length > 6_000_000) {
    return res.status(400).json({ error: 'Attachment too large (max ~4MB)' });
  }

  // Log chat interaction for analytics
  await query(`INSERT INTO ai_analysis_logs (farm_id, analysis_type) VALUES ($1, 'chat')`, [farmId]);

  const lower = question.toLowerCase();
  const fastMatch = FAST_PATH.find((m) => m.test.test(lower));

  let answer: string;
  let insightsCount: number | undefined;
  const shouldAnalyze = /\b(analyze|status|today|now|current|check|report|run analysis|multi intelligence|fusion|comprehensive|what should i do|what do i need|smart analysis|intelligent advice)\b/.test(lower);

  if (fastMatch) {
    answer = await fastMatch.fn(farmId);
  } else if (shouldAnalyze) {
    const insightsResult = await query(`SELECT * FROM ai_insights WHERE farm_id=$1 AND status IN ('new','acknowledged','in_progress')
      AND (expires_at IS NULL OR expires_at > now())
      ORDER BY (confidence_score * priority) DESC LIMIT 10`, [farmId]);
    const insights = insightsResult.rows;
    insightsCount = insights.length;

    if (!insights.length) {
      answer = `I've performed a comprehensive multi-intelligence analysis of your farm and there are no active high-priority items requiring immediate attention right now. Everything looks in order. I'll continue monitoring and alert you when something significant is detected.`;
    } else {
      const critical = insights.filter((i: any) => i.severity === 'critical');
      const high = insights.filter((i: any) => i.severity === 'high');
      answer = `Here's your current multi-intelligence farm status:\n\n`;
      if (critical.length) answer += `CRITICAL (${critical.length})\n${critical.map((i: any) => `• [${i.category.toUpperCase()}] ${i.title}`).join('\n')}\n\n`;
      if (high.length) answer += `HIGH PRIORITY (${high.length})\n${high.slice(0, 7).map((i: any) => `• [${i.category.toUpperCase()}] ${i.title}`).join('\n')}\n\n`;
      answer += `This analysis combines 9 intelligence sources: Rule-based expert system, Machine Learning, Predictive Analytics, Statistical Analysis, Business Intelligence, Veterinary Knowledge, Weather Intelligence, Financial Analysis, and Risk Analysis.\n\n`;
      answer += `You can view full details and track actions in the AI Advisor tab. Would you like me to run a fresh comprehensive multi-intelligence analysis?`;
    }
  } else {
    const { MasterOrchestrator } = await import('../intelligence/orchestrator.js');
    const orchestrator = new MasterOrchestrator(farmId);
    const result = await orchestrator.orchestrate(question);
    answer = result.master_answer;
  }

  if (attachment?.name) {
    answer = `📎 Noted the attached file "${attachment.name}" alongside your question — I can't yet read image or document contents directly, but it's saved with this conversation for your reference.\n\n${answer}`;
  }

  const saved = await query(
    `INSERT INTO ai_chat_messages (farm_id, user_id, question, answer, attachment_name, attachment_type, attachment_data)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, created_at`,
    [farmId, req.user?.id ?? null, question, answer, attachment?.name ?? null, attachment?.type ?? null, attachment?.data ?? null]
  );

  res.json({ id: saved.rows[0].id, created_at: saved.rows[0].created_at, answer, insights_count: insightsCount });
}));

router.get('/chat/history', asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const { rows } = await query(
    `SELECT id, question, answer, attachment_name, attachment_type, attachment_data, created_at
     FROM ai_chat_messages WHERE farm_id=$1 ORDER BY created_at DESC LIMIT 200`,
    [farmId]
  );
  res.json({ data: rows });
}));

router.delete('/chat/history/:id', asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  await query(`DELETE FROM ai_chat_messages WHERE id=$1 AND farm_id=$2`, [req.params.id, farmId]);
  res.json({ ok: true });
}));

router.delete('/chat/history', asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  await query(`DELETE FROM ai_chat_messages WHERE farm_id=$1`, [farmId]);
  res.json({ ok: true });
}));

router.get('/command-center', asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const data = await buildCommandCenter(farmId, req.user?.name);
  res.json({ data });
}));

router.post('/command-center/actions/:actionId/complete', asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const actionId = req.params.actionId;
  const result = await executeCommandAction(farmId, actionId, 'done', req.user?.id);
  res.json(result);
}));

export default router;