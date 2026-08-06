import { Router } from 'express';
import { query } from '../db/index.js';
import { requireAuth, resolveFarmId, audit } from '../middleware/auth.js';
import { asyncHandler } from '../lib/errors.js';
import { runExecutiveOrchestrator } from '../ai/executive/orchestrator.js';
import { generateDailyBrief } from '../ai/executive/briefing/daily-brief.js';
import { generateWeeklyReview } from '../ai/executive/briefing/weekly-review.js';
import { getOrCreateConversation, loadConversationMessages, appendMessage, getRelevantMemory, generateFollowUpQuestions } from '../ai/conversation/engine.js';
import { recallMemory, storeMemory, type Memory } from '../ai/executive/memory/store.js';
import { getAgentStatus } from '../ai/executive/orchestrator.js';

const router = Router();
router.use(requireAuth);

router.get('/executive/brief/daily', asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const userName = req.user?.name;
  const data = await generateDailyBrief(farmId, userName);
  res.json({ ok: true, data });
}));

router.get('/executive/brief/weekly', asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const data = await generateWeeklyReview(farmId);
  res.json({ ok: true, data });
}));

router.get('/executive/agents', asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const data = await getAgentStatus(farmId);
  res.json({ data });
}));

router.post('/executive/agents/run', asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const insights = await runExecutiveOrchestrator(farmId);
  res.json({ ok: true, generated: insights.length, insights });
}));

router.get('/executive/memory', asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const kind = (req.query.kind as Memory['kind']) || undefined;
  const data = await recallMemory(farmId, kind);
  res.json({ data });
}));

router.post('/executive/memory', asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const { kind, key, value, confidence, source } = req.body || {};
  if (!kind || !key) return res.status(400).json({ error: 'kind and key are required' });
  await storeMemory(farmId, kind, key, value, confidence, source);
  res.json({ ok: true });
}));

router.post('/executive/conversations', asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const { title } = req.body || {};
  const conversationId = await getOrCreateConversation(farmId, req.user?.id || '', title);
  res.status(201).json({ conversationId });
}));

router.get('/executive/conversations', asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const { rows } = await query(`SELECT id, title, context, created_at, updated_at FROM ai_conversations WHERE farm_id=$1 AND user_id=$2 ORDER BY updated_at DESC LIMIT 50`, [farmId, req.user?.id || '']);
  res.json({ data: rows });
}));

router.get('/executive/conversations/:id/messages', asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const messages = await loadConversationMessages(req.params.id, farmId);
  res.json({ data: messages });
}));

router.post('/executive/conversations/:id/messages', asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const { content, attachments } = req.body || {};
  if (!content?.trim()) return res.status(400).json({ error: 'Message content is required' });
  const userMessage = await appendMessage(req.params.id, farmId, 'user', content, attachments || []);
  const relevantMemory = await getRelevantMemory(farmId, content, 5);
  const contextSummary = relevantMemory.map((m) => `${m.key}: ${JSON.stringify(m.value).slice(0, 100)}`).join('\n');
  const answer = `I've referenced ${relevantMemory.length} relevant memory entries. For detailed advice, run an executive briefing or ask a specific question about health, nutrition, finance, or weather.`;
  const assistantMessage = await appendMessage(req.params.id, farmId, 'assistant', answer, [], { memoryUsed: relevantMemory.length, contextSummary });
  const followUps = await generateFollowUpQuestions(farmId, answer, { farmId, conversationId: req.params.id, userId: req.user?.id || '', messages: [] });
  res.status(201).json({ userMessage, assistantMessage, followUps });
}));

router.get('/executive/conversations/:id/suggestions', asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const { rows } = await query(`SELECT content, metadata FROM ai_messages WHERE conversation_id=$1 AND farm_id=$2 AND role='assistant' ORDER BY created_at DESC LIMIT 1`, [req.params.id, farmId]);
  const lastAnswer = rows[0]?.content || '';
  const followUps = await generateFollowUpQuestions(farmId, lastAnswer, { farmId, conversationId: req.params.id, userId: req.user?.id || '', messages: [] });
  res.json({ suggestions: followUps });
}));

router.post('/executive/scenario', asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const { scenario, params } = req.body || {};
  if (!scenario) return res.status(400).json({ error: 'scenario is required' });

  let impacts: any[] = [];
  let recommendations: string[] = [];
  let confidence = 0.7;

  if (scenario === 'feed_reduction') {
    const reduction = Number(params?.reduction_pct || 0);
    const expenseRes = await query(`SELECT COALESCE(SUM(amount),0) AS v FROM expenses WHERE farm_id=$1 AND category ILIKE '%feed%' AND incurred_on >= date_trunc('month', current_date)`, [farmId]);
    const current = Number(expenseRes.rows[0]?.v || 0);
    const projected = current * (1 - reduction / 100);
    impacts = [
      { metric: 'Monthly feed cost', change: `-${reduction}%`, description: `From ${current.toFixed(0)} to ${projected.toFixed(0)}` },
      { metric: 'Risk', change: 'Moderate', description: 'Reduced feed may affect milk yield if not managed carefully' },
    ];
    recommendations = ['Gradually reduce expensive feed components', 'Monitor milk yield closely', 'Ensure minimum nutritional requirements are met'];
  } else if (scenario === 'heat_stress') {
    impacts = [
      { metric: 'Milk yield', change: '-10-20%', description: 'THI > 72 typically reduces yield' },
      { metric: 'Feed intake', change: '-15%', description: 'Cows eat less in heat' },
      { metric: 'Conception rate', change: '-20%', description: 'Heat stress affects reproduction' },
    ];
    recommendations = ['Install shade structures', 'Increase water availability', 'Feed during cooler hours', 'Consider cooling systems'];
    confidence = 0.85;
  } else if (scenario === 'disease_outbreak') {
    impacts = [
      { metric: 'Affected cows', change: `+${params?.affected_cows || 5}`, description: 'Estimated number of cows affected' },
      { metric: 'Treatment cost', change: 'High', description: 'Vet visits, medication, and reduced production' },
      { metric: 'Milk loss', change: '-25%', description: 'During active outbreak' },
    ];
    recommendations = ['Isolate affected animals immediately', 'Contact vet for diagnosis', 'Review biosecurity protocols', 'Monitor all herd members'];
    confidence = 0.75;
  }

  res.json({ ok: true, scenario, params, current: { summary: 'Current farm state' }, projected: { summary: 'Projected after scenario' }, impacts, recommendations, confidence });
}));

export default router;
