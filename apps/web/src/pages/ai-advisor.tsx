import { useState, useEffect, useRef } from 'react';
import { useFarm } from '../app';
import { useHashRoute } from '../router';
import { PageHeader, Kpi, AnimatedCounter, Modal, useToast } from '../ui';
import {
  aiInsights, runAiAnalysis, aiDailyActionPlan, updateAiInsight, addAiAction, updateAiAction, AiInsight, aiChat, aiCreateConversation, submitFeedback,
  getLearningStats, recordInsightOutcome, aiChatHistory, deleteAiChatMessage, clearAiChatHistory, AiChatMessage, AiChatAttachment,
  aiInsightHistory, dailyAdvice, DailyAdvice, farmScore, FarmScoreResult,
} from '../data';
import { Sparkles, AlertTriangle, TrendingUp, Activity, Zap, Send, Filter, CheckCircle2, X, ChevronDown, ChevronUp, RefreshCw, ClipboardList, ArrowRight, Mic, Paperclip, Volume2, VolumeX, Trash2, Bot, Loader2, Flame, Snowflake, CloudSun, DollarSign, Stethoscope, Plus, Copy, RotateCcw } from 'lucide-react';
import { fmt, daysFromNow } from '../format';

const PRIORITY_DOT: Record<string, string> = { critical: '🔴', high: '🟠', medium: '🟡', low: '🟢' };

interface SourcePill {
  label: string;
  count: number;
  link: string;
}

function parseSourcePills(text: string): { body: string; pills: SourcePill[] } {
  const match = text.match(/\n\n---\nSources: (.+)$/s);
  if (!match) return { body: text, pills: [] };
  const body = text.slice(0, match.index).trim();
  const raw = match[1];
  const pills: SourcePill[] = [];
  const regex = /(.+?)\s*\[(\d+)\]\(([^)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(raw)) !== null) {
    pills.push({ label: m[1].trim(), count: Number(m[2]), link: m[3] });
  }
  return { body, pills };
}

function inlineMarkdown(text: string): React.ReactNode[] {
  const formatted = text.replace(/\b\d{5,}\b/g, (value) => Number(value).toLocaleString('en-US'));
  return formatted.split(/(\*\*[^*]+\*\*)/g).map((part, index) => part.startsWith('**') && part.endsWith('**')
    ? <strong key={index}>{part.slice(2, -2)}</strong>
    : <span key={index}>{part}</span>);
}

function RichAnswer({ text }: { text: string }) {
  let displayText = text;
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object') {
      displayText = Object.entries(parsed).map(([key, value]) => `${key.replace(/[_-]/g, ' ')}: ${typeof value === 'object' ? JSON.stringify(value) : value}`).join('\n');
    }
  } catch { /* normal assistant prose is not JSON */ }
  const lines = displayText.split(/\r?\n/);
  const blocks: React.ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) { i++; continue; }
    if (/^#{1,3}\s/.test(line)) {
      const level = Math.min(3, line.match(/^#+/)?.[0].length || 3) as 1 | 2 | 3;
      const Heading = (`h${level}`) as keyof JSX.IntrinsicElements;
      blocks.push(<Heading key={i} className="ai-answer-heading">{inlineMarkdown(line.replace(/^#{1,3}\s+/, ''))}</Heading>);
      i++; continue;
    }
    if (/^\|/.test(line) && i + 1 < lines.length && /^\|?\s*:?-{3,}/.test(lines[i + 1].trim())) {
      const rows: string[][] = [];
      while (i < lines.length && /^\|/.test(lines[i].trim())) {
        if (!/^\|?\s*:?-{3,}/.test(lines[i].trim())) rows.push(lines[i].split('|').slice(1, -1).map((cell) => cell.trim()));
        i++;
      }
      blocks.push(<div key={`table-${i}`} className="ai-answer-table-wrap"><table className="ai-answer-table"><tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => rowIndex === 0 ? <th key={cellIndex}>{inlineMarkdown(cell)}</th> : <td key={cellIndex}>{inlineMarkdown(cell)}</td>)}</tr>)}</tbody></table></div>);
      continue;
    }
    if (/^(?:[-*•])\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^(?:[-*•])\s+/.test(lines[i].trim())) { items.push(lines[i].trim().replace(/^(?:[-*•])\s+/, '')); i++; }
      blocks.push(<ul key={`ul-${i}`} className="ai-answer-list">{items.map((item, index) => <li key={index}>{inlineMarkdown(item)}</li>)}</ul>);
      continue;
    }
    if (/^\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+[.)]\s+/.test(lines[i].trim())) { items.push(lines[i].trim().replace(/^\d+[.)]\s+/, '')); i++; }
      blocks.push(<ol key={`ol-${i}`} className="ai-answer-list">{items.map((item, index) => <li key={index}>{inlineMarkdown(item)}</li>)}</ol>);
      continue;
    }
    if (/^(CRITICAL|HIGH PRIORITY|WARNING|RECOMMENDATION|STATUS):?/i.test(line)) {
      blocks.push(<div key={i} className={`ai-answer-status ${line.toLowerCase().startsWith('critical') || line.toLowerCase().startsWith('warning') ? 'danger' : 'info'}`}><AlertTriangle size={14} />{inlineMarkdown(line)}</div>);
      i++; continue;
    }
    const paragraph: string[] = [line];
    i++;
    while (i < lines.length && lines[i].trim() && !/^#{1,3}\s|^(?:[-*•])\s+|^\d+[.)]\s+|^\|/.test(lines[i].trim())) { paragraph.push(lines[i].trim()); i++; }
    blocks.push(<p key={i} className="ai-answer-paragraph">{inlineMarkdown(paragraph.join(' '))}</p>);
  }
  return <div className="ai-answer-content">{blocks}</div>;
}

function chatDate(value: string) {
  return new Date(value).toLocaleString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function WeatherIcon({ title }: { title: string }) {
  if (title === 'Heat stress risk') return <Flame size={15} style={{ color: 'var(--danger)' }} />;
  if (title === 'Cold stress risk') return <Snowflake size={15} style={{ color: 'var(--info)' }} />;
  return <CloudSun size={15} style={{ color: 'var(--ok)' }} />;
}

function buildFriendlyNote(brief: DailyAdvice): { lines: string[]; cowId?: string } {
  const lines: string[] = [];
  const hasCriticalOrHigh = brief.priorityTasks.some((t) => t.severity === 'critical' || t.severity === 'high');

  if (!hasCriticalOrHigh && brief.farmScore >= 80) {
    lines.push('Everything is looking good today.');
  }
  if (brief.milkProductionAnalysis.title === 'Milk production stable') {
    lines.push(brief.milkProductionAnalysis.description);
  }

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
const statusLabel: Record<string, string> = { new: 'New', acknowledged: 'Acknowledged', in_progress: 'In Progress', resolved: 'Resolved', dismissed: 'Dismissed' };
const statusOptions = Object.entries(statusLabel).map(([k, v]) => ({ value: k, label: v }));

const SUGGESTED_PROMPTS = [
  "What needs attention today?",
  "Which cows need attention?",
  "Which cows are due to calve?",
  "How is milk production performing?",
  "Do I have enough feed?",
  "What are my biggest risks?",
  "Give me today's priorities.",
];

export function AIAdvisor() {
  const { farmId, farmName } = useFarm();
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
  const [chatError, setChatError] = useState<string | null>(null);
  const [retryQuestion, setRetryQuestion] = useState<string | null>(null);
  const [retryAttachment, setRetryAttachment] = useState<AiChatAttachment | null>(null);
  const [planOpen, setPlanOpen] = useState(false);
  const [plan, setPlan] = useState<any>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [detail, setDetail] = useState<AiInsight | null>(null);
  const [chatHistory, setChatHistory] = useState<AiChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [processingStage, setProcessingStage] = useState('Analyzing your farm data…');
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
  const [showInsights, setShowInsights] = useState(false);

  const loadScore = async () => {
    setScoreLoading(true);
    try { setScore(await farmScore(farmId)); } catch { /* score strip is best-effort */ }
    setScoreLoading(false);
  };
  useEffect(() => { loadScore(); /* eslint-disable-next-line */ }, [farmId]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatSectionRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

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
  useEffect(() => {
    const prefill = localStorage.getItem('dairyos:ai-prefill');
    if (prefill) { setChat(prefill); localStorage.removeItem('dairyos:ai-prefill'); }
  }, []);

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
    setInsights((prev) => prev.map((i) => i.id === insight.id ? { ...i, action_items: items } : i));
    if (detail?.id === insight.id) setDetail({ ...detail, action_items: items });

    const existingAction = insight.actions?.find((a: any) => !a.completed_at);
    if (existingAction) {
      await updateAiAction(existingAction.id, farmId, { status: items[actionIdx].done ? 'completed' : 'pending' });
    } else if (items[actionIdx].done) {
      await addAiAction(insight.id, farmId, { title: items[actionIdx].label });
    }
  };

  const sendChat = async (override?: string, viaVoice = false, regenerateMessage?: AiChatMessage) => {
    const question = (override ?? chat).trim();
    if (!question && !attachment) return;
    const q = question || `Please take a look at the attached file: ${attachment?.name}`;
    const pendingAttachment = attachment;
    setChat(''); setAttachment(null); setChatBusy(true); setChatError(null); setRetryQuestion(null); setRetryAttachment(null);
    setProcessingStage('Checking animal records…');
    const stageTimer = window.setTimeout(() => setProcessingStage('Analyzing milk production…'), 900);
    const stageTimer2 = window.setTimeout(() => setProcessingStage('Reviewing health records…'), 1800);
    try {
      const res = await aiChat(q, farmId, pendingAttachment || undefined, conversationId || undefined);
      if (res.conversation_id) setConversationId(res.conversation_id);
      setChatHistory((h) => [{
        id: res.id, question: q, answer: res.answer, created_at: res.created_at,
        attachment_name: pendingAttachment?.name, attachment_type: pendingAttachment?.type, attachment_data: pendingAttachment?.data,
      }, ...h.filter((message) => !regenerateMessage || message.id !== regenerateMessage.id)]);
      if (viaVoice) speak(res.id, res.answer);
    } catch (err: any) {
      const message = err?.message || 'I couldn\'t access your farm data right now. Please try again.';
      setChatError(message);
      setRetryQuestion(q);
      setRetryAttachment(pendingAttachment || null);
    } finally {
      window.clearTimeout(stageTimer); window.clearTimeout(stageTimer2);
      setChatBusy(false);
      setProcessingStage('Analyzing your farm data…');
    }
  };

  const retryLast = async () => {
    if (!retryQuestion && !retryAttachment) return;
    const q = retryQuestion || `Please take a look at the attached file: ${retryAttachment?.name}`;
    setChatError(null);
    await sendChat(q, false);
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

  const newConversation = async () => {
    try {
      const created = await aiCreateConversation(farmId);
      setConversationId(created.id);
      setChatHistory([]); setChatError(null); setRetryQuestion(null); setRetryAttachment(null); setChat('');
      push('New conversation started', <Plus size={14} />);
    } catch { push('Could not start a new conversation'); }
  };

  const regenerate = (message: AiChatMessage) => {
    if (!chatBusy) sendChat(message.question, false, message);
  };

  const copyAnswer = async (answer: string) => {
    try { await navigator.clipboard.writeText(parseSourcePills(answer).body); push('Answer copied', <Copy size={14} />); }
    catch { push('Could not copy answer'); }
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

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatHistory, chatBusy]);

  return (
    <div>
      <PageHeader eyebrow="AI FARM ADVISOR" title="AI Assistant" desc={`Conversational assistant for ${farmName || 'your farm'}. Ask anything about your herd, milk, feed, breeding, or finances.`}
        actions={
          <div className="row" style={{ gap: 8 }}>
            <button className="btn ghost sm" onClick={generatePlan} disabled={planLoading}>
              {planLoading ? 'Generating…' : <><ClipboardList size={14} /> Daily Action Plan</>}
            </button>
            <button className="btn gold sm" onClick={runAnalysis} disabled={analysing}>
              {analysing ? 'Analyzing…' : <><Sparkles size={14} /> Analyze</>}
            </button>
            <button className="btn sm" onClick={() => setShowInsights((v) => !v)}>
              {showInsights ? 'Hide Insights' : <><Activity size={14} /> Insights</>}
            </button>
          </div>
        }
      />

      {/* Farm Context Banner */}
      <div className="card mt" style={{ padding: '12px 16px', background: 'var(--surface-2)', border: 0 }}>
        <div className="row" style={{ gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <Bot size={16} style={{ color: 'var(--primary)' }} />
          <span style={{ fontSize: 13, fontWeight: 600 }}>AI Assistant — {farmName || 'Current Farm'}</span>
          {score && !scoreLoading && (
            <span className="muted" style={{ fontSize: 12, marginLeft: 'auto' }}>
              Farm health: <b style={{ color: score.overall >= 80 ? 'var(--ok)' : score.overall >= 50 ? 'var(--warn)' : 'var(--danger)' }}>{score.overall}/100</b>
            </span>
          )}
        </div>
      </div>

      {/* Chat Section - Primary Focus */}
      <div ref={chatSectionRef} className="ai-workspace mt">
        <div className="ai-chat-header">
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="row" style={{ gap: 8, alignItems: 'center' }}>
              <div className="ai-avatar ai-avatar-large"><Bot size={20} /></div>
              <div><b style={{ fontSize: 16 }}>AI Farm Assistant</b><div className="muted" style={{ fontSize: 12 }}>{chatBusy ? processingStage : `Online · ${farmName || 'Current farm'}`}</div></div>
            </div>
            <div className="row" style={{ gap: 6 }}>
              <button className="btn ghost sm" onClick={newConversation}><Plus size={14} /> New conversation</button>
              {chatHistory.length > 0 && <button className="btn ghost sm" title="Clear all saved chat history" onClick={clearHistory}><Trash2 size={13} /> Clear</button>}
            </div>
          </div>
        </div>

        {/* Messages */}
        <div ref={chatContainerRef} className="ai-chat-scroll">
          {historyLoading && (
            <div style={{ textAlign: 'center', padding: 20 }}>
              <div className="skeleton" style={{ height: 16, width: 180, margin: '0 auto' }}>Loading conversation…</div>
            </div>
          )}
          {!historyLoading && chatHistory.length === 0 && (
            <div style={{ textAlign: 'center', padding: '24px 16px' }}>
              <Bot size={36} style={{ color: 'var(--primary)', marginBottom: 10, opacity: 0.7 }} />
              <p style={{ fontSize: 14, marginBottom: 4, fontWeight: 600 }}>Hello! I'm your AI Farm Assistant.</p>
              <p className="muted" style={{ fontSize: 13, marginBottom: 16 }}>I have access to your farm data. Ask me anything about your herd, milk, feed, breeding, or finances.</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                {SUGGESTED_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    className="btn sm ghost"
                    style={{ borderRadius: 20, fontSize: 12 }}
                    onClick={() => sendChat(prompt)}
                    disabled={chatBusy}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}
          {chatHistory.slice().reverse().map((m) => (
            <div key={m.id} className="ai-exchange">
              <div className="ai-message ai-user-message">
                <div className="ai-message-meta">You · {chatDate(m.created_at)}</div>
                <div className="ai-user-bubble">
                  {m.attachment_name && <div className="ai-attachment"><Paperclip size={14} /> {m.attachment_name}</div>}
                  {m.question}
                </div>
                <div className="ai-user-avatar">You</div>
              </div>
              <div className="ai-message ai-assistant-message">
                <div className="ai-avatar"><Bot size={15} /></div>
                <div className="ai-assistant-body">
                  <div className="ai-message-meta">AI Assistant · {chatDate(m.created_at)}</div>
                  <div className="ai-assistant-bubble">
                    {(() => { const { body, pills } = parseSourcePills(m.answer); return <><RichAnswer text={body} />{pills.length > 0 && <details className="ai-sources"><summary>Sources ({fmt.num(pills.length)})</summary><div className="ai-source-pills">{pills.map((p, i) => <a key={i} href={p.link} className="btn ghost sm">{p.label} ({fmt.num(p.count)})</a>)}</div></details>}</>; })()}
                  </div>
                  <div className="ai-message-actions">
                    <button className="btn ghost sm" title="Copy answer" onClick={() => copyAnswer(m.answer)}><Copy size={13} /> Copy</button>
                    <button className="btn ghost sm" title="Regenerate answer" onClick={() => regenerate(m)} disabled={chatBusy}><RotateCcw size={13} /> Regenerate</button>
                    <button className="btn ghost sm" title={speakingId === m.id ? 'Stop reading' : 'Read answer aloud'} onClick={() => speak(m.id, m.answer)}>{speakingId === m.id ? <VolumeX size={13} /> : <Volume2 size={13} />} Read aloud</button>
                    <button className="btn ghost sm" title="Delete this exchange" onClick={() => deleteMessage(m.id)}><Trash2 size={13} /> Delete</button>
                  </div>
                </div>
              </div>
            </div>
          ))}
          {chatBusy && <div className="ai-processing"><div className="ai-avatar"><Bot size={15} /></div><div><div className="ai-message-meta">AI Assistant</div><div className="ai-assistant-bubble"><Loader2 size={14} className="spin" /> {processingStage}</div></div></div>}
          {chatError && (
            <div style={{ background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: 12, padding: '12px 16px', fontSize: 13, color: 'var(--danger)', alignSelf: 'flex-start', maxWidth: '90%' }}>
              <b>I couldn't access your farm data right now.</b>
              <p style={{ margin: '4px 0 0', fontSize: 12, opacity: 0.9 }}>Please try again.</p>
              <button className="btn sm mt" style={{ marginTop: 8 }} onClick={retryLast}>Retry</button>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Suggested Prompts */}
        {chatHistory.length === 0 && !chatBusy && (
          <div style={{ padding: '0 16px 12px', borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-soft)', marginBottom: 8, fontWeight: 700 }}>Suggested questions</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {SUGGESTED_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  className="btn sm ghost"
                  style={{ borderRadius: 20, fontSize: 12, justifyContent: 'flex-start' }}
                  onClick={() => sendChat(prompt)}
                  disabled={chatBusy}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input Area */}
        <div className="ai-composer">
          {attachment && (
            <div className="row" style={{ gap: 8, marginBottom: 8, alignItems: 'center', background: 'var(--surface-2)', padding: 8, borderRadius: 8 }}>
              {attachment.type.startsWith('image/')
                ? <img src={attachment.data} alt={attachment.name} style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 6 }} />
                : <Paperclip size={16} />}
              <span style={{ fontSize: 13, flex: 1 }}>{attachment.name}</span>
              <button className="btn ghost sm" onClick={() => setAttachment(null)}><X size={13} /></button>
            </div>
          )}
          <div className="ai-composer-row">
            <input ref={fileInputRef} type="file" accept="image/*,.pdf,.doc,.docx,.csv,.xlsx" style={{ display: 'none' }}
              onChange={(e) => onAttachFile(e.target.files?.[0])} />
            <button className="btn ghost sm ai-icon-button" title="Attach a file or photo" onClick={() => fileInputRef.current?.click()}><Paperclip size={16} /><span className="sr-only">Attach file</span></button>
            <input
              className="input"
              placeholder="Ask about your farm…"
              value={chat}
              onChange={(e) => setChat(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendChat()}
              style={{ flex: 1, minHeight: 44 }}
            />
            <button className="btn ghost sm ai-icon-button" title="Voice input" onClick={startVoiceInput} disabled={chatBusy} style={{ color: listening ? 'var(--danger)' : undefined }}>
              <Mic size={16} />
            </button>
            <button className="btn ai-send-button" onClick={() => sendChat()} disabled={chatBusy || (!chat.trim() && !attachment)} style={{ minHeight: 44 }}>
              {chatBusy ? <><Loader2 size={14} className="spin" /> Sending…</> : <><Send size={14} /> Send</>}
            </button>
          </div>
          <p className="muted" style={{ fontSize: 11, marginTop: 6, textAlign: 'center' }}>AI analyzes your farm data in real-time. Ask by text, voice, or attach a file.</p>
        </div>
      </div>

      {/* Insights Panel (collapsible) */}
      {showInsights && (
        <>
          <div className="four mt">
            <Kpi icon={<Sparkles size={18} />} label="Total Insights" value={<AnimatedCounter value={counts.all} />} delta="all categories" />
            <Kpi icon={<AlertTriangle size={18} />} label="Critical" value={<AnimatedCounter value={counts.critical} />} tone="down" delta="immediate action" />
            <Kpi icon={<Zap size={18} />} label="High Priority" value={<AnimatedCounter value={counts.high} />} tone="down" delta="today" />
            <Kpi icon={<Activity size={18} />} label="New" value={<AnimatedCounter value={counts.new} />} delta="awaiting review" />
          </div>

          <div className="card mt" style={{ padding: 16 }}>
            <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 12 }}>
              <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                <h3 style={{ margin: 0 }}>Insights</h3>
                <span className="muted" style={{ fontSize: 12 }}>{insightHistory.length} in last {insightHistoryDays} days</span>
              </div>
              <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                {[7, 30, 90].map((d) => (
                  <button key={d} className="btn ghost sm"
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
            </div>
          </div>
        </>
      )}

      {/* Detail Modal */}
      {detail && (
        <Modal title="Insight Detail" onClose={() => setDetail(null)}>
          <div className="row" style={{ gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            <span className={`pill ${severityTone[detail.severity] || 'info'}`} style={{ textTransform: 'capitalize' }}>{detail.severity}</span>
            <span className="pill info" style={{ textTransform: 'capitalize' }}>{detail.type.replace('_', ' ')}</span>
            <span className="pill" style={{ background: 'var(--surface-2)', color: 'var(--text-soft)' }}>{categoryLabel[detail.category] || detail.category}</span>
            {detail.confidence_score > 0 && <span className="muted" style={{ fontSize: 13 }}>Confidence: {Math.round(detail.confidence_score * 100)}%</span>}
          </div>
          <h3 style={{ marginBottom: 6 }}>{detail.title}</h3>
          <p style={{ fontSize: 14, lineHeight: 1.6 }}>{detail.description}</p>

          {detail.explanation && (
            <div className="card mt" style={{ padding: 16, background: 'var(--surface-2)', border: 0 }}>
              <h4 style={{ marginBottom: 10, fontSize: 13, textTransform: 'uppercase', letterSpacing: 1 }}>Why this matters</h4>
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
              <h4 style={{ marginBottom: 6, fontSize: 13, textTransform: 'uppercase', letterSpacing: 1 }}>Evidence</h4>
              {detail.evidence?.length ? (
                <div style={{ fontSize: 12, color: 'var(--text-soft)' }}>
                  {detail.evidence.map((ev: any, idx: number) => (
                    <div key={idx} style={{ marginBottom: 4 }}>
                      <b>{ev.rule_id}</b> | signal: {ev.signal} | base confidence: {Math.round((ev.base_confidence || 0) * 100)}%
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
    </div>
  );
}
