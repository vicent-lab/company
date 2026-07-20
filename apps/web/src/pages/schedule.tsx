import { useState, useEffect } from 'react';
import { useFarm } from '../app';
import { useHashRoute } from '../router';
import { PageHeader, Modal, Kpi, useAsync, useToast, Skeleton } from '../ui';
import { dailyActivities, createDailyActivity, updateDailyActivity, deleteDailyActivity, employees } from '../data';
import { Plus, Trash2, Edit3, Save, X, Clock, Activity, User, Calendar, ClipboardList } from 'lucide-react';
import { fmt } from '../format';

const EMPTY = { activityType: '', description: '', durationMinutes: '', relatedCowId: '', relatedTaskId: '', activityDate: '' };

export function DailySchedule() {
  const { farmId } = useFarm();
  const [, navigate] = useHashRoute();
  const { push } = useToast();
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [actKey, setActKey] = useState(0);
  const { data: activities, loading } = useAsync(() => dailyActivities(farmId, date), [farmId, date, actKey]);
  const { data: empList } = useAsync(() => employees(farmId), [farmId]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const list = activities || [];
  const totalMinutes = list.reduce((s: number, a: any) => s + (a.duration_minutes || 0), 0);
  const types: string[] = list.length > 0 ? (list as any[]).map((a: any) => a.activity_type).filter((v: string, i: number, a: any[]) => a.indexOf(v) === i) : [];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.activityType.trim()) { push('Activity type is required'); return; }
    setSaving(true);
    try {
      await createDailyActivity({
        farmId,
        activity_type: form.activityType,
        description: form.description,
        duration_minutes: Number(form.durationMinutes) || undefined,
        related_cow_id: form.relatedCowId || undefined,
        related_task_id: form.relatedTaskId || undefined,
        activity_date: form.activityDate || date,
        employee_id: undefined,
      });
      push('Activity logged');
      setForm(EMPTY);
      setOpen(false);
      setActKey((k) => k + 1);
    } catch (err: any) { push(err.message); }
    setSaving(false);
  };

  return (
    <div>
      <PageHeader eyebrow="DAILY" title="Daily schedule" desc={`${list.length} activities · ${Math.round(totalMinutes / 60)}h logged`}
        actions={<button className="btn sm" onClick={() => setOpen(true)}><Plus size={16} /> Log activity</button>} />
      <div className="row mt" style={{ gap: 10, marginBottom: 16, alignItems: 'center' }}>
        <label style={{ fontSize: 14 }}>Date:</label>
        <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: 180 }} />
      </div>
      <div className="four mt">
        <Kpi icon={<Activity size={18} />} label="Activities" value={list.length} />
        <Kpi icon={<Clock size={18} />} label="Hours logged" value={`${(totalMinutes / 60).toFixed(1)}h`} />
        <Kpi icon={<User size={18} />} label="Team members" value={empList?.length || 0} />
      </div>
      {types.length > 0 && (
        <div className="row mt" style={{ gap: 8, flexWrap: 'wrap' }}>
          {types.map((t: string) => (
            <span key={t} className="pill">{t}</span>
          ))}
        </div>
      )}
      <div className="card mt">
        {list.length === 0 && <p className="muted">No activities for this date.</p>}
        {list.map((act: any) => (
          <div key={act.id} className="between" style={{ padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
            <div style={{ flex: 1 }}>
              <div className="row" style={{ gap: 8, marginBottom: 4 }}>
                <b style={{ fontSize: 15 }}>{act.activity_type}</b>
                <span className="pill info">{act.duration_minutes ? `${act.duration_minutes} min` : 'No duration'}</span>
              </div>
              {act.description && <div className="muted" style={{ fontSize: 13, marginBottom: 4 }}>{act.description}</div>}
              <div className="row" style={{ gap: 12, fontSize: 12, color: 'var(--muted)' }}>
                {act.employee_name && <span className="row" style={{ gap: 4 }}><User size={12} /> {act.employee_name}</span>}
                {act.task_title && <span className="row" style={{ gap: 4 }}><ClipboardList size={12} /> {act.task_title}</span>}
                <span className="row" style={{ gap: 4 }}><Calendar size={12} /> {fmt.date(act.activity_date)}</span>
              </div>
            </div>
            <div className="row" style={{ gap: 6 }}>
              <button className="btn ghost sm" onClick={() => { setForm({ activityType: act.activity_type, description: act.description || '', durationMinutes: String(act.duration_minutes || ''), relatedCowId: act.related_cow_id || '', relatedTaskId: act.related_task_id || '', activityDate: act.activity_date }); setOpen(true); }}><Edit3 size={14} /></button>
              <button className="btn ghost sm" onClick={() => { if (confirm('Delete this activity?')) { deleteDailyActivity(act.id).then(() => { push('Activity deleted'); setActKey((k) => k + 1); }); } }}><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
      </div>

      {open && <Modal title="Log activity" onClose={() => setOpen(false)}>
        <form onSubmit={submit}>
          <div className="field"><label>Activity type</label><input className="input" value={form.activityType} onChange={(e) => setForm({ ...form, activityType: e.target.value })} placeholder="e.g., Milking, Feeding, Cleaning" required /></div>
          <div className="field"><label>Description</label><textarea className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div className="row" style={{ gap: 10 }}>
            <div className="field"><label>Duration (minutes)</label><input className="input" type="number" value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })} /></div>
            <div className="field"><label>Date</label><input className="input" type="date" value={form.activityDate} onChange={(e) => setForm({ ...form, activityDate: e.target.value })} /></div>
          </div>
          <div className="row mt" style={{ justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" className="btn ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn" type="submit" disabled={saving}><Save size={15} /> {saving ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </Modal>}
    </div>
  );
}
