import { useState } from 'react';
import { useFarm } from '../app';
import { useHashRoute } from '../router';
import { PageHeader, Modal, Kpi, useAsync, useToast, Skeleton } from '../ui';
import { tasks, createTask, updateTask, deleteTask, employees } from '../data';
import { Plus, Trash2, Edit3, Save, X, Clock, CheckCircle, AlertCircle, User, Calendar } from 'lucide-react';
import { fmt } from '../format';

const EMPTY = { title: '', description: '', assignedTo: '', priority: 'medium', dueDate: '', dueTime: '', category: '', tags: [] };

export function TaskManager() {
  const { farmId } = useFarm();
  const [, navigate] = useHashRoute();
  const { push } = useToast();
  const [filter, setFilter] = useState<string>('all');
  const [taskKey, setTaskKey] = useState(0);
  const { data: taskList, loading } = useAsync(() => tasks({ status: filter !== 'all' ? filter : undefined }), [filter, taskKey]);
  const { data: empList } = useAsync(() => employees(farmId), [farmId]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const today = new Date().toISOString().slice(0, 10);
  const list = (taskList || []).filter((t: any) => filter === 'all' || t.status === filter);
  const pending = (taskList || []).filter((t: any) => t.status === 'pending').length;
  const completed = (taskList || []).filter((t: any) => t.status === 'completed').length;
  const overdue = (taskList || []).filter((t: any) => t.status !== 'completed' && t.due_date && t.due_date < today).length;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) { push('Title is required'); return; }
    setSaving(true);
    try {
      await createTask({
        title: form.title.trim(),
        description: form.description,
        assignedTo: form.assignedTo || undefined,
        priority: form.priority,
        dueDate: form.dueDate || undefined,
        dueTime: form.dueTime || undefined,
        category: form.category || undefined,
        tags: form.tags,
      });
      push('Task created');
      setForm(EMPTY);
      setOpen(false);
      setTaskKey((k) => k + 1);
    } catch (err: any) { push(err.message); }
    setSaving(false);
  };

  return (
    <div>
      <PageHeader eyebrow="TASKS" title="Task management" desc={`${pending} pending · ${completed} completed · ${overdue} overdue`}
        actions={<button className="btn sm" onClick={() => setOpen(true)}><Plus size={16} /> New task</button>} />
      <div className="four mt">
        <Kpi icon={<Clock size={18} />} label="Pending" value={pending} />
        <Kpi icon={<CheckCircle size={18} />} label="Completed" value={completed} />
        <Kpi icon={<AlertCircle size={18} />} label="Overdue" value={overdue} />
      </div>
      <div className="row mt" style={{ gap: 8, marginBottom: 16 }}>
        {['all', 'pending', 'in_progress', 'completed'].map((s) => (
          <button key={s} className={`btn sm ${filter === s ? 'gold' : 'ghost'}`} onClick={() => setFilter(s)}>{s.replace('_', ' ')}</button>
        ))}
      </div>
      <div className="card mt">
        {list.length === 0 && <p className="muted">No tasks found.</p>}
        {list.map((task: any) => (
          <div key={task.id} className="between" style={{ padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
            <div style={{ flex: 1 }}>
              <div className="row" style={{ gap: 8, marginBottom: 4 }}>
                <b style={{ fontSize: 15 }}>{task.title}</b>
                <span className={`pill ${task.priority === 'urgent' ? 'danger' : task.priority === 'high' ? 'warn' : 'info'}`}>{task.priority}</span>
                <span className={`pill ${task.status === 'completed' ? 'healthy' : task.status === 'in_progress' ? 'info' : 'muted'}`}>{task.status}</span>
              </div>
              {task.description && <div className="muted" style={{ fontSize: 13, marginBottom: 4 }}>{task.description}</div>}
              <div className="row" style={{ gap: 12, fontSize: 12, color: 'var(--muted)' }}>
                {task.assigned_name && <span className="row" style={{ gap: 4 }}><User size={12} /> {task.assigned_name}</span>}
                {task.due_date && <span className="row" style={{ gap: 4 }}><Calendar size={12} /> {fmt.date(task.due_date)}</span>}
                {task.category && <span className="pill" style={{ fontSize: 11 }}>{task.category}</span>}
              </div>
            </div>
            <div className="row" style={{ gap: 6 }}>
              <button className="btn ghost sm" onClick={() => { setForm({ title: task.title, description: task.description || '', assignedTo: task.assigned_to || '', priority: task.priority, dueDate: task.due_date || '', dueTime: task.due_time || '', category: task.category || '', tags: task.tags || [] }); setOpen(true); }}><Edit3 size={14} /></button>
              <button className="btn ghost sm" onClick={() => updateTask(task.id, { status: task.status === 'completed' ? 'pending' : 'completed' }).then(() => setTaskKey((k) => k + 1))}>
                {task.status === 'completed' ? 'Reopen' : 'Complete'}
              </button>
              <button className="btn ghost sm" onClick={() => { if (confirm('Delete this task?')) { deleteTask(task.id).then(() => { push('Task deleted'); setTaskKey((k) => k + 1); }); } }}><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
      </div>

      {open && <Modal title={form.title ? 'Edit task' : 'New task'} onClose={() => setOpen(false)}>
        <form onSubmit={submit}>
          <div className="field"><label>Title</label><input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></div>
          <div className="field"><label>Description</label><textarea className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div className="field"><label>Assign to</label><select className="select" value={form.assignedTo} onChange={(e) => setForm({ ...form, assignedTo: e.target.value })}><option value="">Unassigned</option>{(empList || []).map((e: any) => <option key={e.id} value={e.id}>{e.name} — {e.role}</option>)}</select></div>
          <div className="row" style={{ gap: 10 }}>
            <div className="field"><label>Priority</label><select className="select" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option></select></div>
            <div className="field"><label>Category</label><input className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></div>
          </div>
          <div className="row" style={{ gap: 10 }}>
            <div className="field"><label>Due date</label><input className="input" type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></div>
            <div className="field"><label>Due time</label><input className="input" type="time" value={form.dueTime} onChange={(e) => setForm({ ...form, dueTime: e.target.value })} /></div>
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
