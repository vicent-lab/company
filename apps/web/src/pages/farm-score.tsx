import { useFarm } from '../app';
import { PageHeader, Kpi, AnimatedCounter, Progress, Sparkline, DoughnutChart, useAsync, Skeleton } from '../ui';
import { farmScore, farmScoreHistory, FarmScoreCategories } from '../data';
import {
  Gauge, HeartPulse, Wheat, FlaskConical, DollarSign, Milk, Boxes, ShieldCheck, Users, Rabbit,
} from 'lucide-react';

const CATEGORY_META: { key: keyof FarmScoreCategories; label: string; icon: any }[] = [
  { key: 'health', label: 'Health', icon: HeartPulse },
  { key: 'nutrition', label: 'Nutrition', icon: Wheat },
  { key: 'breeding', label: 'Breeding', icon: FlaskConical },
  { key: 'finance', label: 'Finance', icon: DollarSign },
  { key: 'milkProduction', label: 'Milk Production', icon: Milk },
  { key: 'inventory', label: 'Inventory', icon: Boxes },
  { key: 'biosecurity', label: 'Biosecurity', icon: ShieldCheck },
  { key: 'workerPerformance', label: 'Worker Performance', icon: Users },
  { key: 'animalWelfare', label: 'Animal Welfare', icon: Rabbit },
];

function tierColor(score: number): string {
  if (score >= 80) return 'var(--primary)';
  if (score >= 60) return 'var(--warn)';
  return 'var(--danger)';
}

function tierLabel(score: number): string {
  if (score >= 80) return 'Good';
  if (score >= 60) return 'Needs attention';
  return 'At risk';
}

export function FarmScore() {
  const { farmId } = useFarm();
  const score = useAsync(() => farmScore(farmId), [farmId]);
  const history = useAsync(() => farmScoreHistory(farmId, 30), [farmId]);

  const data = score.data;
  const overall = data?.overall ?? 0;
  const overallTrend = (history.data || []).map((p: { overall: number }) => p.overall);
  const worst = data ? CATEGORY_META.map((m) => ({ ...m, score: data.categories[m.key].score })).sort((a, b) => a.score - b.score)[0] : null;
  const worstDeduction = worst && data ? data.categories[worst.key].deductions[0] : null;

  return (
    <div>
      <PageHeader eyebrow="AI FARM SCORE" title="Farm health, scored"
        desc="Nine categories scored 0-100 from your live farm data, each with concrete recommendations to improve it." />

      <div className="split mt">
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          {score.loading ? <Skeleton h={140} w={140} style={{ borderRadius: '50%' }} /> : (
            <div style={{ width: 140, height: 140, position: 'relative' }}>
              <DoughnutChart
                data={{ datasets: [{ data: [overall, 100 - overall], backgroundColor: [tierColor(overall), 'var(--border)'], borderWidth: 0 }] }}
                options={{ responsive: true, maintainAspectRatio: false, cutout: '78%', plugins: { legend: { display: false }, tooltip: { enabled: false } } }}
              />
              <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 30, fontWeight: 700 }}><AnimatedCounter value={overall} /></div>
                  <div className="muted" style={{ fontSize: 11 }}>/ 100</div>
                </div>
              </div>
            </div>
          )}
          <div style={{ flex: 1 }}>
            <div className="row" style={{ alignItems: 'center', gap: 8 }}>
              <Gauge size={18} />
              <h3 style={{ margin: 0 }}>Overall Farm Health</h3>
            </div>
            <div className="muted mt" style={{ fontSize: 13 }}>{tierLabel(overall)} — weighted across all 9 categories, with health, biosecurity, and animal welfare weighted highest.</div>
            {overallTrend.length > 1 && <div className="mt"><Sparkline data={overallTrend} color={tierColor(overall)} /></div>}
            {worst && worstDeduction && (
              <div className="mt" style={{ fontSize: 13 }}>
                <b>Biggest opportunity:</b> {worst.label} ({worst.score}/100) — {worstDeduction.recommendation}
              </div>
            )}
          </div>
        </div>
        <div className="card">
          <h3>Category snapshot</h3>
          <div className="mt" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {CATEGORY_META.map((m) => {
              const s = data?.categories[m.key]?.score ?? 0;
              return (
                <div key={m.key}>
                  <div className="between" style={{ fontSize: 13 }}><span>{m.label}</span><b>{score.loading ? '—' : s}</b></div>
                  <Progress value={score.loading ? 0 : s} />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="four mt">
        {CATEGORY_META.map((m) => {
          const cat = data?.categories[m.key];
          const s = cat?.score ?? 0;
          const Icon = m.icon;
          return (
            <Kpi
              key={m.key}
              icon={<Icon size={20} />}
              label={m.label}
              value={score.loading ? <Skeleton h={30} w={60} /> : <AnimatedCounter value={s} suffix="/100" />}
              delta={score.loading ? undefined : tierLabel(s)}
              tone={s >= 60 ? 'up' : 'down'}
              loading={score.loading}
            />
          );
        })}
      </div>

      <div className="mt scroll-x" style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', minWidth: 0 }}>
        {CATEGORY_META.map((m) => {
          const cat = data?.categories[m.key];
          if (!cat) return null;
          return (
            <div className="card" key={m.key}>
              <div className="between">
                <div className="row" style={{ alignItems: 'center', gap: 8 }}><m.icon size={16} /><h3 style={{ margin: 0 }}>{m.label}</h3></div>
                <b style={{ color: tierColor(cat.score) }}>{cat.score}/100</b>
              </div>
              <div className="mt"><Progress value={cat.score} /></div>
              {cat.deductions.length === 0 ? (
                <div className="muted mt" style={{ fontSize: 13 }}>No issues detected — keep up the current routine.</div>
              ) : (
                <ul className="mt" style={{ margin: 0, paddingLeft: 18, fontSize: 13, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {cat.deductions.slice(0, 3).map((d: { reason: string; recommendation: string }, i: number) => (
                    <li key={i}><span className="muted">{d.reason}.</span> {d.recommendation}</li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
