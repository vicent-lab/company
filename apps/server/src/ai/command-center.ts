import { query } from '../db/index.js';
import { generateDailyAdvice } from './daily-advice.js';
import { computeFarmScore, FarmScoreResult } from './farm-score.js';

export interface TimeBlock {
  label: string;
  window: string;
  actions: CommandAction[];
}

export interface CommandAction {
  id: string;
  block: 'morning' | 'midday' | 'evening' | 'urgent';
  title: string;
  category: string;
  priority: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  reason: string;
  consequenceIfSkipped: string;
  estimatedCostIfSkippedUGX: number;
  estimatedTimeMinutes: number;
  relatedCowId?: string | null;
  cowCode?: string | null;
  source: string;
  done: boolean;
  delegatedTo?: string | null;
  dueDate?: string | null;
  actionable: boolean;
  shortcut?: string;
}

export interface CommandCenterData {
  generatedAt: string;
  farmScore: number;
  farmScoreDelta: number;
  herdPulse: {
    total: number;
    milking: number;
    sick: number;
    inTreatment: number;
    calvingToday: number;
    calvingThisWeek: number;
    sickCodes: string[];
    treatmentCodes: string[];
  };
  blocks: TimeBlock[];
  eveningReview: {
    tasksChecked: number;
    pendingCount: number;
    completionPct: number;
  };
  meta: {
    totalActions: number;
    criticalPending: number;
    estimatedTimeTotalMinutes: number;
    highestRiskAction: CommandAction | null;
  };
}

function criticalLoss(points: number): number {
  return Math.round(points * 58000);
}

export async function buildCommandCenter(farmId: string, userName?: string): Promise<CommandCenterData> {
  const [advice, farmScore] = await Promise.all([
    generateDailyAdvice(farmId, userName),
    computeFarmScore(farmId),
  ]);

  const actions: CommandAction[] = [];
  const sourceLabel = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  const pickFirst = <T,>(arr: T[] | undefined) => arr && arr.length ? arr[0] : null;

  for (const t of advice.priorityTasks ?? []) {
    const sev = (t.severity || 'medium') as CommandAction['severity'];
    actions.push({
      id: `task-${actions.length + 1}`,
      block: sev === 'critical' ? 'urgent' : 'morning',
      title: t.label,
      category: 'general',
      priority: sev === 'critical' ? 5 : sev === 'high' ? 4 : 3,
      severity: sev,
      reason: 'AI identified this as a priority task for today',
      consequenceIfSkipped: sev === 'critical'
        ? 'High risk of production or health loss today.'
        : 'Small performance or compliance impact today.',
      estimatedCostIfSkippedUGX: criticalLoss(sev === 'critical' ? 15 : sev === 'high' ? 8 : 4),
      estimatedTimeMinutes: 20,
      done: t.done || false,
      source: 'daily_advice',
      actionable: true,
    });
  }

  for (const a of advice.urgentAlerts ?? []) {
    const sev = (a.severity || 'high') as CommandAction['severity'];
    actions.push({
      id: `alert-${actions.length + 1}`,
      block: 'urgent',
      title: a.title,
      category: 'alert',
      priority: 5,
      severity: sev,
      reason: a.description,
      consequenceIfSkipped: 'Risk escalates within hours. Likely herd health or financial impact.',
      estimatedCostIfSkippedUGX: criticalLoss(20),
      estimatedTimeMinutes: 15,
      done: false,
      source: 'daily_advice_alert',
      actionable: true,
    });
  }

  for (const h of advice.healthWarnings ?? []) {
    const sev = (h.severity || 'high') as CommandAction['severity'];
    actions.push({
      id: `health-${actions.length + 1}`,
      block: 'morning',
      title: h.title,
      category: 'health',
      priority: 5,
      severity: sev,
      reason: h.description,
      consequenceIfSkipped: 'Animal welfare and milk quality risk. Treatment window may close.',
      estimatedCostIfSkippedUGX: criticalLoss(18),
      estimatedTimeMinutes: 30,
      relatedCowId: h.cowId || null,
      cowCode: h.cowId ? extractCode(h.description) : null,
      done: false,
      source: 'daily_advice_health',
      actionable: true,
    });
  }

  for (const w of advice.inventoryWarnings ?? []) {
    const sev = (w.severity || 'medium') as CommandAction['severity'];
    actions.push({
      id: `inv-${actions.length + 1}`,
      block: 'midday',
      title: w.title,
      category: 'inventory',
      priority: sev === 'critical' ? 4 : 3,
      severity: sev,
      reason: w.description,
      consequenceIfSkipped: 'Feed or medicine stockout could halt operations.',
      estimatedCostIfSkippedUGX: sev === 'critical' ? criticalLoss(25) : criticalLoss(10),
      estimatedTimeMinutes: 15,
      done: false,
      source: 'daily_advice_inventory',
      actionable: true,
      shortcut: 'Create purchase order draft',
    });
  }

  for (const b of advice.breedingRecommendations ?? []) {
    const sev = (b.severity || 'medium') as CommandAction['severity'];
    actions.push({
      id: `breed-${actions.length + 1}`,
      block: 'midday',
      title: b.title,
      category: 'breeding',
      priority: 4,
      severity: sev,
      reason: b.description,
      consequenceIfSkipped: 'Missed breeding window reduces conception chance significantly.',
      estimatedCostIfSkippedUGX: criticalLoss(12),
      estimatedTimeMinutes: 20,
      relatedCowId: b.cowId || null,
      cowCode: b.cowId ? extractCode(b.description) : null,
      done: false,
      source: 'daily_advice_breeding',
      actionable: true,
    });
  }

  for (const f of advice.feedRecommendations ?? []) {
    const sev = (f.severity || 'low') as CommandAction['severity'];
    actions.push({
      id: `feed-${actions.length + 1}`,
      block: 'midday',
      title: f.title,
      category: 'feed',
      priority: 3,
      severity: sev,
      reason: f.description,
      consequenceIfSkipped: 'Lactation yield may drop. Body condition risk increases.',
      estimatedCostIfSkippedUGX: criticalLoss(6),
      estimatedTimeMinutes: 25,
      done: false,
      source: 'daily_advice_feed',
      actionable: true,
    });
  }

  for (const t of advice.employeeTasks ?? []) {
    actions.push({
      id: `emp-${actions.length + 1}`,
      block: 'morning',
      title: t.title,
      category: 'operations',
      priority: 2,
      severity: 'medium',
      reason: t.description,
      consequenceIfSkipped: 'Staffing gap for scheduled operation.',
      estimatedCostIfSkippedUGX: criticalLoss(4),
      estimatedTimeMinutes: 15,
      done: false,
      delegatedTo: t.assignedTo || null,
      dueDate: t.dueDate || null,
      source: 'daily_advice_employees',
      actionable: true,
    });
  }

  for (const t of advice.endOfDayChecklist ?? []) {
    actions.push({
      id: `eod-${actions.length + 1}`,
      block: 'evening',
      title: t.label,
      category: 'review',
      priority: 2,
      severity: 'low',
      reason: 'Standard end-of-day verification',
      consequenceIfSkipped: 'Missed data entry may delay tomorrow\'s AI analysis.',
      estimatedCostIfSkippedUGX: criticalLoss(2),
      estimatedTimeMinutes: 10,
      done: t.done || false,
      source: 'daily_advice_checklist',
      actionable: true,
    });
  }

  const weather = advice.weatherAdvice;
  if (weather?.title) {
    actions.push({
      id: `weather-${actions.length + 1}`,
      block: 'morning',
      title: weather.title,
      category: 'weather',
      priority: 3,
      severity: 'medium',
      reason: weather.description,
      consequenceIfSkipped: 'Herd heat stress or exposure risk increases.',
      estimatedCostIfSkippedUGX: criticalLoss(5),
      estimatedTimeMinutes: 10,
      done: false,
      source: 'daily_advice_weather',
      actionable: true,
    });
  }

  const feedShortage = detectFeedShortage(actions);
  if (feedShortage) {
    feedShortage.shortcut = 'Emergency feed order';
    feedShortage.consequenceIfSkipped = 'Milking herd faces feed gap. Production drops begin within 48h.';
    feedShortage.estimatedCostIfSkippedUGX = criticalLoss(30);
    feedShortage.estimatedTimeMinutes = 10;
  }

  const sorted = actions.sort((a, b) => {
    const sevOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    if (sevOrder[a.severity] !== sevOrder[b.severity]) return sevOrder[a.severity] - sevOrder[b.severity];
    return b.priority - a.priority;
  });

  const categorized: Record<string, CommandAction[]> = { urgent: [], morning: [], midday: [], evening: [] };
  for (const a of sorted) {
    if (a.done) continue;
    const block = categorized[a.block] ? a.block : 'morning';
    categorized[block].push(a);
  }

  const blocks: TimeBlock[] = [
    { label: 'Urgent — Do now', window: '0–2h', actions: categorized.urgent },
    { label: 'Morning briefing', window: '6–9am', actions: categorized.morning },
    { label: 'Midday follow-up', window: '12–2pm', actions: categorized.midday },
    { label: 'Evening review', window: '5–7pm', actions: categorized.evening },
  ];

  const totalPending = sorted.filter((a) => !a.done).length;
  const criticalPending = sorted.filter((a) => !a.done && a.severity === 'critical').length;
  const estimatedTotalMinutes = sorted.reduce((s, a) => s + (a.done ? 0 : a.estimatedTimeMinutes), 0);
  const highestRisk = sorted.find((a) => !a.done && a.severity === 'critical') || sorted.find((a) => !a.done) || null;

  const herdPulse = await buildHerdPulse(farmId);

  const previousScore = await loadPreviousScore(farmId, farmScore.date);
  const farmScoreDelta = previousScore !== null ? farmScore.overall - previousScore : 0;

  return {
    generatedAt: new Date().toISOString(),
    farmScore: farmScore.overall,
    farmScoreDelta,
    herdPulse,
    blocks,
    eveningReview: {
      tasksChecked: sorted.filter((a) => a.done).length,
      pendingCount: totalPending,
      completionPct: totalPending > 0 || sorted.length > 0 ? Math.round((sorted.filter((a) => a.done).length / Math.max(1, sorted.length)) * 100) : 100,
    },
    meta: {
      totalActions: totalPending,
      criticalPending,
      estimatedTimeTotalMinutes: estimatedTotalMinutes,
      highestRiskAction: highestRisk,
    },
  };
}

export async function executeCommandAction(farmId: string, actionId: string, status: 'done' | 'undo', userId?: string) {
  const row = await query(`SELECT id FROM ai_insights WHERE farm_id=$1`, [farmId]).catch(() => ({ rows: [] as any[] }));
  const insight = row.rows[0];
  const r = await query(`UPDATE ai_insights SET status='resolved', resolved_at=now() WHERE farm_id=$1 AND id=$2 RETURNING id`, [farmId, actionId]).catch(() => ({ rows: [] as any[] }));
  return { ok: true, actionId, status, insightId: r.rows[0]?.id || null };
}

async function buildHerdPulse(farmId: string) {
  let total = 0, milking = 0, sick = 0, inTreatment = 0, calvingToday = 0, calvingThisWeek = 0;
  const sickCodes: string[] = [];
  const treatmentCodes: string[] = [];

  try {
    const r = await query(`SELECT count(*) FILTER (WHERE status='active') AS total, count(*) FILTER (WHERE is_milking) AS milking, count(*) FILTER (WHERE health='sick') AS sick, count(*) FILTER (WHERE health='under_treatment') AS in_treatment, string_agg(cow_code, ',') FILTER (WHERE health='sick') AS sick_codes, string_agg(cow_code, ',') FILTER (WHERE health='under_treatment') AS treatment_codes FROM cows WHERE farm_id=$1`, [farmId]);
    const row = r.rows[0] || {};
    total = Number(row.total || 0);
    milking = Number(row.milking || 0);
    sick = Number(row.sick || 0);
    inTreatment = Number(row.in_treatment || 0);
    const sc = row.sick_codes || '';
    const tc = row.treatment_codes || '';
    if (sc) sickCodes.push(...sc.split(',').filter(Boolean).slice(0, 5));
    if (tc) treatmentCodes.push(...tc.split(',').filter(Boolean).slice(0, 5));
  } catch {
    // swallow — non-critical
  }

  try {
    const cr = await query(`SELECT count(*)::int AS c FROM calving_records WHERE farm_id=$1 AND expected_calving_on = CURRENT_DATE`, [farmId]);
    calvingToday = Number(cr.rows[0]?.c || 0);
    const wr = await query(`SELECT count(*)::int AS c FROM calving_records WHERE farm_id=$1 AND expected_calving_on >= CURRENT_DATE AND expected_calving_on < CURRENT_DATE + INTERVAL '7 days'`, [farmId]);
    calvingThisWeek = Number(wr.rows[0]?.c || 0);
  } catch {
    // swallow
  }

  return { total, milking, sick, inTreatment, calvingToday, calvingThisWeek, sickCodes, treatmentCodes };
}

async function loadPreviousScore(farmId: string, today: string): Promise<number | null> {
  try {
    const r = await query(`SELECT overall_score FROM ai_farm_scores WHERE farm_id=$1 AND score_date < $2 ORDER BY score_date DESC LIMIT 1`, [farmId, today]);
    return r.rows[0] ? Number(r.rows[0].overall_score) : null;
  } catch {
    return null;
  }
}

function extractCode(text: string): string | null {
  const m = text.match(/([A-Z]{2}-\d{3})/i);
  return m ? m[1].toUpperCase() : null;
}

function detectFeedShortage(actions: CommandAction[]): CommandAction | null {
  return actions.find((a) => a.category === 'inventory' && /feed|concentrate|silage|hay/i.test(a.title)) || null;
}
