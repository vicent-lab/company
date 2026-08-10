import { useRef, useState } from 'react';
import { useFarm } from '../app';
import { PageHeader, Kpi, AnimatedCounter, ChartCard, LineChart, BarChart, DoughnutChart, chartColors, gridColor, tickColor, useToast, useAsync, Skeleton } from '../ui';
import { predictions, analytics, finance, weather, sustainability, notifications, aiAsk, dashboardSummary, breedPopulation, healthDistribution } from '../data';
import { isLive, apiSend } from '../api';
import { Bot, Send, TrendingUp, TrendingDown, CloudSun, Droplets, Wind, Thermometer, Leaf, AlertTriangle, Syringe, HeartPulse, Flame, Package, CreditCard, FileDown, Mic, Sparkles, Activity } from 'lucide-react';
import { fmt } from '../format';
import { exportTable, exportPDF, exportReport, openReportWindow, toCSV, download } from '../export';

// "write/generate/get me a report" (about the farm, in pdf, etc.) — distinguished from
// a plain question that happens to mention "report" (e.g. "financial report for March")
// by requiring an explicit request-to-produce-something verb alongside it.
const REPORT_TOPIC = /\b(report|pdf)\b/i;
const REPORT_VERB = /\b(write|generate|create|make|produce|build|prepare|compile|give me|get me|send me|download|export|need|want)\b/i;
const isReportRequest = (q: string) => REPORT_TOPIC.test(q) && REPORT_VERB.test(q);

export function AIAssistant() {
  const { farmId } = useFarm();
  const { push } = useToast();
  const [msgs, setMsgs] = useState<{ q: string; a: string }[]>([
    { q: 'Hi! I\'m your DairyOS AI advisor. I know everything about your farm, the project, and dairy management. Ask me anything — from milk production and feed to finance, breeding, sustainability, or how to use any feature.', a: '' }
  ]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const [listening, setListening] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const generateFarmReport = async (target: Window | null): Promise<string> => {
    const [summary, breeds, health, fin] = await Promise.all([
      dashboardSummary(farmId), breedPopulation(farmId), healthDistribution(farmId), finance(farmId),
    ]);
    const sections = [
      {
        heading: 'Herd overview',
        headers: ['Metric', 'Value'],
        rows: [
          ['Total cows', summary.totalCows],
          ['Milking cows', summary.milkingCows],
          ['Pregnant cows', summary.pregnantCows],
          ['Cows needing attention', summary.sickCows],
          ['Milk produced today (L)', summary.milkToday],
          ['Feed stock (kg)', summary.feedStock],
          ['Vaccinations due (next 7 days)', summary.upcomingVacc],
        ],
      },
      { heading: 'Breed population', headers: ['Breed', 'Count'], rows: (breeds || []).map((b: any) => [b.breed, b.count]) },
      { heading: 'Health distribution', headers: ['Health status', 'Count'], rows: (health || []).map((h: any) => [h.health, h.count]) },
      {
        heading: "Financial snapshot (this month)",
        headers: ['Metric', 'Value'],
        rows: [
          ['Revenue', fmt.money(summary.revenue)],
          ['Expenses', fmt.money(summary.expenses)],
          ['Profit', fmt.money(summary.profit)],
          ['Outstanding balance', fmt.money(fin.outstanding || 0)],
        ],
      },
      ...(fin.outstandingList?.length ? [{
        heading: 'Outstanding invoices',
        headers: ['Customer', 'Type', 'Amount', 'Status'],
        rows: fin.outstandingList.map((o: any) => [o.customerName, o.saleType, fmt.money(o.amount), o.status]),
      }] : []),
    ];
    const now = new Date();
    exportReport('DairyOS Farm Report', `Generated ${now.toLocaleDateString()} at ${now.toLocaleTimeString()}`, sections, target);
    return target
      ? "I've put together your farm report — herd overview, breed and health distribution, and this month's finances — and opened it in a new tab. Use your browser's print dialog (Ctrl/Cmd+P → Save as PDF) to save it."
      : "I generated your farm report, but the browser blocked the pop-up — please allow pop-ups for this site and ask me again.";
  };

  const send = (text?: string) => {
    const q = (text ?? input).trim();
    if (!q) return;
    setInput('');
    setTyping(true);
    if (isReportRequest(q)) {
      const w = openReportWindow('Generating your farm report…');
      generateFarmReport(w).then((a) => {
        setMsgs((m) => [...m, { q, a }]);
        setTyping(false);
      }).catch(() => {
        setMsgs((m) => [...m, { q, a: 'Sorry, I could not generate the report right now.' }]);
        setTyping(false);
      });
      return;
    }
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

  const quick = [
    'What is my farm status?',
    'Which cows need vaccination?',
    "Show today's milk production.",
    'Predict next month output.',
    'Recommend feed adjustments.',
    'Which employees are on the team?',
    'Show me gallery images.',
    'How do I use this project?',
    'Give me health advice.',
    'How can I improve profitability?',
    'Write a PDF report about my farm.',
  ];

  return (
    <div>
      <PageHeader eyebrow="AI" title="Farm assistant" desc="Ask me anything about your farm, dairy management, or how to use DairyOS. I give advice on all matters and update automatically from your live data." />
      <div className="card" style={{ height: 'calc(100vh - 230px)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 4px' }}>
          {msgs.map((m, i) => (
            <div key={i} className="reveal" style={{ marginBottom: 16 }}>
              {m.a ? <><div className="row" style={{ justifyContent: 'flex-end' }}><div className="card" style={{ background: 'var(--primary)', color: '#fff', maxWidth: '75%', border: 0 }}>{m.q}</div></div>
              <div className="row mt" style={{ marginTop: 10 }}><div className="icon" style={{ width: 32, height: 32, borderRadius: 9, display: 'grid', placeItems: 'center', background: 'var(--primary-soft)', color: 'var(--primary)' }}><Bot size={16} /></div><div className="card" style={{ maxWidth: '80%', border: 0, background: 'var(--surface-2)', whiteSpace: 'pre-wrap' }}>{m.a}</div></div></>
                : <div className="row"><div className="icon" style={{ width: 32, height: 32, borderRadius: 9, display: 'grid', placeItems: 'center', background: 'var(--primary-soft)', color: 'var(--primary)' }}><Bot size={16} /></div><div className="card" style={{ border: 0, background: 'var(--surface-2)', whiteSpace: 'pre-wrap' }}>{m.q}</div></div>}
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
          <button className="btn ghost sm" style={listening ? { background: 'var(--danger)', color: '#fff' } : {}} onClick={voice}><Mic size={16} /></button>
          <button className="btn" onClick={() => send()}><Send size={16} /></button>
        </div>
      </div>
    </div>
  );
}

export function Predictions() {
  const { farmId } = useFarm();
  const { data: predictionsList } = useAsync(() => predictions(farmId), [farmId]);
  const preds = Array.isArray(predictionsList) ? predictionsList : [];
  const byCategory = Object.fromEntries(preds.map((p: any) => [p.category, p]));

  const milk = byCategory['milk_production'] as any;
  const disease = byCategory['disease_risk'] as any;
  const pregnancy = byCategory['pregnancy_success'] as any;
  const calving = byCategory['calving_date'] as any;
  const feed = byCategory['feed_shortage'] as any;
  const medicine = byCategory['medicine_shortage'] as any;
  const equipment = byCategory['equipment_failure'] as any;
  const cashFlow = byCategory['cash_flow'] as any;
  const profit = byCategory['profit'] as any;
  const productivity = byCategory['cow_productivity'] as any;
  const workload = byCategory['farmer_workload'] as any;
  const stress = byCategory['animal_stress'] as any;
  const water = byCategory['water_requirements'] as any;

  const gc = chartColors();
  const opts = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: tickColor() }, grid: { color: gridColor() } }, y: { ticks: { color: tickColor() }, grid: { color: gridColor() } } } };

  const Pill = ({ children, tone = 'info' }: { children: React.ReactNode; tone?: string }) => (
    <span className={`pill ${tone}`} style={{ fontSize: 11, textTransform: 'capitalize' }}>{children}</span>
  );

  return (
    <div>
      <PageHeader eyebrow="AI PREDICTIONS" title="Forecasts & risk" desc="Machine-learning estimates across 13 farm dimensions from your live data." />

      <div className="four mt">
        <Kpi icon={<TrendingUp size={18} />} label="Milk forecast (7d)" value={<AnimatedCounter value={milk?.forecast?.[6] ?? 0} suffix=" L" />} delta={milk?.trend?.replace('_', ' ') || '—'} tone={milk?.trend === 'increasing' ? 'up' : milk?.trend === 'decreasing' ? 'down' : undefined} />
        <Kpi icon={<HeartPulse size={18} />} label="Disease risk" value={disease?.level ?? '—'} delta={`score ${disease?.score ?? 0}`} tone={(disease?.score ?? 0) > 50 ? 'down' : 'up'} />
        <Kpi icon={<Activity size={18} />} label="Pregnancy success" value={<AnimatedCounter value={pregnancy?.predictedRate ?? 0} suffix="%" />} delta="predicted" />
        <Kpi icon={<AlertTriangle size={18} />} label="Calving soon" value={<AnimatedCounter value={calving?.nextMonthCount ?? 0} suffix="" />} delta="next 30d" tone={(calving?.nextMonthCount ?? 0) > 0 ? 'down' : 'up'} />
      </div>

      <div className="split mt">
        <ChartCard title="Milk output — next 7 days" subtitle="Predicted litres">
          <LineChart data={{ labels: Array.from({ length: 7 }, (_, i) => `D${i + 1}`), datasets: [{ label: 'Predicted', data: milk?.forecast || [], borderColor: gc[0], backgroundColor: gc[0] + '22', fill: true, tension: 0.4, pointRadius: 3, borderWidth: 3 }] }} options={opts} />
        </ChartCard>
        <ChartCard title="Cash flow projection" subtitle="Next 90 days">
          <BarChart data={{ labels: ['30d','60d','90d'], datasets: [{ label: 'Net', data: [cashFlow?.next30Days ?? 0, ((cashFlow?.next30Days ?? 0) * 2), cashFlow?.next90Days ?? 0], backgroundColor: [gc[0], gc[1], gc[2]], borderRadius: 6 }] }} options={opts} />
        </ChartCard>
      </div>

      <div className="three mt">
        <div className="card">
          <h3>Feed shortage risk</h3>
          <p className="mt">Days remaining: <b>{feed?.daysRemaining ?? '—'}</b></p>
          <div className="row mt" style={{ gap: 8 }}><Pill tone={feed?.riskLevel === 'High' ? 'danger' : feed?.riskLevel === 'Moderate' ? 'warn' : 'ok'}>{feed?.riskLevel || '—'}</Pill><span className="muted" style={{ fontSize: 12 }}>{feed?.shortageType}</span></div>
        </div>
        <div className="card">
          <h3>Medicine shortage risk</h3>
          <p className="mt">Critical medicines: <b>{(medicine?.criticalMedicines || []).length}</b></p>
          <div className="row mt" style={{ gap: 8 }}><Pill tone={medicine?.riskLevel === 'High' ? 'danger' : medicine?.riskLevel === 'Moderate' ? 'warn' : 'ok'}>{medicine?.riskLevel || '—'}</Pill></div>
          {(medicine?.criticalMedicines || []).slice(0, 3).map((m: any, i: number) => (
            <div key={i} className="between mt" style={{ alignItems: 'center' }}><span>{m.name}</span><span className="muted" style={{ fontSize: 12 }}>Stock: {m.stock}</span></div>
          ))}
        </div>
        <div className="card">
          <h3>Equipment failure risk</h3>
          <p className="mt">Risk score: <b>{equipment?.riskScore ?? 0}/100</b></p>
          <div className="row mt" style={{ gap: 8 }}><Pill tone={(equipment?.riskScore ?? 0) > 50 ? 'danger' : 'ok'}>{equipment?.atRiskItems?.length ? 'At risk' : 'Low risk'}</Pill></div>
        </div>
      </div>

      <div className="two mt">
        <div className="card">
          <h3>Profit outlook</h3>
          <div className="row mt" style={{ gap: 16 }}>
            <div><div className="muted" style={{ fontSize: 12 }}>Next 30 days</div><b>${(profit?.next30Days ?? 0).toLocaleString()}</b></div>
            <div><div className="muted" style={{ fontSize: 12 }}>Next 90 days</div><b>${(profit?.next90Days ?? 0).toLocaleString()}</b></div>
            <div><div className="muted" style={{ fontSize: 12 }}>Margin</div><b>{profit?.margin ?? 0}%</b></div>
          </div>
          <Pill tone={profit?.trend === 'increasing' ? 'ok' : profit?.trend === 'decreasing' ? 'danger' : 'info'}>{profit?.trend || '—'}</Pill>
        </div>
        <div className="card">
          <h3>Farmer workload</h3>
          <div className="row mt" style={{ gap: 16 }}>
            <div><div className="muted" style={{ fontSize: 12 }}>Pending tasks</div><b>{workload?.pendingTasks ?? 0}</b></div>
            <div><div className="muted" style={{ fontSize: 12 }}>Workload score</div><b>{workload?.score ?? 0}/100</b></div>
          </div>
          <p className="mt muted" style={{ fontSize: 13 }}>{workload?.recommendation}</p>
        </div>
      </div>

      <div className="three mt">
        <div className="card">
          <h3>Animal stress (THI)</h3>
          <p className="mt">Current risk: <b>{stress?.currentRisk ?? '—'}</b></p>
          <div className="row mt" style={{ gap: 8 }}><Pill tone={stress?.currentRisk === 'High' ? 'danger' : stress?.currentRisk === 'Moderate' ? 'warn' : 'ok'}>{stress?.thi ?? '—'} THI</Pill></div>
          <p className="muted mt" style={{ fontSize: 13 }}>{stress?.recommendation}</p>
        </div>
        <div className="card">
          <h3>Water requirements</h3>
          <p className="mt">Daily need: <b>{(water?.dailyNeedLiters ?? 0).toLocaleString()} L</b></p>
          <p className="muted mt" style={{ fontSize: 13 }}>Available: {(water?.currentAvailability ?? 0).toLocaleString()} L</p>
          <div className="row mt" style={{ gap: 8 }}><Pill tone={water?.riskLevel === 'High' ? 'danger' : 'ok'}>{water?.riskLevel || '—'}</Pill></div>
        </div>
        <div className="card">
          <h3>Top cow productivity</h3>
          {(productivity?.topPerformers || []).slice(0, 3).map((c: any, i: number) => (
            <div key={i} className="between mt" style={{ alignItems: 'center' }}><span>{c.cowCode}</span><span className="muted" style={{ fontSize: 12 }}>{c.predictedYield} L/day</span></div>
          ))}
          {(productivity?.topPerformers || []).length === 0 && <p className="muted mt" style={{ fontSize: 13 }}>No data yet.</p>}
        </div>
      </div>

      <div className="card mt">
        <h3>Upcoming calvings (next 60 days)</h3>
        <div className="table-wrap mt" style={{ border: 0, boxShadow: 'none' }}>
          <table>
            <thead><tr><th>Cow</th><th>Expected date</th><th>Days until</th></tr></thead>
            <tbody>{(calving?.upcoming || []).slice(0, 10).map((c: any, i: number) => (
              <tr key={i}><td>{c.cowCode}</td><td>{fmt.shortDate(c.expectedDate)}</td><td>{c.daysUntil}</td></tr>
            ))}</tbody>
          </table>
        </div>
        {(calving?.upcoming || []).length === 0 && <p className="muted mt" style={{ fontSize: 13 }}>No calvings expected in the next 60 days.</p>}
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
          {(d.outstandingList || []).map((o: any) => (
            <div className="between mt" key={o.id} style={{ alignItems: 'center' }}>
              <div>
                <div>{o.customerName}</div>
                <div className="muted" style={{ fontSize: 12 }}>{o.saleType} · {fmt.shortDate(o.saleDate)} · <span className={`pill ${o.status === 'overdue' ? 'danger' : 'warn'}`}>{o.status}</span></div>
              </div>
              <div className="row" style={{ gap: 10 }}>
                <b>{fmt.money(o.amount)}</b>
                <button className="btn ghost sm" disabled={!o.customerEmail}
                  onClick={() => push(o.customerEmail ? `Reminder sent to ${o.customerEmail}` : 'No email on file for this customer')}>
                  Send reminder
                </button>
              </div>
            </div>
          ))}
          {!(d.outstandingList || []).length && <p className="muted mt">No outstanding payments.</p>}
        </div>
      </div>
    </div>
  );
}

export function Weather() {
  const { farmId } = useFarm();
  const { data: w } = useAsync(() => weather(farmId), [farmId]);
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
  const [readIds, setReadIds] = useState<Set<string | number>>(new Set());
  const unreadCount = items.filter((n: any) => !readIds.has(n.id) && !n.read_at).length;

  const markAllRead = async () => {
    const ids = items.map((n: any) => n.id);
    setReadIds(new Set(ids));
    try {
      await Promise.all(ids.map((id: string | number) => apiSend(`/notifications/${id}/read`, 'POST').catch(() => {})));
      push('All notifications marked as read');
    } catch (err: any) { push(err.message); }
  };

  const toneIcon = (t: string) => t === 'danger' ? <AlertTriangle size={16} color="var(--danger)" /> : t === 'warn' ? <Syringe size={16} color="var(--warn)" /> : <HeartPulse size={16} color="var(--info)" />;
  return (
    <div>
      <PageHeader eyebrow="SMART NOTIFICATIONS" title="Alerts & reminders" desc="Automated alerts across your farm."
        actions={<button className="btn sm" onClick={markAllRead} disabled={unreadCount === 0}>Mark all read</button>} />
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {items.map((n: any) => {
          const isRead = readIds.has(n.id) || !!n.read_at;
          return (
            <div key={n.id} className="between" style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', opacity: isRead ? 0.6 : 1, background: isRead ? 'transparent' : 'var(--primary-soft)' }}>
              <div className="row"><span style={{ color: n.tone === 'danger' ? 'var(--danger)' : n.tone === 'warn' ? 'var(--warn)' : 'var(--info)', display: 'grid', placeItems: 'center' }}>{toneIcon(n.tone)}</span>
                <div><b>{n.title}</b><div className="muted" style={{ fontSize: 13 }}>{n.body}</div></div></div>
              <div className="row"><span className="muted" style={{ fontSize: 12 }}>{isRead ? 'Read' : n.time}</span><span className={`pill ${n.tone}`}>{n.type}</span></div>
            </div>
          );
        })}
        {!items.length && <div className="muted" style={{ padding: 20 }}>No notifications.</div>}
      </div>
    </div>
  );
}
