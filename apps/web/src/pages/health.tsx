import { useState, useEffect } from 'react';
import { useFarm } from '../app';
import { useHashRoute } from '../router';
import { PageHeader, Modal, Kpi, useAsync, useToast, Skeleton } from '../ui';
import { isLive } from '../api';
import { apiGet, apiSend } from '../api';
import { Plus, Trash2, Edit3, Save, X, Activity, Pill, FlaskConical, Bug, ShieldAlert, AlertTriangle, RefreshCw } from 'lucide-react';
import { fmt } from '../format';

const q = (p: Record<string, any>) => '?' + new URLSearchParams(Object.entries(p).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)]).reduce((a, [k, v]) => ({ ...a, [k]: v }), {} as Record<string, string>)).toString();

// ---------- Health Records ----------
const HEALTH_EMPTY = { cowId: '', recordedOn: '', healthStatus: 'healthy', bodyConditionScore: '', lamenessScore: '', aiDetectedDisease: '', aiConfidence: '', photoUrl: '', notes: '', veterinarianName: '' };

function HealthRecords({ farmId }: { farmId: string }) {
  const { push } = useToast();
  const [key, setKey] = useState(0);
  const { data: records, loading } = useAsync(() => isLive ? apiGet<any[]>(`/health/records${q({ farmId })}`).then((r: any) => r.data) : Promise.resolve([]), [farmId, key]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(HEALTH_EMPTY);
  const [saving, setSaving] = useState(false);

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
      {loading ? <Skeleton h={180} /> : (
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
          <div className="field"><label>Cow</label><select className="select" value={form.cowId} onChange={(e) => setForm({ ...form, cowId: e.target.value })} required><option value="">Select cow</option>{records?.map((r: any) => <option key={r.cow_id} value={r.cow_id}>{r.cow_name} ({r.cow_code})</option>)}</select></div>
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
          <div className="row" style={{ gap: 10 }}>
            <div className="field"><label>Quantity</label><input className="input" type="number" value={form.quantityOnHand} onChange={(e) => setForm({ ...form, quantityOnHand: e.target.value })} /></div>
            <div className="field"><label>Unit</label><input className="input" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} /></div>
            <div className="field"><label>Reorder level</label><input className="input" type="number" value={form.reorderLevel} onChange={(e) => setForm({ ...form, reorderLevel: e.target.value })} /></div>
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
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(LAB_EMPTY);
  const [saving, setSaving] = useState(false);

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
          <div className="field"><label>Cow</label><select className="select" value={form.cowId} onChange={(e) => setForm({ ...form, cowId: e.target.value })} required><option value="">Select cow</option>{tests?.map((t: any) => <option key={t.cow_id} value={t.cow_id}>{t.cow_name} ({t.cow_code})</option>)}</select></div>
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
          <div className="row" style={{ gap: 10 }}>
            <div className="field"><label>Scheduled on</label><input className="input" type="date" value={form.scheduledOn} onChange={(e) => setForm({ ...form, scheduledOn: e.target.value })} required /></div>
            <div className="field"><label>Administered on</label><input className="input" type="date" value={form.administeredOn} onChange={(e) => setForm({ ...form, administeredOn: e.target.value })} /></div>
            <div className="field"><label>Status</label><select className="select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option value="scheduled">Scheduled</option><option value="completed">Completed</option><option value="missed">Missed</option></select></div>
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
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(QUARANTINE_EMPTY);
  const [saving, setSaving] = useState(false);

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
          <div className="field"><label>Cow</label><select className="select" value={form.cowId} onChange={(e) => setForm({ ...form, cowId: e.target.value })} required><option value="">Select cow</option>{records?.map((q: any) => <option key={q.cow_id} value={q.cow_id}>{q.cow_name} ({q.cow_code})</option>)}</select></div>
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

// ---------- Main Health Page ----------
export function Health() {
  const { farmId } = useFarm();
  const { push } = useToast();
  const [tab, setTab] = useState<'records' | 'medicines' | 'lab' | 'parasite' | 'quarantine' | 'alerts' | 'effectiveness'>('records');

  return (
    <div>
      <PageHeader eyebrow="HEALTH" title="Health & Veterinary" desc="Disease detection, medicine inventory, lab tests, parasite control, quarantine, and emergency alerts"
        actions={<button className="btn sm" onClick={() => push('Feature ready', <Activity size={15} />)}><Activity size={15} /> Quick check</button>} />

      <div className="row mt" style={{ gap: 8, flexWrap: 'wrap' }}>
        {[
          { key: 'records', label: 'Health records', icon: Activity },
          { key: 'medicines', label: 'Medicine inventory', icon: Pill },
          { key: 'lab', label: 'Lab tests', icon: FlaskConical },
          { key: 'parasite', label: 'Parasite control', icon: Bug },
          { key: 'quarantine', label: 'Quarantine', icon: ShieldAlert },
          { key: 'alerts', label: 'Emergency alerts', icon: AlertTriangle },
          { key: 'effectiveness', label: 'Treatment reports', icon: RefreshCw },
        ].map((t) => (
          <button key={t.key} className={`btn ghost sm ${tab === t.key ? '' : 'muted'}`} onClick={() => setTab(t.key as any)}><t.icon size={15} /> {t.label}</button>
        ))}
      </div>

      <div className="card mt">
        {tab === 'records' && <HealthRecords farmId={farmId} />}
        {tab === 'medicines' && <MedicineInventory farmId={farmId} />}
        {tab === 'lab' && <LabTests farmId={farmId} />}
        {tab === 'parasite' && <ParasiteControl farmId={farmId} />}
        {tab === 'quarantine' && <Quarantine farmId={farmId} />}
        {tab === 'alerts' && <EmergencyAlerts farmId={farmId} />}
        {tab === 'effectiveness' && <TreatmentEffectiveness farmId={farmId} />}
      </div>
    </div>
  );
}
