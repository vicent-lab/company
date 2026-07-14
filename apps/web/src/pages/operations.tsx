import { useMemo, useState } from 'react';
import { useFarm } from '../app';
import { useTheme } from '../theme';
import { useHashRoute } from '../router';
import { CowPhoto, QrCode, PageHeader, Kpi, AnimatedCounter, Modal, Progress, useToast, useAsync } from '../ui';
import { ALL_COWS, GALLERY, BADGES, LEADERBOARD, BARNS } from '../mock';
import { listCows, gallery, mapNodes } from '../data';
import { MapPin, Droplets, Tractor, Scissors, Syringe, AlertTriangle, Wheat, Image as ImgIc, Trophy, Flame, Crown, Search, Filter, Download } from 'lucide-react';
import { fmt } from '../format';

const MAP_NODES = [
  { id: 'barnA', label: 'Barn A — Milking', x: 24, y: 30, icon: <Tractor size={16} />, tone: 'var(--primary)', detail: 'Capacity 60 · 38 cows · 4 milking stalls' },
  { id: 'barnB', label: 'Barn B — Dry', x: 62, y: 22, icon: <Tractor size={16} />, tone: 'var(--primary)', detail: 'Capacity 40 · 22 dry cows' },
  { id: 'graze1', label: 'North Pasture', x: 40, y: 60, icon: <Wheat size={16} />, tone: 'var(--accent)', detail: '12 ha · rotational grazing · good cover' },
  { id: 'graze2', label: 'South Pasture', x: 78, y: 70, icon: <Wheat size={16} />, tone: 'var(--accent)', detail: '9 ha · rest period until next week' },
  { id: 'water1', label: 'Water Point 1', x: 33, y: 44, icon: <Droplets size={16} />, tone: 'var(--info)', detail: 'Flow 12 L/min · temp 14°C · clean' },
  { id: 'water2', label: 'Water Point 2', x: 70, y: 50, icon: <Droplets size={16} />, tone: 'var(--info)', detail: 'Flow 9 L/min · monitor usage' },
  { id: 'milk', label: 'Milking Station', x: 18, y: 22, icon: <Droplets size={16} />, tone: 'var(--primary)', detail: 'Parlour 2×8 · 3 sessions/day' },
  { id: 'iso', label: 'Isolation', x: 14, y: 74, icon: <AlertTriangle size={16} />, tone: 'var(--danger)', detail: '2 sick cows under treatment' },
  { id: 'feed', label: 'Feed Storage', x: 88, y: 38, icon: <Wheat size={16} />, tone: 'var(--warn)', detail: 'Silage 2,400kg · Conc. 380kg (low)' },
];

export function FarmMap() {
  const { theme } = useTheme();
  const { farmId } = useFarm();
  const [, navigate] = useHashRoute();
  const [active, setActive] = useState<string | null>(null);
  const { data: mapData } = useAsync(() => mapNodes(farmId), [farmId]);
  const barns = (mapData?.barns || []).map((b: any) => ({ id: b.id, name: b.name, cows: b.cows, capacity: b.capacity }));
  const NODES = MAP_NODES.map((n) => {
    const barn = barns.find((b: any) => n.label.startsWith(b.name.split(' ')[0]) || n.label.includes('Milking') && b.name.includes('Milking'));
    if (n.id === 'barnA' && barns[0]) return { ...n, detail: `Capacity ${barns[0].capacity} · ${barns[0].cows} cows` };
    if (n.id === 'barnB' && barns[1]) return { ...n, detail: `Capacity ${barns[1].capacity} · ${barns[1].cows} cows` };
    return n;
  });
  const node = NODES.find((n) => n.id === active);

  return (
    <div>
      <PageHeader eyebrow="OPERATIONS" title="Interactive farm map"
        desc="Tap any location to view live details." />
      <div className={`map ${theme === 'dark' ? 'dark' : ''}`}>
        {NODES.map((n) => (
          <button key={n.id} className={`node ${active === n.id ? 'active' : ''}`} style={{ left: n.x + '%', top: n.y + '%', borderColor: n.tone }}
            onClick={() => setActive(n.id)}>
            <span style={{ color: n.tone, display: 'grid', placeItems: 'center' }}>{n.icon}</span> {n.label}
          </button>
        ))}
      </div>
      <div className="three mt">
        {NODES.slice(0, 3).map((n) => (
          <div className="card" key={n.id} onClick={() => setActive(n.id)} style={{ cursor: 'pointer' }}>
            <div className="row">{n.icon && <span style={{ color: n.tone }}>{n.icon}</span>}<b>{n.label}</b></div>
            <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>{n.detail}</p>
          </div>
        ))}
      </div>
      {node && <Modal title={node.label} onClose={() => setActive(null)}>
        <p style={{ fontSize: 15 }}>{node.detail}</p>
        <div className="row mt">
          <button className="btn sm" onClick={() => { setActive(null); navigate('/app/cows'); }}>View cows here</button>
          <button className="btn ghost sm" onClick={() => setActive(null)}>Close</button>
        </div>
      </Modal>}
    </div>
  );
}

export function Gallery({ id }: { id?: string }) {
  const { farmId } = useFarm();
  const { data: categories } = useAsync(() => gallery(farmId), [farmId]);
  const cats = categories || GALLERY;
  const cat = id ? cats.find((g: any) => g.id === id) || cats[0] : cats[0];
  const cows = useMemo(() => ALL_COWS.filter((c) => c.farmId === farmId).slice(0, 12), [farmId]);
  const tiles = cat.id === 'cows' ? cows : Array.from({ length: cat.count }, (_, i) => ({ name: `${cat.label} ${i + 1}`, color: ['#2f7d54', '#8a6240', '#b5651d', '#2b2b2b'][i % 4] }));

  return (
    <div>
      <PageHeader eyebrow="GALLERY" title="Photo gallery" desc="Every cow, calf, employee, and facility." />
      <div className="row mb">
        {cats.map((g: any) => <button key={g.id} className={`btn sm ${cat.id === g.id ? '' : 'ghost'}`} onClick={() => location.hash = '#/app/gallery/' + g.id}>{g.label} ({g.count})</button>)}
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px,1fr))' }}>
        {tiles.map((t: any, i) => (
          <div key={i} className="card reveal" style={{ padding: 10, textAlign: 'center' }}>
            <CowPhoto name={t.name} color={t.color} size={120} />
            <div className="mt" style={{ fontSize: 13, fontWeight: 600 }}>{t.name}</div>
            {t.earTag && <div className="muted" style={{ fontSize: 11 }}>{t.earTag}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

export function AdvancedSearch({ initial = '' }: { initial?: string }) {
  const { farmId } = useFarm();
  const [f, setF] = useState({ q: initial, breed: '', health: '', pregnant: '', age: '', minMilk: '' });
  const { data: cows } = useAsync(() => listCows(farmId, { search: f.q, breed: f.breed, health: f.health, pregnant: f.pregnant }), [farmId, f.q, f.breed, f.health, f.pregnant]);
  const res = (cows || []).filter((c) => !f.minMilk || c.avgDailyMilk >= +f.minMilk);

  return (
    <div>
      <PageHeader eyebrow="SEARCH" title="Advanced search" desc={`${res.length} cows match`} />
      <div className="card mb" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px,1fr))', gap: 12 }}>
        <input className="input" placeholder="Cow ID / name / tag" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
        <select className="select" value={f.breed} onChange={(e) => setF({ ...f, breed: e.target.value })}><option value="">All breeds</option>{['Holstein','Jersey','Guernsey','Ayrshire','Brown Swiss','Fleckvieh'].map((b) => <option key={b}>{b}</option>)}</select>
        <select className="select" value={f.health} onChange={(e) => setF({ ...f, health: e.target.value })}><option value="">Any health</option><option value="healthy">Healthy</option><option value="sick">Sick</option><option value="under_treatment">Under treatment</option></select>
        <select className="select" value={f.pregnant} onChange={(e) => setF({ ...f, pregnant: e.target.value })}><option value="">Any pregnancy</option><option value="yes">Pregnant</option><option value="no">Open</option></select>
        <input className="input" type="number" placeholder="Min milk L/day" value={f.minMilk} onChange={(e) => setF({ ...f, minMilk: e.target.value })} />
      </div>
      <div className="table-wrap">
        <table><thead><tr><th>Cow</th><th>Code</th><th>Breed</th><th>Health</th><th>Pregnant</th><th>Milk/day</th></tr></thead>
          <tbody>{res.map((c) => <tr key={c.id}><td><div className="row"><CowPhoto name={c.name} color={c.color} size={32} /> {c.name}</div></td><td>{c.cowCode}</td><td>{c.breed}</td><td><span className={`pill ${c.health}`}>{c.health.replace('_', ' ')}</span></td><td>{c.isPregnant ? 'Yes' : 'No'}</td><td>{c.avgDailyMilk ? fmt.liters(c.avgDailyMilk) : '—'}</td></tr>)}</tbody></table>
      </div>
    </div>
  );
}

export function Gamification() {
  const { push } = useToast();
  return (
    <div>
      <PageHeader eyebrow="ENGAGEMENT" title="Goals & achievements"
        desc="Earn badges and climb the leaderboard." actions={<button className="btn sm" onClick={() => push('Goal saved')}><Trophy size={15} /> New goal</button>} />
      <div className="two">
        <div className="card">
          <h3>Achievement badges</h3>
          <div className="grid mt" style={{ gridTemplateColumns: '1fr 1fr' }}>
            {BADGES.map((b) => (
              <div key={b.id} className="card" style={{ opacity: b.earned ? 1 : 0.5, display: 'flex', gap: 12, alignItems: 'center', padding: 14 }}>
                <div className="icon" style={{ width: 40, height: 40, borderRadius: 10, display: 'grid', placeItems: 'center', background: b.earned ? 'var(--primary-soft)' : 'var(--surface-2)', color: b.earned ? 'var(--primary)' : 'var(--text-soft)' }}><Crown size={18} /></div>
                <div><b>{b.name}</b><div className="muted" style={{ fontSize: 12 }}>{b.desc}</div></div>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <h3>Leaderboard</h3>
          {LEADERBOARD.map((l, i) => (
            <div key={l.name} className={`between mt ${l.you ? '' : ''}`} style={{ padding: '10px 12px', borderRadius: 10, background: l.you ? 'var(--primary-soft)' : 'var(--surface-2)' }}>
              <div className="row"><span className="tag">#{i + 1}</span><b>{l.name}</b><span className="muted" style={{ fontSize: 12 }}>{l.role}</span></div>
              <b>{fmt.num(l.score)}</b>
            </div>
          ))}
        </div>
      </div>
      <div className="three mt">
        <GoalCard icon={<Flame size={18} />} title="Monthly milk target" value={72} />
        <GoalCard icon={<Crown size={18} />} title="Breeding rate" value={64} />
        <GoalCard icon={<Trophy size={18} />} title="Records accuracy" value={91} />
      </div>
    </div>
  );
}
function GoalCard({ icon, title, value }: { icon: React.ReactNode; title: string; value: number }) {
  return <div className="card"><div className="row"><span style={{ color: 'var(--primary)' }}>{icon}</span><b>{title}</b></div><div className="mt"><Progress value={value} /></div><div className="between mt"><span className="muted" style={{ fontSize: 13 }}>{value}%</span><span className="muted" style={{ fontSize: 13 }}>of goal</span></div></div>;
}
