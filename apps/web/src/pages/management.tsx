import { useState, useEffect } from 'react';
import { useFarm } from '../app';
import { useHashRoute } from '../router';
import { PageHeader, Modal, Kpi, AnimatedCounter, useAsync, useToast } from '../ui';
import { updateCow, deleteCow, updateMilkRecord, deleteMilkRecord, createMilkRecord, createFeedRecord, updateFeedRecord, deleteFeedRecord, createEmployee, updateEmployee, deleteEmployee, createGalleryItem, deleteGalleryItem, listFeedRecords, listMilkRecords, listCows, employees, gallery } from '../data';
import { Plus, Trash2, Edit3, Save, X, ArrowLeft } from 'lucide-react';
import { BREEDS } from '../mock';
import { fmt } from '../format';

const MILK_EMPTY = { cowId: '', date: '', morning: '', afternoon: '', evening: '' };
const FEED_EMPTY = { cowId: '', date: '', feed: '', kg: '' };
const EMP_EMPTY = { name: '', job_title: '', hired_on: '', base_salary: '' };
const GAL_EMPTY = { url: '', category: 'cows', is_primary: false };

export function DailyRecords() {
  const { farmId } = useFarm();
  const [, navigate] = useHashRoute();
  const { push } = useToast();
  const [tab, setTab] = useState<'milk' | 'feed'>('milk');
  const [milk, setMilk] = useState(MILK_EMPTY);
  const [feed, setFeed] = useState(FEED_EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [milkRefresh, setMilkRefresh] = useState(0);
  const [feedRefresh, setFeedRefresh] = useState(0);
  const { data: feedList } = useAsync(() => listFeedRecords(), [feedRefresh]);
  const { data: milkRecords } = useAsync(() => listMilkRecords(), [milkRefresh]);
  const { data: apiCows } = useAsync(() => listCows(farmId), [farmId]);
  const allCows = (apiCows || []).map((c: any) => ({ id: c.id, name: c.name, cowCode: c.cowCode, earTag: c.earTag }));

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    setMilk((m) => ({ ...m, date: today }));
    setFeed((f) => ({ ...f, date: today }));
  }, [farmId]);

  const submitMilk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!milk.cowId || !milk.date) { push('Cow and date are required'); return; }
    setSubmitting(true);
    try {
      const res = await createMilkRecord({
        cow_id: milk.cowId,
        recorded_on: milk.date,
        morning_liters: Number(milk.morning) || 0,
        afternoon_liters: Number(milk.afternoon) || 0,
        evening_liters: Number(milk.evening) || 0,
      });
      push(res.queued ? "Saved offline — will sync when you're back online" : 'Milk record saved');
      setMilk({ ...MILK_EMPTY, date: new Date().toISOString().slice(0, 10) });
      setMilkRefresh((k) => k + 1);
    } catch (err: any) { push(err.message); }
    setSubmitting(false);
  };

  const submitFeed = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feed.cowId || !feed.date || !feed.feed.trim()) { push('Cow, date, and feed type are required'); return; }
    setSubmitting(true);
    try {
      const res = await createFeedRecord({
        cow_id: feed.cowId,
        consumed_on: feed.date,
        feed_type: feed.feed.trim(),
        quantity_kg: Number(feed.kg) || 0,
      });
      push(res.queued ? "Saved offline — will sync when you're back online" : 'Feed record saved');
      setFeed({ ...FEED_EMPTY, date: new Date().toISOString().slice(0, 10) });
      setFeedRefresh((k) => k + 1);
    } catch (err: any) { push(err.message); }
    setSubmitting(false);
  };

  return (
    <div>
      <PageHeader eyebrow="DAILY RECORDS" title="Daily milk & feed" desc="Record morning, afternoon, and evening milk yields."
        actions={<button className="btn sm" onClick={() => navigate('/app/cows')}><ArrowLeft size={15} /> Herd</button>} />

      <div className="card reveal" style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', padding: 0, marginBottom: 0 }}>
        <button className={`btn ghost ${tab === 'milk' ? 'active-tab' : ''}`} style={{ borderRadius: 0, flex: 1, justifyContent: 'center', padding: '12px 16px' }} onClick={() => setTab('milk')}>Milk records</button>
        <button className={`btn ghost ${tab === 'feed' ? 'active-tab' : ''}`} style={{ borderRadius: 0, flex: 1, justifyContent: 'center', padding: '12px 16px' }} onClick={() => setTab('feed')}>Feed records</button>
      </div>

      {tab === 'milk' && (
        <div className="card reveal">
          <h3>New milk record</h3>
          <form onSubmit={submitMilk} className="mt">
            <div className="row">
              <div className="field" style={{ flex: 2 }}><label>Cow</label>
                <select className="select" value={milk.cowId} onChange={(e) => setMilk({ ...milk, cowId: e.target.value })} required>
                  <option value="">Select cow…</option>
                  {allCows.map((c) => <option key={c.id} value={c.id}>{c.name} — {c.cowCode}</option>)}
                </select>
              </div>
              <div className="field" style={{ flex: 1 }}><label>Date</label><input className="input" type="date" value={milk.date} onChange={(e) => setMilk({ ...milk, date: e.target.value })} required /></div>
            </div>
            <div className="row mt">
              <div className="field" style={{ flex: 1 }}><label>Morning (L)</label><input className="input" type="number" step="0.1" min="0" placeholder="0.0" value={milk.morning} onChange={(e) => setMilk({ ...milk, morning: e.target.value })} /></div>
              <div className="field" style={{ flex: 1 }}><label>Afternoon (L)</label><input className="input" type="number" step="0.1" min="0" placeholder="0.0" value={milk.afternoon} onChange={(e) => setMilk({ ...milk, afternoon: e.target.value })} /></div>
              <div className="field" style={{ flex: 1 }}><label>Evening (L)</label><input className="input" type="number" step="0.1" min="0" placeholder="0.0" value={milk.evening} onChange={(e) => setMilk({ ...milk, evening: e.target.value })} /></div>
            </div>
            <button className="btn mt" type="submit" disabled={submitting}>{submitting ? 'Saving…' : 'Save milk record'}</button>
          </form>
        </div>
      )}

      {tab === 'feed' && (
        <div className="card reveal">
          <h3>New feed record</h3>
          <form onSubmit={submitFeed} className="mt">
            <div className="row">
              <div className="field" style={{ flex: 2 }}><label>Cow</label>
                <select className="select" value={feed.cowId} onChange={(e) => setFeed({ ...feed, cowId: e.target.value })} required>
                  <option value="">Select cow…</option>
                  {allCows.map((c) => <option key={c.id} value={c.id}>{c.name} — {c.cowCode}</option>)}
                </select>
              </div>
              <div className="field" style={{ flex: 1 }}><label>Date</label><input className="input" type="date" value={feed.date} onChange={(e) => setFeed({ ...feed, date: e.target.value })} required /></div>
            </div>
            <div className="row mt">
              <div className="field" style={{ flex: 2 }}><label>Feed type</label><input className="input" placeholder="e.g. Silage, Hay, Concentrate" value={feed.feed} onChange={(e) => setFeed({ ...feed, feed: e.target.value })} required /></div>
              <div className="field" style={{ flex: 1 }}><label>Amount (kg)</label><input className="input" type="number" step="0.1" min="0" placeholder="0.0" value={feed.kg} onChange={(e) => setFeed({ ...feed, kg: e.target.value })} required /></div>
            </div>
            <button className="btn mt" type="submit" disabled={submitting}>{submitting ? 'Saving…' : 'Save feed record'}</button>
          </form>
        </div>
      )}

      <div className="card mt">
        <h3>Recent milk records</h3>
        <div className="table-wrap mt" style={{ border: 0, boxShadow: 'none' }}>
          <table>
            <thead><tr><th>Date</th><th>Cow</th><th>Morning</th><th>Afternoon</th><th>Evening</th><th>Total</th></tr></thead>
            <tbody>
              {(milkRecords || []).slice(0, 20).map((m: any) => (
                <tr key={m.id}><td>{fmt.date(m.recorded_on)}</td><td>{m.cow_name ? `${m.cow_name} — ${m.cow_code}` : (m.cow_code || m.cow_id || '—')}</td><td>{fmt.liters(m.morning_liters)}</td><td>{fmt.liters(m.afternoon_liters)}</td><td>{fmt.liters(m.evening_liters)}</td><td><b>{fmt.liters(Number(m.morning_liters || 0) + Number(m.afternoon_liters || 0) + Number(m.evening_liters || 0))}</b></td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="card mt">
        <h3>Recent feed records</h3>
        <div className="table-wrap mt" style={{ border: 0, boxShadow: 'none' }}>
          <table>
            <thead><tr><th>Date</th><th>Cow</th><th>Feed</th><th>Amount</th><th></th></tr></thead>
            <tbody>
              {(feedList || []).slice(0, 20).map((f: any) => (
                <tr key={f.id}>
                  <td>{fmt.date(f.date || f.consumed_on)}</td>
                  <td>{f.cow_name ? `${f.cow_name} — ${f.cow_code || f.cow_id}` : (f.cow_id || '—')}</td>
                  <td>{f.feed_type_name || f.feed_type_id || '—'}</td>
                  <td>{f.quantity ? fmt.kg(Number(f.quantity)) : '—'}</td>
                  <td><button className="btn ghost sm" onClick={async () => { await deleteFeedRecord(f.id); push('Feed record deleted'); }}><Trash2 size={13} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function EmployeeManagement() {
  const { farmId } = useFarm();
  const { push } = useToast();
  const { data: empList, loading } = useAsync(() => employees(farmId), [farmId]);
  const [list, setList] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState(EMP_EMPTY);

  useEffect(() => {
    if (empList) setList(empList);
  }, [empList]);

  const openAdd = () => { setEditing(null); setForm(EMP_EMPTY); setOpen(true); };
  const openEdit = (emp: any) => { setEditing(emp); setForm({ name: emp.name, job_title: emp.job_title ?? emp.role ?? '', hired_on: emp.hired_on ?? '', base_salary: emp.base_salary ?? '' }); setOpen(true); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { push('Name is required'); return; }
    try {
      if (editing) {
        await updateEmployee(editing.id, { name: form.name.trim(), job_title: form.job_title, hired_on: form.hired_on, base_salary: Number(form.base_salary) || 0 });
        push('Employee updated');
        setList((l) => l.map((e) => e.id === editing.id ? { ...e, ...form, name: form.name.trim(), base_salary: Number(form.base_salary) || 0 } : e));
      } else {
        const newEmp = await createEmployee(farmId, { name: form.name.trim(), job_title: form.job_title, hired_on: form.hired_on, base_salary: Number(form.base_salary) || 0 });
        push('Employee added');
        setList((l) => [...l, newEmp]);
      }
      setOpen(false);
    } catch (err: any) { push(err.message); }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this employee?')) return;
    await deleteEmployee(id);
    push('Employee deleted');
    setList((l) => l.filter((e) => e.id !== id));
  };

  return (
    <div>
      <PageHeader eyebrow="MANAGEMENT" title="Employee management" desc="Add, edit, and remove employees."
        actions={<button className="btn sm" onClick={openAdd}><Plus size={16} /> Add employee</button>} />
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-wrap" style={{ border: 0, boxShadow: 'none' }}>
          <table>
            <thead><tr><th>Name</th><th>Job title</th><th>Hired</th><th>Salary</th><th style={{ width: 120 }}></th></tr></thead>
            <tbody>
              {list.map((e: any) => (
                <tr key={e.id}>
                  <td><b>{e.name}</b></td>
                  <td>{e.job_title ?? e.role ?? '—'}</td>
                  <td>{e.hired_on ? fmt.date(e.hired_on) : '—'}</td>
                  <td>{e.base_salary ? `$${Number(e.base_salary).toLocaleString()}` : '—'}</td>
                  <td>
                    <div className="row">
                      <button className="btn ghost sm" onClick={() => openEdit(e)}><Edit3 size={14} /></button>
                      <button className="btn ghost sm" onClick={() => remove(e.id)}><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {!list.length && !loading && <tr><td colSpan={5} style={{ textAlign: 'center', padding: 40 }} className="muted">No employees yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      {open && <Modal title={editing ? 'Edit employee' : 'Add employee'} onClose={() => setOpen(false)}>
        <form onSubmit={submit}>
          <div className="field"><label>Full name</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
          <div className="field"><label>Job title</label><input className="input" value={form.job_title} onChange={(e) => setForm({ ...form, job_title: e.target.value })} /></div>
          <div className="field"><label>Hired on</label><input className="input" type="date" value={form.hired_on} onChange={(e) => setForm({ ...form, hired_on: e.target.value })} /></div>
          <div className="field"><label>Base salary ($)</label><input className="input" type="number" value={form.base_salary} onChange={(e) => setForm({ ...form, base_salary: e.target.value })} /></div>
          <div className="row mt" style={{ justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" className="btn ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn" type="submit" disabled={loading}>{editing ? <><Save size={15} /> Update</> : <><Plus size={15} /> Add</>}</button>
          </div>
        </form>
      </Modal>}
    </div>
  );
}

export function GalleryManagement() {
  const { farmId } = useFarm();
  const { push } = useToast();
  const { data: items, loading } = useAsync(() => gallery(farmId), [farmId]);
  const [list, setList] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(GAL_EMPTY);

  useEffect(() => {
    if (items) setList(items);
  }, [items]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.url.trim()) { push('URL is required'); return; }
    try {
      const item = await createGalleryItem(farmId, { url: form.url.trim(), category: form.category, is_primary: form.is_primary });
      push('Gallery item added');
      setList((l) => [...l, item]);
      setForm(GAL_EMPTY);
      setOpen(false);
    } catch (err: any) { push(err.message); }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this gallery item?')) return;
    await deleteGalleryItem(id);
    push('Item deleted');
    setList((l) => l.filter((x) => x.id !== id));
  };

  return (
    <div>
      <PageHeader eyebrow="MANAGEMENT" title="Gallery management" desc="Manage farm photos and media."
        actions={<button className="btn sm" onClick={() => setOpen(true)}><Plus size={16} /> Add item</button>} />
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-wrap" style={{ border: 0, boxShadow: 'none' }}>
          <table>
            <thead><tr><th>URL</th><th>Category</th><th>Primary</th><th style={{ width: 100 }}></th></tr></thead>
            <tbody>
              {list.map((item: any) => (
                <tr key={item.id}>
                  <td style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.url || item.image_url || '—'}</td>
                  <td><span className="tag">{item.category || 'general'}</span></td>
                  <td>{item.is_primary ? <span className="pill healthy">Yes</span> : <span className="pill muted">No</span>}</td>
                  <td><button className="btn ghost sm" onClick={() => remove(item.id)}><Trash2 size={14} /></button></td>
                </tr>
              ))}
              {!list.length && !loading && <tr><td colSpan={4} style={{ textAlign: 'center', padding: 40 }} className="muted">No gallery items yet. Add your first item above.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      {open && <Modal title="Add gallery item" onClose={() => setOpen(false)}>
        <form onSubmit={submit}>
          <div className="field"><label>Image URL</label><input className="input" placeholder="https://…" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} required /></div>
          <div className="field"><label>Category</label>
            <select className="select" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              <option value="cows">Cows</option>
              <option value="calves">Calves</option>
              <option value="employees">Employees</option>
              <option value="equipment">Equipment</option>
              <option value="facilities">Facilities</option>
            </select>
          </div>
          <label className="field" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input type="checkbox" checked={form.is_primary} onChange={(e) => setForm({ ...form, is_primary: e.target.checked })} />
            Set as primary image for this category
          </label>
          <div className="row mt" style={{ justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" className="btn ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn" type="submit" disabled={loading}><Plus size={15} /> Add item</button>
          </div>
        </form>
      </Modal>}
    </div>
  );
}export function Management() {
  const [tab, setTab] = useState<'daily' | 'employees' | 'gallery'>('daily');
  return (
    <div>
      <PageHeader eyebrow='MANAGEMENT' title='Farm management' desc='Daily records, team, and media.' />
      <div className='card reveal' style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', padding: 0, marginBottom: 0 }}>
        <button className={'btn ghost ' + (tab === 'daily' ? 'active-tab' : '')} style={{ borderRadius: 0, flex: 1, justifyContent: 'center', padding: '12px 16px' }} onClick={() => setTab('daily')}>Daily records</button>
        <button className={'btn ghost ' + (tab === 'employees' ? 'active-tab' : '')} style={{ borderRadius: 0, flex: 1, justifyContent: 'center', padding: '12px 16px' }} onClick={() => setTab('employees')}>Employees</button>
        <button className={'btn ghost ' + (tab === 'gallery' ? 'active-tab' : '')} style={{ borderRadius: 0, flex: 1, justifyContent: 'center', padding: '12px 16px' }} onClick={() => setTab('gallery')}>Gallery</button>
      </div>
      {tab === 'daily' && <DailyRecords />}
      {tab === 'employees' && <EmployeeManagement />}
      {tab === 'gallery' && <GalleryManagement />}
    </div>
  );
}
