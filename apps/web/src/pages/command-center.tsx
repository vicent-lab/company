import { useState, useEffect, useMemo } from 'react';
import { useFarm } from '../app';
import { useAuth } from '../auth';
import { isLive } from '../api';
import { PageHeader, Kpi, AnimatedCounter, Modal, useToast, Skeleton, Progress } from '../ui';
import { commandCenter, getFarmSetupStatus, FarmSetupStep } from '../data';
import {
  Clock, AlertTriangle, TrendingUp, Activity, Zap, CheckCircle2, X, ChevronDown,
  RefreshCw, ClipboardList, ArrowRight, Flame, Sunrise, Sun, Moon, ShieldCheck,
  Milestone, Timer, DollarSign, Pill, Wheat, FlaskConical, Wind, Users, Gauge, Boxes, Square, ListChecks,
} from 'lucide-react';
import { fmt } from '../format';

function FarmSetupChecklist({ farmId }: { farmId: string }) {
  const [status, setStatus] = useState<{ steps: FarmSetupStep[]; completionPct: number } | null>(null);

  useEffect(() => {
    // farmId starts as the 'f1' placeholder until the real farm list loads and AppShell
    // corrects it — skip the fetch until it looks like a real farm id, since the backend
    // route takes a UUID param and a non-UUID string here would fail server-side.
    if (!isLive || !/^[0-9a-f]{8}-/i.test(farmId)) return;
    let alive = true;
    getFarmSetupStatus(farmId).then((res) => { if (alive) setStatus(res); }).catch(() => {});
    return () => { alive = false; };
  }, [farmId]);

  if (!status || status.completionPct >= 100) return null;

  return (
    <div className="card mt" style={{ padding: 20 }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div className="row" style={{ gap: 8, alignItems: 'center', marginBottom: 10 }}>
            <ListChecks size={16} color="var(--primary)" />
            <b style={{ fontSize: 14 }}>Farm Setup</b>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '6px 16px' }}>
            {status.steps.map((s) => (
              <div key={s.key} className="row" style={{ gap: 6, fontSize: 13, color: s.done ? 'var(--text)' : 'var(--text-soft)' }}>
                {s.done ? <CheckCircle2 size={15} color="var(--primary)" /> : <Square size={15} color="var(--border)" />}
                {s.label}
              </div>
            ))}
          </div>
        </div>
        <div style={{ minWidth: 140, textAlign: 'right' }}>
          <div className="muted" style={{ fontSize: 12 }}>Completion</div>
          <div style={{ fontSize: 26, fontWeight: 700, fontFamily: "'Playfair Display', serif" }}>{status.completionPct}%</div>
          <div style={{ width: 120 }}><Progress value={status.completionPct} /></div>
          <p className="muted" style={{ fontSize: 11, marginTop: 8, maxWidth: 160 }}>This helps you know exactly what to do next.</p>
        </div>
      </div>
    </div>
  );
}

type BlockId = 'urgent' | 'morning' | 'midday' | 'evening';

interface CommandCenterData {
  generatedAt: string;
  farmScore: number;
  farmScoreDelta: number;
  herdPulse: {
    total: number; milking: number; sick: number; inTreatment: number;
    calvingToday: number; calvingThisWeek: number; sickCodes: string[]; treatmentCodes: string[];
  };
  blocks: { label: string; window: string; actions: CommandAction[] }[];
  eveningReview: { tasksChecked: number; pendingCount: number; completionPct: number };
  meta: { totalActions: number; criticalPending: number; estimatedTimeTotalMinutes: number; highestRiskAction: CommandAction | null };
}

interface CommandAction {
  id: string;
  block: BlockId;
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
  actionable: boolean;
  shortcut?: string;
}

const BLOCK_META: Record<BlockId, { icon: any; color: string; border: string; label: string }> = {
  urgent: { icon: Zap, color: 'var(--danger)', border: '#ef4444', label: 'Urgent — Do now' },
  morning: { icon: Sunrise, color: 'var(--warn)', border: '#f59e0b', label: 'Morning briefing' },
  midday: { icon: Sun, color: 'var(--info)', border: '#3b82f6', label: 'Midday follow-up' },
  evening: { icon: Moon, color: '#8b5cf6', border: '#8b5cf6', label: 'Evening review' },
};

const CATEGORY_ICONS: Record<string, any> = {
  general: ClipboardList, alert: AlertTriangle, health: Activity, inventory: Boxes,
  breeding: FlaskConical, feed: Wheat, operations: Users, review: CheckCircle2, weather: Wind,
};

const severityTone: Record<string, string> = {
  critical: 'danger', high: 'warn', medium: 'info', low: 'ok',
};

function fmtMoney(n: number): string {
  if (n >= 1_000_000) return `UGX ${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `UGX ${(n / 1_000).toFixed(0)}K`;
  return `UGX ${n}`;
}

export function CommandCenter() {
  const { farmId, farmName } = useFarm();
  const { user } = useAuth();
  const { push } = useToast();
  const [data, setData] = useState<CommandCenterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());

  const load = async (background = false) => {
    if (!background) setLoading(true);
    try {
      const res = await commandCenter(farmId);
      const d = (res as any).data || res;
      setData(d);
    } catch { if (!background) push('Failed to load command center'); }
    if (!background) setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [farmId]);

  // Keeps the day's priorities current without the user having to think about it: a
  // silent refetch whenever the tab regains focus, on a 60s heartbeat while it's open,
  // and immediately after the offline queue syncs anything.
  useEffect(() => {
    const silentRefetch = () => { if (document.visibilityState === 'visible') load(true); };
    window.addEventListener('focus', silentRefetch);
    document.addEventListener('visibilitychange', silentRefetch);
    window.addEventListener('dairyos:refresh', silentRefetch);
    const interval = setInterval(() => load(true), 60_000);
    return () => {
      window.removeEventListener('focus', silentRefetch);
      document.removeEventListener('visibilitychange', silentRefetch);
      window.removeEventListener('dairyos:refresh', silentRefetch);
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [farmId]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    push('Command center refreshed', <RefreshCw size={14} />);
    setRefreshing(false);
  };

  const completeAction = async (action: CommandAction) => {
    setCompletedIds((prev) => new Set(prev).add(action.id));
    push(`Marked: ${action.title}`, <CheckCircle2 size={14} />);
    try {
      await commandCenter(farmId);
    } catch {}
  };

  const overallActions = useMemo(() => {
    if (!data) return [];
    return data.blocks.flatMap((b) => b.actions);
  }, [data]);

  const pendingCount = data ? data.meta.totalActions : 0;
  const criticalPending = data ? data.meta.criticalPending : 0;
  const totalMinutes = data ? data.meta.estimatedTimeTotalMinutes : 0;

  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 5 ? 'Early bird' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = user?.name?.split(' ')[0] || 'farmer';

  return (
    <div>
      <PageHeader eyebrow="COMMAND CENTER" title={`${greeting} ${firstName} 👋`} desc={farmName ? farmName : 'Your AI operating system. Everything you need to do, prioritized by impact, time, and consequence.'}
        actions={
          <div className="row" style={{ gap: 8 }}>
            <button className="btn ghost sm" onClick={refresh} disabled={refreshing}>
              {refreshing ? <><RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> Refreshing…</> : <><RefreshCw size={14} /> Refresh</>}
            </button>
          </div>
        }
      />

      <FarmSetupChecklist farmId={farmId} />

      {loading && (
        <div className="card mt" style={{ padding: 40, textAlign: 'center' }}>
          <div className="skeleton" style={{ height: 20, width: 200, margin: '0 auto' }}>Loading command center…</div>
        </div>
      )}

      {!loading && data && (
        <>
          <div className="eyebrow mt" style={{ marginBottom: 8 }}>TODAY'S STATUS</div>
          <div className="four mt">
            <Kpi icon={<Gauge size={18} />} label="Farm Score" value={<AnimatedCounter value={data.farmScore} suffix="/100" />} delta={`${data.farmScoreDelta >= 0 ? '+' : ''}${data.farmScoreDelta} vs yesterday`} tone={data.farmScore >= 75 ? 'up' : data.farmScore >= 50 ? undefined : 'down'} />
            <Kpi icon={<Zap size={18} />} label="Critical pending" value={<AnimatedCounter value={criticalPending} />} tone={criticalPending > 0 ? 'down' : 'up'} delta={criticalPending > 0 ? 'immediate' : 'clear'} />
            <Kpi icon={<Timer size={18} />} label="Time needed" value={`${totalMinutes}m`} delta={`${pendingCount} actions`} />
            <Kpi icon={<DollarSign size={18} />} label="At-risk value" value={fmtMoney(data.meta.highestRiskAction ? data.meta.highestRiskAction.estimatedCostIfSkippedUGX : 0)} delta="if top action skipped" tone="down" />
          </div>

          <div className="eyebrow mt" style={{ marginBottom: 8 }}>NEEDS ATTENTION</div>
          {data.blocks.map((block) => {
            const meta = BLOCK_META[block.label.toLowerCase().includes('urgent') ? 'urgent' : block.label.toLowerCase().includes('morning') ? 'morning' : block.label.toLowerCase().includes('midday') ? 'midday' : 'evening'];
            const Icon = meta.icon;
            if (!block.actions.length) return null;
            return (
              <div key={block.label} className="mt">
                <div className="row" style={{ gap: 8, marginBottom: 8, alignItems: 'center' }}>
                  <Icon size={16} style={{ color: meta.color }} />
                  <h3 style={{ margin: 0 }}>{block.label}</h3>
                  <span className="muted" style={{ fontSize: 12 }}>{block.window}</span>
                  <span className="pill" style={{ background: 'var(--surface-2)', color: 'var(--text-soft)', marginLeft: 'auto' }}>{block.actions.length}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {block.actions.map((action) => {
                    const isDone = completedIds.has(action.id);
                    const SIcon = CATEGORY_ICONS[action.category.toLowerCase()] || ClipboardList;
                    const tone = severityTone[action.severity] || 'info';
                    return (
                       <div key={action.id} className={`card ${isDone ? 'reveal' : ''}`} style={{ padding: 14, borderLeft: `4px solid ${meta.border}`, opacity: isDone ? 0.6: 1 }}>
                         <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                           <div style={{ marginTop: 1, color: meta.color }}><SIcon size={16} /></div>
                           <div style={{ flex: 1, minWidth: 0 }}>
                             <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 2 }}>
                               <b style={{ fontSize: 14, textDecoration: isDone ? 'line-through' : 'none' }}>{action.title}</b>
                               <span className={`pill ${tone}`} style={{ fontSize: 10, textTransform: 'capitalize' }}>{action.severity}</span>
                               {action.cowCode && <span className="pill info" style={{ fontSize: 10 }}>{action.cowCode}</span>}
                             </div>
                             <div className="row mt" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 6 }}>
                               <span className="muted" style={{ fontSize: 11 }}><Timer size={11} style={{ marginRight: 3 }} />{action.estimatedTimeMinutes} min</span>
                               <span className="muted" style={{ fontSize: 11 }}><DollarSign size={11} style={{ marginRight: 3 }} />Risk: {fmtMoney(action.estimatedCostIfSkippedUGX)}</span>
                               {action.shortcut && <span className="pill info" style={{ fontSize: 10 }}>{action.shortcut}</span>}
                               <span className="muted" style={{ fontSize: 10, marginLeft: 'auto' }}>{action.source.replace(/_/g, ' ')}</span>
                             </div>
                           </div>
                           <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
                             {!isDone ? (
                               <button className="btn sm" onClick={() => completeAction(action)}>
                                 <CheckCircle2 size={13} /> Done
                               </button>
                             ) : (
                               <span className="pill ok" style={{ fontSize: 10 }}><CheckCircle2 size={11} /> Done</span>
                             )}
                           </div>
                         </div>
                       </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {!pendingCount && !loading && (
            <div className="card mt" style={{ padding: 40, textAlign: 'center' }}>
              <CheckCircle2 size={36} style={{ color: 'var(--ok)', marginBottom: 10 }} />
              <h3 style={{ marginBottom: 6 }}>All clear</h3>
              <p className="muted" style={{ maxWidth: 400, margin: '0 auto' }}>No critical pending actions right now. The AI will alert you when something needs attention.</p>
            </div>
          )}

          <div className="card mt" style={{ padding: '12px 16px' }}>
            <div className="row" style={{ gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
              <div className="row" style={{ gap: 6 }}><ClipboardList size={14} /><b style={{ fontSize: 13 }}>Evening review</b></div>
              <span className="muted" style={{ fontSize: 12 }}>{data.eveningReview.tasksChecked} checked · {data.eveningReview.pendingCount} pending</span>
              <span className="pill ok" style={{ fontSize: 10 }}>{data.eveningReview.completionPct}%</span>
              <span className="muted" style={{ fontSize: 11, marginLeft: 'auto' }}>Score <b>{data.farmScore}</b> <span className={`pill ${data.farmScoreDelta >= 0 ? 'ok' : 'danger'}`} style={{ fontSize: 10 }}>{data.farmScoreDelta >= 0 ? '+' : ''}{data.farmScoreDelta}</span></span>
              <span className="pill" style={{ background: 'var(--surface-2)', color: 'var(--text-soft)', fontSize: 10 }}>{pendingCount} pending · {criticalPending} critical</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
