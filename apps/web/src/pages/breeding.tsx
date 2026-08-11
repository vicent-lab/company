import { useState } from 'react';
import { useFarm } from '../app';
import { useAuth } from '../auth';
import { PageHeader, Modal, Kpi, AnimatedCounter, useAsync, useToast, Skeleton } from '../ui';
import {
  heatDetections, createHeatDetection, deleteHeatDetection,
  breedingRecords, createBreedingRecord, updateBreedingRecord, deleteBreedingRecord,
  semenInventory, createSemenItem, updateSemenItem, deleteSemenItem,
  calvingRecords, createCalvingRecord, updateCalvingRecord, deleteCalvingRecord,
  twinBirths, createTwinBirth, deleteTwinBirth,
  fertilityStats, createFertilityStat, updateFertilityStat,
  geneticAnalysis, createGeneticAnalysis,
  breedingRecommendations, createBreedingRecommendation, updateBreedingRecommendation,
  pregnancies, createPregnancy, updatePregnancy, deletePregnancy,
  offspring, createOffspring, deleteOffspring
} from '../data';
import { Plus, Trash2, Edit3, Save, X, Thermometer, Activity, Brain, FlaskConical, TrendingUp, Baby, GitBranch, HeartPulse, CheckCircle, AlertTriangle } from 'lucide-react';
import { fmt } from '../format';

type Tab = 'heat' | 'recommendations' | 'genetics' | 'semen' | 'fertility' | 'calving' | 'twins' | 'pregnancies' | 'offspring' | 'dashboard';

export function Breeding() {
  const { farmId } = useFarm();
  const { user } = useAuth();
  const { push } = useToast();
  const [tab, setTab] = useState<Tab>('heat');
  const [key, setKey] = useState(0);
  const refresh = () => setKey((k) => k + 1);

  const { data: heatList, loading: heatLoading } = useAsync(() => heatDetections(farmId), [farmId, key]);
  const { data: recList, loading: recLoading } = useAsync(() => breedingRecommendations(farmId), [farmId, key]);
  const { data: geneticList, loading: geneticLoading } = useAsync(() => geneticAnalysis(farmId), [farmId, key]);
  const { data: semenList, loading: semenLoading } = useAsync(() => semenInventory(farmId), [farmId, key]);
  const { data: fertilityList, loading: fertilityLoading } = useAsync(() => fertilityStats(farmId), [farmId, key]);
  const { data: calvingList, loading: calvingLoading } = useAsync(() => calvingRecords(farmId), [farmId, key]);
  const { data: twinList, loading: twinLoading } = useAsync(() => twinBirths(farmId), [farmId, key]);
  const { data: pregnancyList, loading: pregnancyLoading } = useAsync(() => pregnancies(farmId), [farmId, key]);
  const { data: offspringList, loading: offspringLoading } = useAsync(() => offspring(farmId), [farmId, key]);

  return (
    <div>
      <PageHeader eyebrow="BREEDING" title="Breeding management" desc="Heat detection, genetics, semen, calving, and reproductive performance." />
      <div className="card reveal" style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', padding: 0, marginBottom: 0, overflowX: 'auto' }}>
        {([
          { key: 'heat', label: 'Heat detection', icon: <Thermometer size={14} /> },
          { key: 'recommendations', label: 'AI recommendations', icon: <Brain size={14} /> },
          { key: 'genetics', label: 'Genetics', icon: <GitBranch size={14} /> },
          { key: 'semen', label: 'Semen inventory', icon: <FlaskConical size={14} /> },
          { key: 'fertility', label: 'Fertility', icon: <TrendingUp size={14} /> },
          { key: 'calving', label: 'Calving', icon: <Baby size={14} /> },
          { key: 'twins', label: 'Twin births', icon: <Activity size={14} /> },
          { key: 'pregnancies', label: 'Pregnancies', icon: <CheckCircle size={14} /> },
          { key: 'offspring', label: 'Offspring', icon: <HeartPulse size={14} /> },
          { key: 'dashboard', label: 'Dashboard', icon: <HeartPulse size={14} /> },
        ] as const).map((t) => (
          <button key={t.key} className={`btn ghost ${tab === t.key ? 'active-tab' : ''}`} style={{ borderRadius: 0, flex: 1, justifyContent: 'center', padding: '12px 14px', whiteSpace: 'nowrap' }} onClick={() => setTab(t.key)}>
            <span className="row" style={{ gap: 6, justifyContent: 'center' }}>{t.icon} {t.label}</span>
          </button>
        ))}
      </div>

      <div className="mt">
        {tab === 'heat' && <HeatTab farmId={farmId} heatList={heatList || []} loading={heatLoading} refresh={refresh} />}
        {tab === 'recommendations' && <RecommendationsTab farmId={farmId} recList={recList || []} loading={recLoading} refresh={refresh} />}
        {tab === 'genetics' && <GeneticsTab farmId={farmId} geneticList={geneticList || []} loading={geneticLoading} refresh={refresh} />}
        {tab === 'semen' && <SemenTab farmId={farmId} semenList={semenList || []} loading={semenLoading} refresh={refresh} />}
        {tab === 'fertility' && <FertilityTab farmId={farmId} fertilityList={fertilityList || []} loading={fertilityLoading} refresh={refresh} />}
        {tab === 'calving' && <CalvingTab farmId={farmId} calvingList={calvingList || []} loading={calvingLoading} refresh={refresh} />}
        {tab === 'twins' && <TwinsTab farmId={farmId} twinList={twinList || []} loading={twinLoading} refresh={refresh} />}
        {tab === 'pregnancies' && <PregnanciesTab farmId={farmId} pregnancyList={pregnancyList || []} loading={pregnancyLoading} refresh={refresh} />}
        {tab === 'offspring' && <OffspringTab farmId={farmId} offspringList={offspringList || []} loading={offspringLoading} refresh={refresh} />}
        {tab === 'dashboard' && <ReproDashboard farmId={farmId} heatList={heatList || []} recList={recList || []} calvingList={calvingList || []} fertilityList={fertilityList || []} twinList={twinList || []} />}
      </div>
    </div>
  );
}

function HeatTab({ farmId, heatList, loading, refresh }: any) {
  const { push } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ cowId: '', confidence: 0.5, sensorType: 'wearable', activityLevel: '', temperatureC: '', notes: '' });
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await createHeatDetection(farmId, { ...form, activityLevel: form.activityLevel ? Number(form.activityLevel) : undefined, temperatureC: form.temperatureC ? Number(form.temperatureC) : undefined });
    push('Heat detection recorded');
    setForm({ cowId: '', confidence: 0.5, sensorType: 'wearable', activityLevel: '', temperatureC: '', notes: '' });
    setOpen(false);
    refresh();
    setSaving(false);
  };

  const recent = heatList.slice(0, 10);
  const highConfidence = heatList.filter((h: any) => h.confidence >= 0.8).length;

  return (
    <div>
      <div className="three mb">
        <Kpi icon={<Thermometer size={18} />} label="Detections" value={heatList.length} loading={loading} />
        <Kpi icon={<Activity size={18} />} label="High confidence" value={highConfidence} loading={loading} />
        <Kpi icon={<CheckCircle size={18} />} label="Last 24h" value={recent.filter((h: any) => new Date(h.detected_on) > new Date(Date.now() - 86400000)).length} loading={loading} />
      </div>
      <div className="card reveal">
        <div className="between mb">
          <h3>Heat detections</h3>
          <button className="btn sm" onClick={() => setOpen(true)}><Plus size={14} /> Record heat</button>
        </div>
        <div className="table-wrap">
          <table><thead><tr><th>Cow</th><th>Detected</th><th>Confidence</th><th>Sensor</th><th>Temp</th><th>Activity</th></tr></thead>
            <tbody>{recent.map((h: any) => (
              <tr key={h.id}>
                <td>{h.cow_name || h.cow_id} {h.cow_code && <span className="muted" style={{ fontSize: 11 }}>({h.cow_code})</span>}</td>
                <td>{fmt.shortDate(h.detected_on)}</td>
                <td><span className={`pill ${h.confidence >= 0.8 ? 'healthy' : h.confidence >= 0.5 ? 'warn' : 'danger'}`}>{(h.confidence * 100).toFixed(0)}%</span></td>
                <td>{h.sensor_type}</td>
                <td>{h.temperature_c ? `${h.temperature_c}°C` : '—'}</td>
                <td>{h.activity_level ?? '—'}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </div>

      {open && <Modal title="Record heat detection" onClose={() => setOpen(false)}>
        <form onSubmit={submit}>
          <div className="field"><label>Cow ID</label><input className="input" value={form.cowId} onChange={(e) => setForm({ ...form, cowId: e.target.value })} required /></div>
          <div className="field"><label>Confidence (0-1)</label><input className="input" type="number" step="0.1" min="0" max="1" value={form.confidence} onChange={(e) => setForm({ ...form, confidence: Number(e.target.value) })} /></div>
          <div className="field"><label>Sensor type</label>
            <select className="select" value={form.sensorType} onChange={(e) => setForm({ ...form, sensorType: e.target.value })}>
              <option value="wearable">Wearable sensor</option><option value="camera">Camera AI</option><option value="manual">Manual</option>
            </select>
          </div>
          <div className="row" style={{ gap: 10 }}>
            <div className="field" style={{ flex: 1 }}><label>Activity level</label><input className="input" type="number" step="0.1" value={form.activityLevel} onChange={(e) => setForm({ ...form, activityLevel: e.target.value })} /></div>
            <div className="field" style={{ flex: 1 }}><label>Temperature (°C)</label><input className="input" type="number" step="0.1" value={form.temperatureC} onChange={(e) => setForm({ ...form, temperatureC: e.target.value })} /></div>
          </div>
          <div className="field"><label>Notes</label><textarea className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          <div className="row mt" style={{ justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" className="btn ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn" type="submit" disabled={saving}>Save</button>
          </div>
        </form>
      </Modal>}
    </div>
  );
}

function RecommendationsTab({ farmId, recList, loading, refresh }: any) {
  const { push } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ cowId: '', recommendedDate: '', recommendedSire: '', reason: '', confidence: 0.7, status: 'pending' });
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await createBreedingRecommendation(farmId, form);
    push('Recommendation created');
    setForm({ cowId: '', recommendedDate: '', recommendedSire: '', reason: '', confidence: 0.7, status: 'pending' });
    setOpen(false);
    refresh();
    setSaving(false);
  };

  const act = async (id: string) => {
    await updateBreedingRecommendation(id, { status: 'acted' });
    push('Marked as acted');
    refresh();
  };

  return (
    <div>
      <div className="three mb">
        <Kpi icon={<Brain size={18} />} label="Recommendations" value={recList.length} loading={loading} />
        <Kpi icon={<CheckCircle size={18} />} label="Acted on" value={recList.filter((r: any) => r.acted_on).length} loading={loading} />
        <Kpi icon={<AlertTriangle size={18} />} label="Pending" value={recList.filter((r: any) => !r.acted_on).length} loading={loading} />
      </div>
      <div className="card reveal">
        <div className="between mb">
          <h3>AI breeding recommendations</h3>
          <button className="btn sm" onClick={() => setOpen(true)}><Plus size={14} /> New recommendation</button>
        </div>
        <div className="table-wrap">
          <table><thead><tr><th>Cow</th><th>Recommended date</th><th>Sire</th><th>Confidence</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>{recList.slice(0, 20).map((r: any) => (
              <tr key={r.id}>
                <td>{r.cow_name || r.cow_id} {r.cow_code && <span className="muted" style={{ fontSize: 11 }}>({r.cow_code})</span>}</td>
                <td>{fmt.date(r.recommended_date)}</td>
                <td>{r.recommended_sire || '—'}</td>
                <td>{(r.confidence * 100).toFixed(0)}%</td>
                <td><span className={`pill ${r.acted_on ? 'healthy' : 'warn'}`}>{r.acted_on ? 'Acted' : r.status}</span></td>
                <td>{!r.acted_on && <button className="btn ghost sm" onClick={() => act(r.id)}><CheckCircle size={13} /></button>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </div>

      {open && <Modal title="New recommendation" onClose={() => setOpen(false)}>
        <form onSubmit={submit}>
          <div className="field"><label>Cow ID</label><input className="input" value={form.cowId} onChange={(e) => setForm({ ...form, cowId: e.target.value })} required /></div>
          <div className="field"><label>Recommended date</label><input className="input" type="date" value={form.recommendedDate} onChange={(e) => setForm({ ...form, recommendedDate: e.target.value })} required /></div>
          <div className="field"><label>Recommended sire</label><input className="input" value={form.recommendedSire} onChange={(e) => setForm({ ...form, recommendedSire: e.target.value })} /></div>
          <div className="field"><label>Reason</label><textarea className="input" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} required /></div>
          <div className="row mt" style={{ justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" className="btn ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn" type="submit" disabled={saving}>Save</button>
          </div>
        </form>
      </Modal>}
    </div>
  );
}

function GeneticsTab({ farmId, geneticList, loading, refresh }: any) {
  const { push } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ cowId: '', sireId: '', compatibilityScore: 0.5, inbreedingCoeefficient: '', traitsAnalysis: '{}', recommendation: '' });
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await createGeneticAnalysis(farmId, { ...form, compatibilityScore: Number(form.compatibilityScore), inbreedingCoefficient: form.inbreedingCoeefficient ? Number(form.inbreedingCoeefficient) : undefined, traitsAnalysis: JSON.parse(form.traitsAnalysis || '{}') });
    push('Genetic analysis created');
    setForm({ cowId: '', sireId: '', compatibilityScore: 0.5, inbreedingCoeefficient: '', traitsAnalysis: '{}', recommendation: '' });
    setOpen(false);
    refresh();
    setSaving(false);
  };

  return (
    <div>
      <div className="three mb">
        <Kpi icon={<GitBranch size={18} />} label="Analyses" value={geneticList.length} loading={loading} />
        <Kpi icon={<TrendingUp size={18} />} label="Avg compatibility" value={geneticList.length ? (geneticList.reduce((s: number, g: any) => s + g.compatibility_score, 0) / geneticList.length).toFixed(2) : '—'} loading={loading} />
      </div>
      <div className="card reveal">
        <div className="between mb">
          <h3>Genetic compatibility analysis</h3>
          <button className="btn sm" onClick={() => setOpen(true)}><Plus size={14} /> New analysis</button>
        </div>
        <div className="table-wrap">
          <table><thead><tr><th>Cow</th><th>Sire</th><th>Compatibility</th><th>Inbreeding</th><th>Analyzed</th></tr></thead>
            <tbody>{geneticList.slice(0, 20).map((g: any) => (
              <tr key={g.id}>
                <td>{g.cow_name || g.cow_id}</td>
                <td>{g.sire_id}</td>
                <td><AnimatedCounter value={Number(g.compatibility_score) || 0} suffix="/1" /></td>
                <td>{g.inbreeding_coefficient ? (g.inbreeding_coefficient * 100).toFixed(2) + '%' : '—'}</td>
                <td>{fmt.shortDate(g.analyzed_on)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </div>

      {open && <Modal title="Genetic analysis" onClose={() => setOpen(false)}>
        <form onSubmit={submit}>
          <div className="field"><label>Cow ID</label><input className="input" value={form.cowId} onChange={(e) => setForm({ ...form, cowId: e.target.value })} required /></div>
          <div className="field"><label>Sire ID / Name</label><input className="input" value={form.sireId} onChange={(e) => setForm({ ...form, sireId: e.target.value })} required /></div>
          <div className="row" style={{ gap: 10 }}>
            <div className="field" style={{ flex: 1 }}><label>Compatibility (0-1)</label><input className="input" type="number" step="0.01" min="0" max="1" value={form.compatibilityScore} onChange={(e) => setForm({ ...form, compatibilityScore: Number(e.target.value) })} /></div>
            <div className="field" style={{ flex: 1 }}><label>Inbreeding (0-1)</label><input className="input" type="number" step="0.01" min="0" max="1" value={form.inbreedingCoeefficient} onChange={(e) => setForm({ ...form, inbreedingCoeefficient: e.target.value })} /></div>
          </div>
          <div className="field"><label>Traits analysis (JSON)</label><textarea className="input" value={form.traitsAnalysis} onChange={(e) => setForm({ ...form, traitsAnalysis: e.target.value })} /></div>
          <div className="field"><label>Recommendation</label><textarea className="input" value={form.recommendation} onChange={(e) => setForm({ ...form, recommendation: e.target.value })} /></div>
          <div className="row mt" style={{ justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" className="btn ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn" type="submit" disabled={saving}>Save</button>
          </div>
        </form>
      </Modal>}
    </div>
  );
}

function SemenTab({ farmId, semenList, loading, refresh }: any) {
  const { push } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ sireName: '', breed: '', batchNumber: '', quantityDoses: 0, storageLocation: '', expiryDate: '', costPerDose: '', notes: '' });
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await createSemenItem(farmId, { ...form, costPerDose: form.costPerDose ? Number(form.costPerDose) : undefined });
    push('Semen added');
    setForm({ sireName: '', breed: '', batchNumber: '', quantityDoses: 0, storageLocation: '', expiryDate: '', costPerDose: '', notes: '' });
    setOpen(false);
    refresh();
    setSaving(false);
  };

  const totalDoses = semenList.reduce((s: number, i: any) => s + (i.quantity_doses || 0), 0);
  const lowStock = semenList.filter((i: any) => i.quantity_doses < 10).length;

  return (
    <div>
      <div className="three mb">
        <Kpi icon={<FlaskConical size={18} />} label="Total doses" value={totalDoses} loading={loading} />
        <Kpi icon={<AlertTriangle size={18} />} label="Low stock" value={lowStock} loading={loading} />
      </div>
      <div className="card reveal">
        <div className="between mb">
          <h3>Semen inventory</h3>
          <button className="btn sm" onClick={() => setOpen(true)}><Plus size={14} /> Add semen</button>
        </div>
        <div className="table-wrap">
          <table><thead><tr><th>Sire</th><th>Breed</th><th>Batch</th><th>Doses</th><th>Storage</th><th>Expiry</th><th>Cost/dose</th></tr></thead>
            <tbody>{semenList.slice(0, 20).map((s: any) => (
              <tr key={s.id}>
                <td><b>{s.sire_name}</b></td>
                <td>{s.breed}</td>
                <td>{s.batch_number}</td>
                <td><span className={`pill ${s.quantity_doses < 10 ? 'danger' : 'healthy'}`}>{s.quantity_doses}</span></td>
                <td>{s.storage_location || '—'}</td>
                <td>{s.expiry_date ? fmt.date(s.expiry_date) : '—'}</td>
                <td>{s.cost_per_dose ? fmt.money(s.cost_per_dose) : '—'}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </div>

      {open && <Modal title="Add semen" onClose={() => setOpen(false)}>
        <form onSubmit={submit}>
          <div className="row" style={{ gap: 10 }}>
            <div className="field" style={{ flex: 1 }}><label>Sire name</label><input className="input" value={form.sireName} onChange={(e) => setForm({ ...form, sireName: e.target.value })} required /></div>
            <div className="field" style={{ flex: 1 }}><label>Breed</label><input className="input" value={form.breed} onChange={(e) => setForm({ ...form, breed: e.target.value })} required /></div>
          </div>
          <div className="row" style={{ gap: 10 }}>
            <div className="field" style={{ flex: 1 }}><label>Batch number</label><input className="input" value={form.batchNumber} onChange={(e) => setForm({ ...form, batchNumber: e.target.value })} required /></div>
            <div className="field" style={{ flex: 1 }}><label>Quantity</label><input className="input" type="number" value={form.quantityDoses} onChange={(e) => setForm({ ...form, quantityDoses: Number(e.target.value) })} required /></div>
          </div>
          <div className="row" style={{ gap: 10 }}>
            <div className="field" style={{ flex: 1 }}><label>Storage location</label><input className="input" value={form.storageLocation} onChange={(e) => setForm({ ...form, storageLocation: e.target.value })} /></div>
            <div className="field" style={{ flex: 1 }}><label>Expiry date</label><input className="input" type="date" value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} /></div>
          </div>
          <div className="row mt" style={{ justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" className="btn ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn" type="submit" disabled={saving}>Save</button>
          </div>
        </form>
      </Modal>}
    </div>
  );
}

function FertilityTab({ farmId, fertilityList, loading, refresh }: any) {
  const { push } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ periodStart: '', periodEnd: '', conceptionRate: 0, calvingRate: 0, abortionRate: 0, avgServicesPerConception: 0, cowsServiced: 0, cowsPregnant: 0 });
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await createFertilityStat(farmId, form);
    push('Fertility stats added');
    setForm({ periodStart: '', periodEnd: '', conceptionRate: 0, calvingRate: 0, abortionRate: 0, avgServicesPerConception: 0, cowsServiced: 0, cowsPregnant: 0 });
    setOpen(false);
    refresh();
    setSaving(false);
  };

  return (
    <div>
      <div className="three mb">
        <Kpi icon={<TrendingUp size={18} />} label="Conception rate" value={fertilityList.length ? `${fertilityList[0].conception_rate.toFixed(1)}%` : '—'} loading={loading} />
        <Kpi icon={<Baby size={18} />} label="Calving rate" value={fertilityList.length ? `${fertilityList[0].calving_rate.toFixed(1)}%` : '—'} loading={loading} />
        <Kpi icon={<Activity size={18} />} label="Avg services" value={fertilityList.length ? fertilityList[0].avg_services_per_conception.toFixed(1) : '—'} loading={loading} />
      </div>
      <div className="card reveal">
        <div className="between mb">
          <h3>Fertility statistics</h3>
          <button className="btn sm" onClick={() => setOpen(true)}><Plus size={14} /> Add stats</button>
        </div>
        <div className="table-wrap">
          <table><thead><tr><th>Period</th><th>Conception</th><th>Calving</th><th>Abortion</th><th>Avg services</th><th>Serviced</th><th>Pregnant</th></tr></thead>
            <tbody>{fertilityList.slice(0, 10).map((f: any) => (
              <tr key={f.id}>
                <td>{fmt.date(f.period_start)} — {fmt.date(f.period_end)}</td>
                <td><AnimatedCounter value={Number(f.conception_rate) || 0} suffix="%" /></td>
                <td><AnimatedCounter value={Number(f.calving_rate) || 0} suffix="%" /></td>
                <td><AnimatedCounter value={Number(f.abortion_rate) || 0} suffix="%" /></td>
                <td>{f.avg_services_per_conception?.toFixed(1) || '—'}</td>
                <td>{f.cows_serviced}</td>
                <td>{f.cows_pregnant}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </div>

      {open && <Modal title="Add fertility stats" onClose={() => setOpen(false)}>
        <form onSubmit={submit}>
          <div className="row" style={{ gap: 10 }}>
            <div className="field" style={{ flex: 1 }}><label>Period start</label><input className="input" type="date" value={form.periodStart} onChange={(e) => setForm({ ...form, periodStart: e.target.value })} required /></div>
            <div className="field" style={{ flex: 1 }}><label>Period end</label><input className="input" type="date" value={form.periodEnd} onChange={(e) => setForm({ ...form, periodEnd: e.target.value })} required /></div>
          </div>
          <div className="row" style={{ gap: 10 }}>
            <div className="field" style={{ flex: 1 }}><label>Conception rate %</label><input className="input" type="number" value={form.conceptionRate} onChange={(e) => setForm({ ...form, conceptionRate: Number(e.target.value) })} /></div>
            <div className="field" style={{ flex: 1 }}><label>Calving rate %</label><input className="input" type="number" value={form.calvingRate} onChange={(e) => setForm({ ...form, calvingRate: Number(e.target.value) })} /></div>
          </div>
          <div className="row mt" style={{ justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" className="btn ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn" type="submit" disabled={saving}>Save</button>
          </div>
        </form>
      </Modal>}
    </div>
  );
}

function CalvingTab({ farmId, calvingList, loading, refresh }: any) {
  const { push } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ cowId: '', pregnancyId: '', calvingDate: '', difficultyScore: 3, assistanceRequired: false, assistanceType: '', veterinarianName: '', calfId: '', notes: '' });
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await createCalvingRecord(farmId, form);
    push('Calving record added');
    setForm({ cowId: '', pregnancyId: '', calvingDate: '', difficultyScore: 3, assistanceRequired: false, assistanceType: '', veterinarianName: '', calfId: '', notes: '' });
    setOpen(false);
    refresh();
    setSaving(false);
  };

  const assisted = calvingList.filter((c: any) => c.assistance_required).length;

  return (
    <div>
      <div className="three mb">
        <Kpi icon={<Baby size={18} />} label="Total calvings" value={calvingList.length} loading={loading} />
        <Kpi icon={<AlertTriangle size={18} />} label="Assisted" value={assisted} loading={loading} />
      </div>
      <div className="card reveal">
        <div className="between mb">
          <h3>Calving difficulty records</h3>
          <button className="btn sm" onClick={() => setOpen(true)}><Plus size={14} /> Record calving</button>
        </div>
        <div className="table-wrap">
          <table><thead><tr><th>Cow</th><th>Date</th><th>Difficulty</th><th>Assistance</th><th>Vet</th><th>Calf weight</th></tr></thead>
            <tbody>{calvingList.slice(0, 20).map((c: any) => (
              <tr key={c.id}>
                <td>{c.cow_name || c.cow_id} {c.cow_code && <span className="muted" style={{ fontSize: 11 }}>({c.cow_code})</span>}</td>
                <td>{fmt.date(c.calving_date)}</td>
                <td><span className={`pill ${c.difficulty_score <= 2 ? 'healthy' : c.difficulty_score === 3 ? 'warn' : 'danger'}`}>{c.difficulty_score}/5</span></td>
                <td>{c.assistance_required ? c.assistance_type || 'Yes' : 'No'}</td>
                <td>{c.veterinarian_name || '—'}</td>
                <td>{c.birth_weight_kg ? `${c.birth_weight_kg} kg` : '—'}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </div>

      {open && <Modal title="Record calving" onClose={() => setOpen(false)}>
        <form onSubmit={submit}>
          <div className="field"><label>Cow ID</label><input className="input" value={form.cowId} onChange={(e) => setForm({ ...form, cowId: e.target.value })} required /></div>
          <div className="field"><label>Pregnancy ID</label><input className="input" value={form.pregnancyId} onChange={(e) => setForm({ ...form, pregnancyId: e.target.value })} /></div>
          <div className="field"><label>Calving date</label><input className="input" type="date" value={form.calvingDate} onChange={(e) => setForm({ ...form, calvingDate: e.target.value })} required /></div>
          <div className="row" style={{ gap: 10 }}>
            <div className="field" style={{ flex: 1 }}><label>Difficulty (1-5)</label><input className="input" type="number" min="1" max="5" value={form.difficultyScore} onChange={(e) => setForm({ ...form, difficultyScore: Number(e.target.value) })} /></div>
            <div className="field" style={{ flex: 1 }}><label>Assistance required</label>
              <select className="select" value={form.assistanceRequired ? 'yes' : 'no'} onChange={(e) => setForm({ ...form, assistanceRequired: e.target.value === 'yes' })}>
                <option value="no">No</option><option value="yes">Yes</option>
              </select>
            </div>
          </div>
          <div className="field"><label>Veterinarian</label><input className="input" value={form.veterinarianName} onChange={(e) => setForm({ ...form, veterinarianName: e.target.value })} /></div>
          <div className="row mt" style={{ justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" className="btn ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn" type="submit" disabled={saving}>Save</button>
          </div>
        </form>
      </Modal>}
    </div>
  );
}

function TwinsTab({ farmId, twinList, loading, refresh }: any) {
  const { push } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ cowId: '', calvingId: '', calf1Id: '', calf2Id: '', birthType: 'fraternal', notes: '' });
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await createTwinBirth(farmId, form);
    push('Twin birth recorded');
    setForm({ cowId: '', calvingId: '', calf1Id: '', calf2Id: '', birthType: 'fraternal', notes: '' });
    setOpen(false);
    refresh();
    setSaving(false);
  };

  return (
    <div>
      <div className="three mb">
        <Kpi icon={<Activity size={18} />} label="Twin births" value={twinList.length} loading={loading} />
      </div>
      <div className="card reveal">
        <div className="between mb">
          <h3>Twin birth tracking</h3>
          <button className="btn sm" onClick={() => setOpen(true)}><Plus size={14} /> Record twins</button>
        </div>
        <div className="table-wrap">
          <table><thead><tr><th>Cow</th><th>Calving date</th><th>Birth type</th><th>Calf 1</th><th>Calf 2</th></tr></thead>
            <tbody>{twinList.slice(0, 20).map((t: any) => (
              <tr key={t.id}>
                <td>{t.cow_name || t.cow_id}</td>
                <td>{fmt.date(t.calving_date)}</td>
                <td><span className="tag">{t.birth_type}</span></td>
                <td>{t.calf_1_id}</td>
                <td>{t.calf_2_id}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </div>

      {open && <Modal title="Record twin birth" onClose={() => setOpen(false)}>
        <form onSubmit={submit}>
          <div className="field"><label>Cow ID</label><input className="input" value={form.cowId} onChange={(e) => setForm({ ...form, cowId: e.target.value })} required /></div>
          <div className="field"><label>Calving record ID</label><input className="input" value={form.calvingId} onChange={(e) => setForm({ ...form, calvingId: e.target.value })} required /></div>
          <div className="row" style={{ gap: 10 }}>
            <div className="field" style={{ flex: 1 }}><label>Calf 1 ID</label><input className="input" value={form.calf1Id} onChange={(e) => setForm({ ...form, calf1Id: e.target.value })} required /></div>
            <div className="field" style={{ flex: 1 }}><label>Calf 2 ID</label><input className="input" value={form.calf2Id} onChange={(e) => setForm({ ...form, calf2Id: e.target.value })} required /></div>
          </div>
          <div className="row mt" style={{ justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" className="btn ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn" type="submit" disabled={saving}>Save</button>
          </div>
        </form>
      </Modal>}
    </div>
  );
}

function PregnanciesTab({ farmId, pregnancyList, loading, refresh }: any) {
  const { push } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ cowId: '', breedingId: '', confirmationDate: '', status: 'confirmed', expectedCalvingDate: '' });
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await createPregnancy(farmId, form);
    push('Pregnancy recorded');
    setForm({ cowId: '', breedingId: '', confirmationDate: '', status: 'confirmed', expectedCalvingDate: '' });
    setOpen(false);
    refresh();
    setSaving(false);
  };

  return (
    <div>
      <div className="three mb">
        <Kpi icon={<CheckCircle size={18} />} label="Pregnancies" value={pregnancyList.length} loading={loading} />
      </div>
      <div className="card reveal">
        <div className="between mb">
          <h3>Pregnancy records</h3>
          <button className="btn sm" onClick={() => setOpen(true)}><Plus size={14} /> Add pregnancy</button>
        </div>
        <div className="table-wrap">
          <table><thead><tr><th>Cow</th><th>Breeding</th><th>Confirmed</th><th>Status</th><th>Expected calving</th></tr></thead>
            <tbody>{pregnancyList.slice(0, 20).map((p: any) => (
              <tr key={p.id}>
                <td>{p.cow_name || p.cow_id} {p.cow_code && <span className="muted" style={{ fontSize: 11 }}>({p.cow_code})</span>}</td>
                <td>{p.breeding_id}</td>
                <td>{fmt.date(p.confirmation_date)}</td>
                <td><span className={`pill ${p.status === 'confirmed' ? 'healthy' : p.status === 'failed' ? 'danger' : 'warn'}`}>{p.status}</span></td>
                <td>{fmt.date(p.expected_calving_date)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </div>

      {open && <Modal title="Add pregnancy" onClose={() => setOpen(false)}>
        <form onSubmit={submit}>
          <div className="field"><label>Cow ID</label><input className="input" value={form.cowId} onChange={(e) => setForm({ ...form, cowId: e.target.value })} required /></div>
          <div className="field"><label>Breeding ID</label><input className="input" value={form.breedingId} onChange={(e) => setForm({ ...form, breedingId: e.target.value })} required /></div>
          <div className="row" style={{ gap: 10 }}>
            <div className="field" style={{ flex: 1 }}><label>Confirmation date</label><input className="input" type="date" value={form.confirmationDate} onChange={(e) => setForm({ ...form, confirmationDate: e.target.value })} required /></div>
            <div className="field" style={{ flex: 1 }}><label>Expected calving</label><input className="input" type="date" value={form.expectedCalvingDate} onChange={(e) => setForm({ ...form, expectedCalvingDate: e.target.value })} required /></div>
          </div>
          <div className="field"><label>Status</label>
            <select className="select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="confirmed">Confirmed</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed</option>
            </select>
          </div>
          <div className="row mt" style={{ justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" className="btn ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn" type="submit" disabled={saving}>Save</button>
          </div>
        </form>
      </Modal>}
    </div>
  );
}

function OffspringTab({ farmId, offspringList, loading, refresh }: any) {
  const { push } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ animalId: '', motherId: '', fatherId: '' });
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await createOffspring(farmId, form);
    push('Offspring recorded');
    setForm({ animalId: '', motherId: '', fatherId: '' });
    setOpen(false);
    refresh();
    setSaving(false);
  };

  return (
    <div>
      <div className="three mb">
        <Kpi icon={<HeartPulse size={18} />} label="Offspring" value={offspringList.length} loading={loading} />
      </div>
      <div className="card reveal">
        <div className="between mb">
          <h3>Offspring records</h3>
          <button className="btn sm" onClick={() => setOpen(true)}><Plus size={14} /> Add offspring</button>
        </div>
        <div className="table-wrap">
          <table><thead><tr><th>Animal</th><th>Mother</th><th>Father</th></tr></thead>
            <tbody>{offspringList.slice(0, 20).map((o: any) => (
              <tr key={o.id}>
                <td>{o.animal_code || o.animal_id}</td>
                <td>{o.mother_code || o.mother_id}</td>
                <td>{o.father_code || o.father_id}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </div>

      {open && <Modal title="Add offspring" onClose={() => setOpen(false)}>
        <form onSubmit={submit}>
          <div className="field"><label>Animal ID</label><input className="input" value={form.animalId} onChange={(e) => setForm({ ...form, animalId: e.target.value })} required /></div>
          <div className="row" style={{ gap: 10 }}>
            <div className="field" style={{ flex: 1 }}><label>Mother ID</label><input className="input" value={form.motherId} onChange={(e) => setForm({ ...form, motherId: e.target.value })} required /></div>
            <div className="field" style={{ flex: 1 }}><label>Father ID</label><input className="input" value={form.fatherId} onChange={(e) => setForm({ ...form, fatherId: e.target.value })} required /></div>
          </div>
          <div className="row mt" style={{ justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" className="btn ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn" type="submit" disabled={saving}>Save</button>
          </div>
        </form>
      </Modal>}
    </div>
  );
}

function ReproDashboard({ farmId, heatList, recList, calvingList, fertilityList, twinList }: any) {
  const recentHeat = heatList.filter((h: any) => new Date(h.detected_on) > new Date(Date.now() - 7 * 86400000)).length;
  const recentCalvings = calvingList.filter((c: any) => new Date(c.calving_date) > new Date(Date.now() - 30 * 86400000)).length;
  const avgDifficulty = calvingList.length ? (calvingList.reduce((s: number, c: any) => s + (c.difficulty_score || 0), 0) / calvingList.length).toFixed(1) : '—';
  const twinRate = calvingList.length ? ((twinList.length / calvingList.length) * 100).toFixed(1) : '0';

  return (
    <div>
      <div className="four">
        <Kpi icon={<Thermometer size={18} />} label="Heat detections (7d)" value={recentHeat} />
        <Kpi icon={<Baby size={18} />} label="Calvings (30d)" value={recentCalvings} />
        <Kpi icon={<TrendingUp size={18} />} label="Avg difficulty" value={`${avgDifficulty}/5`} />
        <Kpi icon={<Activity size={18} />} label="Twin rate" value={`${twinRate}%`} />
      </div>
      <div className="two mt">
        <div className="card">
          <h3>Reproductive performance</h3>
          <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>Heat detections: {heatList.length} total. Recommendations: {recList.length}. Calving records: {calvingList.length}. Twin births: {twinList.length}.</p>
        </div>
        <div className="card">
          <h3>Key metrics</h3>
          <div className="between mt"><span>Conception rate</span><b>{fertilityList.length ? `${fertilityList[0].conception_rate.toFixed(1)}%` : '—'}</b></div>
          <div className="between mt"><span>Calving rate</span><b>{fertilityList.length ? `${fertilityList[0].calving_rate.toFixed(1)}%` : '—'}</b></div>
          <div className="between mt"><span>Avg services/conception</span><b>{fertilityList.length ? fertilityList[0].avg_services_per_conception.toFixed(1) : '—'}</b></div>
        </div>
      </div>
    </div>
  );
}
