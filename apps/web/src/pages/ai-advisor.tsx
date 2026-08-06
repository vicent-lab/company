import { useState, useEffect, useRef } from 'react';
import { useFarm } from '../app';
import { useHashRoute } from '../router';
import { PageHeader, Kpi, AnimatedCounter, Modal, useToast } from '../ui';
import {
  aiInsights, runAiAnalysis, aiDailyActionPlan, updateAiInsight, addAiAction, updateAiAction, AiInsight, aiChat, submitFeedback,
  getLearningStats, recordInsightOutcome, aiChatHistory, deleteAiChatMessage, clearAiChatHistory, AiChatMessage, AiChatAttachment,
  aiInsightHistory, dailyAdvice, DailyAdvice, farmScore, FarmScoreResult,
} from '../data';
import { Sparkles, AlertTriangle, TrendingUp, Activity, Zap, Send, Filter, CheckCircle2, X, ChevronDown, ChevronUp, RefreshCw, ClipboardList, ArrowRight, Mic, Paperclip, Volume2, VolumeX, Trash2, Bot, Loader2, Flame, Snowflake, CloudSun, DollarSign, Stethoscope } from 'lucide-react';
import { fmt, daysFromNow } from '../format';

const PRIORITY_DOT: Record<string, string> = { critical: '🔴', high: '🟠', medium: '🟡', low: '🟢' };

function WeatherIcon({ title }: { title: string }) {
  if (title === 'Heat stress risk') return <Flame size={15} style={{ color: 'var(--danger)' }} />;
  if (title === 'Cold stress risk') return <Snowflake size={15} style={{ color: 'var(--info)' }} />;
  return <CloudSun size={15} style={{ color: 'var(--ok)' }} />;
}

// Same warmer, conversational voice from the mockup — "good news, however, here's the
// concern, here's what I'd do" — but every clause is a real description string the
// daily-advice engine already computed, just narrated instead of listed. No new facts,
// no LLM: this is phrasing, not reasoning.
function buildFriendlyNote(brief: DailyAdvice): { lines: string[]; cowId?: string } {
  const lines: string[] = [];
  const hasCriticalOrHigh = brief.priorityTasks.some((t) => t.severity === 'critical' || t.severity === 'high');

  if (!hasCriticalOrHigh && brief.farmScore >= 80) {
    lines.push('Everything is looking good today.');
  }
  if (brief.milkProductionAnalysis.title === 'Milk production stable') {
    lines.push(brief.milkProductionAnalysis.description);
  }

  // The single most pressing, cow-specific concern — health warnings carry a cowId,
  // priority tasks don't, so prefer a health warning when one exists.
  const concern = brief.healthWarnings.find((h) => h.cowId) ?? null;

  if (concern) {
    if (lines.length > 0) lines.push('However…');
    lines.push(concern.description || concern.title);
    lines.push('I recommend checking on her today.');
  } else if (brief.priorityTasks.length > 0) {
    if (lines.length > 0) lines.push('However…');
    lines.push(brief.priorityTasks[0].label + '.');
  }

  if (lines.length === 0) lines.push("Nothing urgent today — a good day to get ahead on routine work.");

  return { lines, cowId: concern?.cowId };
}

type FilterType = 'all' | 'recommendation' | 'warning' | 'prediction' | 'action_plan' | 'alert';
type SeverityFilter = 'all' | 'low' | 'medium' | 'high' | 'critical';
type StatusFilter = 'all' | 'new' | 'acknowledged' | 'in_progress' | 'resolved' | 'dismissed';

const severityTone: Record<string, string> = { critical: 'danger', high: 'warn', medium: 'info', low: 'ok' };
const severityIcon: Record<string, any> = { critical: AlertTriangle, high: AlertTriangle, medium: Activity, low: Sparkles };
const typeIcon: Record<string, any> = {
  recommendation: TrendingUp, warning: AlertTriangle, prediction: TrendingUp, action_plan: ClipboardList, alert: Zap,
};
const categoryLabel: Record<string, string> = {
  health: 'Health', milk_production: 'Milk Production', feed_nutrition: 'Feed & Nutrition',
  breeding: 'Breeding', financial: 'Financial', infrastructure: 'Infrastructure',
  team_management: 'Team', sustainability: 'Sustainability', general: 'General',
};
const categoryOptions = Object.entries(categoryLabel).map(([k, v]) => ({ value: k, label: v }));
const statusLabel: Record<string, string> = { new: 'New', acknowledged: 'Acknowledced', in_progress: 'In Progress', resolved: 'Resolved', dismissed: 'Dismissed' };
const statusOptions = Object.entries(statusLabel).map(([k, v]) => ({ value: k, label: v }));

export function AIAdvisor() {
  const { farmId } = useFarm();
  const { push } = useToast();
  const [, navigate] = useHashRoute();
  const [insights, setInsights] = useState<AiInsight[]>([]);
  const [loading, setLoading] = useState(true);
  const [analysing, setAnalysing] = useState(false);
  const [filter, setFilter] = useState<FilterType>('all');
  const [severity, setSeverity] = useState<SeverityFilter>('all');
  const [category, setCategory] = useState<string>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [minConfidence, setMinConfidence] = useState<number>(0);
  const [showFilters, setShowFilters] = useState(false);
  const [chat, setChat] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [plan, setPlan] = useState<any>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [detail, setDetail] = useState<AiInsight | null>(null);
  const [chatHistory, setChatHistory] = useState<AiChatMessage[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [attachment, setAttachment] = useState<AiChatAttachment | null>(null);
  const [listening, setListening] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [insightHistory, setInsightHistory] = useState<AiInsight[]>([]);
  const [insightHistoryLoading, setInsightHistoryLoading] = useState(false);
  const [insightHistoryDays, setInsightHistoryDays] = useState(30);
  const [brief, setBrief] = useState<DailyAdvice | null>(null);
  const [briefLoading, setBriefLoading] = useState(true);
  const [expandedWhy, setExpandedWhy] = useState<Record<string, boolean>>({});
  const [score, setScore] = useState<FarmScoreResult | null>(null);
  const [scoreLoading, setScoreLoading] = useState(true);

  const loadScore = async () => {
    setScoreLoading(true);
    try { setScore(await farmScore(farmId)); } catch { /* score strip is best-effort */ }
    setScoreLoading(false);
  };
  useEffect(() => { loadScore(); /* eslint-disable-next-line */ }, [farmId]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatSectionRef = useRef<HTMLDivElement>(null);

  const loadBrief = async () => {
    setBriefLoading(true);
    try { setBrief(await dailyAdvice(farmId)); } catch { /* briefing is best-effort */ }
    setBriefLoading(false);
  };
  useEffect(() => { loadBrief(); /* eslint-disable-next-line */ }, [farmId]);

  const toggleRecommendedTask = (idx: number) => {
    setBrief((b) => {
      if (!b) return b;
      const endOfDayChecklist = [...b.endOfDayChecklist];
      endOfDayChecklist[idx] = { ...endOfDayChecklist[idx], done: !endOfDayChecklist[idx].done };
      return { ...b, endOfDayChecklist };
    });
  };

  const loadHistory = async () => {
    setHistoryLoading(true);
    try { setChatHistory(await aiChatHistory(farmId)); } catch { /* history is best-effort */ }
    setHistoryLoading(false);
  };
  const loadInsightHistory = async () => {
    setInsightHistoryLoading(true);
    try { setInsightHistory(await aiInsightHistory(farmId, insightHistoryDays)); } catch { /* history is best-effort */ }
    setInsightHistoryLoading(false);
  };
  useEffect(() => { loadHistory(); /* eslint-disable-next-line */ }, [farmId]);
  useEffect(() => { loadInsightHistory(); /* eslint-disable-next-line */ }, [farmId, insightHistoryDays]);

  const load = async () => {
    setLoading(true);
    try {
      const params: any = { includeEvidence: true };
      if (filter !== 'all') params.type = filter;
      if (severity !== 'all') params.severity = severity;
      if (category !== 'all') params.category = category;
      if (status !== 'all') params.status = status;
      if (minConfidence > 0) params.minConfidence = String(minConfidence);
      const data = await aiInsights(farmId, params);
      setInsights(data);
    } catch { push('Failed to load insights'); }
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filter, severity, category, status, minConfidence, farmId]);

  const runAnalysis = async () => {
    setAnalysing(true);
    try {
      const res = await runAiAnalysis(farmId);
      push(`Analysis complete: ${res.created} new insights generated`, <Sparkles size={14} />);
      await load();
    } catch { push('Analysis failed'); }
    setAnalysing(false);
  };

  const generatePlan = async () => {
    setPlanLoading(true);
    try {
      const res = await aiDailyActionPlan(farmId);
      setPlan(res.action_items || []);
      setPlanOpen(true);
      push('Daily action plan generated', <ClipboardList size={14} />);
    } catch { push('Failed to generate action plan'); }
    setPlanLoading(false);
  };

  const changeStatus = async (id: string, status: string) => {
    try {
      const updated = await updateAiInsight(id, { status });
      setInsights((prev) => prev.map((i) => i.id === id ? { ...i, ...updated } : i));
      push(`Insight ${status}`, <CheckCircle2 size={14} />);
    } catch { push('Failed to update insight'); }
  };

  const scheduleVet = async (insight: AiInsight) => {
    try {
      await addAiAction(insight.id, farmId, { title: `Schedule vet visit — ${insight.title}`, dueDate: daysFromNow(1) });
      push('Vet visit scheduled for tomorrow', <Stethoscope size={14} />);
    } catch { push('Failed to schedule vet visit'); }
  };

  const askAiAbout = (insight: AiInsight) => {
    chatSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    sendChat(`Tell me more about "${insight.title}" and what I should do about it.`);
  };

  const toggleAction = async (insight: AiInsight, actionIdx: number) => {
    const items = [...insight.action_items];
    items[actionIdx] = { ...items[actionIdx], done: !items[actionIdx].done };
    // Optimistic update
    setInsights((prev) => prev.map((i) => i.id === insight.id ? { ...i, action_items: items } : i));
    if (detail?.id === insight.id) setDetail({ ...detail, action_items: items });

    // Find or create related action item
    const existingAction = insight.actions?.find((a: any) => !a.completed_at);
    if (existingAction) {
      await updateAiAction(existingAction.id, farmId, { status: items[actionIdx].done ? 'completed' : 'pending' });
    } else if (items[actionIdx].done) {
      await addAiAction(insight.id, farmId, { title: items[actionIdx].label });
    }
  };

  const sendChat = async (override?: string, viaVoice = false) => {
    const question = (override ?? chat).trim();
    if (!question && !attachment) return;
    const q = question || `Please take a look at the attached file: ${attachment?.name}`;
    const pendingAttachment = attachment;
    setChat(''); setAttachment(null); setChatBusy(true);
    try {
      const res = await aiChat(q, farmId, pendingAttachment || undefined);
      setChatHistory((h) => [{
        id: res.id, question: q, answer: res.answer, created_at: res.created_at,
        attachment_name: pendingAttachment?.name, attachment_type: pendingAttachment?.type, attachment_data: pendingAttachment?.data,
      }, ...h]);
      // A question asked by voice gets its answer read back — that's what makes it a
      // conversation instead of just voice-to-text-then-read-the-screen.
      if (viaVoice) speak(res.id, res.answer);
    } catch { push('Chat failed'); }
    setChatBusy(false);
  };

  const startVoiceInput = () => {
    const SR = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if (!SR) { push('Voice input is not supported in this browser'); return; }
    const rec = new SR();
    rec.lang = 'en-US';
    rec.onresult = (e: any) => sendChat(e.results[0][0].transcript, true);
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    setListening(true);
    rec.start();
  };

  const speak = (id: string, text: string) => {
    if (!('speechSynthesis' in window)) { push('Voice output is not supported in this browser'); return; }
    if (speakingId === id) { window.speechSynthesis.cancel(); setSpeakingId(null); return; }
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.onend = () => setSpeakingId(null);
    utter.onerror = () => setSpeakingId(null);
    setSpeakingId(id);
    window.speechSynthesis.speak(utter);
  };

  const onAttachFile = (file: File | undefined) => {
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) { push('File too large — max 4MB'); return; }
    const reader = new FileReader();
    reader.onload = () => setAttachment({ name: file.name, type: file.type, data: String(reader.result) });
    reader.readAsDataURL(file);
  };

  const deleteMessage = async (id: string) => {
    setChatHistory((h) => h.filter((m) => m.id !== id));
    try { await deleteAiChatMessage(id, farmId); } catch { push('Failed to delete message'); }
  };

  const clearHistory = async () => {
    const prev = chatHistory;
    setChatHistory([]);
    try { await clearAiChatHistory(farmId); push('Chat history cleared', <Trash2 size={14} />); } catch { push('Failed to clear history'); setChatHistory(prev); }
  };

  const [feedback, setFeedback] = useState<{ [insightId: string]: { helpful?: boolean; accurate?: boolean; urgent?: boolean; note: string } }>({});

  const submitUserFeedback = async (insightId: string) => {
    const fb = feedback[insightId] || {};
    try {
      await submitFeedback(insightId, farmId, { helpful: fb.helpful, accurate: fb.accurate, urgent: fb.urgent, note: fb.note || undefined });
      if (fb.accurate === false) {
        await recordInsightOutcome(insightId, farmId, { outcome: 'failure', notes: fb.note || 'Marked as inaccurate' });
      } else if (fb.accurate === true) {
        await recordInsightOutcome(insightId, farmId, { outcome: 'success', notes: fb.note || undefined });
      }
      push('Feedback recorded — AI is learning!', <CheckCircle2 size={14} />);
      setDetail(null);
    } catch { push('Failed to submit feedback'); }
  };

  const counts = {
    all: insights.length,
    critical: insights.filter((i) => i.severity === 'critical').length,
    high: insights.filter((i) => i.severity === 'high').length,
    new: insights.filter((i) => i.status === 'new').length,
  };

  return (
    <div>
      <PageHeader eyebrow="AI FARM ADVISOR" title="Proactive intelligence" desc="Continuous analysis generates recommendations, warnings, and daily action plans for your farm."
        actions={
          <div className="row btn-row" style={{ gap: 8 }}>
            <button className="btn ghost sm" onClick={generatePlan} disabled={planLoading}>
              {planLoading ? 'Generating…' : <><ClipboardList size={14} /> Daily Action Plan</>}
            </button>
            <button className="btn gold sm" onClick={runAnalysis} disabled={analysing}>
              {analysing ? 'Analyzing…' : <><Sparkles size={14} /> Run Full Analysis</>}
            </button>
          </div>
        }
      />

      {/* Farm Health Dashboard */}
      {scoreLoading && <div className="card mt" style={{ padding: 24, textAlign: 'center' }}><div className="skeleton" style={{ height: 20, width: 200, margin: '0 auto' }}>Scoring your farm…</div></div>}
      {!scoreLoading && score && (
        <div className="card mt" style={{ padding: 20 }}>
          <div className="row" style={{ gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ textAlign: 'center', minWidth: 90 }}>
              <p className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 }}>Farm Score</p>
              <div style={{ fontSize: 32, fontWeight: 700, color: score.overall >= 80 ? 'var(--ok)' : score.overall >= 50 ? 'var(--warn)' : 'var(--danger)' }}>
                {score.overall}<span style={{ fontSize: 14 }}>/100</span>
              </div>
            </div>
            {([
              ['Health', score.categories.health.score],
              ['Milk', score.categories.milkProduction.score],
              ['Breeding', score.categories.breeding.score],
              ['Finance', score.categories.finance.score],
              ['Feed', score.categories.nutrition.score],
              ['Inventory', score.categories.inventory.score],
            ] as [string, number][]).map(([label, s]) => (
              <div key={label} style={{ textAlign: 'center', minWidth: 70 }}>
                <p className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 }}>{label}</p>
                <div style={{ fontSize: 20, fontWeight: 700, color: s >= 80 ? 'var(--ok)' : s >= 50 ? 'var(--warn)' : 'var(--danger)' }}>{s}%</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Today's Briefing */}
      {briefLoading && <div className="card mt" style={{ padding: 40, textAlign: 'center' }}><div className="skeleton" style={{ height: 20, width: 200, margin: '0 auto' }}>Preparing today's briefing…</div></div>}
      {!briefLoading && brief && (
        <div className="card mt" style={{ padding: 20 }}>
          <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
            <div>
              <h2 style={{ marginBottom: 8 }}>
                {brief.greeting.startsWith('Good morning') ? '🌞' : brief.greeting.startsWith('Good afternoon') ? '🌤️' : '🌙'} {brief.greeting}
              </h2>
              {(() => {
                const note = buildFriendlyNote(brief);
                return (
                  <div style={{ maxWidth: 480 }}>
                    {note.lines.map((line, idx) => (
                      <p key={idx} style={{ fontSize: 14, marginBottom: 4, color: line === 'However…' ? 'var(--text-soft)' : 'var(--text)' }}>{line}</p>
                    ))}
                    {note.cowId && (
                      <button className="btn ghost sm mt" onClick={() => navigate('/app/cow/' + note.cowId)}>
                        <ArrowRight size={13} /> Open Her Record
                      </button>
                    )}
                  </div>
                );
              })()}
            </div>
            {score && (
              <div style={{ textAlign: 'center' }}>
                <p className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>Farm Health Score</p>
                <div style={{ fontSize: 36, fontWeight: 700, color: score.overall >= 80 ? 'var(--ok)' : score.overall >= 50 ? 'var(--warn)' : 'var(--danger)' }}>
                  {score.overall}<span style={{ fontSize: 16 }}>/100</span>
                </div>
              </div>
            )}
          </div>

          <div className="two mt" style={{ gap: 16 }}>
            <div>
              <h3 style={{ fontSize: 14, marginBottom: 8 }}>Today's Priorities</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {brief.priorityTasks.length === 0 && (
                  <div style={{ fontSize: 14 }}>🟢 No urgent priorities right now.</div>
                )}
                {brief.priorityTasks.slice(0, 6).map((t, idx) => (
                  <div key={idx} style={{ fontSize: 14, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <span>{PRIORITY_DOT[t.severity || 'low'] || '🟢'}</span>
                    <span>{t.label}</span>
                  </div>
                ))}
                <div style={{ fontSize: 14, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <WeatherIcon title={brief.weatherAdvice.title} />
                  <span>{brief.weatherAdvice.description}</span>
                </div>
              </div>
            </div>

            <div>
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <h3 style={{ fontSize: 14, margin: 0 }}>Recommended Tasks</h3>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {brief.endOfDayChecklist.map((item, idx) => (
                  <label key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
                    <input type="checkbox" checked={item.done} onChange={() => toggleRecommendedTask(idx)} />
                    <span style={{ textDecoration: item.done ? 'line-through' : 'none', color: item.done ? 'var(--text-soft)' : 'var(--text)' }}>{item.label}</span>
                  </label>
                ))}
              </div>

              <div className="card mt" style={{ padding: 12, background: 'var(--surface-2)', border: 0 }}>
                <p className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, display: 'flex', alignItems: 'center', gap: 6 }}><DollarSign size={12} /> Estimated Profit Today</p>
                <div style={{ fontSize: 22, fontWeight: 700, color: brief.estimatedProfitUgx >= 0 ? 'var(--ok)' : 'var(--danger)' }}>
                  UGX {brief.estimatedProfitUgx.toLocaleString()}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="four mt">
        <Kpi icon={<Sparkles size={18} />} label="Total Insights" value={<AnimatedCounter value={counts.all} />} delta="all categories" />
        <Kpi icon={<AlertTriangle size={18} />} label="Critical" value={<AnimatedCounter value={counts.critical} />} tone="down" delta="immediate action" />
        <Kpi icon={<Zap size={18} />} label="High Priority" value={<AnimatedCounter value={counts.high} />} tone="down" delta="today" />
        <Kpi icon={<Activity size={18} />} label="New" value={<AnimatedCounter value={counts.new} />} delta="awaiting review" />
      </div>

      {/* Insight History */}
      <div className="card mt" style={{ padding: 16 }}>
        <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 12 }}>
          <div className="row" style={{ gap: 8, alignItems: 'center' }}>
            <h3 style={{ margin: 0 }}>Insight History</h3>
            <span className="muted" style={{ fontSize: 12 }}>{insightHistory.length} insights in last {insightHistoryDays} days</span>
          </div>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            {[7, 30, 90].map((d) => (
              <button key={d} className={`btn ghost sm ${insightHistoryDays === d ? '' : ''}`}
                style={insightHistoryDays === d ? { background: 'var(--primary)', color: '#fff', border: 0 } : {}}
                onClick={() => setInsightHistoryDays(d)}>
                {d === 7 ? '7 days' : d === 30 ? '30 days' : '90 days'}
              </button>
            ))}
            <button className="btn ghost sm" onClick={loadInsightHistory} disabled={insightHistoryLoading}>
              {insightHistoryLoading ? 'Loading…' : <><RefreshCw size={13} /> Refresh</>}
            </button>
          </div>
        </div>
        {insightHistoryLoading && <div className="skeleton" style={{ height: 60 }} />}
        {!insightHistoryLoading && insightHistory.length === 0 && (
          <p className="muted" style={{ fontSize: 13 }}>No insight history for this period.</p>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 360, overflowY: 'auto' }}>
          {insightHistory.slice(0, 20).map((ins) => {
            const tone = severityTone[ins.severity] || 'info';
            return (
              <div key={ins.id} className="reveal" style={{ padding: '10px 12px', background: 'var(--surface-2)', borderRadius: 10, borderLeft: `3px solid var(--${tone})`, cursor: 'pointer' }} onClick={() => setDetail(ins)}>
                <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                  <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                    <span className={`pill ${tone}`} style={{ fontSize: 10, textTransform: 'capitalize' }}>{ins.severity}</span>
                    <span className="pill info" style={{ fontSize: 10, textTransform: 'capitalize' }}>{ins.type.replace('_', ' ')}</span>
                  </div>
                  <span className="muted" style={{ fontSize: 11 }}>{fmt.shortDate(ins.created_at)}</span>
                </div>
                <div style={{ fontSize: 13, marginTop: 4 }}>{ins.title}</div>
                <div className="row" style={{ gap: 8, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span className="muted" style={{ fontSize: 11 }}>{categoryLabel[ins.category] || ins.category}</span>
                  {ins.confidence_score > 0 && <span className="muted" style={{ fontSize: 11 }}>{Math.round(ins.confidence_score * 100)}% confidence</span>}
                  <span className="pill" style={{ fontSize: 10, background: 'var(--surface)', color: 'var(--text-soft)' }}>{ins.status}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card mt" style={{ padding: 16 }}>
        <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 10 }}>
          <div className="row" style={{ gap: 8, alignItems: 'center' }}>
            <Filter size={14} style={{ color: 'var(--text-soft)' }} />
            <b style={{ fontSize: 13 }}>Filters</b>
            <button className="btn ghost sm" onClick={() => setShowFilters((v) => !v)}>
              {showFilters ? 'Hide' : 'Show'} advanced
            </button>
          </div>
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            {(Object.keys(categoryLabel) as Array<keyof typeof categoryLabel>).map((k) => (
              <button key={k} className={`btn ghost sm ${category === k ? '' : ''}`}
                style={category === k ? { background: 'var(--primary)', color: '#fff', border: 0 } : {}}
                onClick={() => setCategory(category === k ? 'all' : k)}>
                {categoryLabel[k]}
              </button>
            ))}
          </div>
        </div>

        <div className="row btn-row" style={{ gap: 8, flexWrap: 'wrap' }}>
          {(['all','recommendation','warning','prediction','action_plan','alert'] as FilterType[]).map(f => (
            <button key={f} className={`btn ghost sm ${filter === f ? '' : ''}`}
              style={filter === f ? { background: 'var(--primary)', color: '#fff', border: 0 } : {}}
              onClick={() => setFilter(f)}>
              {f === 'all' ? 'All' : f.replace('_',' ').replace(/\b\w/g, (c) => c.toUpperCase())}
              {f !== 'all' && insights.filter(i => i.type === f).length > 0 && <span className="badge-dot" style={{ marginLeft: 4 }}>{insights.filter(i => i.type === f).length}</span>}
            </button>
          ))}
          {(['all','low','medium','high','critical'] as SeverityFilter[]).map(s => (
            <button key={s} className={`btn ghost sm`}
              style={severity === s ? { background: s === 'critical' ? 'var(--danger)' : s === 'high' ? 'var(--warn)' : 'var(--primary)', color: '#fff', border: 0 } : {}}
              onClick={() => setSeverity(s)}>
              {s === 'all' ? 'All severities' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
          {statusOptions.map((s) => (
            <button key={s.value} className={`btn ghost sm`}
              style={status === s.value ? { background: 'var(--info)', color: '#fff', border: 0 } : {}}
              onClick={() => setStatus(status === s.value ? 'all' : s.value as StatusFilter)}>
              {s.label}
            </button>
          ))}
        </div>

        {showFilters && (
          <div className="card mt" style={{ padding: 12, background: 'var(--surface-2)', border: 0 }}>
            <div className="row" style={{ gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ minWidth: 180 }}>
                <label className="muted" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Min confidence: {minConfidence}%</label>
                <input className="input" type="range" min={0} max={100} value={minConfidence} onChange={(e) => setMinConfidence(Number(e.target.value))} />
              </div>
              <div>
                <label className="muted" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Category</label>
                <select className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
                  <option value="all">All categories</option>
                  {categoryOptions.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="muted" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Status</label>
                <select className="select" value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)}>
                  <option value="all">All statuses</option>
                  {statusOptions.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <button className="btn ghost sm" onClick={() => { setFilter('all'); setSeverity('all'); setCategory('all'); setStatus('all'); setMinConfidence(0); }}>Reset all</button>
            </div>
          </div>
        )}
      </div>

      <div className="mt" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {loading && (
          <div className="card" style={{ padding: 40, textAlign: 'center' }}><div className="skeleton" style={{ height: 20, width: 200, margin: '0 auto' }}>Loading insights…</div></div>
        )}
        {!loading && insights.length === 0 && (
          <div className="card" style={{ padding: 40, textAlign: 'center' }}>
            <Sparkles size={36} style={{ color: 'var(--text-soft)', marginBottom: 12 }} />
            <h3 style={{ marginBottom: 6 }}>No insights yet</h3>
            <p className="muted" style={{ maxWidth: 400, margin: '0 auto' }}>Run the Full Analysis to generate proactive recommendations, warnings, and predictions from your live farm data.</p>
            <button className="btn gold mt" onClick={runAnalysis} disabled={analysing}>
              <Sparkles size={14} /> {analysing ? 'Analyzing…' : 'Run AI Analysis'}
            </button>
          </div>
        )}
        {insights.map((ins) => {
          const SIcon = severityIcon[ins.severity] || Activity;
          const TIcon = typeIcon[ins.type] || Sparkles;
          const tone = severityTone[ins.severity] || 'info';
          const progress = ins.action_items.length ? Math.round((ins.action_items.filter(a => a.done).length / ins.action_items.length) * 100) : 0;
          return (
            <div key={ins.id} className="card reveal" style={{ cursor: 'pointer', borderLeft: `4px solid var(--${tone})` }} onClick={() => setDetail(ins)}>
              <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                  <span className={`pill ${tone}`} style={{ textTransform: 'capitalize' }}><SIcon size={12} /> {ins.severity}</span>
                  <span className="pill info" style={{ textTransform: 'capitalize' }}><TIcon size={12} /> {ins.type.replace('_',' ')}</span>
                  <span className="pill" style={{ background: 'var(--surface-2)', color: 'var(--text-soft)' }}>{categoryLabel[ins.category] || ins.category}</span>
                  {ins.status !== 'new' && <span className="pill" style={{ background: 'var(--surface-2)', color: 'var(--text-soft)' }}>{ins.status}</span>}
                </div>
                <div className="row" style={{ gap: 6 }}>
                  <span className="muted" style={{ fontSize: 12 }}>{fmt.shortDate(ins.created_at)}</span>
                  {ins.confidence_score > 0 && <span className="muted" style={{ fontSize: 12 }}>{Math.round(ins.confidence_score*100)}%</span>}
                </div>
              </div>
              <h3 style={{ marginTop: 10, marginBottom: 4 }}>{ins.title}</h3>
              <p className="muted" style={{ fontSize: 14 }}>{ins.description}</p>
              {ins.explanation && (
                <div className="mt">
                  <button
                    className="btn ghost sm"
                    style={{ padding: '4px 10px' }}
                    onClick={(e) => { e.stopPropagation(); setExpandedWhy((w) => ({ ...w, [ins.id]: !w[ins.id] })); }}
                  >
                    Why? {expandedWhy[ins.id] ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  </button>
                  {expandedWhy[ins.id] && (
                    <div className="card mt reveal" style={{ padding: 12, background: 'var(--surface-2)', border: 0 }} onClick={(e) => e.stopPropagation()}>
                      {ins.explanation.reasons.length > 0 && (
                        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.7 }}>
                          {ins.explanation.reasons.map((reason, idx) => <li key={idx}>{reason}</li>)}
                        </ul>
                      )}
                      <div className="row mt" style={{ gap: 24, flexWrap: 'wrap' }}>
                        <div>
                          <p className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 }}>Probability</p>
                          <div style={{ fontSize: 22, fontWeight: 700 }}>{ins.explanation.probability}%</div>
                        </div>
                        <div>
                          <p className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 }}>Confidence</p>
                          <div style={{ fontSize: 22, fontWeight: 700 }}>{Math.round(ins.confidence_score * 100)}%</div>
                        </div>
                        <div>
                          <p className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 }}>Evidence</p>
                          <div style={{ fontSize: 14, marginTop: 4 }}>{ins.evidence?.length || 0} indicator{ins.evidence?.length === 1 ? '' : 's'} analyzed</div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {ins.action_items.length > 0 && (
                <>
                  <div style={{ marginTop: 10 }}>
                    <div className="progress" style={{ height: 6, background: 'var(--surface-2)' }}><span style={{ width: `${progress}%`, transition: 'width 0.3s' }} /></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                      <span className="muted" style={{ fontSize: 12 }}>{ins.action_items.filter(a => a.done).length} of {ins.action_items.length} actions completed</span>
                      <span className="muted" style={{ fontSize: 12 }}>{progress}%</span>
                    </div>
                  </div>
                </>
              )}
              {(ins.status === 'new' || ins.status === 'acknowledged' || ins.status === 'in_progress') && (
                <div className="row btn-row mt" style={{ gap: 6, flexWrap: 'wrap' }} onClick={(e) => e.stopPropagation()}>
                  {ins.related_cow_id && (
                    <button className="btn ghost sm" onClick={() => navigate('/app/cow/' + ins.related_cow_id)}><ArrowRight size={13} /> Open Cow</button>
                  )}
                  <button className="btn ghost sm" onClick={() => scheduleVet(ins)}><Stethoscope size={13} /> Schedule Vet</button>
                  <button className="btn ghost sm" style={{ color: 'var(--text-soft)' }} onClick={() => changeStatus(ins.id, 'dismissed')}>Ignore</button>
                  <button className="btn gold sm" onClick={() => changeStatus(ins.id, ins.status === 'new' ? 'acknowledged' : 'resolved')}>
                    <CheckCircle2 size={13} /> Mark Checked
                  </button>
                  <button className="btn ghost sm" onClick={() => askAiAbout(ins)}><Bot size={13} /> Ask AI</button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Detail Modal */}
      {detail && (
        <Modal title="AI Insight Detail" onClose={() => setDetail(null)}>
          <div className="row" style={{ gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            <span className={`pill ${severityTone[detail.severity] || 'info'}`} style={{ textTransform: 'capitalize' }}>{detail.severity}</span>
            <span className="pill info" style={{ textTransform: 'capitalize' }}>{detail.type.replace('_',' ')}</span>
            <span className="pill" style={{ background: 'var(--surface-2)', color: 'var(--text-soft)' }}>{categoryLabel[detail.category] || detail.category}</span>
            {detail.confidence_score > 0 && <span className="muted" style={{ fontSize: 13 }}>Confidence: {Math.round(detail.confidence_score*100)}%</span>}
          </div>
          <h3 style={{ marginBottom: 6 }}>{detail.title}</h3>
          <p style={{ fontSize: 14, lineHeight: 1.6 }}>{detail.description}</p>

          {detail.explanation && (
            <div className="card mt" style={{ padding: 16, background: 'var(--surface-2)', border: 0 }}>
              <h4 style={{ marginBottom: 10, fontSize: 13, textTransform: 'uppercase', letterSpacing: 1 }}>AI Explanation</h4>
              <div style={{ marginBottom: 12 }}>
                <b style={{ fontSize: 15 }}>Probability: {detail.explanation.probability}%</b>
                <span className={`pill ${detail.explanation.probability >= 70 ? 'danger' : detail.explanation.probability >= 40 ? 'warn' : 'ok'}`} style={{ marginLeft: 8, fontSize: 11, textTransform: 'capitalize' }}>{detail.explanation.severity} risk</span>
              </div>
              {detail.explanation.reasons?.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <b style={{ fontSize: 13, display: 'block', marginBottom: 6 }}>Reasons:</b>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.6 }}>
                    {detail.explanation.reasons.map((reason: string, idx: number) => (
                      <li key={idx}>{reason}</li>
                    ))}
                  </ul>
                </div>
              )}
              {detail.explanation.recommendedActions?.length > 0 && (
                <div>
                  <b style={{ fontSize: 13, display: 'block', marginBottom: 6 }}>Recommended Actions:</b>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.6 }}>
                    {detail.explanation.recommendedActions.map((action: string, idx: number) => (
                      <li key={idx}>{action}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {(detail.evidence?.length || detail.metadata?.metrics) && (
            <div className="card mt" style={{ padding: 12, background: 'var(--surface-2)', border: 0 }}>
              <h4 style={{ marginBottom: 6, fontSize: 13, textTransform: 'uppercase', letterSpacing: 1 }}>Evidence Chain</h4>
              {detail.evidence?.length ? (
                <div style={{ fontSize: 12, color: 'var(--text-soft)' }}>
                  {detail.evidence.map((ev: any, idx: number) => (
                    <div key={idx} style={{ marginBottom: 4 }}>
                      <b>{ev.rule_id}</b> | signal: {ev.signal} | base confidence: {Math.round((ev.base_confidence || 0) * 100)}%
                      <div className="muted" style={{ fontSize: 11 }}>{JSON.stringify(ev.metrics)}</div>
                    </div>
                  ))}
                </div>
              ) : detail.metadata?.metrics && (
                <pre style={{ fontSize: 12, color: 'var(--text-soft)', whiteSpace: 'pre-wrap' }}>{JSON.stringify(detail.metadata.metrics, null, 2)}</pre>
              )}
            </div>
          )}
          {detail.related_cow_id && <p className="muted" style={{ marginTop: 6, fontSize: 13 }}>Related cow: {detail.related_cow_id}</p>}
          {detail.action_items.length > 0 && (
            <div className="mt">
              <h4>Actions</h4>
              {detail.action_items.map((a, idx) => (
                <label key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, cursor: 'pointer', fontSize: 14 }}>
                  <input type="checkbox" checked={a.done} onChange={() => toggleAction(detail, idx)} />
                  <span style={{ textDecoration: a.done ? 'line-through' : 'none', color: a.done ? 'var(--text-soft)' : 'var(--text)' }}>{a.label}</span>
                </label>
              ))}
            </div>
          )}
          <div className="row btn-row mt" style={{ justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
            {detail.status === 'new' && <><button className="btn" onClick={() => { changeStatus(detail.id, 'acknowledged'); setDetail({ ...detail, status: 'acknowledged' }); }}>Acknowledge</button>
              <button className="btn ghost" onClick={() => { changeStatus(detail.id, 'dismissed'); setDetail({ ...detail, status: 'dismissed' }); }}>Dismiss</button></>}
            {(detail.status === 'acknowledged' || detail.status === 'in_progress') && <button className="btn gold" onClick={() => { changeStatus(detail.id, 'resolved'); setDetail({ ...detail, status: 'resolved' }); }}>Mark Resolved</button>}
          </div>
          {detail.status !== 'dismissed' && (
            <div className="card mt" style={{ padding: 12, background: 'var(--surface-2)', border: 0 }}>
              <h4 style={{ marginBottom: 8 }}>Was this insight helpful?</h4>
              <div className="row btn-row" style={{ gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                <button className="btn ghost sm" style={feedback[detail.id]?.helpful === true ? { background: 'var(--ok)', color: '#fff', border: 0 } : {}} onClick={() => setFeedback(f => ({ ...f, [detail.id]: { ...f[detail.id], helpful: true } }))}>👍 Helpful</button>
                <button className="btn ghost sm" style={feedback[detail.id]?.helpful === false ? { background: 'var(--danger)', color: '#fff', border: 0 } : {}} onClick={() => setFeedback(f => ({ ...f, [detail.id]: { ...f[detail.id], helpful: false } }))}>👎 Not helpful</button>
                <button className="btn ghost sm" style={feedback[detail.id]?.accurate === true ? { background: 'var(--primary)', color: '#fff', border: 0 } : {}} onClick={() => setFeedback(f => ({ ...f, [detail.id]: { ...f[detail.id], accurate: true } }))}>Accurate</button>
                <button className="btn ghost sm" style={feedback[detail.id]?.accurate === false ? { background: 'var(--warn)', color: '#fff', border: 0 } : {}} onClick={() => setFeedback(f => ({ ...f, [detail.id]: { ...f[detail.id], accurate: false } }))}>Inaccurate</button>
              </div>
              <input className="input" placeholder="Optional note…" value={feedback[detail.id]?.note || ''} onChange={(e) => setFeedback(f => ({ ...f, [detail.id]: { ...f[detail.id], note: e.target.value } }))} />
              <button className="btn sm mt" onClick={() => submitUserFeedback(detail.id)}>Submit Feedback</button>
            </div>
          )}
        </Modal>
      )}

      {/* Daily Action Plan Modal */}
      {planOpen && plan && (
        <Modal title="Daily Action Plan" onClose={() => setPlanOpen(false)}>
          <div style={{ maxWidth: 580, width: '100%' }}>
            <p className="muted" style={{ marginBottom: 12 }}>{plan.length} priority items identified by AI for today.</p>
            {plan.map((item: any, idx: number) => (
              <div key={idx} className="card" style={{ marginBottom: 8, padding: 12, background: 'var(--surface-2)', border: 0, borderLeft: `3px solid var(--${severityTone[item.severity] || 'info'})` }}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <b>{idx + 1}. {item.title}</b>
                  <span className={`pill ${severityTone[item.severity] || 'info'}`} style={{ fontSize: 11, textTransform: 'capitalize' }}>{item.severity}</span>
                </div>
                <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>Category: {categoryLabel[item.category] || item.category}</p>
                {item.related_cow_id && <p className="muted" style={{ fontSize: 13 }}>Related cow: {item.related_cow_id}</p>}
              </div>
            ))}
            <div className="row btn-row mt" style={{ justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setPlanOpen(false)}>Close</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Chat */}
      <div ref={chatSectionRef} className="card mt" style={{ padding: 16 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h3 style={{ marginBottom: 8 }}>Ask AI Advisor</h3>
          {chatHistory.length > 0 && (
            <button className="btn ghost sm" style={{ color: 'var(--danger)' }} onClick={clearHistory}><Trash2 size={13} /> Clear all</button>
          )}
        </div>

        <div className="card mt" style={{ padding: 16, background: 'var(--surface-2)', border: 0, textAlign: 'center' }}>
          <button
            onClick={startVoiceInput}
            disabled={chatBusy}
            title="Speak your question"
            style={{
              width: 56, height: 56, borderRadius: '50%', border: 0, cursor: chatBusy ? 'default' : 'pointer',
              background: listening ? 'var(--danger)' : 'var(--primary)', color: '#fff',
              display: 'grid', placeItems: 'center', boxShadow: 'var(--shadow)',
              animation: listening ? 'pulse 1.2s ease infinite' : 'none',
            }}
          >
            <Mic size={24} />
          </button>
          <p className="muted mt" style={{ fontSize: 13 }}>
            {listening ? 'Listening…' : chatBusy ? 'Thinking…' : 'Tap to ask by voice — the answer will be read back to you.'}
          </p>
        </div>

        {attachment && (
          <div className="row" style={{ gap: 8, marginBottom: 8, alignItems: 'center', background: 'var(--surface-2)', padding: 8, borderRadius: 8 }}>
            {attachment.type.startsWith('image/')
              ? <img src={attachment.data} alt={attachment.name} style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 6 }} />
              : <Paperclip size={16} />}
            <span style={{ fontSize: 13, flex: 1 }}>{attachment.name}</span>
            <button className="btn ghost sm" onClick={() => setAttachment(null)}><X size={13} /></button>
          </div>
        )}

        <div className="row btn-row" style={{ gap: 8 }}>
          <input className="input" placeholder="Ask about your farm: 'What's urgent today?' or 'Show breeding advice'…" value={chat}
            onChange={(e) => setChat(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendChat()} />
          <input ref={fileInputRef} type="file" accept="image/*,.pdf,.doc,.docx,.csv,.xlsx" style={{ display: 'none' }}
            onChange={(e) => onAttachFile(e.target.files?.[0])} />
          <button className="btn ghost sm" title="Attach a file or photo" onClick={() => fileInputRef.current?.click()}><Paperclip size={16} /></button>
          <button className="btn" onClick={() => sendChat()} disabled={chatBusy || (!chat.trim() && !attachment)}>
            {chatBusy ? <><Loader2 size={14} className="spin" /> Thinking…</> : <><Send size={14} /> Send</>}
          </button>
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>AI Advisor analyzes your data in real-time. Ask anything about your herd, milk, feed, breeding, finances, or what to prioritize today — by text, voice, or with a file attached.</p>

        {historyLoading && <div className="skeleton mt" style={{ height: 60 }} />}
        {!historyLoading && chatHistory.length > 0 && (
          <div className="mt" style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 420, overflowY: 'auto', paddingRight: 4 }}>
            {chatHistory.map((m) => (
              <div key={m.id} className="reveal" style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                <div style={{ textAlign: 'right' }}>
                  <span className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>Farmer</span>
                </div>
                <div className="row" style={{ justifyContent: 'flex-end' }}>
                  <div className="card" style={{ background: 'var(--primary)', color: '#fff', maxWidth: '80%', border: 0, padding: 10 }}>
                    {m.attachment_name && (
                      <div className="row" style={{ gap: 6, marginBottom: 6, opacity: 0.9 }}>
                        {m.attachment_type?.startsWith('image/') && m.attachment_data
                          ? <img src={m.attachment_data} alt={m.attachment_name} style={{ width: 28, height: 28, objectFit: 'cover', borderRadius: 5 }} />
                          : <Paperclip size={13} />}
                        <span style={{ fontSize: 12 }}>{m.attachment_name}</span>
                      </div>
                    )}
                    <span style={{ fontSize: 14 }}>{m.question}</span>
                  </div>
                </div>
                <span className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>AI Advisor</span>
                <div className="row" style={{ marginTop: 4, alignItems: 'flex-start', gap: 8 }}>
                  <div className="icon" style={{ width: 28, height: 28, borderRadius: 8, display: 'grid', placeItems: 'center', background: 'var(--primary-soft)', color: 'var(--primary)', flexShrink: 0 }}><Bot size={14} /></div>
                  <div className="card" style={{ maxWidth: '78%', border: 0, background: 'var(--surface-2)', padding: 10, whiteSpace: 'pre-wrap', fontSize: 14 }}>{m.answer}</div>
                  <button className="btn ghost sm" title={speakingId === m.id ? 'Stop reading' : 'Read answer aloud'} onClick={() => speak(m.id, m.answer)}>
                    {speakingId === m.id ? <VolumeX size={13} /> : <Volume2 size={13} />}
                  </button>
                  <button className="btn ghost sm" title="Delete this exchange" style={{ color: 'var(--text-soft)' }} onClick={() => deleteMessage(m.id)}><Trash2 size={13} /></button>
                </div>
                <div className="muted" style={{ fontSize: 11, marginTop: 4, textAlign: 'right' }}>{fmt.shortDate(m.created_at)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
