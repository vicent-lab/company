import { useState, useEffect } from 'react';
import { useHashRoute } from '../router';
import { PageHeader, Kpi, ChartCard, LineChart, chartColors, gridColor, tickColor, Skeleton, useToast } from '../ui';
import { getCow } from '../data';
import { fmt } from '../format';
import { Milk, Beef, HeartPulse, Syringe, Stethoscope, Activity, Edit, ArrowLeft, AlertTriangle } from 'lucide-react';

export function CowDashboard({ id }: { id: string }) {
  const [, navigate] = useHashRoute();
  const { push } = useToast();
  const [cow, setCow] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getCow(id).then((c) => {
      if (!cancelled) { setCow(c); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [id]);

  if (loading) return <div className="card"><Skeleton h={220} /></div>;
  if (!cow) return <div className="card">Cow not found.</div>;

  const milkTotal = cow.milk?.reduce((s: number, m: any) => s + (m.morning || 0) + (m.afternoon || 0) + (m.evening || 0), 0) || 0;
  const lastMilk = cow.milk?.[0];
  const lastMilkTotal = lastMilk ? (lastMilk.morning || 0) + (lastMilk.afternoon || 0) + (lastMilk.evening || 0) : 0;
  const pendingVacc = (cow.vaccinations || []).filter((v: any) => !v.done).length;
  const activeTreatments = (cow.treatments || []).filter((t: any) => (t.status || '').toLowerCase() === 'active').length;

  const gc = chartColors();
  const opts = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: tickColor(), maxTicksLimit: 6 }, grid: { color: gridColor() } }, y: { ticks: { color: tickColor(), grid: { color: gridColor() } } } } };

  const recentAlerts = (cow.treatments || [])
    .filter((t: any) => (t.status || '').toLowerCase() === 'active')
    .slice(0, 3)
    .map((t: any) => ({ text: t.disease || t.diagnosis || 'Active treatment', date: t.date }));

  const upcomingVaccs = (cow.vaccinations || [])
    .filter((v: any) => !v.done)
    .slice(0, 3)
    .map((v: any) => ({ text: v.name, date: v.due }));

  return (
    <div>
      <div className="row" style={{ gap: 18, alignItems: 'center', marginBottom: 4 }}>
        <div
          style={{
            width: 80, height: 80, borderRadius: 16, background: cow.color || '#888',
            display: 'grid', placeItems: 'center', color: '#fff', fontSize: 32, fontWeight: 700, flexShrink: 0,
          }}
        >
          {(cow.name || cow.cowCode || '?').charAt(0).toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <PageHeader
            eyebrow="COW DASHBOARD"
            title={cow.name || cow.cowCode}
            desc={`${cow.cowCode} · ${cow.breed} · ${cow.gender} · ${cow.status}`}
            actions={
              <div className="row" style={{ gap: 8 }}>
                <button className="btn ghost sm" onClick={() => navigate('/app/cows')}><ArrowLeft size={15} /> Herd</button>
                <button className="btn sm" onClick={() => push('Open full profile to edit records', <Edit size={15} />)}><Edit size={15} /> Edit</button>
              </div>
            }
          />
        </div>
      </div>

      <div className="four mt">
        <Kpi icon={<Milk size={18} />} label="Avg Milk/Day" value={fmt.liters(cow.avgDailyMilk)} delta={lastMilkTotal ? `${fmt.liters(lastMilkTotal)} today` : 'No records'} />
        <Kpi icon={<Beef size={18} />} label="Weight" value={fmt.kg(cow.weightKg)} />
        <Kpi icon={<HeartPulse size={18} />} label="Productivity" value={<span>{(cow.productivityScore || 0)}%</span>} />
        <Kpi icon={<Syringe size={18} />} label="Vaccinations" value={`${(cow.vaccinations || []).filter((v: any) => v.done).length}/${(cow.vaccinations || []).length}`} delta={pendingVacc > 0 ? `${pendingVacc} pending` : 'Up to date'} tone={pendingVacc > 0 ? 'down' : 'up'} />
        <Kpi icon={<Stethoscope size={18} />} label="Treatments" value={activeTreatments} delta={activeTreatments ? 'Active' : 'None'} tone={activeTreatments ? 'down' : 'up'} />
        <Kpi icon={<Activity size={18} />} label="Total Milk Recorded" value={fmt.liters(milkTotal)} delta={`${(cow.milk || []).length} records`} />
        <Kpi icon={<HeartPulse size={18} />} label="Health" value={cow.health?.replace('_', ' ') || 'Unknown'} tone={cow.health === 'healthy' ? 'up' : 'down'} />
        <Kpi icon={<Milk size={18} />} label="Status" value={cow.status === 'active' ? 'Active' : cow.status} tone={cow.status === 'active' ? 'up' : 'down'} />
      </div>

      <div className="split mt">
        <ChartCard title="Milk production" subtitle="Last 30 days (L/day)">
          {cow.milk?.length ? (
            <LineChart
              data={{ labels: cow.milk.map((m: any) => m.date.slice(5)), datasets: [{ label: 'Litres', data: cow.milk.map((m: any) => +((m.morning || 0) + (m.afternoon || 0) + (m.evening || 0)).toFixed(1)), borderColor: gc[0], backgroundColor: gc[0] + '22', fill: true, tension: 0.4, pointRadius: 0, borderWidth: 2 }] }}
              options={opts}
            />
          ) : (
            <p className="muted">No milk records yet.</p>
          )}
        </ChartCard>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="card" style={{ padding: 16 }}>
            <h3 style={{ marginTop: 0, marginBottom: 10 }}>Alerts & upcoming</h3>
            {recentAlerts.length === 0 && upcomingVaccs.length === 0 && <p className="muted">No active alerts or upcoming vaccinations.</p>}
            {recentAlerts.length > 0 && (
              <>
                <div style={{ fontSize: 12, color: 'var(--text-soft)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Active treatments</div>
                {recentAlerts.map((a: any, i: number) => (
                  <div key={i} className="row" style={{ gap: 8, alignItems: 'center', marginBottom: 6 }}>
                    <AlertTriangle size={14} style={{ color: 'var(--danger)' }} />
                    <span style={{ fontSize: 14 }}>{a.text}</span>
                    {a.date && <span className="muted" style={{ fontSize: 12 }}>{fmt.shortDate(a.date)}</span>}
                  </div>
                ))}
              </>
            )}
            {upcomingVaccs.length > 0 && (
              <>
                <div style={{ fontSize: 12, color: 'var(--text-soft)', textTransform: 'uppercase', letterSpacing: 1, margin: '10px 0 6px' }}>Due vaccinations</div>
                {upcomingVaccs.map((v: any, i: number) => (
                  <div key={i} className="row" style={{ gap: 8, alignItems: 'center', marginBottom: 6 }}>
                    <Syringe size={14} style={{ color: 'var(--warn)' }} />
                    <span style={{ fontSize: 14 }}>{v.text}</span>
                    {v.date && <span className="muted" style={{ fontSize: 12 }}>{fmt.shortDate(v.date)}</span>}
                  </div>
                ))}
              </>
            )}
          </div>

          <div className="card" style={{ padding: 16 }}>
            <h3 style={{ marginTop: 0, marginBottom: 10 }}>Quick info</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 14 }}>
              <div><span className="muted">Breed:</span> <b>{cow.breed || 'Unknown'}</b></div>
              <div><span className="muted">Gender:</span> <b>{cow.gender || 'Unknown'}</b></div>
              <div><span className="muted">Milking:</span> <b>{cow.isMilking ? 'Yes' : 'No'}</b></div>
              <div><span className="muted">Pregnant:</span> <b>{cow.isPregnant ? 'Yes' : 'No'}</b></div>
              <div><span className="muted">Barn:</span> <b>{cow.barnId || '—'}</b></div>
              <div><span className="muted">Milk records:</span> <b>{(cow.milk || []).length}</b></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
