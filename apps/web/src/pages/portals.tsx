import { useState, useEffect } from 'react';
import { useFarm } from '../app';
import { PageHeader, Kpi, AnimatedCounter, ChartCard, LineChart, chartColors, gridColor, tickColor, useToast, Modal, Progress, useAsync } from '../ui';
import { customers, customerInvoices, employees } from '../data';
import { CUSTOMERS, INVOICES, EMPLOYEES } from '../mock';
import { Users, FileDown, CreditCard, ShoppingCart, Truck, Download, CheckCircle2, CalendarCheck, ClipboardList, Send, Plane, UserCheck } from 'lucide-react';
import { fmt } from '../format';
import { exportTable, exportPDF, toCSV, download } from '../export';

export function Customers() {
  const { farmId } = useFarm();
  const { push } = useToast();
  const { data: custList } = useAsync(() => customers(farmId), [farmId]);
  const list = custList || [];
  const [sel, setSel] = useState<any>(null);
  const [pay, setPay] = useState<string | null>(null);
  const [order, setOrder] = useState(false);
  const { data: invs } = useAsync(() => sel ? customerInvoices(sel.id) : Promise.resolve([]), [sel?.id]);
  const gc = chartColors();

  useEffect(() => { if (!sel && list.length) setSel(list[0]); }, [list, sel]);

  return (
    <div>
      <PageHeader eyebrow="CUSTOMER PORTAL" title="Customer accounts" desc="Orders, invoices, payments, and deliveries."
        actions={<><button className="btn ghost sm" onClick={() => { exportTable('customers.xls', 'Customers', ['Name', 'Email', 'Orders', 'Spent'], list.map((c: any) => [c.name, c.email, c.orders, c.spent])); push('Exported', <Download size={15} />); }}>Export</button><button className="btn sm" onClick={() => setOrder(true)}><ShoppingCart size={15} /> New order</button></>} />
      <div className="two">
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)' }}><h3>Customers</h3></div>
          {list.map((c: any) => (
            <div key={c.id} className="between" style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', cursor: 'pointer', background: sel?.id === c.id ? 'var(--primary-soft)' : 'transparent' }} onClick={() => setSel(c)}>
              <div className="row"><span className="photo" style={{ width: 34, height: 34, fontSize: 13, background: 'var(--primary)' }}>{c.name[0]}</span><div><b>{c.name}</b><div className="muted" style={{ fontSize: 12 }}>{c.email}</div></div></div>
              <span className="muted">{fmt.money(c.spent)}</span>
          </div>
          ))}
        </div>

        <div>
          {sel && <><div className="card reveal" style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <span className="photo" style={{ width: 56, height: 56, fontSize: 22, background: 'var(--primary)' }}>{sel.name[0]}</span>
            <div><b style={{ fontSize: 18 }}>{sel.name}</b><div className="muted">{sel.phone}</div><span className={`pill ${sel.status === 'Active' ? 'healthy' : 'warn'}`}>{sel.status}</span></div>
          </div>
          <div className="four mt">
            <Kpi icon={<ShoppingCart size={16} />} label="Orders" value={sel.orders} />
            <Kpi icon={<CreditCard size={16} />} label="Spent" value={<AnimatedCounter value={sel.spent} prefix="$" />} />
          </div>
          <ChartCard title="Purchase history" subtitle="Litres / month">
            <LineChart data={{ labels: ['Jan','Feb','Mar','Apr','May','Jun'], datasets: [{ label: 'L', data: [30,42,38,50,46,58], borderColor: gc[0], backgroundColor: gc[0] + '22', fill: true, tension: 0.4, pointRadius: 0, borderWidth: 2 }] }}
              options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: tickColor() }, grid: { color: gridColor() } }, y: { ticks: { color: tickColor() }, grid: { color: gridColor() } } } }} />
          </ChartCard>
          <div className="card mt"><h3>Invoices</h3>
            <div className="table-wrap mt" style={{ border: 0, boxShadow: 'none' }}><table><thead><tr><th>Invoice</th><th>Date</th><th>Amount</th><th>Status</th><th></th></tr></thead>
              <tbody>{(invs || []).map((inv: any) => <tr key={inv.id}><td>{inv.id}</td><td>{fmt.date(inv.date)}</td><td>{fmt.money(inv.amount)}</td><td><span className={`pill ${inv.status === 'Paid' ? 'healthy' : inv.status === 'Overdue' ? 'danger' : 'warn'}`}>{inv.status}</span></td><td><button className="btn ghost sm" onClick={() => { exportPDF('Invoice ' + inv.id, ['Field', 'Value'], [['Invoice', inv.id], ['Date', inv.date], ['Amount', fmt.money(inv.amount)], ['Status', inv.status]]); push('Invoice downloaded'); }}>PDF</button></td></tr>)}</tbody></table></div>
          </div>
          <div className="row mt">
            <button className="btn sm" onClick={() => setPay('due')}><CreditCard size={15} /> Make payment</button>
            <button className="btn ghost sm" onClick={() => push('Delivery tracked')}><Truck size={15} /> Track delivery</button>
          </div>
          </>}
        </div>
      </div>

      {pay && <Modal title={`Pay invoice ${pay}`} onClose={() => setPay(null)}>
        <p>Amount due: <b>{fmt.money(4200)}</b></p>
        <div className="field mt"><label>Card number</label><input className="input" placeholder="4242 4242 4242 4242" /></div>
        <button className="btn" onClick={() => { setPay(null); push('Payment successful', <CheckCircle2 size={15} />); }}>Pay now</button>
      </Modal>}
      {order && <Modal title="Place new order" onClose={() => setOrder(false)}>
        <div className="field"><label>Product</label><select className="select"><option>Fresh milk — 100L</option><option>Cream — 20L</option><option>Yogurt pack</option></select></div>
        <div className="field"><label>Quantity</label><input className="input" type="number" defaultValue={1} /></div>
        <button className="btn" onClick={() => { setOrder(false); push('Order placed', <ShoppingCart size={15} />); }}>Submit order</button>
      </Modal>}
    </div>
  );
}

export function Employees() {
  const { farmId } = useFarm();
  const { push } = useToast();
  const { data: empList } = useAsync(() => employees(farmId), [farmId]);
  const list = empList || [];
  const [report, setReport] = useState(false);
  const [leave, setLeave] = useState(false);
  const tasks = ['Morning milking', 'Feed calves', 'Clean Barn B', 'Vet check 2 cows', 'Update records'];
  return (
    <div>
      <PageHeader eyebrow="EMPLOYEE PORTAL" title="Team workspace" desc="Schedules, attendance, tasks, and reports."
        actions={<><button className="btn ghost sm" onClick={() => setReport(true)}><ClipboardList size={15} /> Daily report</button><button className="btn sm" onClick={() => setLeave(true)}><Plane size={15} /> Request leave</button></>} />
      <div className="four">
        <Kpi icon={<CalendarCheck size={16} />} label="My attendance" value="96%" />
        <Kpi icon={<ClipboardList size={16} />} label="Tasks today" value={tasks.length} />
        <Kpi icon={<UserCheck size={16} />} label="Shift" value="Day" />
        <Kpi icon={<Plane size={16} />} label="Leave left" value="12d" />
      </div>
      <div className="two mt">
        <div className="card">
          <h3>Today's schedule</h3>
          {['06:00 — Morning milking', '09:00 — Feed & health check', '13:00 — Records & cleanup', '16:00 — Evening milking'].map((s, i) => (
            <div key={i} className="between mt" style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}><span>{s}</span><span className="pill healthy">done</span></div>
          ))}
          <button className="btn sm mt" onClick={() => push('Attendance marked', <UserCheck size={15} />)}>Mark attendance</button>
        </div>
        <div className="card">
          <h3>My tasks</h3>
          {tasks.map((t, i) => <div key={i} className="between mt"><span className="row"><CheckCircle2 size={16} color="var(--primary)" /> {t}</span><span className="pill muted">pending</span></div>)}
        </div>
      </div>
      <div className="card mt">
        <h3>Team</h3>
        <div className="table-wrap mt" style={{ border: 0, boxShadow: 'none' }}><table><thead><tr><th>Name</th><th>Role</th><th>Attendance</th><th>Tasks</th></tr></thead>
          <tbody>{list.map((e: any) => <tr key={e.id}><td>{e.name}</td><td>{e.role}</td><td><div className="row"><div style={{ width: 80 }}><Progress value={e.attendance} /></div>{e.attendance}%</div></td><td>{e.tasks}</td></tr>)}</tbody></table></div>
      </div>

      {report && <Modal title="Submit daily report" onClose={() => setReport(false)}>
        <div className="field"><label>Summary</label><textarea className="input" rows={4} placeholder="What did you complete today?" /></div>
        <button className="btn" onClick={() => { setReport(false); push('Report submitted', <Send size={15} />); }}>Submit</button>
      </Modal>}
      {leave && <Modal title="Request leave" onClose={() => setLeave(false)}>
        <div className="field"><label>From</label><input className="input" type="date" /></div>
        <div className="field"><label>To</label><input className="input" type="date" /></div>
        <button className="btn" onClick={() => { setLeave(false); push('Leave requested'); }}>Send request</button>
      </Modal>}
    </div>
  );
}
