import { useState } from 'react';
import { useFarm } from '../app';
import { useHashRoute } from '../router';
import { CowPhoto, QrCode, PageHeader, Kpi, AnimatedCounter, ChartCard, LineChart, chartColors, gridColor, tickColor, Modal, Progress, useToast, useAsync, Skeleton } from '../ui';
import { listCows, getCow, createCow } from '../data';
import { Beef, Milk, HeartPulse, Syringe, Search, ArrowLeft, Download, Printer, QrCode as QrIc, Plus } from 'lucide-react';
import { fmt } from '../format';
import { BREEDS } from '../mock';

const EMPTY = { name: '', breed: BREEDS[0], earTag: '', weightKg: '', isMilking: true, isPregnant: false };

export function Herd() {
  const { farmId } = useFarm();
  const [, navigate] = useHashRoute();
  const { push } = useToast();
  const [q, setQ] = useState('');
  const { data: cows, loading } = useAsync(() => listCows(farmId, { search: q }), [farmId, q]);
  const list = cows || [];
  const milking = list.filter((c) => c.isMilking).length;
  const pregnant = list.filter((c) => c.isPregnant).length;
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.earTag.trim()) { push('Name and ear tag are required'); return; }
    await createCow(farmId, {
      name: form.name.trim(),
      breed: form.breed,
      ear_tag: form.earTag.trim(),
      weight_kg: Number(form.weightKg) || 0,
      is_milking: form.isMilking,
      is_pregnant: form.isPregnant,
      gender: 'female',
      health: 'healthy',
    });
    push('Cow added');
    setForm(EMPTY);
    setOpen(false);
  };

  return (
    <div>
      <PageHeader eyebrow="HERD" title="Your cows" desc={`${list.length} registered · ${milking} milking`}
        actions={<button className="btn sm" onClick={() => setOpen(true)}><Plus size={16} /> Add cow</button>} />
      <div className="three mb">
        <Kpi icon={<Beef size={18} />} label="Total" value={list.length} loading={loading} />
        <Kpi icon={<Milk size={18} />} label="Milking" value={milking} />
        <Kpi icon={<HeartPulse size={18} />} label="Pregnant" value={pregnant} />
      </div>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="between" style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)' }}>
          <h3>{loading ? 'Loading…' : `${list.length} cows`}</h3>
          <input className="input" style={{ maxWidth: 280 }} placeholder="Search by code, name, breed" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="table-wrap" style={{ border: 0, boxShadow: 'none' }}>
          <table>
            <thead><tr><th>Cow</th><th>Code</th><th>Ear tag</th><th>Breed</th><th>Health</th><th>Milking</th><th>Milk/day</th></tr></thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id} onClick={() => navigate('/app/cow/' + c.id)}>
                  <td><div className="row"><CowPhoto name={c.name} color={c.color} size={36} /><div><b>{c.name}</b><div className="muted" style={{ fontSize: 12 }}>{c.gender}</div></div></div></td>
                  <td>{c.cowCode}</td><td>{c.earTag}</td><td>{c.breed}</td>
                  <td><span className={`pill ${c.health}`}>{c.health.replace('_', ' ')}</span></td>
                  <td>{c.isMilking ? 'Yes' : 'No'}</td>
                  <td>{c.avgDailyMilk ? fmt.liters(c.avgDailyMilk) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {open && <Modal title="Add new cow" onClose={() => setOpen(false)}>
        <form onSubmit={submit}>
          <div className="field"><label>Name</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
          <div className="field"><label>Breed</label><select className="select" value={form.breed} onChange={(e) => setForm({ ...form, breed: e.target.value })}>{BREEDS.map((b) => <option key={b} value={b}>{b}</option>)}</select></div>
          <div className="field"><label>Ear tag</label><input className="input" value={form.earTag} onChange={(e) => setForm({ ...form, earTag: e.target.value })} required /></div>
          <div className="field"><label>Weight (kg)</label><input className="input" type="number" value={form.weightKg} onChange={(e) => setForm({ ...form, weightKg: e.target.value })} /></div>
          <div className="row mt"><label style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={form.isMilking} onChange={(e) => setForm({ ...form, isMilking: e.target.checked })} /> Milking</label><label style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={form.isPregnant} onChange={(e) => setForm({ ...form, isPregnant: e.target.checked })} /> Pregnant</label></div>
          <button className="btn mt" style={{ marginTop: 16 }} type="submit">Save cow</button>
        </form>
      </Modal>}
    </div>
  );
}

export function CowProfile({ id }: { id: string }) {
  const [, navigate] = useHashRoute();
  const { push } = useToast();
  const { data: cow, loading } = useAsync(() => getCow(id), [id]);
  const [qr, setQr] = useState(false);
  if (loading) return <div className="card"><Skeleton h={200} /></div>;
  if (!cow) return <div className="card">Cow not found.</div>;
  const milkTotal = cow.milk.reduce((s, m) => s + m.morning + m.afternoon + m.evening, 0);
  const gc = chartColors();
  const opts = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: tickColor(), maxTicksLimit: 6 }, grid: { color: gridColor() } }, y: { ticks: { color: tickColor() }, grid: { color: gridColor() } } } };

  return (
    <div>
      <button className="btn ghost sm mb" onClick={() => navigate('/app/cows')}><ArrowLeft size={15} /> Back to herd</button>

      <div className="card reveal" style={{ display: 'flex', gap: 22, flexWrap: 'wrap', alignItems: 'center' }}>
        <CowPhoto name={cow.name} color={cow.color} size={92} />
        <div style={{ flex: 1, minWidth: 220 }}>
          <div className="eyebrow">{cow.cowCode} · {cow.earTag}</div>
          <h1 style={{ fontSize: 30 }}>{cow.name}</h1>
          <div className="row mt">
            <span className={`pill ${cow.health}`}>{cow.health.replace('_', ' ')}</span>
            {cow.isMilking && <span className="pill info">Milking</span>}
            {cow.isPregnant && <span className="pill warn">Pregnant</span>}
            <span className="tag">{cow.breed}</span>
          </div>
        </div>
        <div className="row">
          <button className="btn ghost sm" onClick={() => setQr(true)}><QrIc size={15} /> QR</button>
          <button className="btn ghost sm" onClick={() => push('Profile exported', <Download size={15} />)}><Download size={15} /> Export</button>
          <button className="btn ghost sm" onClick={() => window.print()}><Printer size={15} /> Print</button>
        </div>
      </div>

      <div className="four mt">
        <Kpi icon={<Milk size={18} />} label="Avg milk / day" value={fmt.liters(cow.avgDailyMilk)} />
        <Kpi icon={<Beef size={18} />} label="Weight" value={fmt.kg(cow.weightKg)} />
        <Kpi icon={<Syringe size={18} />} label="Vaccinations" value={`${(cow.vaccinations || []).filter((v) => v.done).length}/${(cow.vaccinations || []).length}`} />
        <Kpi icon={<HeartPulse size={18} />} label="Productivity" value={<AnimatedCounter value={cow.productivityScore} suffix="%" />} />
      </div>

      <div className="split mt">
        <ChartCard title="Milk production" subtitle="Last 30 days (L/day)">
          {cow.milk.length ? <LineChart data={{ labels: cow.milk.map((m) => m.date.slice(5)), datasets: [{ label: 'Litres', data: cow.milk.map((m) => +(m.morning + m.afternoon + m.evening).toFixed(1)), borderColor: gc[0], backgroundColor: gc[0] + '22', fill: true, tension: 0.4, pointRadius: 0, borderWidth: 2 }] }} options={opts} /> : <p className="muted">No milk records yet.</p>}
        </ChartCard>
        <ChartCard title="Weight growth" subtitle="kg over time">
          {(cow.weights && cow.weights.length) ? <LineChart data={{ labels: cow.weights.map((w) => w.date.slice(5)), datasets: [{ label: 'kg', data: cow.weights.map((w) => w.kg), borderColor: gc[1], backgroundColor: gc[1] + '22', fill: true, tension: 0.4, pointRadius: 0, borderWidth: 2 }] }} options={opts} /> : <p className="muted">No weight history.</p>}
        </ChartCard>
      </div>

      <div className="two mt">
        <div className="card">
          <h3>Health history</h3>
          {(cow.treatments && cow.treatments.length) ? cow.treatments.map((t) => (
            <div key={t.id} className="between mt" style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <div><b>{t.disease}</b><div className="muted" style={{ fontSize: 12 }}>{t.diagnosis} · {fmt.date(t.date)}</div></div>
              <span className={`pill ${t.status === 'Active' ? 'danger' : 'warn'}`}>{t.status}</span>
            </div>
          )) : <p className="muted mt">No health issues recorded. 🎉</p>}
          <h3 className="mt">Vaccination schedule</h3>
          {(cow.vaccinations || []).map((v) => (
            <div key={v.id} className="between mt" style={{ fontSize: 14 }}>
              <span><Syringe size={14} style={{ verticalAlign: -2 }} /> {v.name}</span>
              <span className="row">{fmt.shortDate(v.due)}{v.done ? <span className="pill healthy">done</span> : <span className="pill warn">due</span>}</span>
            </div>
          ))}
        </div>

        <div className="card">
          <h3>Pregnancy history</h3>
          {(cow.breedings && cow.breedings.length) ? cow.breedings.map((b) => (
            <div key={b.id} className="between mt" style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <div><b>{b.method}</b> · {fmt.date(b.date)}<div className="muted" style={{ fontSize: 12 }}>Exp. calving {fmt.date(b.expectedCalving)}</div></div>
              <span className={`pill ${b.result === 'Pregnant' ? 'warn' : 'muted'}`}>{b.result}</span>
            </div>
          )) : <p className="muted mt">No breeding records.</p>}
          <h3 className="mt">Family tree</h3>
          <div className="row mt">
            <div className="card" style={{ flex: 1, textAlign: 'center', padding: 12 }}><div className="muted" style={{ fontSize: 12 }}>Mother</div>{cow.motherId ? cow.motherId : 'Unknown'}</div>
            <div className="card" style={{ flex: 1, textAlign: 'center', padding: 12 }}><div className="muted" style={{ fontSize: 12 }}>Father</div>{cow.fatherId ? cow.fatherId : 'Unknown'}</div>
          </div>
          <div className="card mt" style={{ textAlign: 'center', padding: 12 }}><div className="muted" style={{ fontSize: 12 }}>Offspring</div>None yet</div>
        </div>
      </div>

      <div className="card mt">
        <h3>Feeding records</h3>
        <div className="table-wrap mt" style={{ border: 0, boxShadow: 'none' }}>
          <table><thead><tr><th>Date</th><th>Feed</th><th>Amount</th></tr></thead>
            <tbody>{(cow.feed || []).map((f) => <tr key={f.id}><td>{fmt.date(f.date)}</td><td>{f.feed}</td><td>{fmt.kg(f.kg)}</td></tr>)}</tbody></table>
        </div>
      </div>

      {qr && <Modal title={`QR — ${cow.cowCode}`} onClose={() => setQr(false)}>
        <div className="row" style={{ justifyContent: 'center', gap: 20 }}>
          <QrCode seed={cow.earTag + cow.id} size={180} />
          <div style={{ fontSize: 14 }}>
            <p><b>Scan to view:</b></p>
            <ul className="mt" style={{ display: 'grid', gap: 6 }}>
              <li>Profile & photo</li><li>Milk records</li><li>Vaccination history</li><li>Health records</li><li>Breeding info</li>
            </ul>
          </div>
        </div>
      </Modal>}
    </div>
  );
}
