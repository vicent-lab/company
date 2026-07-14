import { useRef, useState } from 'react';
import { useFarm } from '../app';
import { PageHeader, Kpi, AnimatedCounter, ChartCard, LineChart, BarChart, DoughnutChart, chartColors, gridColor, tickColor, useToast, useAsync, Skeleton } from '../ui';
import { predictions, analytics, finance, weather, sustainability, notifications, aiAsk } from '../data';
import { Bot, Send, TrendingUp, TrendingDown, CloudSun, Droplets, Wind, Thermometer, Leaf, AlertTriangle, Syringe, HeartPulse, Flame, Package, CreditCard, FileDown, Mic, Sparkles } from 'lucide-react';
import { fmt } from '../format';
import { exportTable, exportPDF, toCSV, download } from '../export';

export function AIAssistant() {
  const { farmId } = useFarm();
  const { push } = useToast();
  const [msgs, setMsgs] = useState<{ q: string; a: string }[]>([{ q: 'Hi! How can I help your farm today?', a: '' }]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const [listening, setListening] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const send = (text?: string) => {
    const q = (text ?? input).trim();
    if (!q) return;
    setInput('');
    setTyping(true);
    aiAsk(q, farmId).then((a) => {
      setMsgs((m) => [...m, { q, a }]);
      setTyping(false);
    }).catch(() => {
      setMsgs((m) => [...m, { q, a: 'Sorry, I could not reach the assistant.' }]);
      setTyping(false);
    });
  };

  const voice = () => {
    const SR = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if (!SR) { push('Voice not supported in this browser'); return; }
    const rec = new SR();
    rec.lang = 'en-US';
    rec.onresult = (e: any) => send(e.results[0][0].transcript);
    rec.onend = () => setListening(false);
    setListening(true); rec.start();
  };

  const quick = ['Which cows need vaccination this week?', "Show today's milk production.", 'Predict next month’s milk output.', 'Recommend feed adjustments.'];

  return (
    <div>
      <PageHeader eyebrow="AI" title="Farm assistant" desc="Ask anything about your herd, milk, feed, or weather." />
      <div className="card" style={{ height: 'calc(100vh - 230px)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 4px' }}>
          {msgs.map((m, i) => (
            <div key={i} className="reveal" style={{ marginBottom: 16 }}>
              {m.a ? <><div className="row" style={{ justifyContent: 'flex-end' }}><div className="card" style={{ background: 'var(--primary)', color: '#fff', maxWidth: '75%', border: 0 }}>{m.q}</div></div>
              <div className="row mt" style={{ marginTop: 10 }}><div className="icon" style={{ width: 32, height: 32, borderRadius: 9, display: 'grid', placeItems: 'center', background: 'var(--primary-soft)', color: 'var(--primary)' }}><Bot size={16} /></div><div className="card" style={{ maxWidth: '80%', border: 0, background: 'var(--surface-2)' }}>{m.a}</div></div></>
                : <div className="row"><div className="icon" style={{ width: 32, height: 32, borderRadius: 9, display: 'grid', placeItems: 'center', background: 'var(--primary-soft)', color: 'var(--primary)' }}><Bot size={16} /></div><div className="card" style={{ border: 0, background: 'var(--surface-2)' }}>{m.q}</div></div>}
            </div>
          ))}
          {typing && <div className="row mt"><div className="icon" style={{ width: 32, height: 32, borderRadius: 9, display: 'grid', placeItems: 'center', background: 'var(--primary-soft)', color: 'var(--primary)' }}><Bot size={16} /></div><div className="card" style={{ border: 0, background: 'var(--surface-2)' }}>Thinking…</div></div>}
          <div ref={endRef} />
        </div>
        <div className="row mt" style={{ flexWrap: 'wrap' }}>
          {quick.map((q) => <button key={q} className="btn ghost sm" onClick={() => send(q)}>{q}</button>)}
        </div>
        <div className="row mt" style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          <input className="input" placeholder="Ask your farm assistant…" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} />
          <button className={`btn ghost sm ${listening ? '' : ''}`} style={listening ? { background: 'var(--danger)', color: '#fff' } : {}} onClick={voice}><Mic size={16} /></button>
          <button className="btn" onClick={() => send()}><Send size={16} /></button>
        </div>
      </div>
    </div>
  );
}

export function Predictions() {
  const { farmId } = useFarm();
  const { data: p } = useAsync(() => predictions(farmId), [farmId]);
  const d = p || ({} as any);
  const gc = chartColors();
  const opts = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: tickColor() }, grid: { color: gridColor() } }, y: { ticks: { color: tickColor() }, grid: { color: gridColor() } } } };
  return (
    <div>
      <PageHeader eyebrow="AI PREDICTIONS" title="Forecasts & risk" desc="Machine-learning estimates from your live data." />
      <div className="four">
        <Kpi icon={<TrendingUp size={18} />} label="Milk next month" value={<AnimatedCounter value={d.milkNext6?.[5] ?? 0} suffix=" L" />} delta="+3%" />
        <Kpi icon={<Package size={18} />} label="Feed needed" value={<AnimatedCounter value={d.feedNeeded ?? 0} suffix=" kg" />} delta="next 30d" tone="down" />
        <Kpi icon={<HeartPulse size={18} />} label="Pregnancy success" value={<AnimatedCounter value={d.pregnancySuccess ?? 0} suffix="%" />} delta="model" />
        <Kpi icon={<AlertTriangle size={18} />} label="Disease risk" value={d.diseaseRisk ?? '—'} delta={`score ${d.diseaseRiskScore ?? 0}`} tone={(d.diseaseRiskScore ?? 0) > 40 ? 'down' : 'up'} />
      </div>
      <div className="split mt">
        <ChartCard title="Milk output — next 6 months" subtitle="Predicted litres">
          <LineChart data={{ labels: ['M1','M2','M3','M4','M5','M6'], datasets: [{ label: 'Predicted', data: d.milkNext6 || [], borderColor: gc[0], backgroundColor: gc[0] + '22', fill: true, tension: 0.4, pointRadius: 3, borderWidth: 3 }] }} options={opts} />
        </ChartCard>
        <ChartCard title="Profit trend" subtitle="Monthly % change">
          <BarChart data={{ labels: ['M1','M2','M3','M4','M5','M6'], datasets: [{ label: 'Δ%', data: d.profitTrend || [], backgroundColor: (d.profitTrend || []).map((v: number) => v >= 0 ? gc[0] : gc[4]), borderRadius: 6 }] }} options={opts} />
        </ChartCard>
      </div>
      <div className="two mt">
        <div className="card"><h3>Inventory shortage risk</h3><p className="mt">Model predicts <b>{d.inventoryShortage ?? '—'}</b> may run low within 10 days. Pre-order recommended.</p><div className="progress mt"><span style={{ width: '30%' }} /></div></div>
        <div className="card"><h3>Recommendation</h3><p className="mt">Increase concentrate by 8% for lactating cows and schedule boosters. Expected +2.4% yield.</p></div>
      </div>
    </div>
  );
}

export function Analytics() {
  const { farmId } = useFarm();
  const { data: a } = useAsync(() => analytics(farmId), [farmId]);
  const d = a || ({} as any);
  const gc = chartColors();
  const breedPerf = d.breedPerf || [];
  return (
    <div>
      <PageHeader eyebrow="ANALYTICS" title="Rich analytics" desc="Performance across herd, breeds, and finances." />
      <div className="two">
        <div className="card"><h3>Best-performing cows</h3>
          <div className="table-wrap mt" style={{ border: 0, boxShadow: 'none' }}><table><thead><tr><th>Cow</th><th>Breed</th><th>L/day</th></tr></thead><tbody>{(d.best || []).map((c: any) => <tr key={c.cowCode}><td>{c.name}</td><td>{c.breed}</td><td>{fmt.liters(c.avgDailyMilk)}</td></tr>)}</tbody></table></div>
        </div>
        <div className="card"><h3>Lowest-producing cows</h3>
          <div className="table-wrap mt" style={{ border: 0, boxShadow: 'none' }}><table><thead><tr><th>Cow</th><th>Breed</th><th>L/day</th></tr></thead><tbody>{(d.worst || []).map((c: any) => <tr key={c.cowCode}><td>{c.name}</td><td>{c.breed}</td><td>{fmt.liters(c.avgDailyMilk)}</td></tr>)}</tbody></table></div>
        </div>
      </div>
      <div className="split mt">
        <ChartCard title="Top milk breeds" subtitle="Avg L/day by breed">
          <BarChart data={{ labels: breedPerf.map((b: any) => b.breed), datasets: [{ label: 'Avg L/day', data: breedPerf.map((b: any) => b.avg), backgroundColor: gc[0], borderRadius: 6 }] }}
            options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: tickColor() }, grid: { color: gridColor() } }, y: { ticks: { color: tickColor() }, grid: { color: gridColor() } } } }} />
        </ChartCard>
        <ChartCard title="Disease trend" subtitle="Cases by month">
          <LineChart data={{ labels: (d.diseaseTrend || []).map((x: any) => x.month), datasets: [{ label: 'Cases', data: (d.diseaseTrend || []).map((x: any) => x.cases), borderColor: gc[4], backgroundColor: gc[4] + '22', fill: true, tension: 0.4, pointRadius: 0, borderWidth: 2 }] }}
            options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: tickColor() }, grid: { color: gridColor() } }, y: { ticks: { color: tickColor() }, grid: { color: gridColor() } } } }} />
        </ChartCard>
      </div>
      <div className="three mt">
        <Kpi icon={<Sparkles size={18} />} label="Feed efficiency" value={d.feedEfficiency ?? '1.42'} delta="kg feed / L" />
        <Kpi icon={<TrendingUp size={18} />} label="Financial perf" value={<AnimatedCounter value={d.financialPerf ?? 0} suffix="%" />} delta="vs target" />
        <Kpi icon={<TrendingDown size={18} />} label="Cull rate" value="2.1%" delta="healthy" />
      </div>
    </div>
  );
}

export function Financial() {
  const { farmId } = useFarm();
  const { push } = useToast();
  const { data: f } = useAsync(() => finance(farmId), [farmId]);
  const d = f || ({} as any);
  const gc = chartColors();
  const monthLabels = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const sum = (a: number[] = []) => a.reduce((x, y) => x + y, 0);
  const doExport = (kind: string) => {
    const rows = monthLabels.map((m, i) => [m, (d.cashFlow?.[i] ?? 0) >= 0 ? 'Profit' : 'Loss', Math.abs(d.cashFlow?.[i] ?? 0)]);
    if (kind === 'csv') download('finance.csv', toCSV(['Month','Type','Amount'], rows), 'text/csv');
    else if (kind === 'excel') exportTable('finance.xls', 'Financial Summary', ['Month','Type','Amount'], rows);
    else exportPDF('Financial Summary', ['Month','Type','Amount'], rows);
    push(`Exported financial report (${kind.toUpperCase()})`, <FileDown size={15} />);
  };
  return (
    <div>
      <PageHeader eyebrow="FINANCE" title="Financial dashboard" desc="Income, expenses, profit, and cash flow."
        actions={<><button className="btn ghost sm" onClick={() => doExport('csv')}>CSV</button><button className="btn ghost sm" onClick={() => doExport('excel')}>Excel</button><button className="btn sm" onClick={() => doExport('pdf')}>PDF</button></>} />
      <div className="four">
        <Kpi icon={<TrendingUp size={18} />} label="Total income" value={<AnimatedCounter value={d.incomeTotal ?? 0} prefix="$" />} delta="+6.4%" />
        <Kpi icon={<CreditCard size={18} />} label="Total expenses" value={<AnimatedCounter value={d.expenseTotal ?? 0} prefix="$" />} delta="on track" tone="down" />
        <Kpi icon={<Sparkles size={18} />} label="Net profit" value={<AnimatedCounter value={sum(d.cashFlow)} prefix="$" />} delta="healthy" />
        <Kpi icon={<AlertTriangle size={18} />} label="Outstanding" value={<AnimatedCounter value={d.outstanding ?? 0} prefix="$" />} delta="invoices" tone="down" />
      </div>
      <div className="split mt">
        <ChartCard title="Cash flow" subtitle="Profit per month">
          <BarChart data={{ labels: monthLabels, datasets: [{ label: 'Net', data: d.cashFlow || [], backgroundColor: (d.cashFlow || []).map((v: number) => v >= 0 ? gc[0] : gc[4]), borderRadius: 6 }] }}
            options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: tickColor() }, grid: { color: gridColor() } }, y: { ticks: { color: tickColor() }, grid: { color: gridColor() } } } }} />
        </ChartCard>
        <ChartCard title="Expense breakdown">
          <DoughnutChart data={{ labels: (d.categories || []).map((c: any) => c.name), datasets: [{ data: (d.categories || []).map((c: any) => c.value), backgroundColor: chartColors((d.categories || []).length), borderWidth: 0 }] }}
            options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: tickColor(), boxWidth: 12 } } } }} />
        </ChartCard>
      </div>
      <div className="two mt">
        <ChartCard title="Sales trend" subtitle="Orders per month">
          <LineChart data={{ labels: monthLabels, datasets: [{ label: 'Orders', data: d.salesTrend || [], borderColor: gc[2], backgroundColor: gc[2] + '22', fill: true, tension: 0.4, pointRadius: 0, borderWidth: 2 }] }}
            options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: tickColor() }, grid: { color: gridColor() } }, y: { ticks: { color: tickColor() }, grid: { color: gridColor() } } } }} />
        </ChartCard>
        <div className="card"><h3>Outstanding payments</h3>
          <div className="between mt"><span>Supplier #INV-228</span><b>$4,200</b></div>
          <div className="between mt"><span>Vet services</span><b>$1,800</b></div>
          <button className="btn sm mt" onClick={() => push('Reminder sent')}>Send reminder</button>
        </div>
      </div>
    </div>
  );
}

export function Weather() {
  const { data: w } = useAsync(() => weather(), []);
  const d = w || ({} as any);
  return (
    <div>
      <PageHeader eyebrow="WEATHER" title="Weather dashboard" desc="Conditions and grazing recommendations." />
      <div className="four">
        <Kpi icon={<Thermometer size={18} />} label="Temperature" value={`${d.temp ?? 0}°C`} />
        <Kpi icon={<Droplets size={18} />} label="Humidity" value={`${d.humidity ?? 0}%`} />
        <Kpi icon={<Wind size={18} />} label="Wind speed" value={`${d.wind ?? 0} km/h`} />
        <Kpi icon={<CloudSun size={18} />} label="Condition" value={d.condition ?? '—'} />
      </div>
      <div className="split mt">
        <ChartCard title="Rain forecast" subtitle="Chance of rain %">
          <BarChart data={{ labels: d.forecast || [], datasets: [{ label: 'Rain %', data: d.rainChance || [], backgroundColor: chartColors(1)[0], borderRadius: 6 }] }}
            options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: tickColor() }, grid: { color: gridColor() } }, y: { ticks: { color: tickColor() }, grid: { color: gridColor() } } } }} />
        </ChartCard>
        <div className="card" style={{ background: 'var(--primary-soft)', borderColor: 'transparent' }}>
          <h3>Grazing recommendation</h3>
          <p className="mt" style={{ fontSize: 15 }}>{d.recommendation ?? ''}</p>
          <div className="row mt"><span className="pill info">Optimal: 6–9am</span><span className="pill warn">Avoid: 2–4pm</span></div>
        </div>
      </div>
    </div>
  );
}

export function Sustainability() {
  const { farmId } = useFarm();
  const { data: s } = useAsync(() => sustainability(farmId), [farmId]);
  const d = s || ({} as any);
  const gc = chartColors();
  return (
    <div>
      <PageHeader eyebrow="SUSTAINABILITY" title="Sustainability dashboard" desc="Track your environmental footprint." />
      <div className="four">
        <Kpi icon={<Droplets size={18} />} label="Water usage" value={<AnimatedCounter value={d.waterUsage ?? 0} suffix=" L" />} delta="this month" />
        <Kpi icon={<Leaf size={18} />} label="Feed efficiency" value={d.feedEfficiency ?? '1.42'} delta="kg feed/L" />
        <Kpi icon={<CloudSun size={18} />} label="Carbon est." value={<AnimatedCounter value={d.carbon ?? 0} suffix=" kg" />} delta="-4% vs last" />
        <Kpi icon={<Flame size={18} />} label="Renewable" value={<AnimatedCounter value={d.renewable ?? 0} suffix="%" />} delta="solar" />
      </div>
      <div className="split mt">
        <ChartCard title="Carbon footprint trend" subtitle="kg CO₂e / month">
          <LineChart data={{ labels: ['Jan','Feb','Mar','Apr','May','Jun'], datasets: [{ label: 'Carbon', data: d.trend || [], borderColor: gc[4], backgroundColor: gc[4] + '22', fill: true, tension: 0.4, pointRadius: 0, borderWidth: 2 }] }}
            options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: tickColor() }, grid: { color: gridColor() } }, y: { ticks: { color: tickColor() }, grid: { color: gridColor() } } } }} />
        </ChartCard>
        <div className="card"><h3>Manure & outputs</h3>
          <div className="between mt"><span>Manure produced</span><b>{fmt.kg(d.manure ?? 0)}</b></div>
          <div className="between mt"><span>Renewable share</span><b>{d.renewable ?? 0}%</b></div>
          <div className="between mt"><span>Water / cow / day</span><b>{fmt.num(Math.round((d.waterUsage ?? 0) / 100))} L</b></div>
        </div>
      </div>
    </div>
  );
}

export function Alerts() {
  const { push } = useToast();
  const { data: list } = useAsync(() => notifications(), []);
  const items = list || [];
  const toneIcon = (t: string) => t === 'danger' ? <AlertTriangle size={16} color="var(--danger)" /> : t === 'warn' ? <Syringe size={16} color="var(--warn)" /> : <HeartPulse size={16} color="var(--info)" />;
  return (
    <div>
      <PageHeader eyebrow="SMART NOTIFICATIONS" title="Alerts & reminders" desc="Automated alerts across your farm."
        actions={<button className="btn sm" onClick={() => push('All marked read')}>Mark all read</button>} />
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {items.map((n: any) => (
          <div key={n.id} className="between" style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
            <div className="row"><span style={{ color: n.tone === 'danger' ? 'var(--danger)' : n.tone === 'warn' ? 'var(--warn)' : 'var(--info)', display: 'grid', placeItems: 'center' }}>{toneIcon(n.tone)}</span>
              <div><b>{n.title}</b><div className="muted" style={{ fontSize: 13 }}>{n.body}</div></div></div>
            <div className="row"><span className="muted" style={{ fontSize: 12 }}>{n.time}</span><span className={`pill ${n.tone}`}>{n.type}</span></div>
          </div>
        ))}
        {!items.length && <div className="muted" style={{ padding: 20 }}>No notifications.</div>}
      </div>
    </div>
  );
}
