import { useState, useEffect, useMemo } from 'react';
import { useFarm } from '../app';
import { useAuth } from '../auth';
import { isLive } from '../api';
import { PageHeader, Kpi, AnimatedCounter, Modal, useToast, Skeleton, Progress, useAsync, SectionHeader, Badge, EmptyState, Alert, Card } from '../ui';
import { commandCenter, getFarmSetupStatus, FarmSetupStep, tasks, emergencyAlerts, dashboardSummary } from '../data';
import {
  Clock, AlertTriangle, TrendingUp, Activity, Zap, CheckCircle2, X, ChevronDown,
  RefreshCw, ClipboardList, ArrowRight, Flame, Sunrise, Sun, Moon, ShieldCheck,
  Milestone, Timer, DollarSign, Pill, Wheat, FlaskConical, Wind, Users, Gauge, Boxes, Square, ListChecks,
  Bell, Milk, Heart, Syringe,
} from 'lucide-react';
import { fmt } from '../format';

function FarmSetupChecklist({ farmId }: { farmId: string }) {
  const [status, setStatus] = useState<{ steps: FarmSetupStep[]; completionPct: number } | null>(null);

  useEffect(() => {
    if (!isLive || !/^[0-9a-f]{8}-/i.test(farmId)) return;
    let alive = true;
    getFarmSetupStatus(farmId).then((res) => { if (alive) setStatus(res); }).catch(() => {});
    return () => { alive = false; };
  }, [farmId]);

  if (!status || status.completionPct >= 100) return null;

  return (
    <div className="card mt" style={{ padding: 20 }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
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

function blockLabel(raw: string): BlockId | null {
  const lower = raw.toLowerCase();
  if (lower.includes('urgent')) return 'urgent';
  if (lower.includes('morning')) return 'morning';
  if (lower.includes('midday')) return 'midday';
  if (lower.includes('evening')) return 'evening';
  return null;
}

export function CommandCenter() {
  const { farmId, farmName } = useFarm();
  const { user } = useAuth();
  const { push } = useToast();
  const [data, setData] = useState<CommandCenterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());

  const { data: taskList } = useAsync(() => tasks({ status: 'pending' }), [farmId]);
  const { data: alertList } = useAsync(() => emergencyAlerts(farmId), [farmId]);
  const { data: summary } = useAsync(() => dashboardSummary(farmId), [farmId]);

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

  useEffect(() => {
    const silentRefetch = () => { if (document.visibilityState === 'visible') load(true); };
    window.addEventListener('focus', silentRefetch);
    document.addEventListener('visibilitychange', silentRefetch);
    window.addEventListener('dairyos:refresh', silentRefetch);
    const interval = setInterval(() => load(true), 60_000);
    return () => {
      window.removeEventListener('focus', silentRefetch);
      window.removeEventListener('visibilitychange', silentRefetch);
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

  const urgentActions = useMemo(() => {
    if (!data) return [];
    const block = data.blocks.find((b) => blockLabel(b.label) === 'urgent');
    return block ? block.actions : [];
  }, [data]);

  const todayActions = useMemo(() => {
    if (!data) return [];
    return data.blocks
      .filter((b) => blockLabel(b.label) === 'morning' || blockLabel(b.label) === 'midday')
      .flatMap((b) => b.actions);
  }, [data]);

  const overdueTasks = useMemo(() => {
    if (!taskList) return [];
    const today = new Date().toISOString().slice(0, 10);
    return (taskList as any[]).filter((t: any) => t.status !== 'completed' && t.due_date && t.due_date < today);
  }, [taskList]);

  const hasCritical = criticalPending > 0 || urgentActions.length > 0 || (alertList || []).length > 0 || (data?.herdPulse.sick || 0) > 0 || overdueTasks.length > 0;

  return (
    <div>
      <PageHeader eyebrow="COMMAND CENTER" title={`${greeting} ${firstName}`} desc={farmName || 'Your AI operating system.'}
        actions={
          <button className="btn ghost sm" onClick={refresh} disabled={refreshing}>
            {refreshing ? <><RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> Refreshing…</> : <><RefreshCw size={14} /> Refresh</>}
          </button>
        }
      />

      <FarmSetupChecklist farmId={farmId} />

      {loading && (
        <Card padding="md" className="mt">
          <div style={{ textAlign: 'center' }}>
            <Skeleton h={20} w={200} style={{ margin: '0 auto' }} />
            <div style={{ marginTop: 8, color: 'var(--text-soft)' }}>Loading command center…</div>
          </div>
        </Card>
      )}

      {!loading && data && (
        <>
          {hasCritical && (
            <>
              <SectionHeader title="Critical — needs attention" subtitle="Actions and alerts requiring immediate attention" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {urgentActions.map((action) => {
                  const SIcon = CATEGORY_ICONS[action.category.toLowerCase()] || ClipboardList;
                  const tone = severityTone[action.severity] || 'danger';
                  const toneColor = tone === 'danger' ? 'var(--danger)' : tone === 'warn' ? 'var(--warn)' : 'var(--info)';
                  return (
                    <Alert key={action.id} variant={tone === 'danger' ? 'danger' : tone === 'warn' ? 'warning' : 'info'} title={action.title} message={action.reason}
                      icon={<Zap size={16} color={toneColor} />}
                    />
                  );
                })}
                {(alertList || []).slice(0, 5).map((alert: any) => (
                  <Alert key={alert.id} variant={alert.tone === 'danger' ? 'danger' : alert.tone === 'warn' ? 'warning' : 'info'} title={alert.title} message={alert.body} icon={<Bell size={16} color={alert.tone === 'danger' ? 'var(--danger)' : alert.tone === 'warn' ? 'var(--warn)' : 'var(--info)'} />} />
                ))}
                {overdueTasks.map((task: any) => (
                  <Alert key={task.id} variant="warning" title={task.title} message={`Due ${task.due_date} · ${task.priority}`} icon={<Clock size={16} color="var(--warn)" />} />
                ))}
                {data.herdPulse.sick > 0 && (
                  <Alert variant="danger" title={`${data.herdPulse.sick} animal${data.herdPulse.sick === 1 ? '' : 's'} sick`} message={data.herdPulse.sickCodes.join(', ')} icon={<Activity size={16} color="var(--danger)" />} />
                )}
              </div>
            </>
          )}

          <SectionHeader title="Important — today's priorities" subtitle="Key metrics and actions for today" />
          <div className="four mt">
            <Kpi icon={<Milk size={18} />} label="Milk today" value={<AnimatedCounter value={summary?.milkToday ?? 0} suffix=" L" />} delta="Production" />
            <Kpi icon={<Heart size={18} />} label="Pregnant" value={<AnimatedCounter value={summary?.pregnantCows ?? 0} />} delta={data.herdPulse.calvingToday > 0 ? `${data.herdPulse.calvingToday} calving today` : 'healthy cycle'} />
            <Kpi icon={<Syringe size={18} />} label="Vaccinations" value={<AnimatedCounter value={summary?.upcomingVacc ?? 0} />} delta="next 7 days" tone={(summary?.upcomingVacc ?? 0) > 0 ? 'down' : 'up'} />
            <Kpi icon={<Wheat size={18} />} label="Feed stock" value={<AnimatedCounter value={summary?.feedStock ?? 0} suffix=" kg" />} delta="12 days left" />
          </div>

          <SectionHeader title="Today's tasks" subtitle="Actions scheduled for today" />
          {todayActions.length === 0 ? (
            <EmptyState icon={<CheckCircle2 size={28} color="var(--primary)" />} title="All caught up" description="No actions scheduled for right now." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {todayActions.slice(0, 6).map((action) => {
                const isDone = completedIds.has(action.id);
                const SIcon = CATEGORY_ICONS[action.category.toLowerCase()] || ClipboardList;
                return (
                  <div key={action.id} className={`card ${isDone ? 'reveal' : ''}`} style={{ padding: 14, borderLeft: `4px solid var(--warn)`, opacity: isDone ? 0.6 : 1 }}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                      <div style={{ marginTop: 1, color: 'var(--warn)' }}><SIcon size={16} /></div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 2, alignItems: 'center' }}>
                          <b style={{ fontSize: 14, textDecoration: isDone ? 'line-through' : 'none' }}>{action.title}</b>
                          <Badge variant={severityTone[action.severity] === 'danger' ? 'danger' : severityTone[action.severity] === 'warn' ? 'warning' : 'info'}>{action.severity}</Badge>
                          {action.cowCode && <Badge variant="info">{action.cowCode}</Badge>}
                        </div>
                        <div className="row" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 6 }}>
                          <span className="muted" style={{ fontSize: 11 }}><Timer size={11} style={{ marginRight: 3 }} />{action.estimatedTimeMinutes} min</span>
                          <span className="muted" style={{ fontSize: 11 }}><DollarSign size={11} style={{ marginRight: 3 }} />Risk: {fmtMoney(action.estimatedCostIfSkippedUGX)}</span>
                        </div>
                      </div>
                      <div style={{ flexShrink: 0 }}>
                        {!isDone ? (
                          <button className="btn sm" onClick={() => completeAction(action)}><CheckCircle2 size={13} /> Done</button>
                        ) : (
                          <Badge variant="success"><CheckCircle2 size={11} /> Done</Badge>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <SectionHeader title="Information" subtitle="Farm overview and status" />
          <Card padding="sm" className="mt">
            <div className="row" style={{ gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <div className="row" style={{ gap: 6 }}><Activity size={16} /><b style={{ fontSize: 13 }}>Herd pulse</b></div>
              <Badge variant="info">{data.herdPulse.total} total</Badge>
              <Badge variant="success">{data.herdPulse.milking} milking</Badge>
              {data.herdPulse.calvingToday > 0 && <Badge variant="info">{data.herdPulse.calvingToday} calving today</Badge>}
              {data.herdPulse.calvingThisWeek > 0 && <Badge variant="info">{data.herdPulse.calvingThisWeek} this week</Badge>}
              {data.herdPulse.sick > 0 && <Badge variant="danger">{data.herdPulse.sick} sick</Badge>}
              {data.herdPulse.inTreatment > 0 && <Badge variant="warning">{data.herdPulse.inTreatment} in treatment</Badge>}
            </div>
          </Card>

          <Card padding="sm" className="mt">
            <div className="row" style={{ gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <span className="muted">Evening review</span>
              <Badge variant="success">{data.eveningReview.completionPct}%</Badge>
              <span className="muted">{data.eveningReview.tasksChecked} checked · {data.eveningReview.pendingCount} pending</span>
              <span className="muted" style={{ marginLeft: 'auto' }}>Score <b>{data.farmScore}</b> <Badge variant={data.farmScoreDelta >= 0 ? 'success' : 'danger'}>{data.farmScoreDelta >= 0 ? '+' : ''}{data.farmScoreDelta}</Badge></span>
              <Badge variant="default">{pendingCount} pending · {criticalPending} critical</Badge>
            </div>
          </Card>

          <FarmSetupChecklist farmId={farmId} />
        </>
      )}
    </div>
  );
}
