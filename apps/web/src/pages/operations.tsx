import { useMemo, useState, useRef } from 'react';
import { useFarm } from '../app';
import { useTheme } from '../theme';
import { useHashRoute } from '../router';
import { CowPhoto, QrCode, PageHeader, Kpi, AnimatedCounter, Modal, Progress, useToast, useAsync } from '../ui';
import { ALL_COWS, BADGES, LEADERBOARD, BARNS } from '../mock';
import { listCows, gallery, galleryCategories, createGalleryItem, updateGalleryItem, deleteGalleryItem, mapNodes } from '../data';
import { MapPin, Droplets, Tractor, Scissors, Syringe, AlertTriangle, Wheat, Trophy, Flame, Crown, Search, Filter, Download, Plus, Edit3, Eye, Trash2, FolderOpen, Camera } from 'lucide-react';
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
  const { push } = useToast();
  const { data: items } = useAsync(() => gallery(farmId), [farmId]);
  const { data: cats } = useAsync(() => galleryCategories(farmId), [farmId]);
  const all = items || [];
  const categories = cats?.categories || [];
  const itemsByCat = cats?.items || all;
  const cat = id ? categories.find((g: any) => g.id === id) || categories[0] : categories[0];
  const filtered = cat ? (itemsByCat || all).filter((g: any) => g.category === cat.id) : all;
  const [addOpen, setAddOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [form, setForm] = useState({ url: '', category: 'cows', caption: '', isPrimary: false });
  const [cameraOpen, setCameraOpen] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const stopCamera = () => {
    if (stream) { stream.getTracks().forEach((t) => t.stop()); setStream(null); }
  };

  const startCamera = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      setStream(s);
      setCameraOpen(true);
      setTimeout(() => { if (videoRef.current) { videoRef.current.srcObject = s; videoRef.current.play(); } }, 100);
    } catch (err) { push('Camera access denied'); }
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    canvas.width = videoRef.current.videoWidth || 640;
    canvas.height = videoRef.current.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (ctx) { ctx.drawImage(videoRef.current, 0, 0); setForm((f) => ({ ...f, url: canvas.toDataURL('image/jpeg', 0.9) })); }
    stopCamera();
    setCameraOpen(false);
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setForm((f) => ({ ...f, url: reader.result as string }));
    reader.readAsDataURL(file);
  };

  const submitAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.url) return;
    await createGalleryItem(farmId, form);
    push('Photo added');
    setForm({ url: '', category: 'cows', caption: '', isPrimary: false });
    setAddOpen(false);
  };

  const submitEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editItem) return;
    await updateGalleryItem(editItem.id, form);
    push('Photo updated');
    setEditItem(null);
  };

  const openEdit = (item: any) => {
    setEditItem(item);
    setForm({ url: item.url, category: item.category, caption: item.caption || '', isPrimary: item.isPrimary });
  };

  return (
    <div>
      <PageHeader eyebrow="GALLERY" title="Photo gallery" desc="Upload, capture, and manage farm photos."
        actions={<button className="btn sm" onClick={() => setAddOpen(true)}><Plus size={15} /> Add photo</button>} />
      <div className="row mb">
        {categories.map((g: any) => <button key={g.id} className={`btn sm ${cat?.id === g.id ? '' : 'ghost'}`} onClick={() => location.hash = '#/app/gallery/' + g.id}>{g.label} ({g.count})</button>)}
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px,1fr))' }}>
        {(filtered.length ? filtered : all).map((item: any) => (
          <div key={item.id} className="card reveal" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ position: 'relative' }}>
              <img src={item.url} alt={item.caption || 'Gallery'} style={{ width: '100%', height: 160, objectFit: 'cover', display: 'block', background: 'var(--surface-2)' }} />
              <div className="row" style={{ position: 'absolute', top: 8, right: 8, gap: 4 }}>
                <button className="btn ghost sm" style={{ background: 'rgba(255,255,255,0.9)' }} onClick={() => openEdit(item)}><Edit3 size={13} /></button>
                <button className="btn ghost sm" style={{ background: 'rgba(255,255,255,0.9)' }} onClick={() => setPreview(item.url)}><Eye size={13} /></button>
                <button className="btn ghost sm" style={{ background: 'rgba(255,255,255,0.9)' }} onClick={async () => { if (confirm('Delete this photo?')) { await deleteGalleryItem(item.id); push('Photo deleted'); } }}><Trash2 size={13} /></button>
              </div>
            </div>
            <div style={{ padding: '10px 12px' }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{item.caption || item.category}</div>
              {item.caption && <div className="muted" style={{ fontSize: 11 }}>{item.category}</div>}
            </div>
          </div>
        ))}
      </div>

      {addOpen && <Modal title="Add photo" onClose={() => { setAddOpen(false); stopCamera(); }}>
        <form onSubmit={submitAdd}>
          <div className="field"><label>Category</label>
            <select className="select" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              <option value="cows">Cows</option><option value="calves">Calves</option><option value="employees">Employees</option><option value="equipment">Equipment</option><option value="facilities">Facilities</option>
            </select>
          </div>
          <div className="field"><label>Caption</label><input className="input" value={form.caption} onChange={(e) => setForm({ ...form, caption: e.target.value })} placeholder="Describe this photo" /></div>
          <div className="field"><label>Image</label>
            <div className="row" style={{ gap: 8 }}>
              <label className="btn sm" style={{ cursor: 'pointer' }}>
                <FolderOpen size={14} /> Upload from PC
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />
              </label>
              <button type="button" className="btn sm" onClick={startCamera}><Camera size={14} /> Take photo</button>
            </div>
          </div>
          {form.url && <img src={form.url} alt="Preview" style={{ width: '100%', maxHeight: 200, objectFit: 'cover', borderRadius: 8, marginTop: 10, background: 'var(--surface-2)' }} />}
          <div className="row mt" style={{ justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" className="btn ghost" onClick={() => setAddOpen(false)}>Cancel</button>
            <button className="btn" type="submit" disabled={!form.url}>Save photo</button>
          </div>
        </form>
      </Modal>}

      {editItem && <Modal title="Edit photo" onClose={() => setEditItem(null)}>
        <form onSubmit={submitEdit}>
          <div className="field"><label>Category</label>
            <select className="select" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              <option value="cows">Cows</option><option value="calves">Calves</option><option value="employees">Employees</option><option value="equipment">Equipment</option><option value="facilities">Facilities</option>
            </select>
          </div>
          <div className="field"><label>Caption</label><input className="input" value={form.caption} onChange={(e) => setForm({ ...form, caption: e.target.value })} /></div>
          <div className="field"><label>Retake / Replace image</label>
            <div className="row" style={{ gap: 8 }}>
              <label className="btn sm" style={{ cursor: 'pointer' }}>
                <FolderOpen size={14} /> Upload new
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />
              </label>
              <button type="button" className="btn sm" onClick={startCamera}><Camera size={14} /> Retake</button>
            </div>
          </div>
          {form.url && <img src={form.url} alt="Preview" style={{ width: '100%', maxHeight: 200, objectFit: 'cover', borderRadius: 8, marginTop: 10, background: 'var(--surface-2)' }} />}
          <div className="row mt" style={{ justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" className="btn ghost" onClick={() => setEditItem(null)}>Cancel</button>
            <button className="btn" type="submit" disabled={!form.url}>Save changes</button>
          </div>
        </form>
      </Modal>}

      {preview && <Modal title="Photo preview" onClose={() => setPreview(null)}>
        <img src={preview} alt="Preview" style={{ width: '100%', maxHeight: 400, objectFit: 'contain', borderRadius: 8, background: 'var(--surface-2)' }} />
        <div className="row mt" style={{ justifyContent: 'flex-end' }}>
          <button className="btn ghost" onClick={() => setPreview(null)}>Close</button>
        </div>
      </Modal>}

      {cameraOpen && <Modal title="Take photo" onClose={() => { setCameraOpen(false); stopCamera(); }}>
        <video ref={videoRef} style={{ width: '100%', borderRadius: 8, background: '#000' }} playsInline muted />
        <canvas ref={canvasRef} style={{ display: 'none' }} />
        <div className="row mt" style={{ justifyContent: 'center', gap: 10 }}>
          <button type="button" className="btn" onClick={capturePhoto}><Camera size={16} /> Capture</button>
          <button type="button" className="btn ghost" onClick={() => { setCameraOpen(false); stopCamera(); }}>Cancel</button>
        </div>
      </Modal>}
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
