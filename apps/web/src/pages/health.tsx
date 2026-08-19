import { useState, useEffect, useMemo } from 'react';
import React from 'react';
import { useFarm } from '../app';
import { useHashRoute } from '../router';
import { PageHeader, Modal, Kpi, useAsync, useToast, Skeleton, CowPhoto, ChartCard } from '../ui';
import { isLive } from '../api';
import { apiGet, apiSend } from '../api';
import { Plus, Trash2, Edit3, Save, X, Activity, Pill, FlaskConical, Bug, ShieldAlert, AlertTriangle, RefreshCw } from 'lucide-react';
import { fmt } from '../format';
import { farmTreatments, farmVaccinations, createTreatment } from '../data';

const q = (p: Record<string, any>) => '?' + new URLSearchParams(Object.entries(p).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)]).reduce((a, [k, v]) => ({ ...a, [k]: v }), {} as Record<string, string>)).toString();

function TabErrorBoundary({ name, children }: { name: string; children: React.ReactNode }) {
  const [error, setError] = useState<string | null>(null);
  if (error) {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        <p style={{ color: 'var(--danger)', marginBottom: 8 }}><b>{name} failed to load</b></p>
        <p style={{ fontSize: 13, color: 'var(--text-soft)', marginBottom: 12 }}>{error}</p>
        <button className="btn sm" onClick={() => { setError(null); window.location.reload(); }}>Retry</button>
      </div>
    );
  }
  return (
    <ErrorBoundary onError={(e) => { console.error(`[Health/${name}]`, e); setError(e.message); }}>
      {children}
    </ErrorBoundary>
  );
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode; onError: (e: Error) => void }, { hasError: boolean }> {
  constructor(props: any) { super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: any) { this.props.onError(error); }
  render() { if (this.state.hasError) return null; return this.props.children; }
}

// ---------- Health Records ----------
const HEALTH_EMPTY = { cowId: '', recordedOn: '', healthStatus: 'healthy', bodyConditionScore: '', lamenessScore: '', aiDetectedDisease: '', aiConfidence: '', photoUrl: '', notes: '', veterinarianName: '' };

function HealthRecords({ farmId }: { farmId: string }) {
  const { push } = useToast();
  const [key, setKey] = useState(0);
  const { data: records, loading, error } = useAsync(() => isLive ? apiGet<any[]>(`/health/records${q({ farmId })}`).then((r: any) => r.data) : Promise.resolve([]), [farmId, key]);
  const [cows, setCows] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(HEALTH_EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isLive) return;
    apiGet<{ data: any[] }>(`/cows${q({ farmId, pageSize: 200 })}`).then((r: any) => setCows(r.data || [])).catch(() => {});
  }, [farmId]);
  useEffect(() => {
    const openForm = () => setOpen(true);
    window.addEventListener('dairyos:health:add-record', openForm);
    return () => window.removeEventListener('dairyos:health:add-record', openForm);
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.cowId) { push('Cow is required'); return; }
    setSaving(true);
    try {
      await apiSend('/health/records', 'POST', {
        cowId: form.cowId,
        recordedOn: form.recordedOn,
        healthStatus: form.healthStatus,
        bodyConditionScore: form.bodyConditionScore ? Number(form.bodyConditionScore) : undefined,
        lamenessScore: form.lamenessScore ? Number(form.lamenessScore) : undefined,
        aiDetectedDisease: form.aiDetectedDisease || undefined,
        aiConfidence: form.aiConfidence ? Number(form.aiConfidence) : undefined,
        photoUrl: form.photoUrl || undefined,
        notes: form.notes || undefined,
        veterinarianName: form.veterinarianName || undefined,
      });
      push('Health record saved');
      setForm(HEALTH_EMPTY);
      setOpen(false);
      setKey((k) => k + 1);
    } catch (err: any) { push(err.message); }
    setSaving(false);
  };

  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <h3>Health records</h3>
        <button className="btn sm" onClick={() => setOpen(true)}><Plus size={16} /> Add record</button>
      </div>
      {loading ? <Skeleton h={180} /> : error ? <p style={{ color: 'var(--danger)', fontSize: 13 }}>Failed to load health records: {error}</p> : (
        <div className="table-wrap">
          <table><thead><tr><th>Date</th><th>Cow</th><th>Status</th><th>BCS</th><th>Lameness</th><th>AI Detection</th><th>Vet</th></tr></thead>
            <tbody>{(records || []).map((r: any) => (
              <tr key={r.id}><td>{fmt.date(r.recorded_on)}</td><td>{r.cow_name} ({r.cow_code})</td>
                <td><span className={`pill ${r.health_status === 'healthy' ? 'healthy' : r.health_status === 'critical' ? 'danger' : 'warn'}`}>{r.health_status}</span></td>
                <td>{r.body_condition_score ?? '—'}</td><td>{r.lameness_score ?? '—'}</td>
                <td>{r.ai_detected_disease ? `${r.ai_detected_disease} (${Math.round((r.ai_confidence || 0) * 100)}%)` : '—'}</td>
                <td>{r.veterinarian_name || '—'}</td></tr>
            ))}</tbody></table>
          </div>
        )}
      {open && <Modal title="Add health record" onClose={() => setOpen(false)}>
        <form onSubmit={submit}>
          <div className="field"><label>Cow</label><select className="select" value={form.cowId} onChange={(e) => setForm({ ...form, cowId: e.target.value })} required><option value="">Select cow</option>{(cows || []).map((c: any) => <option key={c.id} value={c.id}>{c.name || 'Unnamed'} ({c.cow_code || c.cowCode || '—'})</option>)}</select></div>
          <div className="row" style={{ gap: 10 }}>
            <div className="field"><label>Date</label><input className="input" type="date" value={form.recordedOn} onChange={(e) => setForm({ ...form, recordedOn: e.target.value })} /></div>
            <div className="field"><label>Health status</label><select className="select" value={form.healthStatus} onChange={(e) => setForm({ ...form, healthStatus: e.target.value })}><option value="healthy">Healthy</option><option value="sick">Sick</option><option value="under_treatment">Under treatment</option><option value="critical">Critical</option></select></div>
          </div>
          <div className="row" style={{ gap: 10 }}>
            <div className="field"><label>Body condition score (1-9)</label><input className="input" type="number" min="1" max="9" value={form.bodyConditionScore} onChange={(e) => setForm({ ...form, bodyConditionScore: e.target.value })} /></div>
            <div className="field"><label>Lameness score (0-5)</label><input className="input" type="number" min="0" max="5" value={form.lamenessScore} onChange={(e) => setForm({ ...form, lamenessScore: e.target.value })} /></div>
          </div>
          <div className="field"><label>AI detected disease</label><input className="input" value={form.aiDetectedDisease} onChange={(e) => setForm({ ...form, aiDetectedDisease: e.target.value })} placeholder="e.g., Mastitis, Lameness" /></div>
          <div className="field"><label>AI confidence (0-1)</label><input className="input" type="number" step="0.01" min="0" max="1" value={form.aiConfidence} onChange={(e) => setForm({ ...form, aiConfidence: e.target.value })} /></div>
          <div className="field"><label>Photo URL</label><input className="input" value={form.photoUrl} onChange={(e) => setForm({ ...form, photoUrl: e.target.value })} /></div>
          <div className="field"><label>Veterinarian name</label><input className="input" value={form.veterinarianName} onChange={(e) => setForm({ ...form, veterinarianName: e.target.value })} /></div>
          <div className="field"><label>Notes</label><textarea className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          <div className="row mt" style={{ justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" className="btn ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn" type="submit" disabled={saving}><Save size={15} /> {saving ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </Modal>}
    </div>
  );
}

// ---------- Medicine Inventory ----------
const MEDICINE_EMPTY = { name: '', category: '', quantityOnHand: '', unit: 'doses', reorderLevel: '', expiryDate: '', batchNumber: '', supplier: '', costPerUnit: '', storageRequirements: '', notes: '' };

function MedicineInventory({ farmId }: { farmId: string }) {
  const { push } = useToast();
  const [key, setKey] = useState(0);
  const { data: medicines, loading } = useAsync(() => isLive ? apiGet<any[]>(`/health/medicines${q({ farmId })}`).then((r: any) => r.data) : Promise.resolve([]), [farmId, key]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(MEDICINE_EMPTY);
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiSend('/health/medicines', 'POST', {
        name: form.name, category: form.category, quantityOnHand: Number(form.quantityOnHand) || 0,
        unit: form.unit, reorderLevel: Number(form.reorderLevel) || 0, expiryDate: form.expiryDate || undefined,
        batchNumber: form.batchNumber || undefined, supplier: form.supplier || undefined, costPerUnit: form.costPerUnit ? Number(form.costPerUnit) : undefined,
        storageRequirements: form.storageRequirements || undefined, notes: form.notes || undefined,
      });
      push('Medicine added');
      setForm(MEDICINE_EMPTY);
      setOpen(false);
      setKey((k) => k + 1);
    } catch (err: any) { push(err.message); }
    setSaving(false);
  };

  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <h3>Medicine inventory</h3>
        <button className="btn sm" onClick={() => setOpen(true)}><Plus size={16} /> Add medicine</button>
      </div>
      {loading ? <Skeleton h={180} /> : (
        <div className="table-wrap">
          <table><thead><tr><th>Name</th><th>Category</th><th>Quantity</th><th>Reorder level</th><th>Expiry</th><th>Status</th></tr></thead>
            <tbody>{(medicines || []).map((m: any) => (
              <tr key={m.id} style={m.needs_reorder ? { background: 'rgba(220,38,38,0.08)' } : {}}>
                <td><b>{m.name}</b></td><td>{m.category}</td><td>{m.quantity_on_hand} {m.unit}</td><td>{m.reorder_level}</td><td>{m.expiry_date ? fmt.date(m.expiry_date) : '—'}</td>
                <td>{m.needs_reorder ? <span className="pill danger">Reorder</span> : <span className="pill healthy">OK</span>}</td></tr>
            ))}</tbody></table>
        </div>
      )}
      {open && <Modal title="Add medicine" onClose={() => setOpen(false)}>
        <form onSubmit={submit}>
          <div className="row" style={{ gap: 10 }}>
            <div className="field" style={{ flex: 1 }}><label>Name</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
            <div className="field" style={{ flex: 1 }}><label>Category</label><input className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} required /></div>
          </div>
          <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
            <div className="field" style={{ flex: 1, minWidth: 0 }}><label>Quantity</label><input className="input" type="number" value={form.quantityOnHand} onChange={(e) => setForm({ ...form, quantityOnHand: e.target.value })} /></div>
            <div className="field" style={{ flex: 1, minWidth: 0 }}><label>Unit</label><input className="input" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} /></div>
            <div className="field" style={{ flex: 1, minWidth: 0 }}><label>Reorder level</label><input className="input" type="number" value={form.reorderLevel} onChange={(e) => setForm({ ...form, reorderLevel: e.target.value })} /></div>
          </div>
          <div className="row" style={{ gap: 10 }}>
            <div className="field"><label>Expiry date</label><input className="input" type="date" value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} /></div>
            <div className="field"><label>Batch number</label><input className="input" value={form.batchNumber} onChange={(e) => setForm({ ...form, batchNumber: e.target.value })} /></div>
          </div>
          <div className="field"><label>Supplier</label><input className="input" value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} /></div>
          <div className="field"><label>Cost per unit</label><input className="input" type="number" step="0.01" value={form.costPerUnit} onChange={(e) => setForm({ ...form, costPerUnit: e.target.value })} /></div>
          <div className="field"><label>Storage requirements</label><input className="input" value={form.storageRequirements} onChange={(e) => setForm({ ...form, storageRequirements: e.target.value })} /></div>
          <div className="field"><label>Notes</label><textarea className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          <div className="row mt" style={{ justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" className="btn ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn" type="submit" disabled={saving}><Save size={15} /> {saving ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </Modal>}
    </div>
  );
}

// ---------- Lab Tests ----------
const LAB_EMPTY = { cowId: '', testType: '', sampleType: '', collectedOn: '', status: 'pending', veterinarianName: '', labName: '', notes: '' };

function LabTests({ farmId }: { farmId: string }) {
  const { push } = useToast();
  const [key, setKey] = useState(0);
  const { data: tests, loading } = useAsync(() => isLive ? apiGet<any[]>(`/health/lab-tests${q({ farmId })}`).then((r: any) => r.data) : Promise.resolve([]), [farmId, key]);
  const [cows, setCows] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(LAB_EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isLive) return;
    apiGet<{ data: any[] }>(`/cows${q({ farmId, pageSize: 200 })}`).then((r: any) => setCows(r.data || [])).catch(() => {});
  }, [farmId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.cowId || !form.testType || !form.sampleType) { push('Cow, test type and sample type are required'); return; }
    setSaving(true);
    try {
      await apiSend('/health/lab-tests', 'POST', {
        cowId: form.cowId, testType: form.testType, sampleType: form.sampleType,
        collectedOn: form.collectedOn, status: form.status, veterinarianName: form.veterinarianName || undefined,
        labName: form.labName || undefined, notes: form.notes || undefined, results: {},
      });
      push('Lab test recorded');
      setForm(LAB_EMPTY);
      setOpen(false);
      setKey((k) => k + 1);
    } catch (err: any) { push(err.message); }
    setSaving(false);
  };

  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <h3>Laboratory tests</h3>
        <button className="btn sm" onClick={() => setOpen(true)}><Plus size={16} /> Add test</button>
      </div>
      {loading ? <Skeleton h={180} /> : (
        <div className="table-wrap">
          <table><thead><tr><th>Date</th><th>Cow</th><th>Test type</th><th>Sample</th><th>Status</th><th>Lab</th><th>Vet</th></tr></thead>
            <tbody>{(tests || []).map((t: any) => (
              <tr key={t.id}><td>{fmt.date(t.collected_on)}</td><td>{t.cow_name} ({t.cow_code})</td><td>{t.test_type}</td><td>{t.sample_type}</td>
                <td><span className={`pill ${t.status === 'completed' ? 'healthy' : t.status === 'pending' ? 'warn' : 'danger'}`}>{t.status}</span></td>
                <td>{t.lab_name || '—'}</td><td>{t.veterinarian_name || '—'}</td></tr>
            ))}</tbody></table>
        </div>
      )}
      {open && <Modal title="Add lab test" onClose={() => setOpen(false)}>
        <form onSubmit={submit}>
          <div className="field"><label>Cow</label><select className="select" value={form.cowId} onChange={(e) => setForm({ ...form, cowId: e.target.value })} required><option value="">Select cow</option>{(cows || []).map((c: any) => <option key={c.id} value={c.id}>{c.name || 'Unnamed'} ({c.cow_code || c.cowCode || '—'})</option>)}</select></div>
          <div className="row" style={{ gap: 10 }}>
            <div className="field" style={{ flex: 1 }}><label>Test type</label><input className="input" value={form.testType} onChange={(e) => setForm({ ...form, testType: e.target.value })} required /></div>
            <div className="field" style={{ flex: 1 }}><label>Sample type</label><input className="input" value={form.sampleType} onChange={(e) => setForm({ ...form, sampleType: e.target.value })} required /></div>
          </div>
          <div className="row" style={{ gap: 10 }}>
            <div className="field"><label>Collected on</label><input className="input" type="date" value={form.collectedOn} onChange={(e) => setForm({ ...form, collectedOn: e.target.value })} /></div>
            <div className="field"><label>Status</label><select className="select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option value="pending">Pending</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></div>
          </div>
          <div className="row" style={{ gap: 10 }}>
            <div className="field"><label>Veterinarian</label><input className="input" value={form.veterinarianName} onChange={(e) => setForm({ ...form, veterinarianName: e.target.value })} /></div>
            <div className="field"><label>Lab name</label><input className="input" value={form.labName} onChange={(e) => setForm({ ...form, labName: e.target.value })} /></div>
          </div>
          <div className="field"><label>Notes</label><textarea className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          <div className="row mt" style={{ justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" className="btn ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn" type="submit" disabled={saving}><Save size={15} /> {saving ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </Modal>}
    </div>
  );
}

// ---------- Parasite Control ----------
const PARASITE_EMPTY = { cowId: '', treatmentType: '', productName: '', scheduledOn: '', administeredOn: '', status: 'scheduled', dosage: '', veterinarianName: '', notes: '' };

function ParasiteControl({ farmId }: { farmId: string }) {
  const { push } = useToast();
  const [key, setKey] = useState(0);
  const { data: items, loading } = useAsync(() => isLive ? apiGet<any[]>(`/health/parasite-control${q({ farmId })}`).then((r: any) => r.data) : Promise.resolve([]), [farmId, key]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(PARASITE_EMPTY);
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.treatmentType || !form.productName || !form.scheduledOn) { push('Treatment type, product and date are required'); return; }
    setSaving(true);
    try {
      await apiSend('/health/parasite-control', 'POST', {
        cowId: form.cowId || undefined, treatmentType: form.treatmentType, productName: form.productName,
        scheduledOn: form.scheduledOn, administeredOn: form.administeredOn || undefined, status: form.status,
        dosage: form.dosage || undefined, veterinarianName: form.veterinarianName || undefined, notes: form.notes || undefined,
      });
      push('Parasite control scheduled');
      setForm(PARASITE_EMPTY);
      setOpen(false);
      setKey((k) => k + 1);
    } catch (err: any) { push(err.message); }
    setSaving(false);
  };

  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <h3>Parasite control schedules</h3>
        <button className="btn sm" onClick={() => setOpen(true)}><Plus size={16} /> Schedule treatment</button>
      </div>
      {loading ? <Skeleton h={180} /> : (
        <div className="table-wrap">
          <table><thead><tr><th>Scheduled</th><th>Cow</th><th>Type</th><th>Product</th><th>Status</th><th>Dosage</th><th>Vet</th></tr></thead>
            <tbody>{(items || []).map((p: any) => (
              <tr key={p.id}><td>{fmt.date(p.scheduled_on)}</td><td>{p.cow_name ? `${p.cow_name} (${p.cow_code})` : 'All cows'}</td><td>{p.treatment_type}</td><td>{p.product_name}</td>
                <td><span className={`pill ${p.status === 'completed' ? 'healthy' : p.status === 'scheduled' ? 'info' : 'danger'}`}>{p.status}</span></td>
                <td>{p.dosage || '—'}</td><td>{p.veterinarian_name || '—'}</td></tr>
            ))}</tbody></table>
        </div>
      )}
      {open && <Modal title="Schedule parasite control" onClose={() => setOpen(false)}>
        <form onSubmit={submit}>
          <div className="field"><label>Cow (optional)</label><select className="select" value={form.cowId} onChange={(e) => setForm({ ...form, cowId: e.target.value })}><option value="">All cows / Herd</option>{items?.map((p: any) => <option key={p.cow_id} value={p.cow_id}>{p.cow_name} ({p.cow_code})</option>)}</select></div>
          <div className="row" style={{ gap: 10 }}>
            <div className="field" style={{ flex: 1 }}><label>Treatment type</label><input className="input" value={form.treatmentType} onChange={(e) => setForm({ ...form, treatmentType: e.target.value })} required /></div>
            <div className="field" style={{ flex: 1 }}><label>Product name</label><input className="input" value={form.productName} onChange={(e) => setForm({ ...form, productName: e.target.value })} required /></div>
          </div>
          <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
            <div className="field" style={{ flex: 1, minWidth: 0 }}><label>Scheduled on</label><input className="input" type="date" value={form.scheduledOn} onChange={(e) => setForm({ ...form, scheduledOn: e.target.value })} required /></div>
            <div className="field" style={{ flex: 1, minWidth: 0 }}><label>Administered on</label><input className="input" type="date" value={form.administeredOn} onChange={(e) => setForm({ ...form, administeredOn: e.target.value })} /></div>
            <div className="field" style={{ flex: 1, minWidth: 0 }}><label>Status</label><select className="select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option value="scheduled">Scheduled</option><option value="completed">Completed</option><option value="missed">Missed</option></select></div>
          </div>
          <div className="row" style={{ gap: 10 }}>
            <div className="field"><label>Dosage</label><input className="input" value={form.dosage} onChange={(e) => setForm({ ...form, dosage: e.target.value })} /></div>
            <div className="field"><label>Veterinarian</label><input className="input" value={form.veterinarianName} onChange={(e) => setForm({ ...form, veterinarianName: e.target.value })} /></div>
          </div>
          <div className="field"><label>Notes</label><textarea className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          <div className="row mt" style={{ justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" className="btn ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn" type="submit" disabled={saving}><Save size={15} /> {saving ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </Modal>}
    </div>
  );
}

// ---------- Quarantine ----------
const QUARANTINE_EMPTY = { cowId: '', reason: '', startDate: '', endDate: '', location: '', status: 'active', testResults: '', veterinarianName: '', notes: '' };

function Quarantine({ farmId }: { farmId: string }) {
  const { push } = useToast();
  const [key, setKey] = useState(0);
  const { data: records, loading } = useAsync(() => isLive ? apiGet<any[]>(`/health/quarantine${q({ farmId })}`).then((r: any) => r.data) : Promise.resolve([]), [farmId, key]);
  const [cows, setCows] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(QUARANTINE_EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isLive) return;
    apiGet<{ data: any[] }>(`/cows${q({ farmId, pageSize: 200 })}`).then((r: any) => setCows(r.data || [])).catch(() => {});
  }, [farmId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.cowId || !form.reason || !form.startDate || !form.location) { push('Cow, reason, start date and location are required'); return; }
    setSaving(true);
    try {
      await apiSend('/health/quarantine', 'POST', {
        cowId: form.cowId, reason: form.reason, startDate: form.startDate, endDate: form.endDate || undefined,
        location: form.location, status: form.status, testResults: form.testResults || undefined,
        veterinarianName: form.veterinarianName || undefined, notes: form.notes || undefined,
      });
      push('Quarantine record created');
      setForm(QUARANTINE_EMPTY);
      setOpen(false);
      setKey((k) => k + 1);
    } catch (err: any) { push(err.message); }
    setSaving(false);
  };

  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <h3>Quarantine management</h3>
        <button className="btn sm" onClick={() => setOpen(true)}><Plus size={16} /> New quarantine</button>
      </div>
      {loading ? <Skeleton h={180} /> : (
        <div className="table-wrap">
          <table><thead><tr><th>Cow</th><th>Reason</th><th>Start</th><th>End</th><th>Location</th><th>Status</th></tr></thead>
            <tbody>{(records || []).map((q: any) => (
              <tr key={q.id}><td>{q.cow_name} ({q.cow_code})</td><td>{q.reason}</td><td>{fmt.date(q.start_date)}</td><td>{q.end_date ? fmt.date(q.end_date) : '—'}</td><td>{q.location}</td>
                <td><span className={`pill ${q.status === 'active' ? 'danger' : q.status === 'completed' ? 'healthy' : 'warn'}`}>{q.status}</span></td></tr>
            ))}</tbody></table>
        </div>
      )}
      {open && <Modal title="New quarantine record" onClose={() => setOpen(false)}>
        <form onSubmit={submit}>
          <div className="field"><label>Cow</label><select className="select" value={form.cowId} onChange={(e) => setForm({ ...form, cowId: e.target.value })} required><option value="">Select cow</option>{(cows || []).map((c: any) => <option key={c.id} value={c.id}>{c.name || 'Unnamed'} ({c.cow_code || c.cowCode || '—'})</option>)}</select></div>
          <div className="field"><label>Reason</label><textarea className="input" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} required /></div>
          <div className="row" style={{ gap: 10 }}>
            <div className="field"><label>Start date</label><input className="input" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} required /></div>
            <div className="field"><label>End date</label><input className="input" type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></div>
          </div>
          <div className="field"><label>Location</label><input className="input" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} required /></div>
          <div className="field"><label>Status</label><select className="select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option value="active">Active</option><option value="completed">Completed</option><option value="extended">Extended</option></select></div>
          <div className="field"><label>Test results (JSON)</label><textarea className="input" value={form.testResults} onChange={(e) => setForm({ ...form, testResults: e.target.value })} /></div>
          <div className="field"><label>Veterinarian</label><input className="input" value={form.veterinarianName} onChange={(e) => setForm({ ...form, veterinarianName: e.target.value })} /></div>
          <div className="field"><label>Notes</label><textarea className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          <div className="row mt" style={{ justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" className="btn ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn" type="submit" disabled={saving}><Save size={15} /> {saving ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </Modal>}
    </div>
  );
}

// ---------- Emergency Alerts ----------
const ALERT_EMPTY = { cowId: '', alertType: '', severity: 'high', message: '' };

function EmergencyAlerts({ farmId }: { farmId: string }) {
  const { push } = useToast();
  const [key, setKey] = useState(0);
  const { data: alerts, loading } = useAsync(() => isLive ? apiGet<any[]>(`/health/alerts${q({ farmId })}`).then((r: any) => r.data) : Promise.resolve([]), [farmId, key]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(ALERT_EMPTY);
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.alertType || !form.message) { push('Alert type and message are required'); return; }
    setSaving(true);
    try {
      await apiSend('/health/alerts', 'POST', {
        cowId: form.cowId || undefined, alertType: form.alertType, severity: form.severity, message: form.message,
      });
      push('Emergency alert created');
      setForm(ALERT_EMPTY);
      setOpen(false);
      setKey((k) => k + 1);
    } catch (err: any) { push(err.message); }
    setSaving(false);
  };

  const acknowledge = async (id: string) => {
    try { await apiSend(`/health/alerts/${id}`, 'PATCH', { acknowledged: true }); push('Alert acknowledged'); setKey((k) => k + 1); } catch (err: any) { push(err.message); }
  };
  const resolve = async (id: string) => {
    try { await apiSend(`/health/alerts/${id}`, 'PATCH', { resolved: true }); push('Alert resolved'); setKey((k) => k + 1); } catch (err: any) { push(err.message); }
  };

  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <h3>Emergency health alerts</h3>
        <button className="btn sm" onClick={() => setOpen(true)}><Plus size={16} /> New alert</button>
      </div>
      {loading ? <Skeleton h={180} /> : (
        <div className="table-wrap">
          <table><thead><tr><th>Created</th><th>Cow</th><th>Type</th><th>Severity</th><th>Message</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>{(alerts || []).map((a: any) => (
              <tr key={a.id}><td>{fmt.date(a.created_at)}</td><td>{a.cow_name ? `${a.cow_name} (${a.cow_code})` : 'Herd'}</td><td>{a.alert_type}</td>
                <td><span className={`pill ${a.severity === 'critical' ? 'danger' : a.severity === 'high' ? 'warn' : 'info'}`}>{a.severity}</span></td>
                <td>{a.message}</td>
                <td>{a.resolved ? <span className="pill healthy">Resolved</span> : a.acknowledged ? <span className="pill info">Acknowledged</span> : <span className="pill danger">Open</span>}</td>
                <td className="row" style={{ gap: 6 }}>{!a.acknowledged && <button className="btn ghost sm" onClick={() => acknowledge(a.id)}>Ack</button>}{!a.resolved && <button className="btn ghost sm" onClick={() => resolve(a.id)}>Resolve</button>}</td></tr>
            ))}</tbody></table>
        </div>
      )}
      {open && <Modal title="New emergency alert" onClose={() => setOpen(false)}>
        <form onSubmit={submit}>
          <div className="field"><label>Cow (optional)</label><select className="select" value={form.cowId} onChange={(e) => setForm({ ...form, cowId: e.target.value })}><option value="">Herd-wide</option>{alerts?.map((a: any) => <option key={a.cow_id} value={a.cow_id}>{a.cow_name} ({a.cow_code})</option>)}</select></div>
          <div className="row" style={{ gap: 10 }}>
            <div className="field" style={{ flex: 1 }}><label>Alert type</label><input className="input" value={form.alertType} onChange={(e) => setForm({ ...form, alertType: e.target.value })} required /></div>
            <div className="field" style={{ flex: 1 }}><label>Severity</label><select className="select" value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></div>
          </div>
          <div className="field"><label>Message</label><textarea className="input" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} required /></div>
          <div className="row mt" style={{ justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" className="btn ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn" type="submit" disabled={saving}><Save size={15} /> {saving ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </Modal>}
    </div>
  );
}

// ---------- Treatment Effectiveness ----------
function TreatmentEffectiveness({ farmId }: { farmId: string }) {
  const { data: reports, loading } = useAsync(() => isLive ? apiGet<any[]>(`/health/treatment-effectiveness${q({ farmId })}`).then((r: any) => r.data) : Promise.resolve([]), [farmId]);

  return (
    <div>
      <h3>Treatment effectiveness reports</h3>
      {loading ? <Skeleton h={180} /> : (
        <div className="table-wrap">
          <table><thead><tr><th>Cow</th><th>Diagnosis</th><th>Status</th><th>Diagnosed</th><th>Follow-ups</th><th>Last follow-up</th></tr></thead>
            <tbody>{(reports || []).map((r: any) => (
              <tr key={r.id}><td>{r.cow_name} ({r.cow_code})</td><td>{r.diagnosis}</td>
                <td><span className={`pill ${r.status === 'Resolved' ? 'healthy' : r.status === 'Active' ? 'danger' : 'warn'}`}>{r.status}</span></td>
                <td>{fmt.date(r.diagnosed_on)}</td><td>{r.follow_ups}</td><td>{r.last_follow_up ? fmt.date(r.last_follow_up) : '—'}</td></tr>
            ))}</tbody></table>
        </div>
      )}
    </div>
  );
}

type HealthBundle = { cows: any[]; records: any[]; alerts: any[]; labs: any[]; parasite: any[]; quarantine: any[]; treatments: any[]; vaccinations: any[] };

function HealthDashboard({ farmId, onAddRecord }: { farmId: string; onAddRecord: () => void }) {
  const [, navigate] = useHashRoute();
  const { push } = useToast();
  const [refreshKey, setRefreshKey] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [treatmentOpen, setTreatmentOpen] = useState(false);
  const [vaccinationOpen, setVaccinationOpen] = useState(false);
  const [savingAction, setSavingAction] = useState(false);
  const [treatmentForm, setTreatmentForm] = useState({ cowId: '', diseaseName: '', diagnosis: '', treatmentPlan: '', veterinarianName: '' });
  const [vaccinationForm, setVaccinationForm] = useState({ cowId: '', vaccineName: '', dueOn: '', administeredOn: '' });
  const { data, loading, error } = useAsync<HealthBundle>(async () => {
    if (!isLive) return { cows: [], records: [], alerts: [], labs: [], parasite: [], quarantine: [], treatments: [], vaccinations: [] };
    const [cows, records, alerts, labs, parasite, quarantine, treatments, vaccinations] = await Promise.all([
      apiGet<{ data: any[] }>(`/cows${q({ farmId, pageSize: 200 })}`).then((r) => r.data || []),
      apiGet<{ data: any[] }>(`/health/records${q({ farmId })}`).then((r) => r.data || []),
      apiGet<{ data: any[] }>(`/health/alerts${q({ farmId })}`).then((r) => r.data || []),
      apiGet<{ data: any[] }>(`/health/lab-tests${q({ farmId })}`).then((r) => r.data || []),
      apiGet<{ data: any[] }>(`/health/parasite-control${q({ farmId })}`).then((r) => r.data || []),
      apiGet<{ data: any[] }>(`/health/quarantine${q({ farmId })}`).then((r) => r.data || []),
      farmTreatments(farmId), farmVaccinations(farmId),
    ]);
    return { cows, records, alerts, labs, parasite, quarantine, treatments, vaccinations };
  }, [farmId, refreshKey]);

  const bundle = data || { cows: [], records: [], alerts: [], labs: [], parasite: [], quarantine: [], treatments: [], vaccinations: [] };
  const cowById = useMemo(() => new Map(bundle.cows.map((cow) => [cow.id, cow])), [bundle.cows]);
  const today = new Date();
  const cutoff = dateFilter === '7' ? 7 : dateFilter === '30' ? 30 : dateFilter === '90' ? 90 : 0;
  const inDateRange = (value?: string) => !cutoff || (value ? (today.getTime() - new Date(value).getTime()) / 86400000 <= cutoff : false);
  const activeTreatments = bundle.treatments.filter((t) => !['resolved', 'completed', 'closed'].includes(String(t.status || '').toLowerCase()));
  const openAlerts = bundle.alerts.filter((a) => !a.resolved);
  const attentionCows = new Set([...activeTreatments.map((t) => t.cow_id), ...bundle.records.filter((r) => r.health_status !== 'healthy').map((r) => r.cow_id), ...openAlerts.map((a) => a.cow_id)].filter(Boolean));
  const criticalAlerts = openAlerts.filter((a) => a.severity === 'critical');
  const upcomingVaccinations = bundle.vaccinations.filter((v) => v.due_on && new Date(v.due_on) >= today && !v.administered_on).sort((a, b) => new Date(a.due_on).getTime() - new Date(b.due_on).getTime());
  const overdueVaccinations = bundle.vaccinations.filter((v) => v.due_on && new Date(v.due_on) < today && !v.administered_on);
  const filteredCows = bundle.cows.filter((cow) => {
    const text = `${cow.name || ''} ${cow.cow_code || ''} ${cow.ear_tag || ''} ${cow.breed || ''}`.toLowerCase();
    const matchesSearch = !search || text.includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || cow.health === statusFilter;
    const matchesSeverity = severityFilter === 'all' || bundle.alerts.some((a) => a.cow_id === cow.id && a.severity === severityFilter && !a.resolved);
    return matchesSearch && matchesStatus && matchesSeverity;
  });
  const recentRecords = bundle.records.filter((r) => inDateRange(r.recorded_on)).sort((a, b) => new Date(b.recorded_on).getTime() - new Date(a.recorded_on).getTime());
  const diseaseCounts = bundle.records.reduce((acc: Record<string, number>, record) => { const disease = record.ai_detected_disease || record.health_status || 'Unspecified'; acc[disease] = (acc[disease] || 0) + 1; return acc; }, {});
  const statusCounts = bundle.cows.reduce((acc: Record<string, number>, cow) => { const status = cow.health || 'unknown'; acc[status] = (acc[status] || 0) + 1; return acc; }, {});
  const maxDisease = Math.max(1, ...Object.values(diseaseCounts));
  const maxStatus = Math.max(1, ...Object.values(statusCounts));
  const age = (date?: string) => date ? Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / (365.25 * 86400000))) : null;
  const statusTone = (status: string) => status === 'healthy' ? 'healthy' : status === 'critical' ? 'danger' : 'warn';
  const severityLabel = (severity: string) => severity === 'critical' ? '🔴 Critical' : severity === 'high' ? '🟠 High' : severity === 'medium' ? '🟡 Moderate' : '🟢 Normal';
  const alertRank = (severity: string) => ({ critical: 0, high: 1, medium: 2, low: 3 } as Record<string, number>)[severity] ?? 4;
  const retry = () => setRefreshKey((key) => key + 1);
  const askAi = (cow: any) => {
    localStorage.setItem('dairyos:ai-prefill', `Tell me about ${cow.name || cow.cow_code} (${cow.cow_code || cow.id}) health: current status, treatment, vaccinations, risks, and what should I monitor.`);
    navigate('/app/ai-advisor');
  };
  const saveTreatment = async (event: React.FormEvent) => {
    event.preventDefault();
    setSavingAction(true);
    try { await createTreatment(treatmentForm); setTreatmentOpen(false); setTreatmentForm({ cowId: '', diseaseName: '', diagnosis: '', treatmentPlan: '', veterinarianName: '' }); retry(); }
    catch (err: any) { push(err.message || 'Could not save treatment'); }
    setSavingAction(false);
  };
  const saveVaccination = async (event: React.FormEvent) => {
    event.preventDefault();
    setSavingAction(true);
    try { await apiSend('/health/vaccinations', 'POST', vaccinationForm); setVaccinationOpen(false); setVaccinationForm({ cowId: '', vaccineName: '', dueOn: '', administeredOn: '' }); retry(); }
    catch (err: any) { push(err.message || 'Could not save vaccination'); }
    setSavingAction(false);
  };

  if (loading) return <div className="health-dashboard-loading"><Skeleton h={120} /><Skeleton h={280} /><Skeleton h={220} /></div>;
  if (error) return <div className="health-error"><AlertTriangle size={28} /><h3>Health data could not be loaded</h3><p>{error}</p><button className="btn" onClick={retry}><RefreshCw size={15} /> Retry</button></div>;

  return <div className="health-dashboard">
    <div className="health-dashboard-head">
      <div><span className="eyebrow">CLINICAL OVERVIEW</span><h2>Herd health at a glance</h2><p className="muted">Real health records, treatments, alerts, laboratory results, and vaccination schedules for {bundle.cows.length} animals.</p></div>
      <button className="btn" onClick={onAddRecord}><Plus size={16} /> Add Health Record</button>
    </div>
    {!isLive && <div className="health-empty"><Activity size={22} /><p>No health records have been recorded for this farm yet.</p><button className="btn sm" onClick={onAddRecord}><Plus size={14} /> Add Health Record</button></div>}
    <div className="four health-kpis">
      <Kpi icon={<Activity size={18} />} label="Total animals" value={fmt.num(bundle.cows.length)} />
      <Kpi icon={<Activity size={18} />} label="Healthy animals" value={fmt.num(bundle.cows.filter((c) => c.health === 'healthy').length)} />
      <Kpi icon={<Pill size={18} />} label="Under treatment" value={fmt.num(activeTreatments.length)} tone="down" />
      <Kpi icon={<AlertTriangle size={18} />} label="Requiring attention" value={fmt.num(attentionCows.size)} tone="down" />
      <Kpi icon={<ShieldAlert size={18} />} label="Critical alerts" value={fmt.num(criticalAlerts.length)} tone="down" />
      <Kpi icon={<Activity size={18} />} label="Recent incidents" value={fmt.num(recentRecords.length)} />
      <Kpi icon={<RefreshCw size={18} />} label="Health follow-ups" value={fmt.num(upcomingVaccinations.length)} />
    </div>

    <section className="health-section"><div className="health-section-title"><div><h3>Health alerts</h3><p className="muted">Highest-severity issues first</p></div><button className="btn ghost sm" onClick={() => navigate('/app/ai-advisor')}>Ask AI about the herd</button></div>
      {openAlerts.length === 0 ? <div className="health-empty"><p>No open health alerts.</p></div> : <div className="health-alert-grid">{openAlerts.sort((a, b) => alertRank(a.severity) - alertRank(b.severity)).slice(0, 12).map((alert) => <div className={`health-alert-card ${alert.severity}`} key={alert.id}><div className="between"><b>{alert.cow_name || 'Herd-wide'} <span className="muted">{alert.cow_code ? `· ${alert.cow_code}` : ''}</span></b><span>{severityLabel(alert.severity)}</span></div><p>{alert.alert_type}: {alert.message}</p><small className="muted">Detected {fmt.date(alert.created_at)} · {alert.resolved ? 'Resolved' : alert.acknowledged ? 'Acknowledged' : 'Open'}</small><div className="muted" style={{ marginTop: 7, fontSize: 12 }}>Recommended action: review the record and assign follow-up.</div></div>)}</div>}
    </section>

    <section className="health-section"><div className="health-section-title"><div><h3>Animal health list</h3><p className="muted">Select an animal to open its complete health profile.</p></div><div className="health-filters"><input className="input" placeholder="Search name or animal ID" value={search} onChange={(e) => setSearch(e.target.value)} /><select className="select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="all">All statuses</option><option value="healthy">Healthy</option><option value="sick">Sick</option><option value="under_treatment">Under treatment</option><option value="critical">Critical</option></select><select className="select" value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)}><option value="all">All severity</option><option value="critical">Critical</option><option value="high">High</option><option value="medium">Moderate</option></select><select className="select" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)}><option value="all">All dates</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option></select></div></div>
      {filteredCows.length === 0 ? <div className="health-empty"><p>No animals match these health filters.</p></div> : <div className="health-animal-list">{filteredCows.map((cow) => { const treatment = activeTreatments.find((t) => t.cow_id === cow.id); const cowRecords = bundle.records.filter((r) => r.cow_id === cow.id).sort((a, b) => new Date(b.recorded_on).getTime() - new Date(a.recorded_on).getTime()); const vaccine = bundle.vaccinations.find((v) => v.cow_id === cow.id && !v.administered_on); return <div className="health-animal-row" role="button" tabIndex={0} key={cow.id} onClick={() => navigate(`/animals/${cow.id}`)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate(`/animals/${cow.id}`); }}><CowPhoto name={cow.name} color="#6fa27c" size={48} photoUrl={cow.photo_url} /><div className="health-animal-main"><b>{cow.name || 'Unnamed animal'}</b><span className="muted">{cow.cow_code || cow.id} · {cow.breed || 'Breed not recorded'} · {age(cow.date_of_birth) !== null ? `${age(cow.date_of_birth)} years` : 'Age not recorded'}</span></div><span className={`pill ${statusTone(cow.health)}`}>{String(cow.health || 'unknown').replace('_', ' ')}</span><div className="health-animal-meta"><span>Last check: {cowRecords[0] ? fmt.date(cowRecords[0].recorded_on) : 'Not recorded'}</span><span>{treatment ? `Treatment: ${treatment.disease_name || treatment.diagnosis || 'Active'}` : 'No active treatment'}</span><span>{vaccine ? `Next vaccine: ${fmt.date(vaccine.due_on)}` : 'Vaccinations up to date'}</span></div><button className="btn ghost sm" onClick={(e) => { e.stopPropagation(); askAi(cow); }}>Ask AI</button></div>; })}</div>}
    </section>

    <div className="health-two-col"><section className="health-section"><div className="health-section-title"><div><h3>Health history</h3><p className="muted">Chronological examinations, diagnoses, and notes</p></div></div>{recentRecords.length === 0 ? <div className="health-empty"><p>No health records have been recorded for this farm yet.</p><button className="btn sm" onClick={onAddRecord}><Plus size={14} /> Add Health Record</button></div> : <div className="health-history-list">{recentRecords.slice(0, 20).map((record) => <div className="health-history-item" key={record.id}><span className="health-timeline-dot" /><div><b>{record.cow_name || cowById.get(record.cow_id)?.name || 'Animal'} · {record.health_status}</b><div className="muted">{fmt.date(record.recorded_on)}{record.ai_detected_disease ? ` · ${record.ai_detected_disease}` : ''}{record.veterinarian_name ? ` · Vet: ${record.veterinarian_name}` : ''}</div>{record.notes && <p>{record.notes}</p>}</div></div>)}</div>}</section>
      <section className="health-section"><div className="health-section-title"><div><h3>Treatments & vaccinations</h3><p className="muted">Current care and upcoming protection</p></div><div className="row"><button className="btn ghost sm" onClick={() => setTreatmentOpen(true)}><Plus size={14} /> Add treatment</button><button className="btn ghost sm" onClick={() => setVaccinationOpen(true)}><Plus size={14} /> Record vaccination</button></div></div><h4>Active treatments</h4>{activeTreatments.length === 0 ? <p className="muted">No active treatments.</p> : activeTreatments.slice(0, 8).map((t) => <div className="health-mini-row" key={t.id}><b>{t.cow_name || t.cow_code}</b><span>{t.disease_name || t.diagnosis || 'Condition not recorded'}</span><small>{t.veterinarian_name || 'Veterinarian not recorded'} · {fmt.date(t.diagnosed_on)}</small></div>)}<h4 className="mt">Upcoming vaccinations</h4>{upcomingVaccinations.slice(0, 8).map((v) => <div className="health-mini-row" key={v.id}><b>{v.cow_name || v.cow_code}</b><span>{v.vaccine_name}</span><small>Due {fmt.date(v.due_on)} · {v.veterinarian_name || 'Vet not recorded'}</small></div>)}{overdueVaccinations.length > 0 && <p className="health-overdue">{fmt.num(overdueVaccinations.length)} overdue vaccination{overdueVaccinations.length === 1 ? '' : 's'}</p>}</section></div>

    <section className="health-section"><div className="health-section-title"><div><h3>Health analytics</h3><p className="muted">Computed from current farm records</p></div></div><div className="health-analytics-grid"><div><b>Health status distribution</b>{Object.entries(statusCounts).map(([label, count]) => <div className="health-bar-row" key={label}><span>{label.replace('_', ' ')}</span><div><i style={{ width: `${(count / maxStatus) * 100}%` }} /></div><strong>{fmt.num(count)}</strong></div>)}</div><div><b>Incidents by type</b>{Object.entries(diseaseCounts).slice(0, 8).map(([label, count]) => <div className="health-bar-row" key={label}><span>{label}</span><div><i style={{ width: `${(count / maxDisease) * 100}%` }} /></div><strong>{fmt.num(count)}</strong></div>)}</div><div><b>Clinical data coverage</b><div className="health-coverage"><span><strong>{fmt.num(bundle.labs.length)}</strong> lab tests</span><span><strong>{fmt.num(bundle.quarantine.length)}</strong> quarantine records</span><span><strong>{fmt.num(bundle.parasite.length)}</strong> parasite schedules</span><span><strong>{fmt.num(bundle.vaccinations.filter((v) => v.administered_on).length)}</strong> administered vaccines</span></div></div></div></section>

    <section className="health-section"><div className="health-section-title"><div><h3>Veterinary records</h3><p className="muted">The database has no separate veterinary-visits table yet.</p></div></div><div className="health-empty"><p>Veterinary visit records are not available in the current schema. Veterinarian details from health records, treatments, lab tests, and vaccinations are shown above.</p></div></section>
    {treatmentOpen && <Modal title="Add treatment" onClose={() => setTreatmentOpen(false)}><form onSubmit={saveTreatment}><div className="field"><label>Animal</label><select className="select" value={treatmentForm.cowId} onChange={(e) => setTreatmentForm({ ...treatmentForm, cowId: e.target.value })} required><option value="">Select animal</option>{bundle.cows.map((cow) => <option key={cow.id} value={cow.id}>{cow.name || cow.cow_code} · {cow.cow_code}</option>)}</select></div><div className="field"><label>Condition</label><input className="input" value={treatmentForm.diseaseName} onChange={(e) => setTreatmentForm({ ...treatmentForm, diseaseName: e.target.value })} required /></div><div className="field"><label>Diagnosis</label><input className="input" value={treatmentForm.diagnosis} onChange={(e) => setTreatmentForm({ ...treatmentForm, diagnosis: e.target.value })} /></div><div className="field"><label>Treatment / medication plan</label><textarea className="input" value={treatmentForm.treatmentPlan} onChange={(e) => setTreatmentForm({ ...treatmentForm, treatmentPlan: e.target.value })} /></div><div className="field"><label>Veterinarian</label><input className="input" value={treatmentForm.veterinarianName} onChange={(e) => setTreatmentForm({ ...treatmentForm, veterinarianName: e.target.value })} /></div><div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}><button type="button" className="btn ghost" onClick={() => setTreatmentOpen(false)}>Cancel</button><button className="btn" disabled={savingAction}><Save size={14} /> Save treatment</button></div></form></Modal>}
    {vaccinationOpen && <Modal title="Record vaccination" onClose={() => setVaccinationOpen(false)}><form onSubmit={saveVaccination}><div className="field"><label>Animal</label><select className="select" value={vaccinationForm.cowId} onChange={(e) => setVaccinationForm({ ...vaccinationForm, cowId: e.target.value })} required><option value="">Select animal</option>{bundle.cows.map((cow) => <option key={cow.id} value={cow.id}>{cow.name || cow.cow_code} · {cow.cow_code}</option>)}</select></div><div className="field"><label>Vaccine</label><input className="input" value={vaccinationForm.vaccineName} onChange={(e) => setVaccinationForm({ ...vaccinationForm, vaccineName: e.target.value })} required /></div><div className="row" style={{ gap: 8 }}><div className="field"><label>Next vaccination date</label><input className="input" type="date" value={vaccinationForm.dueOn} onChange={(e) => setVaccinationForm({ ...vaccinationForm, dueOn: e.target.value })} required /></div><div className="field"><label>Administered date</label><input className="input" type="date" value={vaccinationForm.administeredOn} onChange={(e) => setVaccinationForm({ ...vaccinationForm, administeredOn: e.target.value })} /></div></div><div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}><button type="button" className="btn ghost" onClick={() => setVaccinationOpen(false)}>Cancel</button><button className="btn" disabled={savingAction}><Save size={14} /> Save vaccination</button></div></form></Modal>}
  </div>;
}

// ---------- Main Health Page ----------
export function Health() {
  const { farmId } = useFarm();
  const { push } = useToast();
  const [tab, setTab] = useState<'records' | 'medicines' | 'lab' | 'parasite' | 'quarantine' | 'alerts' | 'effectiveness'>('records');
  const [showTools, setShowTools] = useState(false);

  return (
    <div>
      <PageHeader eyebrow="HEALTH" title="Health & Veterinary" desc="A complete view of herd health, clinical records, treatment, vaccination, and risk."
        actions={<button className="btn sm" onClick={() => { setShowTools(true); setTab('records'); }}><Activity size={15} /> Clinical tools</button>} />

      <HealthDashboard farmId={farmId} onAddRecord={() => { setShowTools(true); setTab('records'); setTimeout(() => window.dispatchEvent(new Event('dairyos:health:add-record')), 0); }} />

      {showTools && <>
      <div className="between mt" style={{ marginBottom: 8 }}><div><h3>Clinical tools</h3><p className="muted" style={{ fontSize: 13 }}>Manage the detailed records behind the dashboard.</p></div><button className="btn ghost sm" onClick={() => setShowTools(false)}>Hide tools</button></div>
      <div className="card reveal mt" style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', padding: 0, marginBottom: 0, overflowX: 'auto', flexWrap: 'nowrap' }}>
        {[
          { key: 'records', label: 'Health records', icon: Activity },
          { key: 'medicines', label: 'Medicine inventory', icon: Pill },
          { key: 'lab', label: 'Lab tests', icon: FlaskConical },
          { key: 'parasite', label: 'Parasite control', icon: Bug },
          { key: 'quarantine', label: 'Quarantine', icon: ShieldAlert },
          { key: 'alerts', label: 'Emergency alerts', icon: AlertTriangle },
          { key: 'effectiveness', label: 'Treatment reports', icon: RefreshCw },
        ].map((t) => (
          <button key={t.key} className={`btn ghost sm ${tab === t.key ? '' : 'muted'}`} style={{ borderRadius: 0, flex: '0 0 auto', justifyContent: 'center', padding: '10px 14px', whiteSpace: 'nowrap' }} onClick={() => setTab(t.key as any)}><t.icon size={15} /> {t.label}</button>
        ))}
      </div>

      <div className="card mt">
        {tab === 'records' && <TabErrorBoundary name="Health records"><HealthRecords farmId={farmId} /></TabErrorBoundary>}
        {tab === 'medicines' && <TabErrorBoundary name="Medicine inventory"><MedicineInventory farmId={farmId} /></TabErrorBoundary>}
        {tab === 'lab' && <TabErrorBoundary name="Lab tests"><LabTests farmId={farmId} /></TabErrorBoundary>}
        {tab === 'parasite' && <TabErrorBoundary name="Parasite control"><ParasiteControl farmId={farmId} /></TabErrorBoundary>}
        {tab === 'quarantine' && <TabErrorBoundary name="Quarantine"><Quarantine farmId={farmId} /></TabErrorBoundary>}
        {tab === 'alerts' && <TabErrorBoundary name="Emergency alerts"><EmergencyAlerts farmId={farmId} /></TabErrorBoundary>}
        {tab === 'effectiveness' && <TabErrorBoundary name="Treatment reports"><TreatmentEffectiveness farmId={farmId} /></TabErrorBoundary>}
      </div>
      </>}
    </div>
  );
}
