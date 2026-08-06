import { useState, useRef, useEffect } from 'react';
import { useFarm } from '../app';
import { useHashRoute } from '../router';
import { PageHeader, Modal, Kpi, AnimatedCounter, useAsync, useToast, Skeleton } from '../ui';
import { useAuth } from '../auth';
import {
  employees, createEmployee, updateEmployee, deleteEmployee,
  shifts, createShift, updateShift, deleteShift,
  trainingRecords, createTrainingRecord, updateTrainingRecord, deleteTrainingRecord,
  performanceReviews, createPerformanceReview, updatePerformanceReview, deletePerformanceReview,
  leaveRequests, createLeaveRequest, updateLeaveRequest, deleteLeaveRequest,
  messages, sendMessage, markMessageRead,
  faceRegistrations, registerFace, deleteFaceRegistration,
  gpsLocations, createGpsLocation,
  attendance, createAttendance,
  payroll, createPayroll,
  shiftAssignments, assignShift, deleteShiftAssignment,
  getFarmMembers, inviteToFarm,
} from '../data';
import { Plus, Trash2, Edit3, Save, X, Clock, CheckCircle, AlertCircle, User, Users, Briefcase, Mail, Phone, MapPin, Calendar, Award, TrendingUp, MessageSquare, Camera, Map, FileText, DollarSign, Send, UserPlus, ShieldCheck } from 'lucide-react';
import { fmt } from '../format';

const EMP_EMPTY = { name: '', job_title: '', hired_on: '', base_salary: '', phone: '', email: '' };

const ROLE_OPTIONS = [
  { value: 'administrator', label: 'Owner' },
  { value: 'farm_manager', label: 'Manager' },
  { value: 'veterinarian', label: 'Veterinarian' },
  { value: 'worker', label: 'Worker' },
  { value: 'accountant', label: 'Accountant' },
  { value: 'milk_collector', label: 'Milk Collector' },
  { value: 'viewer', label: 'Viewer' },
];

function MembersTab({ farmId }: { farmId: string }) {
  const { user } = useAuth();
  const { push } = useToast();
  const [key, setKey] = useState(0);
  const refresh = () => setKey((k) => k + 1);
  const { data, loading } = useAsync(() => getFarmMembers(farmId), [farmId, key]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('worker');
  const [busy, setBusy] = useState(false);
  const canInvite = user?.role === 'administrator' || user?.role === 'farm_manager';

  const invite = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    try {
      const res = await inviteToFarm(farmId, email, role);
      push(res.devInviteLink ? `Dev mode — invite link: ${res.devInviteLink}` : res.message);
      setEmail('');
      refresh();
    } catch (err: any) {
      push(err.message || 'Could not send invitation');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      {canInvite && (
        <div className="card" style={{ padding: 20 }}>
          <div className="row" style={{ gap: 8, alignItems: 'center', marginBottom: 14 }}><UserPlus size={16} /><b style={{ fontSize: 14 }}>Invite a team member</b></div>
          <form onSubmit={invite} className="row" style={{ gap: 8 }}>
            <input className="input" type="email" placeholder="teammate@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required style={{ flex: 1 }} />
            <select className="select" value={role} onChange={(e) => setRole(e.target.value)}>
              {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            <button className="btn sm" disabled={busy}>{busy ? 'Sending…' : 'Invite'}</button>
          </form>
        </div>
      )}

      <div className="card mt" style={{ padding: 20 }}>
        <div className="row" style={{ gap: 8, alignItems: 'center', marginBottom: 14 }}><ShieldCheck size={16} /><b style={{ fontSize: 14 }}>Members</b></div>
        {loading ? <Skeleton h={80} /> : !data?.members.length ? <p className="muted" style={{ fontSize: 13 }}>No members yet.</p> : (
          <div>
            {data.members.map((m) => (
              <div key={m.id} className="row" style={{ justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                <div>
                  <div style={{ fontSize: 14 }}>{m.name} {m.id === user?.id && <span className="muted" style={{ fontSize: 11 }}>(you)</span>}</div>
                  <div className="muted" style={{ fontSize: 12 }}>{m.email}</div>
                </div>
                <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                  {!m.email_verified && <span className="muted" style={{ fontSize: 11 }}>Unverified</span>}
                  <span className="pill" style={{ textTransform: 'capitalize' }}>{m.role.replace('_', ' ')}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {!!data?.pending.length && (
        <div className="card mt" style={{ padding: 20 }}>
          <div className="row" style={{ gap: 8, alignItems: 'center', marginBottom: 14 }}><Mail size={16} /><b style={{ fontSize: 14 }}>Pending invitations</b></div>
          {data.pending.map((p, i) => (
            <div key={i} className="row" style={{ justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: i < data.pending.length - 1 ? '1px solid var(--border)' : 'none' }}>
              <span style={{ fontSize: 13 }}>{p.email}</span>
              <span className="pill muted" style={{ textTransform: 'capitalize' }}>{p.role.replace('_', ' ')}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

type Tab = 'members' | 'attendance' | 'gps' | 'shifts' | 'training' | 'performance' | 'payroll' | 'leave' | 'messages';

export function Team() {
  const { farmId } = useFarm();
  const { user } = useAuth();
  const [, navigate] = useHashRoute();
  const { push } = useToast();
  const [tab, setTab] = useState<Tab>('members');
  const [key, setKey] = useState(0);
  const refresh = () => setKey((k) => k + 1);

  const { data: empList, loading: empLoading } = useAsync(() => employees(farmId), [farmId, key]);
  const { data: shiftList } = useAsync(() => shifts(farmId), [farmId, key]);
  const { data: trainingList } = useAsync(() => trainingRecords(farmId), [farmId, key]);
  const { data: perfList } = useAsync(() => performanceReviews(farmId), [farmId, key]);
  const { data: leaveList } = useAsync(() => leaveRequests(farmId), [farmId, key]);
  const { data: msgList } = useAsync(() => messages(farmId), [farmId, key]);
  const { data: faceList } = useAsync(() => faceRegistrations(farmId), [farmId, key]);
  const { data: gpsList } = useAsync(() => gpsLocations(farmId), [farmId, key]);
  const { data: attList } = useAsync(() => attendance(farmId), [farmId, key]);
  const { data: payrollList } = useAsync(() => payroll(farmId), [farmId, key]);

  return (
    <div>
      <PageHeader eyebrow="TEAM" title="Employee management" desc="Members & roles, attendance, shifts, training, payroll, leave, and messaging." />
      <div className="card reveal" style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', padding: 0, marginBottom: 0, overflowX: 'auto' }}>
        {([
          { key: 'members', label: 'Members', icon: <ShieldCheck size={14} /> },
          { key: 'attendance', label: 'Attendance', icon: <Clock size={14} /> },
          { key: 'gps', label: 'GPS', icon: <MapPin size={14} /> },
          { key: 'shifts', label: 'Shifts', icon: <Calendar size={14} /> },
          { key: 'training', label: 'Training', icon: <Award size={14} /> },
          { key: 'performance', label: 'Reviews', icon: <TrendingUp size={14} /> },
          { key: 'payroll', label: 'Payroll', icon: <DollarSign size={14} /> },
          { key: 'leave', label: 'Leave', icon: <FileText size={14} /> },
          { key: 'messages', label: 'Messages', icon: <MessageSquare size={14} /> },
        ] as const).map((t) => (
          <button key={t.key} className={`btn ghost ${tab === t.key ? 'active-tab' : ''}`} style={{ borderRadius: 0, flex: 1, justifyContent: 'center', padding: '12px 14px', whiteSpace: 'nowrap' }} onClick={() => setTab(t.key)}>
            <span className="row" style={{ gap: 6, justifyContent: 'center' }}>{t.icon} {t.label}</span>
          </button>
        ))}
      </div>

      <div className="mt">
        {tab === 'members' && <MembersTab farmId={farmId} />}
        {tab === 'attendance' && <AttendanceTab farmId={farmId} user={user} empList={empList || []} attList={attList || []} faceList={faceList || []} loading={empLoading} refresh={refresh} />}
        {tab === 'gps' && <GpsTab farmId={farmId} empList={empList || []} gpsList={gpsList || []} loading={empLoading} refresh={refresh} />}
        {tab === 'shifts' && <ShiftsTab farmId={farmId} empList={empList || []} shiftList={shiftList || []} loading={empLoading} refresh={refresh} refreshKey={key} />}
        {tab === 'training' && <TrainingTab farmId={farmId} empList={empList || []} trainingList={trainingList || []} loading={empLoading} refresh={refresh} />}
        {tab === 'performance' && <PerformanceTab farmId={farmId} empList={empList || []} perfList={perfList || []} loading={empLoading} refresh={refresh} />}
        {tab === 'payroll' && <PayrollTab farmId={farmId} empList={empList || []} payrollList={payrollList || []} loading={empLoading} refresh={refresh} />}
        {tab === 'leave' && <LeaveTab farmId={farmId} empList={empList || []} leaveList={leaveList || []} loading={empLoading} refresh={refresh} />}
        {tab === 'messages' && <MessagesTab farmId={farmId} user={user} empList={empList || []} msgList={msgList || []} loading={empLoading} refresh={refresh} />}
      </div>
    </div>
  );
}

function AttendanceTab({ farmId, user, empList, attList, faceList, loading, refresh }: any) {
  const { push } = useToast();
  const [open, setOpen] = useState(false);
  const [faceOpen, setFaceOpen] = useState(false);
  const [form, setForm] = useState({ employeeId: '', status: 'present', notes: '' });
  const [faceForm, setFaceForm] = useState({ employeeId: '', descriptor: '', photoUrl: '' });
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await createAttendance(farmId, { ...form, date: new Date().toISOString().slice(0, 10) });
      push(res.queued ? "Saved offline — will sync when you're back online" : 'Attendance recorded');
      setForm({ employeeId: '', status: 'present', notes: '' });
      setOpen(false);
      refresh();
    } catch (err: any) {
      push(err.message || 'Could not record attendance');
    }
    setSaving(false);
  };

  const submitFace = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await registerFace(farmId, faceForm);
    push('Face registered');
    setFaceForm({ employeeId: '', descriptor: '', photoUrl: '' });
    setFaceOpen(false);
    refresh();
    setSaving(false);
  };

  const today = attList.filter((a: any) => a.attended_on === new Date().toISOString().slice(0, 10));
  const present = today.filter((a: any) => a.status === 'present').length;
  const absent = today.filter((a: any) => a.status === 'absent').length;

  return (
    <div>
      <div className="three mb">
        <Kpi icon={<Users size={18} />} label="Total" value={empList.length} loading={loading} />
        <Kpi icon={<CheckCircle size={18} />} label="Present today" value={present} loading={loading} />
        <Kpi icon={<AlertCircle size={18} />} label="Absent" value={absent} loading={loading} />
      </div>
      <div className="card reveal">
        <div className="between mb">
          <h3>Today's attendance</h3>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn sm" onClick={() => setOpen(true)}><Plus size={14} /> Mark attendance</button>
            <button className="btn sm" onClick={() => setFaceOpen(true)}><Camera size={14} /> Register face</button>
          </div>
        </div>
        <div className="table-wrap">
          <table><thead><tr><th>Employee</th><th>Date</th><th>Status</th><th>Check in</th><th>Check out</th><th>Face verified</th></tr></thead>
            <tbody>{(today.length ? today : attList.slice(0, 10)).map((a: any) => (
              <tr key={a.id}>
                <td>{a.employee_name || a.employee_id}</td>
                <td>{fmt.date(a.attended_on)}</td>
                <td><span className={`pill ${a.status === 'present' ? 'healthy' : a.status === 'late' ? 'warn' : 'danger'}`}>{a.status}</span></td>
                <td>{a.check_in || '—'}</td>
                <td>{a.check_out || '—'}</td>
                <td>{faceList.some((f: any) => f.employee_id === a.employee_id) ? <CheckCircle size={14} color="var(--primary)" /> : '—'}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </div>

      {open && <Modal title="Mark attendance" onClose={() => setOpen(false)}>
        <form onSubmit={submit}>
          <div className="field"><label>Employee</label>
            <select className="select" value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} required>
              <option value="">Select employee…</option>
              {empList.map((e: any) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div className="field"><label>Status</label>
            <select className="select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="present">Present</option><option value="absent">Absent</option><option value="late">Late</option>
            </select>
          </div>
          <div className="field"><label>Notes</label><textarea className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          <div className="row mt" style={{ justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" className="btn ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn" type="submit" disabled={saving}>Save</button>
          </div>
        </form>
      </Modal>}

      {faceOpen && <Modal title="Register face" onClose={() => setFaceOpen(false)}>
        <form onSubmit={submitFace}>
          <div className="field"><label>Employee</label>
            <select className="select" value={faceForm.employeeId} onChange={(e) => setFaceForm({ ...faceForm, employeeId: e.target.value })} required>
              <option value="">Select employee…</option>
              {empList.map((e: any) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div className="field"><label>Face descriptor (JSON)</label><textarea className="input" value={faceForm.descriptor} onChange={(e) => setFaceForm({ ...faceForm, descriptor: e.target.value })} placeholder='{"descriptor": [...]}' required /></div>
          <div className="field"><label>Photo URL</label><input className="input" value={faceForm.photoUrl} onChange={(e) => setFaceForm({ ...faceForm, photoUrl: e.target.value })} placeholder="https://…" /></div>
          <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>Face descriptor is a JSON array of 128 floats. Use browser face-api or similar.</p>
          <div className="row mt" style={{ justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" className="btn ghost" onClick={() => setFaceOpen(false)}>Cancel</button>
            <button className="btn" type="submit" disabled={saving}>Register</button>
          </div>
        </form>
      </Modal>}
    </div>
  );
}

function GpsTab({ farmId, empList, gpsList, loading, refresh }: any) {
  const { push } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ employeeId: '', latitude: 0, longitude: 0, accuracy: 0, checkedIn: true });
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await createGpsLocation(farmId, form);
    push('GPS location recorded');
    setForm({ employeeId: '', latitude: 0, longitude: 0, accuracy: 0, checkedIn: true });
    setOpen(false);
    refresh();
    setSaving(false);
  };

  const getCurrentPosition = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setForm({ ...form, latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy }),
        () => push('GPS access denied')
      );
    }
  };

  return (
    <div>
      <div className="three mb">
        <Kpi icon={<MapPin size={18} />} label="Check-ins" value={gpsList.length} loading={loading} />
        <Kpi icon={<Users size={18} />} label="Employees" value={empList.length} loading={loading} />
        <Kpi icon={<CheckCircle size={18} />} label="On-site" value={gpsList.filter((g: any) => g.checked_in).length} loading={loading} />
      </div>
      <div className="card reveal">
        <div className="between mb">
          <h3>GPS attendance</h3>
          <button className="btn sm" onClick={() => { getCurrentPosition(); setOpen(true); }}><MapPin size={14} /> My check-in</button>
        </div>
        <div className="table-wrap">
          <table><thead><tr><th>Employee</th><th>Latitude</th><th>Longitude</th><th>Accuracy</th><th>Type</th><th>Time</th></tr></thead>
            <tbody>{gpsList.slice(0, 20).map((g: any) => (
              <tr key={g.id}>
                <td>{g.employee_name || g.employee_id}</td>
                <td>{g.latitude?.toFixed(5)}</td>
                <td>{g.longitude?.toFixed(5)}</td>
                <td>{g.accuracy ? `${g.accuracy.toFixed(1)}m` : '—'}</td>
                <td><span className={`pill ${g.checked_in ? 'healthy' : 'warn'}`}>{g.checked_in ? 'In' : 'Out'}</span></td>
                <td>{fmt.shortDate(g.created_at)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </div>

      {open && <Modal title="GPS check-in" onClose={() => setOpen(false)}>
        <form onSubmit={submit}>
          <div className="field"><label>Employee</label>
            <select className="select" value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} required>
              <option value="">Select employee…</option>
              {empList.map((e: any) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div className="row" style={{ gap: 10 }}>
            <div className="field" style={{ flex: 1 }}><label>Latitude</label><input className="input" type="number" step="any" value={form.latitude} onChange={(e) => setForm({ ...form, latitude: +e.target.value })} required /></div>
            <div className="field" style={{ flex: 1 }}><label>Longitude</label><input className="input" type="number" step="any" value={form.longitude} onChange={(e) => setForm({ ...form, longitude: +e.target.value })} required /></div>
          </div>
          <div className="field"><label>Accuracy (m)</label><input className="input" type="number" value={form.accuracy} onChange={(e) => setForm({ ...form, accuracy: +e.target.value })} /></div>
          <div className="row mt" style={{ justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" className="btn ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn" type="submit" disabled={saving}>Check in</button>
          </div>
        </form>
      </Modal>}
    </div>
  );
}

function ShiftsTab({ farmId, empList, shiftList, loading, refresh, refreshKey }: any) {
  const { push } = useToast();
  const [open, setOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [form, setForm] = useState({ name: '', startTime: '08:00', endTime: '17:00', days: [] as string[], color: '#2f7d54' });
  const [assignForm, setAssignForm] = useState({ employeeId: '', shiftId: '' });
  const [saving, setSaving] = useState(false);
  const { data: assignments } = useAsync(() => shiftAssignments(farmId), [farmId, refreshKey]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await createShift(farmId, form);
    push('Shift created');
    setForm({ name: '', startTime: '08:00', endTime: '17:00', days: [], color: '#2f7d54' });
    setOpen(false);
    refresh();
    setSaving(false);
  };

  const submitAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignForm.shiftId || !assignForm.employeeId) return;
    setSaving(true);
    await assignShift(assignForm.shiftId, { employeeId: assignForm.employeeId });
    push('Employee assigned to shift');
    setAssignForm({ employeeId: '', shiftId: '' });
    setAssignOpen(false);
    refresh();
    setSaving(false);
  };

  const unassign = async (id: string) => {
    await deleteShiftAssignment(id);
    push('Unassigned');
    refresh();
  };

  return (
    <div>
      <div className="three mb">
        <Kpi icon={<Calendar size={18} />} label="Shifts" value={shiftList.length} loading={loading} />
        <Kpi icon={<Users size={18} />} label="Employees" value={empList.length} loading={loading} />
        <Kpi icon={<Clock size={18} />} label="Active" value={shiftList.filter((s: any) => s.is_active).length} loading={loading} />
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px,1fr))' }}>
        {shiftList.map((s: any) => (
          <div key={s.id} className="card" style={{ borderLeft: `4px solid ${s.color}` }}>
            <div className="between">
              <b>{s.name}</b>
              <div className="row" style={{ gap: 4 }}>
                <button className="btn ghost sm" onClick={() => { setForm(s); setOpen(true); }}><Edit3 size={13} /></button>
                <button className="btn ghost sm" onClick={async () => { await deleteShift(s.id); push('Shift deleted'); refresh(); }}><Trash2 size={13} /></button>
              </div>
            </div>
            <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>{s.start_time} — {s.end_time}</div>
            <div className="muted" style={{ fontSize: 12 }}>{(s.days || []).join(', ') || 'No days set'}</div>
            <button className="btn sm mt" onClick={() => setAssignOpen(true)} style={{ marginTop: 8, width: '100%' }}>
              <Briefcase size={14} /> Assign employee
            </button>
          </div>
        ))}
      </div>

      {(assignments || []).length > 0 && (
        <div className="card mt">
          <h3>Current assignments</h3>
          <div className="table-wrap mt" style={{ border: 0, boxShadow: 'none' }}>
            <table><thead><tr><th>Employee</th><th>Shift</th><th>Time</th><th>Assigned on</th><th></th></tr></thead>
              <tbody>{(assignments || []).map((a: any) => (
                <tr key={a.id}>
                  <td>{a.employee_name || a.employee_id}</td>
                  <td>{a.shift_name}</td>
                  <td>{a.start_time} — {a.end_time}</td>
                  <td>{fmt.date(a.assigned_on)}</td>
                  <td><button className="btn ghost sm" onClick={() => unassign(a.id)}><X size={13} /></button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}

      {open && <Modal title="Shift" onClose={() => setOpen(false)}>
        <form onSubmit={submit}>
          <div className="field"><label>Name</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
          <div className="row" style={{ gap: 10 }}>
            <div className="field" style={{ flex: 1 }}><label>Start</label><input className="input" type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} /></div>
            <div className="field" style={{ flex: 1 }}><label>End</label><input className="input" type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} /></div>
          </div>
          <div className="field"><label>Color</label><input className="input" type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} /></div>
          <div className="row mt" style={{ justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" className="btn ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn" type="submit" disabled={saving}>Save</button>
          </div>
        </form>
      </Modal>}

      {assignOpen && <Modal title="Assign employee to shift" onClose={() => setAssignOpen(false)}>
        <form onSubmit={submitAssign}>
          <div className="field"><label>Shift</label>
            <select className="select" value={assignForm.shiftId} onChange={(e) => setAssignForm({ ...assignForm, shiftId: e.target.value })} required>
              <option value="">Select shift…</option>
              {shiftList.map((s: any) => <option key={s.id} value={s.id}>{s.name} ({s.start_time}–{s.end_time})</option>)}
            </select>
          </div>
          <div className="field"><label>Employee</label>
            <select className="select" value={assignForm.employeeId} onChange={(e) => setAssignForm({ ...assignForm, employeeId: e.target.value })} required>
              <option value="">Select employee…</option>
              {empList.map((e: any) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div className="row mt" style={{ justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" className="btn ghost" onClick={() => setAssignOpen(false)}>Cancel</button>
            <button className="btn" type="submit" disabled={saving}>Assign</button>
          </div>
        </form>
      </Modal>}
    </div>
  );
}

function TrainingTab({ farmId, empList, trainingList, loading, refresh }: any) {
  const { push } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ employeeId: '', title: '', description: '', category: 'general', status: 'scheduled', scheduledOn: '', completedOn: '', score: '', certificateUrl: '' });
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await createTrainingRecord(farmId, form);
    push('Training record added');
    setForm({ employeeId: '', title: '', description: '', category: 'general', status: 'scheduled', scheduledOn: '', completedOn: '', score: '', certificateUrl: '' });
    setOpen(false);
    refresh();
    setSaving(false);
  };

  return (
    <div>
      <div className="three mb">
        <Kpi icon={<Award size={18} />} label="Total" value={trainingList.length} loading={loading} />
        <Kpi icon={<CheckCircle size={18} />} label="Completed" value={trainingList.filter((t: any) => t.status === 'completed').length} loading={loading} />
        <Kpi icon={<Clock size={18} />} label="Scheduled" value={trainingList.filter((t: any) => t.status === 'scheduled').length} loading={loading} />
      </div>
      <div className="card reveal">
        <div className="between mb">
          <h3>Training records</h3>
          <button className="btn sm" onClick={() => setOpen(true)}><Plus size={14} /> Add training</button>
        </div>
        <div className="table-wrap">
          <table><thead><tr><th>Employee</th><th>Title</th><th>Category</th><th>Status</th><th>Date</th><th>Score</th></tr></thead>
            <tbody>{trainingList.map((t: any) => (
              <tr key={t.id}>
                <td>{t.employee_name || t.employee_id}</td>
                <td>{t.title}</td>
                <td><span className="tag">{t.category}</span></td>
                <td><span className={`pill ${t.status === 'completed' ? 'healthy' : t.status === 'in_progress' ? 'info' : 'warn'}`}>{t.status}</span></td>
                <td>{fmt.date(t.scheduled_on)}</td>
                <td>{t.score ?? '—'}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </div>

      {open && <Modal title="Add training" onClose={() => setOpen(false)}>
        <form onSubmit={submit}>
          <div className="field"><label>Employee</label>
            <select className="select" value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} required>
              <option value="">Select employee…</option>
              {empList.map((e: any) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div className="field"><label>Title</label><input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></div>
          <div className="field"><label>Description</label><textarea className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div className="row" style={{ gap: 10 }}>
            <div className="field" style={{ flex: 1 }}><label>Category</label>
              <select className="select" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                <option value="general">General</option><option value="safety">Safety</option><option value="technical">Technical</option><option value="management">Management</option>
              </select>
            </div>
            <div className="field" style={{ flex: 1 }}><label>Status</label>
              <select className="select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="scheduled">Scheduled</option><option value="in_progress">In progress</option><option value="completed">Completed</option>
              </select>
            </div>
          </div>
          <div className="row" style={{ gap: 10 }}>
            <div className="field" style={{ flex: 1 }}><label>Scheduled</label><input className="input" type="date" value={form.scheduledOn} onChange={(e) => setForm({ ...form, scheduledOn: e.target.value })} /></div>
            <div className="field" style={{ flex: 1 }}><label>Completed</label><input className="input" type="date" value={form.completedOn} onChange={(e) => setForm({ ...form, completedOn: e.target.value })} /></div>
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

function PerformanceTab({ farmId, empList, perfList, loading, refresh }: any) {
  const { push } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ employeeId: '', reviewerId: '', periodStart: '', periodEnd: '', rating: '', goalsMet: '', areasForImprovement: '', notes: '', status: 'draft' });
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await createPerformanceReview(farmId, form);
    push('Review created');
    setForm({ employeeId: '', reviewerId: '', periodStart: '', periodEnd: '', rating: '', goalsMet: '', areasForImprovement: '', notes: '', status: 'draft' });
    setOpen(false);
    refresh();
    setSaving(false);
  };

  return (
    <div>
      <div className="three mb">
        <Kpi icon={<TrendingUp size={18} />} label="Reviews" value={perfList.length} loading={loading} />
        <Kpi icon={<Award size={18} />} label="Avg rating" value={perfList.length ? (perfList.reduce((s: number, r: any) => s + (r.rating || 0), 0) / perfList.length).toFixed(1) : '—'} loading={loading} />
        <Kpi icon={<CheckCircle size={18} />} label="Published" value={perfList.filter((r: any) => r.status === 'published').length} loading={loading} />
      </div>
      <div className="card reveal">
        <div className="between mb">
          <h3>Performance reviews</h3>
          <button className="btn sm" onClick={() => setOpen(true)}><Plus size={14} /> New review</button>
        </div>
        <div className="table-wrap">
          <table><thead><tr><th>Employee</th><th>Period</th><th>Rating</th><th>Status</th><th>Reviewer</th></tr></thead>
            <tbody>{perfList.map((r: any) => (
              <tr key={r.id}>
                <td>{r.employee_name || r.employee_id}</td>
                <td>{fmt.date(r.period_start)} — {fmt.date(r.period_end)}</td>
                <td><AnimatedCounter value={Number(r.rating) || 0} suffix="/5" /></td>
                <td><span className={`pill ${r.status === 'published' ? 'healthy' : 'warn'}`}>{r.status}</span></td>
                <td>{r.reviewer_name || '—'}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </div>

      {open && <Modal title="Performance review" onClose={() => setOpen(false)}>
        <form onSubmit={submit}>
          <div className="field"><label>Employee</label>
            <select className="select" value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} required>
              <option value="">Select employee…</option>
              {empList.map((e: any) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div className="row" style={{ gap: 10 }}>
            <div className="field" style={{ flex: 1 }}><label>Period start</label><input className="input" type="date" value={form.periodStart} onChange={(e) => setForm({ ...form, periodStart: e.target.value })} required /></div>
            <div className="field" style={{ flex: 1 }}><label>Period end</label><input className="input" type="date" value={form.periodEnd} onChange={(e) => setForm({ ...form, periodEnd: e.target.value })} required /></div>
          </div>
          <div className="field"><label>Rating (0-5)</label><input className="input" type="number" step="0.1" min="0" max="5" value={form.rating} onChange={(e) => setForm({ ...form, rating: e.target.value })} /></div>
          <div className="field"><label>Goals met</label><textarea className="input" value={form.goalsMet} onChange={(e) => setForm({ ...form, goalsMet: e.target.value })} /></div>
          <div className="field"><label>Areas for improvement</label><textarea className="input" value={form.areasForImprovement} onChange={(e) => setForm({ ...form, areasForImprovement: e.target.value })} /></div>
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

function PayrollTab({ farmId, empList, payrollList, loading, refresh }: any) {
  const { push } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ employeeId: '', periodStart: '', periodEnd: '', grossAmount: '', paidOn: '' });
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await createPayroll(farmId, form);
    push('Payroll record added');
    setForm({ employeeId: '', periodStart: '', periodEnd: '', grossAmount: '', paidOn: '' });
    setOpen(false);
    refresh();
    setSaving(false);
  };

  const totalPaid = payrollList.reduce((s: number, p: any) => s + (Number(p.gross_amount) || 0), 0);

  return (
    <div>
      <div className="three mb">
        <Kpi icon={<DollarSign size={18} />} label="Total paid" value={fmt.money(totalPaid)} loading={loading} />
        <Kpi icon={<FileText size={18} />} label="Records" value={payrollList.length} loading={loading} />
        <Kpi icon={<Users size={18} />} label="Employees" value={empList.length} loading={loading} />
      </div>
      <div className="card reveal">
        <div className="between mb">
          <h3>Payroll</h3>
          <button className="btn sm" onClick={() => setOpen(true)}><Plus size={14} /> Add payroll</button>
        </div>
        <div className="table-wrap">
          <table><thead><tr><th>Employee</th><th>Period</th><th>Gross amount</th><th>Paid on</th></tr></thead>
            <tbody>{payrollList.map((p: any) => (
              <tr key={p.id}>
                <td>{p.employee_name || p.employee_id}</td>
                <td>{fmt.date(p.period_start)} — {fmt.date(p.period_end)}</td>
                <td><b>{fmt.money(p.gross_amount)}</b></td>
                <td>{p.paid_on ? fmt.date(p.paid_on) : '—'}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </div>

      {open && <Modal title="Add payroll" onClose={() => setOpen(false)}>
        <form onSubmit={submit}>
          <div className="field"><label>Employee</label>
            <select className="select" value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} required>
              <option value="">Select employee…</option>
              {empList.map((e: any) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div className="row" style={{ gap: 10 }}>
            <div className="field" style={{ flex: 1 }}><label>Period start</label><input className="input" type="date" value={form.periodStart} onChange={(e) => setForm({ ...form, periodStart: e.target.value })} required /></div>
            <div className="field" style={{ flex: 1 }}><label>Period end</label><input className="input" type="date" value={form.periodEnd} onChange={(e) => setForm({ ...form, periodEnd: e.target.value })} required /></div>
          </div>
          <div className="field"><label>Gross amount</label><input className="input" type="number" step="0.01" value={form.grossAmount} onChange={(e) => setForm({ ...form, grossAmount: e.target.value })} required /></div>
          <div className="field"><label>Paid on</label><input className="input" type="date" value={form.paidOn} onChange={(e) => setForm({ ...form, paidOn: e.target.value })} /></div>
          <div className="row mt" style={{ justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" className="btn ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn" type="submit" disabled={saving}>Save</button>
          </div>
        </form>
      </Modal>}
    </div>
  );
}

function LeaveTab({ farmId, empList, leaveList, loading, refresh }: any) {
  const { push } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ employeeId: '', leaveType: 'annual', startDate: '', endDate: '', reason: '', status: 'pending' });
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await createLeaveRequest(farmId, form);
    push('Leave request submitted');
    setForm({ employeeId: '', leaveType: 'annual', startDate: '', endDate: '', reason: '', status: 'pending' });
    setOpen(false);
    refresh();
    setSaving(false);
  };

  const approve = async (id: string) => {
    await updateLeaveRequest(id, { status: 'approved' });
    push('Leave approved');
    refresh();
  };

  const reject = async (id: string) => {
    await updateLeaveRequest(id, { status: 'rejected' });
    push('Leave rejected');
    refresh();
  };

  const pending = leaveList.filter((l: any) => l.status === 'pending').length;
  const approved = leaveList.filter((l: any) => l.status === 'approved').length;

  return (
    <div>
      <div className="three mb">
        <Kpi icon={<FileText size={18} />} label="Pending" value={pending} loading={loading} />
        <Kpi icon={<CheckCircle size={18} />} label="Approved" value={approved} loading={loading} />
        <Kpi icon={<AlertCircle size={18} />} label="Rejected" value={leaveList.filter((l: any) => l.status === 'rejected').length} loading={loading} />
      </div>
      <div className="card reveal">
        <div className="between mb">
          <h3>Leave requests</h3>
          <button className="btn sm" onClick={() => setOpen(true)}><Plus size={14} /> New request</button>
        </div>
        <div className="table-wrap">
          <table><thead><tr><th>Employee</th><th>Type</th><th>Dates</th><th>Reason</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>{leaveList.map((l: any) => (
              <tr key={l.id}>
                <td>{l.employee_name || l.employee_id}</td>
                <td><span className="tag">{l.leave_type}</span></td>
                <td>{fmt.date(l.start_date)} — {fmt.date(l.end_date)}</td>
                <td className="muted" style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.reason || '—'}</td>
                <td><span className={`pill ${l.status === 'approved' ? 'healthy' : l.status === 'rejected' ? 'danger' : 'warn'}`}>{l.status}</span></td>
                <td>
                  {l.status === 'pending' && (
                    <div className="row" style={{ gap: 4 }}>
                      <button className="btn ghost sm" onClick={() => approve(l.id)}><CheckCircle size={13} /></button>
                      <button className="btn ghost sm" onClick={() => reject(l.id)}><X size={13} /></button>
                    </div>
                  )}
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </div>

      {open && <Modal title="Leave request" onClose={() => setOpen(false)}>
        <form onSubmit={submit}>
          <div className="field"><label>Employee</label>
            <select className="select" value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} required>
              <option value="">Select employee…</option>
              {empList.map((e: any) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div className="field"><label>Leave type</label>
            <select className="select" value={form.leaveType} onChange={(e) => setForm({ ...form, leaveType: e.target.value })}>
              <option value="annual">Annual</option><option value="sick">Sick</option><option value="personal">Personal</option><option value="maternity">Maternity</option>
            </select>
          </div>
          <div className="row" style={{ gap: 10 }}>
            <div className="field" style={{ flex: 1 }}><label>Start date</label><input className="input" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} required /></div>
            <div className="field" style={{ flex: 1 }}><label>End date</label><input className="input" type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} required /></div>
          </div>
          <div className="field"><label>Reason</label><textarea className="input" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></div>
          <div className="row mt" style={{ justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" className="btn ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn" type="submit" disabled={saving}>Submit</button>
          </div>
        </form>
      </Modal>}
    </div>
  );
}

function MessagesTab({ farmId, user, empList, msgList, loading, refresh }: any) {
  const { push } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ recipientId: '', subject: '', body: '', priority: 'normal' });
  const [saving, setSaving] = useState(false);
  const unread = (user ? msgList.filter((m: any) => !m.read_at && m.recipient_id === user.id).length : 0);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await sendMessage(farmId, form);
    push('Message sent');
    setForm({ recipientId: '', subject: '', body: '', priority: 'normal' });
    setOpen(false);
    refresh();
    setSaving(false);
  };

  return (
    <div>
      <div className="three mb">
        <Kpi icon={<MessageSquare size={18} />} label="Messages" value={msgList.length} loading={loading} />
        <Kpi icon={<Mail size={18} />} label="Unread" value={msgList.filter((m: any) => !m.read_at).length} loading={loading} />
        <Kpi icon={<Users size={18} />} label="Employees" value={empList.length} loading={loading} />
      </div>
      <div className="card reveal">
        <div className="between mb">
          <h3>Messages</h3>
          <button className="btn sm" onClick={() => setOpen(true)}><Send size={14} /> New message</button>
        </div>
        <div className="table-wrap">
          <table><thead><tr><th>From</th><th>To</th><th>Subject</th><th>Priority</th><th>Status</th><th>Date</th></tr></thead>
            <tbody>{msgList.slice(0, 20).map((m: any) => (
              <tr key={m.id} style={{ opacity: m.read_at ? 1 : 0.7 }}>
                <td>{m.sender_name || m.sender_id}</td>
                <td>{m.recipient_name || m.recipient_id}</td>
                <td><b>{m.subject}</b></td>
                <td><span className={`pill ${m.priority === 'high' ? 'danger' : m.priority === 'urgent' ? 'danger' : 'info'}`}>{m.priority}</span></td>
                <td>{m.read_at ? <span className="pill healthy">Read</span> : <span className="pill warn">Unread</span>}</td>
                <td>{fmt.shortDate(m.created_at)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </div>

      {open && <Modal title="New message" onClose={() => setOpen(false)}>
        <form onSubmit={submit}>
          <div className="field"><label>To</label>
            <select className="select" value={form.recipientId} onChange={(e) => setForm({ ...form, recipientId: e.target.value })} required>
              <option value="">Select recipient…</option>
              {empList.map((e: any) => <option key={e.id} value={e.user_id || e.id}>{e.name}</option>)}
            </select>
          </div>
          <div className="field"><label>Subject</label><input className="input" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} required /></div>
          <div className="field"><label>Message</label><textarea className="input" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} required /></div>
          <div className="field"><label>Priority</label>
            <select className="select" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
              <option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option>
            </select>
          </div>
          <div className="row mt" style={{ justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" className="btn ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn" type="submit" disabled={saving}><Send size={15} /> Send</button>
          </div>
        </form>
      </Modal>}
    </div>
  );
}
