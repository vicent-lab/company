import { Router } from 'express';
import { query } from '../db/index.js';
import { requireAuth, resolveFarmId } from '../middleware/auth.js';
import { asyncHandler } from '../lib/errors.js';
import { MasterOrchestrator } from '../intelligence/orchestrator.js';
import { DailyBriefingGenerator } from '../intelligence/briefing/daily.js';
import { ProactiveAlertEngine } from '../intelligence/alerts/engine.js';
import { FarmKnowledgeEngine } from '../intelligence/knowledge/farm-data.js';
import { PredictionEngine } from '../intelligence/predictions/engine.js';
import { SimulationEngine } from '../intelligence/simulation/engine.js';
import { LearningEngine } from '../intelligence/memory/learning.js';
import { MemoryEngine } from '../intelligence/memory/engine.js';

const router = Router();
router.use(requireAuth);

function getFarmId(req: any): string {
  return resolveFarmId(req);
}

router.post('/chat', asyncHandler(async (req, res) => {
  const farmId = getFarmId(req);
  const userId = req.user?.id || '';
  const question = ((req.body && req.body.question) || '').trim();
  if (!question) return res.status(400).json({ error: 'Question is required' });

  await query(`INSERT INTO ai_analysis_logs (farm_id, analysis_type) VALUES ($1, 'chat')`, [farmId]);

  const orchestrator = new MasterOrchestrator(farmId);
  const result = await orchestrator.orchestrate(question);

  res.json({
    id: `msg-${Date.now()}`,
    answer: result.master_answer,
    explanation: {
      evidence: result.evidence,
      confidence: result.confidence,
      reasoning: result.reasoning,
      risks: result.risks,
      recommended_action: result.recommended_actions[0],
      expected_outcome: result.expected_outcome,
    },
    dataUsed: result.data_sources,
    agentResults: result.agent_results,
    followUps: result.follow_up_questions,
    timestamp: new Date().toISOString(),
  });
}));

router.get('/briefing/daily', asyncHandler(async (req, res) => {
  const farmId = getFarmId(req);
  const orchestrator = new MasterOrchestrator(farmId);
  const briefing = await orchestrator.generateDailyBriefing();
  res.json({ ok: true, data: briefing });
}));

router.post('/feedback', asyncHandler(async (req, res) => {
  const farmId = getFarmId(req);
  const { insight_id, helpful, accurate, urgent, note } = req.body || {};
  if (!insight_id) return res.status(400).json({ error: 'insight_id is required' });
  const engine = new LearningEngine(farmId);
  await engine.recordFeedback(insight_id, { helpful, accurate, urgent, note: note || '' });
  res.json({ ok: true });
}));

router.get('/alerts', asyncHandler(async (req, res) => {
  const farmId = getFarmId(req);
  const engine = new ProactiveAlertEngine(farmId);
  const alerts = await engine.detectAlerts();
  res.json({ data: alerts });
}));

router.get('/knowledge/cow/:identifier', asyncHandler(async (req, res) => {
  const farmId = getFarmId(req);
  const knowledge = new FarmKnowledgeEngine(farmId);
  const profile = await knowledge.getCowProfile(req.params.identifier);
  if (!profile) return res.status(404).json({ error: 'Cow not found' });
  const history = await knowledge.getCowHistory(profile.id);
  res.json({ data: { profile, history } });
}));

router.get('/knowledge/milk', asyncHandler(async (req, res) => {
  const farmId = getFarmId(req);
  const knowledge = new FarmKnowledgeEngine(farmId);
  const analysis = await knowledge.getMilkAnalysis();
  res.json({ data: analysis });
}));

router.get('/knowledge/health', asyncHandler(async (req, res) => {
  const farmId = getFarmId(req);
  const knowledge = new FarmKnowledgeEngine(farmId);
  const analysis = await knowledge.getHealthAnalysis();
  res.json({ data: analysis });
}));

router.get('/knowledge/finance', asyncHandler(async (req, res) => {
  const farmId = getFarmId(req);
  const knowledge = new FarmKnowledgeEngine(farmId);
  const analysis = await knowledge.getFinancialAnalysis();
  res.json({ data: analysis });
}));

router.get('/knowledge/overview', asyncHandler(async (req, res) => {
  const farmId = getFarmId(req);
  const knowledge = new FarmKnowledgeEngine(farmId);
  const overview = await knowledge.getOverview();
  res.json({ data: overview });
}));

router.get('/predictions', asyncHandler(async (req, res) => {
  const farmId = getFarmId(req);
  const type = (req.query.type as string) || 'all';
  const engine = new PredictionEngine(new FarmKnowledgeEngine(farmId));
  const predictions = await engine.predict(type);
  res.json({ data: predictions });
}));

router.post('/simulate', asyncHandler(async (req, res) => {
  const farmId = getFarmId(req);
  const { scenario, params } = req.body || {};
  if (!scenario) return res.status(400).json({ error: 'scenario is required' });
  const engine = new SimulationEngine(new FarmKnowledgeEngine(farmId));
  const result = await engine.simulate(scenario, params || {});
  res.json({ data: result });
}));

router.get('/learning/stats', asyncHandler(async (req, res) => {
  const farmId = getFarmId(req);
  const engine = new LearningEngine(farmId);
  const stats = await engine.getLearningStats();
  res.json({ data: stats });
}));

router.get('/memory', asyncHandler(async (req, res) => {
  const farmId = getFarmId(req);
  const kind = (req.query.kind as string | undefined) as any;
  const engine = new MemoryEngine(farmId);
  const memories = await engine.recall(kind);
  res.json({ data: memories });
}));

router.post('/memory', asyncHandler(async (req, res) => {
  const farmId = getFarmId(req);
  const { kind, key, value, confidence, source } = req.body || {};
  if (!kind || !key) return res.status(400).json({ error: 'kind and key are required' });
  const engine = new MemoryEngine(farmId);
  await engine.store(kind, key, value, confidence, source);
  res.json({ ok: true });
}));

export default router;
