import { useState, useEffect } from 'react';
import { useFarm } from '../app';
import { useHashRoute } from '../router';
import { Kpi, AnimatedCounter, Skeleton, ChartCard, BarChart, LineChart, DoughnutChart, chartColors, gridColor, tickColor, PageHeader, Progress, useAsync } from '../ui';
import {
  dashboardSummary, milkTrend, incomeExpense, feedConsumption, breedPopulation, healthDistribution, farmScore,
} from '../data';
import { Beef, Milk, DollarSign, Wallet, HeartPulse, Stethoscope, Wheat, Syringe, ArrowUpRight, Gauge } from 'lucide-react';
import { fmt } from '../format';

export function Dashboard() {
  const { farmId } = useFarm();
  const [, navigate] = useHashRoute();
  const [loading, setLoading] = useState(true);
  useEffect(() => { setLoading(true); const t = setTimeout(() => setLoading(false), 500); return () => clearTimeout(t); }, [farmId]);

  const sum = useAsync(() => dashboardSummary(farmId), [farmId]);
  const milk = useAsync(() => milkTrend(farmId), [farmId]);
  const fin = useAsync(() => incomeExpense(farmId), [farmId]);
  const feed = useAsync(() => feedConsumption(farmId), [farmId]);
  const breeds = useAsync(() => breedPopulation(farmId), [farmId]);
  const health = useAsync(() => healthDistribution(farmId), [farmId]);
  const score = useAsync(() => farmScore(farmId), [farmId]);

  const s = sum.data || ({} as any);
  const m = milk.data || [];
  const f = fin.data || { income: [], expense: [] };
  const fd = feed.data || { labels: [], silage: [], hay: [], conc: [] };
  const br = breeds.data || [];
  const h = health.data || [];
  const gc = chartColors();
  const baseOpts = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { labels: { color: tickColor() } } },
    scales: { x: { ticks: { color: tickColor() }, grid: { color: gridColor() } }, y: { ticks: { color: tickColor() }, grid: { color: gridColor() } } },
  };

  return (
    <div>
      <PageHeader eyebrow="FARM OPERATIONS" title="Good morning, Manager"
        desc={`${s.totalCows ?? 0} cows · ${fmt.liters(s.milkToday ?? 0)} today · ${(s.profit ?? 0) >= 0 ? 'profitable' : 'review'} this month`}
        actions={<button className="btn sm" onClick={() => navigate('/app/predict')}>AI insights →</button>} />

      <div className="four">
        <Kpi icon={<Beef size={20} />} label="Total cows" value={<AnimatedCounter value={s.totalCows ?? 0} />} delta={`${s.milkingCows ?? 0} milking`} loading={loading} />
        <Kpi icon={<Milk size={20} />} label="Milk today" value={<AnimatedCounter value={s.milkToday ?? 0} suffix=" L" />} delta="+3.1% vs avg" loading={loading} />
        <Kpi icon={<DollarSign size={20} />} label="Revenue" value={<AnimatedCounter value={s.revenue ?? 0} prefix="$" />} delta="+6.4% MoM" loading={loading} />
        <Kpi icon={<Wallet size={20} />} label="Expenses" value={<AnimatedCounter value={s.expenses ?? 0} prefix="$" />} delta="on track" tone="down" loading={loading} />
      </div>

      <div className="five mt">
        <Kpi icon={<HeartPulse size={18} />} label="Pregnant" value={<AnimatedCounter value={s.pregnantCows ?? 0} />} delta="healthy cycle" loading={loading} />
        <Kpi icon={<Stethoscope size={18} />} label="Sick" value={<AnimatedCounter value={s.sickCows ?? 0} />} delta={s.sickCows ? 'needs care' : 'none'} tone={s.sickCows ? 'down' : 'up'} loading={loading} />
        <Kpi icon={<Wheat size={18} />} label="Feed stock" value={<AnimatedCounter value={s.feedStock ?? 0} suffix=" kg" />} delta="12 days left" loading={loading} />
          <div onClick={() => navigate('/app/farm-score')} style={{ cursor: 'pointer' }}>
            <Kpi icon={<Gauge size={18} />} label="AI Score" value={<AnimatedCounter value={score.data?.overall ?? 0} suffix="/100" />} delta="view breakdown →" tone={(score.data?.overall ?? 0) >= 60 ? 'up' : 'down'} loading={score.loading} />
          </div>
          <Kpi icon={<Syringe size={18} />} label="Vaccinations" value={<AnimatedCounter value={s.upcomingVacc ?? 0} />} delta="next 7 days" tone={s.upcomingVacc ? 'down' : 'up'} loading={loading} />
      </div>

      <div className="split mt">
        <ChartCard title="Milk production trend" subtitle="Litres per month"
          right={<span className="tag"><ArrowUpRight size={12} /> +3.1%</span>}>
          {loading ? <Skeleton h={260} /> :
            <LineChart data={{
              labels: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
              datasets: [{ label: 'Litres', data: m as any, borderColor: gc[0], backgroundColor: gc[0] + '22', fill: true, tension: 0.4, pointRadius: 0, borderWidth: 3 }],
            }} options={baseOpts} />}
        </ChartCard>
        <ChartCard title="Income vs expenses" subtitle="This month">
          {loading ? <Skeleton h={260} /> :
            <BarChart data={{
              labels: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
              datasets: [
                { label: 'Income', data: f.income, backgroundColor: gc[0], borderRadius: 5 },
                { label: 'Expenses', data: f.expense, backgroundColor: gc[3], borderRadius: 5 },
              ],
            }} options={{ ...baseOpts, plugins: { legend: { labels: { color: tickColor() } } } }} />}
        </ChartCard>
      </div>

      <div className="three mt">
        <ChartCard title="Feed consumption" subtitle="This week (kg)">
          <BarChart data={{
            labels: fd.labels,
            datasets: [
              { label: 'Silage', data: fd.silage, backgroundColor: gc[0], stack: 'a', borderRadius: 4 },
              { label: 'Hay', data: fd.hay, backgroundColor: gc[1], stack: 'a', borderRadius: 4 },
              { label: 'Concentrate', data: fd.conc, backgroundColor: gc[2], stack: 'a', borderRadius: 4 },
            ],
          }} options={{ ...baseOpts, scales: { x: { stacked: true, ticks: { color: tickColor() }, grid: { color: gridColor() } }, y: { stacked: true, ticks: { color: tickColor() }, grid: { color: gridColor() } } } }} />
        </ChartCard>
        <ChartCard title="Cow population by breed">
          <DoughnutChart data={{
            labels: br.map((b: any) => b.breed), datasets: [{ data: br.map((b: any) => b.count), backgroundColor: chartColors(br.length), borderWidth: 0 }],
          }} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: tickColor(), boxWidth: 12 } } } }} />
        </ChartCard>
        <ChartCard title="Health status" subtitle="Live distribution">
          <DoughnutChart data={{
            labels: h.map((x: any) => x.health.replace('_', ' ')), datasets: [{ data: h.map((x: any) => x.count), backgroundColor: [gc[0], gc[3], gc[4]], borderWidth: 0 }],
          }} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: tickColor(), boxWidth: 12 } } } }} />
        </ChartCard>
      </div>

      <div className="two mt">
        <div className="card">
          <h3>Monthly profit</h3>
          <p className="muted" style={{ fontSize: 13 }}>{fmt.money(s.profit ?? 0)} net this month</p>
          <div className="mt"><Progress value={Math.min(100, ((s.profit ?? 0) / (s.revenue || 1)) * 100)} /></div>
          <div className="between mt"><span className="muted" style={{ fontSize: 13 }}>Margin</span><b>{(((s.profit ?? 0) / (s.revenue || 1)) * 100).toFixed(1)}%</b></div>
        </div>
          <div className="card">
           <h3>Quick actions</h3>
           <div className="row mt">
             <button className="btn sm" onClick={() => navigate('/app/cows')}>Add cow</button>
             <button className="btn sm ghost" onClick={() => navigate('/app/map')}>View map</button>
             <button className="btn sm ghost" onClick={() => navigate('/app/ai')}>Ask AI</button>
             <button className="btn sm ghost" onClick={() => navigate('/app/alerts')}>Alerts</button>
           </div>
         </div>
      </div>
    </div>
  );
}
