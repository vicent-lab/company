import { useState, useEffect, useRef } from 'react';
import { useFarm } from '../app';
import { useHashRoute } from '../router';
import { CowPhoto, QrCode, PageHeader, Kpi, AnimatedCounter, ChartCard, LineChart, chartColors, gridColor, tickColor, Modal, Progress, useToast, useAsync, Skeleton } from '../ui';
import { listCows, getCow, createCow, updateCow, createTreatment, getPedigree, getOffspring, getAncestors } from '../data';
import { Beef, Milk, HeartPulse, Syringe, Search, ArrowLeft, Download, Printer, QrCode as QrIc, Plus, Trash2, Edit3, Save, CloudSun, Stethoscope, ChevronRight, Camera, FolderOpen } from 'lucide-react';
import { fmt } from '../format';
import { BREEDS } from '../mock';

const EMPTY = { name: '', breed: BREEDS[0], earTag: '', weightKg: '', isMilking: true, isPregnant: false };

const EDIT_EMPTY = { name: '', breed: BREEDS[0], earTag: '', weightKg: '', waterIntakeLiters: '', isMilking: true, isPregnant: false, status: 'active', deathDate: '', deathCause: '', deathNotes: '', photoUrl: '' };

function PedigreeNode({ node, navigate, depth = 0 }: { node: any; navigate: (path: string) => void; depth?: number }) {
  const [expanded, setExpanded] = useState(depth < 1);
  const c = node.cow;
  const genderColor = c.gender === 'male' ? '#3b82f6' : c.gender === 'female' ? '#ec4899' : '#9ca3af';
  const initials = (c.name || c.cowCode || '?').split(' ').map((s: string) => s[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div style={{ marginLeft: depth * 24, marginTop: 6, borderLeft: '2px solid var(--border)', paddingLeft: 10 }}>
      <div className="row" style={{ gap: 8, alignItems: 'center' }}>
        <div
          onClick={() => navigate('/app/cow/' + c.id)}
          style={{
            width: 28, height: 28, borderRadius: '50%', background: genderColor, color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, cursor: 'pointer',
          }}
          title={`${c.name || c.cowCode} (${c.breed})`}
        >
          {initials}
        </div>
        <div style={{ fontSize: 12 }}>
          <span style={{ fontWeight: 600 }}>{c.name || c.cowCode}</span>
          <span className="muted" style={{ marginLeft: 6, fontSize: 11 }}>{c.breed}</span>
          <span className="muted" style={{ marginLeft: 6, fontSize: 10, textTransform: 'uppercase' }}>{c.gender}</span>
        </div>
      </div>
      {node.mother && expanded && <PedigreeNode node={node.mother} navigate={navigate} depth={depth + 1} />}
      {node.father && expanded && <PedigreeNode node={node.father} navigate={navigate} depth={depth + 1} />}
      {node.offspring?.length > 0 && expanded && (
        <div style={{ marginLeft: depth * 24, marginTop: 4 }}>
          {node.offspring.map((o: any) => (
            <div key={o.id} className="row" style={{ gap: 8, alignItems: 'center', marginTop: 4, fontSize: 12 }}
              onClick={() => navigate('/app/cow/' + o.id)}>
              <div style={{ width: 20, height: 20, borderRadius: '50%', background: o.gender === 'male' ? '#3b82f6' : o.gender === 'female' ? '#ec4899' : '#9ca3af', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, cursor: 'pointer' }}>
                {(o.name || o.cowCode || '?').split(' ').map((s: string) => s[0]).slice(0, 2).join('').toUpperCase()}
              </div>
              <span>{o.name || o.cowCode}</span>
              <span className="muted" style={{ fontSize: 10 }}>{o.breed}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function Herd() {
  const { farmId } = useFarm();
  const [, navigate] = useHashRoute();
  const { push } = useToast();
  const [q, setQ] = useState('');
  const [listKey, setListKey] = useState(0);
  const { data: cows, loading } = useAsync(() => listCows(farmId, { search: q }), [farmId, q, listKey]);
  const list = cows || [];
  const milking = list.filter((c) => c.isMilking).length;
  const pregnant = list.filter((c) => c.isPregnant).length;
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);

  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.earTag.trim()) { push('Name and ear tag are required'); return; }
    setSaving(true);
    try {
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
      setListKey((k) => k + 1);
      window.dispatchEvent(new Event('dairyos:refresh'));
    } catch (err: any) {
      push(err.message || 'Failed to add cow');
    }
    setSaving(false);
  };

  return (
    <div>
      <PageHeader eyebrow="HERD" title="Your cows" desc={`${list.length} registered · ${milking} milking`}
        actions={<button className="btn sm" onClick={() => { setQ(''); setOpen(true); }}><Plus size={16} /> Add cow</button>} />
      <div className="three mb">
        <Kpi icon={<Beef size={18} />} label="Total" value={list.length} loading={loading} />
        <Kpi icon={<Milk size={18} />} label="Milking" value={milking} />
        <Kpi icon={<HeartPulse size={18} />} label="Pregnant" value={pregnant} />
      </div>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="between" style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)' }}>
          <h3>{loading ? 'Loading…' : `${list.length} cows`}</h3>
          <input className="input" style={{ maxWidth: 280 }} placeholder="Search by code, name, breed" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
        </div>
        <div className="table-wrap" style={{ border: 0, boxShadow: 'none' }}>
          <table>
            <thead><tr><th>Cow</th><th>Code</th><th>Ear tag</th><th>Breed</th><th>Health</th><th>Milking</th><th>Milk/day</th><th></th></tr></thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id} onClick={() => navigate('/app/cow/' + c.id)} style={{ cursor: 'pointer' }}>
                  <td><div className="row"><CowPhoto name={c.name} color={c.color} size={36} photoUrl={c.photoUrl} /><div><b>{c.name}</b><div className="muted" style={{ fontSize: 12 }}>{c.gender}</div></div></div></td>
                  <td>{c.cowCode}</td><td>{c.earTag}</td><td>{c.breed}</td>
                  <td><span className={`pill ${c.health}`}>{c.health.replace('_', ' ')}</span></td>
                  <td>{c.isMilking ? 'Yes' : 'No'}</td>
                  <td>{c.avgDailyMilk ? fmt.liters(c.avgDailyMilk) : '—'}</td>
                  <td><ChevronRight size={16} className="muted" /></td>
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
          <button className="btn mt" style={{ marginTop: 16 }} type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save cow'}</button>
        </form>
      </Modal>}
    </div>
  );
}

export function CowProfile({ id }: { id: string }) {
  const [, navigate] = useHashRoute();
  const { push } = useToast();
  const [cowKey, setCowKey] = useState(0);
  const { data: cow, loading } = useAsync(() => getCow(id), [id, cowKey]);
  const [qr, setQr] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState(EDIT_EMPTY);
  const [treatOpen, setTreatOpen] = useState(false);
  const [treatForm, setTreatForm] = useState({ disease: '', diagnosis: '', vetName: '', status: 'Active' });
  const [saving, setSaving] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pedigree, setPedigree] = useState<any>(null);
  const [offspringList, setOffspringList] = useState<any[]>([]);
  const [pedigreeLoading, setPedigreeLoading] = useState(false);
  if (loading) return <div className="card"><Skeleton h={200} /></div>;
  if (!cow) return <div className="card">Cow not found.</div>;

  useEffect(() => {
    let cancelled = false;
    setPedigreeLoading(true);
    getPedigree(id, 2).then((t) => { if (!cancelled) setPedigree(t); });
    getOffspring(id).then((o) => { if (!cancelled) setOffspringList(o); });
    setPedigreeLoading(false);
    return () => { cancelled = true; };
  }, [id]);

  const milkTotal = cow.milk.reduce((s, m) => s + m.morning + m.afternoon + m.evening, 0);
  const lastMilk = cow.milk[0];
  const lastMilkTotal = lastMilk ? lastMilk.morning + lastMilk.afternoon + lastMilk.evening : 0;
  const age = cow.dob ? Math.floor((Date.now() - new Date(cow.dob).getTime()) / (1000 * 60 * 60 * 24 * 365.25)) : null;
  const pendingVacc = (cow.vaccinations || []).filter((v) => !v.done).length;
  const activeTreatments = (cow.treatments || []).filter((t) => t.status === 'Active').length;
  const gc = chartColors();
  const opts = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: tickColor(), maxTicksLimit: 6 }, grid: { color: gridColor() } }, y: { ticks: { color: tickColor() }, grid: { color: gridColor() } } } };

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
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      setEditForm((f) => ({ ...f, photoUrl: dataUrl }));
      setPhotoPreview(dataUrl);
    }
    stopCamera();
    setCameraOpen(false);
  };

  const handlePhotoFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setEditForm((f) => ({ ...f, photoUrl: dataUrl }));
      setPhotoPreview(dataUrl);
    };
    reader.readAsDataURL(file);
  };
  return (
    <div>
      <div className="row" style={{ gap: 18, alignItems: 'center', marginBottom: 4 }}>
        <CowPhoto name={cow.name} color={cow.color} size={96} photoUrl={cow.photoUrl} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <PageHeader eyebrow="COW DASHBOARD" title={cow.name}
            desc={`${cow.cowCode} · ${cow.earTag} · ${cow.breed}${age ? ` · ${age} years` : ''}`}
            actions={
              <div className="row">
                <button className="btn ghost sm" onClick={() => { setEditForm({ name: cow.name, breed: cow.breed, earTag: cow.earTag, weightKg: String(cow.weightKg), waterIntakeLiters: String(cow.waterIntakeLiters ?? 0), isMilking: cow.isMilking, isPregnant: cow.isPregnant, status: cow.status, deathDate: cow.deathDate ?? '', deathCause: cow.deathCause ?? '', deathNotes: cow.deathNotes ?? '', photoUrl: cow.photoUrl ?? '' }); setEditOpen(true); }}><Edit3 size={15} /> Edit</button>
                <button className="btn ghost sm" onClick={() => setQr(true)}><QrIc size={15} /> QR</button>
                <button className="btn ghost sm" onClick={() => push('Profile exported', <Download size={15} />)}><Download size={15} /> Export</button>
                <button className="btn ghost sm" onClick={() => window.print()}><Printer size={15} /> Print</button>
              </div>
            }
          />
        </div>
      </div>

      <div className="four mt">
        <Kpi icon={<Milk size={18} />} label="Avg milk / day" value={fmt.liters(cow.avgDailyMilk)} delta={lastMilkTotal ? `${fmt.liters(lastMilkTotal)} today` : 'No records'} />
        <Kpi icon={<Beef size={18} />} label="Weight" value={fmt.kg(cow.weightKg)} />
        <Kpi icon={<HeartPulse size={18} />} label="Productivity" value={<AnimatedCounter value={cow.productivityScore} suffix="%" />} />
        <Kpi icon={<CloudSun size={18} />} label="Water intake" value={`${cow.waterIntakeLiters ?? 0} L/day`} />
        <Kpi icon={<Syringe size={18} />} label="Vaccinations" value={`${(cow.vaccinations || []).filter((v) => v.done).length}/${(cow.vaccinations || []).length}`} delta={pendingVacc ? `${pendingVacc} pending` : 'Up to date'} tone={pendingVacc ? 'down' : 'up'} />
        <Kpi icon={<Stethoscope size={18} />} label="Treatments" value={activeTreatments} delta={activeTreatments ? 'Active' : 'None'} tone={activeTreatments ? 'down' : 'up'} loading={loading} />
        <Kpi icon={<Milk size={18} />} label="Total milk recorded" value={fmt.liters(milkTotal)} delta={`${cow.milk.length} records`} />
        <Kpi icon={<Beef size={18} />} label="Status" value={cow.status === 'active' ? 'Active' : cow.status} tone={cow.status === 'active' ? 'up' : 'down'} />
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
          <h3>Health status</h3>
          <div className="row mt" style={{ gap: 10 }}>
            <span className={`pill ${cow.health}`}>{cow.health.replace('_', ' ')}</span>
            {cow.isMilking && <span className="pill info">Milking</span>}
            {cow.isPregnant && <span className="pill warn">Pregnant</span>}
            <span className="tag">{cow.breed}</span>
          </div>
          <h3 className="mt">Recent treatments</h3>
          {(cow.treatments && cow.treatments.length) ? cow.treatments.slice(0, 5).map((t) => (
            <div key={t.id} className="between mt" style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <div><b>{t.disease}</b><div className="muted" style={{ fontSize: 12 }}>{t.diagnosis} · {fmt.date(t.date)} {t.vetName ? `· Vet: ${t.vetName}` : ''}</div></div>
              <span className={`pill ${t.status === 'Active' ? 'danger' : 'warn'}`}>{t.status}</span>
            </div>
          )) : <p className="muted mt">No health issues recorded. 🎉</p>}
          <button className="btn sm mt" onClick={() => setTreatOpen(true)}><Plus size={14} /> Add treatment</button>
          <h3 className="mt">Vaccination schedule</h3>
          {(cow.vaccinations || []).map((v) => (
            <div key={v.id} className="between mt" style={{ fontSize: 14 }}>
              <span><Syringe size={14} style={{ verticalAlign: -2 }} /> {v.name}</span>
              <span className="row">{fmt.shortDate(v.due)}{v.done ? <span className="pill healthy">done</span> : <span className="pill warn">due</span>}</span>
            </div>
          ))}
        </div>

        <div className="card">
          <h3>Breeding & family</h3>
          <h3 className="mt" style={{ fontSize: 14, textTransform: 'uppercase', letterSpacing: 1 }}>Pregnancy history</h3>
          {(cow.breedings && cow.breedings.length) ? cow.breedings.map((b) => (
            <div key={b.id} className="between mt" style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <div><b>{b.method}</b> · {fmt.date(b.date)}<div className="muted" style={{ fontSize: 12 }}>Exp. calving {fmt.date(b.expectedCalving)}</div></div>
              <span className={`pill ${b.result === 'Pregnant' ? 'warn' : 'muted'}`}>{b.result}</span>
            </div>
          )) : <p className="muted mt">No breeding records.</p>}
          <h3 className="mt">Family tree</h3>
          {pedigreeLoading ? <p className="muted mt">Loading pedigree…</p> : pedigree ? (
            <div style={{ fontSize: 13 }}>
              <PedigreeNode node={pedigree} navigate={navigate} />
            </div>
          ) : (
            <div className="row mt">
              <div className="card" style={{ flex: 1, textAlign: 'center', padding: 12 }}><div className="muted" style={{ fontSize: 12 }}>Mother</div>{cow.motherId || 'Unknown'}</div>
              <div className="card" style={{ flex: 1, textAlign: 'center', padding: 12 }}><div className="muted" style={{ fontSize: 12 }}>Father</div>{cow.fatherId || 'Unknown'}</div>
            </div>
          )}
          <h3 className="mt">Offspring ({offspringList.length})</h3>
          {offspringList.length === 0 ? <p className="muted mt">None yet</p> : (
            <div className="table-wrap mt" style={{ border: 0, boxShadow: 'none' }}>
              <table><thead><tr><th>Code</th><th>Name</th><th>Sex</th><th>Breed</th><th>Status</th></tr></thead>
                <tbody>{offspringList.slice(0, 10).map((o: any) => (
                  <tr key={o.id} onClick={() => navigate('/app/cow/' + o.id)} style={{ cursor: 'pointer' }}>
                    <td>{o.cowCode}</td><td>{o.name}</td><td>{o.gender}</td><td>{o.breed}</td><td>{o.status}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
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

      {editOpen && <Modal title="Edit cow" onClose={() => { setEditOpen(false); stopCamera(); }}>
        <form onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          try {
            await updateCow(id, {
              name: editForm.name.trim(),
              breed: editForm.breed,
              ear_tag: editForm.earTag.trim(),
              weight_kg: Number(editForm.weightKg) || 0,
              water_intake_liters: Number(editForm.waterIntakeLiters) || 0,
              is_milking: editForm.isMilking,
              is_pregnant: editForm.isPregnant,
              status: editForm.status,
              death_date: editForm.deathDate || null,
              death_cause: editForm.deathCause || null,
              death_notes: editForm.deathNotes || null,
              photo_url: editForm.photoUrl || null,
            });
            push('Cow updated');
            setCowKey(k => k + 1);
            setEditOpen(false);
            window.dispatchEvent(new Event('dairyos:refresh'));
          } catch (err: any) { push(err.message); }
          setSaving(false);
        }}>
          <div className="field"><label>Name</label><input className="input" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} required /></div>
          <div className="field"><label>Breed</label><select className="select" value={editForm.breed} onChange={(e) => setEditForm({ ...editForm, breed: e.target.value })}>{BREEDS.map((b) => <option key={b} value={b}>{b}</option>)}</select></div>
          <div className="field"><label>Ear tag</label><input className="input" value={editForm.earTag} onChange={(e) => setEditForm({ ...editForm, earTag: e.target.value })} required /></div>
          <div className="field"><label>Weight (kg)</label><input className="input" type="number" value={editForm.weightKg} onChange={(e) => setEditForm({ ...editForm, weightKg: e.target.value })} /></div>
          <div className="field"><label>Water intake (L/day)</label><input className="input" type="number" value={editForm.waterIntakeLiters} onChange={(e) => setEditForm({ ...editForm, waterIntakeLiters: e.target.value })} /></div>
          <div className="field"><label>Photo</label>
            <div className="row" style={{ gap: 8, marginBottom: 8 }}>
              <label className="btn sm" style={{ cursor: 'pointer' }}>
                <FolderOpen size={14} /> Upload from PC
                <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhotoFile} />
              </label>
              <button type="button" className="btn sm" onClick={startCamera}><Camera size={14} /> Take photo</button>
              {(editForm.photoUrl || photoPreview) && <button type="button" className="btn ghost sm" onClick={() => { setEditForm((f) => ({ ...f, photoUrl: '' })); setPhotoPreview(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}><Trash2 size={14} /> Remove</button>}
            </div>
            {(editForm.photoUrl || photoPreview) && <img src={(editForm.photoUrl || photoPreview) as string} alt="Preview" style={{ width: '100%', maxHeight: 200, objectFit: 'cover', borderRadius: 8, background: 'var(--surface-2)' }} />}
          </div>
          <div className="row mt"><label style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={editForm.isMilking} onChange={(e) => setEditForm({ ...editForm, isMilking: e.target.checked })} /> Milking</label><label style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={editForm.isPregnant} onChange={(e) => setEditForm({ ...editForm, isPregnant: e.target.checked })} /> Pregnant</label></div>
          <div className="field mt"><label>Status</label><select className="select" value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}><option value="active">Active</option><option value="deceased">Deceased</option><option value="sold">Sold</option><option value="archived">Archived</option></select></div>
          {editForm.status === 'deceased' && <><div className="field mt"><label>Death date</label><input className="input" type="date" value={editForm.deathDate} onChange={(e) => setEditForm({ ...editForm, deathDate: e.target.value })} /></div><div className="field mt"><label>Death cause</label><input className="input" value={editForm.deathCause} onChange={(e) => setEditForm({ ...editForm, deathCause: e.target.value })} /></div><div className="field mt"><label>Death notes</label><textarea className="input" value={editForm.deathNotes} onChange={(e) => setEditForm({ ...editForm, deathNotes: e.target.value })} /></div></>}
          <div className="row mt" style={{ justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" className="btn ghost" onClick={() => setEditOpen(false)}>Cancel</button>
            <button className="btn" type="submit" disabled={saving}><Save size={15} /> {saving ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </Modal>}

      {treatOpen && <Modal title="Add treatment" onClose={() => setTreatOpen(false)}>
        <form onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          try {
            await createTreatment({
              cow_id: id,
              disease: treatForm.disease,
              diagnosis: treatForm.diagnosis,
              treatment_plan: '',
              veterinarian_name: treatForm.vetName,
              status: treatForm.status,
            });
            push('Treatment added');
            setCowKey(k => k + 1);
            setTreatOpen(false);
            setTreatForm({ disease: '', diagnosis: '', vetName: '', status: 'Active' });
          } catch (err: any) { push(err.message); }
          setSaving(false);
        }}>
          <div className="field"><label>Disease / Condition</label><input className="input" value={treatForm.disease} onChange={(e) => setTreatForm({ ...treatForm, disease: e.target.value })} required /></div>
          <div className="field"><label>Diagnosis</label><input className="input" value={treatForm.diagnosis} onChange={(e) => setTreatForm({ ...treatForm, diagnosis: e.target.value })} /></div>
          <div className="field"><label>Veterinarian name</label><input className="input" value={treatForm.vetName} onChange={(e) => setTreatForm({ ...treatForm, vetName: e.target.value })} required /></div>
          <div className="field"><label>Status</label><select className="select" value={treatForm.status} onChange={(e) => setTreatForm({ ...treatForm, status: e.target.value })}><option value="Active">Active</option><option value="Recovering">Recovering</option><option value="Resolved">Resolved</option></select></div>
          <div className="row mt" style={{ justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" className="btn ghost" onClick={() => setTreatOpen(false)}>Cancel</button>
            <button className="btn" type="submit" disabled={saving}><Save size={15} /> {saving ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
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
