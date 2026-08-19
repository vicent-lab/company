import React, { createContext, useContext, useCallback, useEffect, useRef, useState, ReactNode } from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, PointElement, LineElement, ArcElement, Tooltip, Legend, Filler } from 'chart.js';
import { Bar, Line, Doughnut } from 'react-chartjs-2';
import { Eye, EyeOff, WifiOff, CloudUpload, AlertTriangle, Search, ChevronRight, ChevronLeft, Clock, User, Package, FileText, Calendar, Beef, Users, Activity, Syringe, Wheat } from 'lucide-react';
import * as data from './data';
import { passwordStrength } from './lib/password-strength';
import { getQueue, subscribeQueue, initOfflineSync, QueuedWrite } from './lib/offline-queue';

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, ArcElement, Tooltip, Legend, Filler);
ChartJS.defaults.font.family = "'DM Sans', sans-serif";

const C = {
  primary: getCss('--primary'), accent: getCss('--accent'), text: getCss('--text'),
  soft: getCss('--text-soft'), border: getCss('--border'), warn: getCss('--warn'),
  danger: getCss('--danger'), info: getCss('--info'), surface: getCss('--surface-2'),
};
function getCss(v: string) {
  if (typeof window === 'undefined') return '#246346';
  return getComputedStyle(document.documentElement).getPropertyValue(v).trim() || '#246346';
}

// ---------- Animated counter ----------
export function AnimatedCounter({ value, decimals = 0, prefix = '', suffix = '' }: { value: number; decimals?: number; prefix?: string; suffix?: string; }) {
  const [v, setV] = useState(0);
  const ref = useRef(0);
  useEffect(() => {
    const start = ref.current;
    const t0 = performance.now();
    const dur = 900;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setV(start + (value - start) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
      else ref.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{prefix}{v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}{suffix}</>;
}

// ---------- Skeleton ----------
export function Skeleton({ h = 16, w = '100%', style }: { h?: number; w?: string | number; style?: React.CSSProperties }) {
  return <div className="skeleton" style={{ height: h, width: w, ...style }} />;
}

// ---------- KPI card ----------
export function Kpi({ icon, label, value, delta, tone = 'up', loading, spark }: {
  icon: ReactNode; label: string; value: ReactNode; delta?: string; tone?: 'up' | 'down'; loading?: boolean; spark?: number[];
}) {
  return (
    <div className="kpi reveal">
      <div className="icon">{icon}</div>
      <div className="label">{label}</div>
      {loading ? <Skeleton h={30} w={120} style={{ marginTop: 8 }} /> : <div className="value">{value}</div>}
      {delta && !loading && <div className={`delta ${tone}`}>{delta}</div>}
      {spark && <Sparkline data={spark} />}
    </div>
  );
}

export function Sparkline({ data, color = C.primary }: { data: number[]; color?: string }) {
  const max = Math.max(...data), min = Math.min(...data);
  const w = 90, h = 34;
  const pts = data.map((d, i) => `${(i / (data.length - 1)) * w},${h - ((d - min) / (max - min || 1)) * h}`).join(' ');
  return (
    <svg className="spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
    </svg>
  );
}

// ---------- Chart wrappers ----------
export function ChartCard({ title, subtitle, children, right }: { title: string; subtitle?: string; children: ReactNode; right?: ReactNode }) {
  return (
    <div className="card reveal">
      <div className="between mb"><div><h3>{title}</h3>{subtitle && <div className="muted" style={{ fontSize: 13 }}>{subtitle}</div>}</div>{right}</div>
      {children}
    </div>
  );
}
export const BarChart = (p: any) => <div className="chart-box"><Bar {...p} /></div>;
export const LineChart = (p: any) => <div className="chart-box"><Line {...p} /></div>;
export const DoughnutChart = (p: any) => <div className="chart-box sm"><Doughnut {...p} /></div>;

export const chartColors = (n = 6) => {
  const base = [C.primary, C.accent, C.info, C.warn, C.danger, '#9b8cff'];
  return Array.from({ length: n }, (_, i) => base[i % base.length]);
};
export const gridColor = () => C.border;
export const tickColor = () => C.soft;

export interface Column<T> {
  key: keyof T | string;
  header: string;
  render?: (row: T) => ReactNode;
  className?: string;
}

export function ResponsiveTable<T>({ columns, data, rowKey, onRowClick, emptyMessage = 'No records found.' }: { columns: Column<T>[]; data: T[]; rowKey: keyof T | ((row: T) => string); onRowClick?: (row: T) => void; emptyMessage?: string }) {
  const getKey = (row: T, idx: number) => {
    if (typeof rowKey === 'function') return rowKey(row);
    return String(row[rowKey]);
  };
  return (
    <div className="table-wrap" style={{ border: 0, boxShadow: 'none' }}>
      <div className="responsive-table">
        <table>
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={String(col.key)} className={col.className}>{col.header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.length === 0 && (
              <tr><td colSpan={columns.length} style={{ textAlign: 'center', padding: 24 }}><span className="muted">{emptyMessage}</span></td></tr>
            )}
            {data.map((row, idx) => (
              <tr key={getKey(row, idx)} onClick={() => onRowClick?.(row)} style={{ cursor: onRowClick ? 'pointer' : 'default' }}>
                {columns.map((col) => (
                  <td key={String(col.key)} className={col.className}>
                    {col.render ? col.render(row) : String((row as any)[col.key] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="responsive-cards">
          {data.length === 0 && <p className="muted" style={{ padding: 20, textAlign: 'center' }}>{emptyMessage}</p>}
          {data.map((row, idx) => (
            <div key={getKey(row, idx)} className="responsive-card" onClick={() => onRowClick?.(row)}>
              {columns.map((col) => (
                <div key={String(col.key)} className="responsive-card-row">
                  <span className="responsive-card-label">{col.header}</span>
                  <span className="responsive-card-value">{col.render ? col.render(row) : String((row as any)[col.key] ?? '')}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------- Modal ----------
export function Modal({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="between mb"><h3 style={{ fontSize: 20 }}>{title}</h3><button className="ghost btn sm" onClick={onClose}>✕</button></div>
        {children}
        {footer && <div className="row mt" style={{ justifyContent: 'flex-end' }}>{footer}</div>}
      </div>
    </div>
  );
}

// ---------- Toast ----------
interface ToastCtx { push: (msg: string, icon?: ReactNode) => void; }
const TCtx = createContext<ToastCtx>({ push: () => {} });
export const useToast = () => useContext(TCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<{ id: number; msg: string; icon?: ReactNode }[]>([]);
  const nextToastId = useRef(0);
  const push = (msg: string, icon?: ReactNode) => {
    const id = ++nextToastId.current;
    setToasts((t) => [...t, { id, msg, icon }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  };
  return (
    <TCtx.Provider value={{ push }}>
      {children}
      <div className="toast-wrap">{toasts.map((t) => <div key={t.id} className="toast">{t.icon}<span>{t.msg}</span></div>)}</div>
    </TCtx.Provider>
  );
}

// ---------- Theme toggle ----------
export function ThemeToggle({ theme, setTheme }: { theme: string; setTheme: (t: any) => void }) {
  const opts = [['light', 'Light'], ['dark', 'Dark'], ['contrast', 'A11y']];
  return (
    <div className="theme-toggle">
      {opts.map(([k, l]) => (
        <button key={k} className={theme === k ? 'active' : ''} onClick={() => setTheme(k)}>{l}</button>
      ))}
    </div>
  );
}

// ---------- Cow photo (SVG or real image) ----------
export function CowPhoto({ name, color, size = 64, photoUrl }: { name: string; color: string; size?: number; photoUrl?: string | null }) {
  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={name}
        className="photo"
        style={{ width: size, height: size, objectFit: 'cover', borderRadius: 12 }}
      />
    );
  }
  const initials = name.split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div className="photo" style={{ width: size, height: size, background: `linear-gradient(135deg, ${color}, #173d2b)`, fontSize: size * 0.34 }}>
      {initials}
    </div>
  );
}

// ---------- QR code (deterministic visual) ----------
export function QrCode({ seed, size = 120 }: { seed: string; size?: number }) {
  const n = 11;
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const cells: boolean[] = [];
  for (let i = 0; i < n * n; i++) { h = (h * 1103515245 + 12345) >>> 0; cells.push((h >> 16 & 1) === 1); }
  const finder = (r: number, c: number) => r < 3 && c < 3 || r < 3 && c > n - 4 || r > n - 4 && c < 3;
  const gap = 2, cell = (size - gap * 2) / n;
  return (
    <div className="qr" style={{ width: size, height: size, gridTemplateColumns: `repeat(${n}, 1fr)` }}>
      {Array.from({ length: n * n }, (_, i) => {
        const r = Math.floor(i / n), c = i % n;
        const on = finder(r, c) ? (r % 2 === 0 || c % 2 === 0 || (r > 0 && r < n - 1 && c > 0 && c < n - 1)) : cells[i];
        return <i key={i} style={{ aspectRatio: 1, background: on ? '#111' : '#fff' }} />;
      })}
    </div>
  );
}

// ---------- Card ----------
export function Card({ title, subtitle, children, className = '', style, padding = 'md' }: {
  title?: string; subtitle?: string; children: ReactNode; className?: string; style?: React.CSSProperties; padding?: 'none' | 'sm' | 'md' | 'lg';
}) {
  const paddingMap = { none: 0, sm: 12, md: 18, lg: 24 };
  return (
    <div className={`card ${className}`} style={{ padding: paddingMap[padding], ...style }}>
      {(title || subtitle) && (
        <div className="card-header">
          <div>
            {title && <div className="card-title">{title}</div>}
            {subtitle && <div className="card-subtitle">{subtitle}</div>}
          </div>
        </div>
      )}
      {children}
    </div>
  );
}

// ---------- Form field ----------
export function FormField({ label, children, error }: { label?: string; children: ReactNode; error?: string }) {
  return (
    <div className="field">
      {label && <label>{label}</label>}
      {children}
      {error && <span className="field-error">{error}</span>}
    </div>
  );
}

// ---------- Table ----------
export function Table<T>({ columns, data, rowKey, onRowClick, emptyMessage = 'No records found.' }: {
  columns: Column<T>[]; data: T[]; rowKey: keyof T | ((row: T) => string); onRowClick?: (row: T) => void; emptyMessage?: string;
}) {
  return (
    <div className="table-wrap">
      <ResponsiveTable columns={columns} data={data} rowKey={rowKey} onRowClick={onRowClick} emptyMessage={emptyMessage} />
    </div>
  );
}

// ---------- Icon wrapper ----------
export function IconWrap({ children, size = 20, color = 'var(--primary)' }: { children: ReactNode; size?: number; color?: string }) {
  return (
    <div className="icon" style={{ width: size, height: size, borderRadius: size * 0.25, display: 'grid', placeItems: 'center', background: 'var(--primary-soft)', color }}>
      {children}
    </div>
  );
}

export function Spinner({ size = 24, style }: { size?: number; style?: React.CSSProperties }) {
  return (
    <div className="spin" style={{ width: size, height: size, border: `${size * 0.1}px solid var(--border)`, borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', ...style }} />
  );
}

// ---------- Error state ----------
export function ErrorState({ title, message, onRetry }: { title?: string; message: string; onRetry?: () => void }) {
  return (
    <div className="empty-state">
      <div className="empty-icon" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}>
        <AlertTriangle size={24} />
      </div>
      <h3>{title || 'Something went wrong'}</h3>
      <p>{message}</p>
      {onRetry && <button className="btn sm mt" onClick={onRetry}>Try again</button>}
    </div>
  );
}

// ---------- Section / page header ----------
export function PageHeader({ eyebrow, title, desc, actions, back }: { eyebrow?: string; title: string; desc?: string; actions?: ReactNode; back?: () => void }) {
  return (
    <div className="page-head">
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12 }}>
        {back && <button className="btn ghost sm" style={{ padding: '6px 8px', minWidth: 0 }} onClick={back}><ChevronLeft size={16} /></button>}
        <div>
          {eyebrow && <div className="eyebrow">{eyebrow}</div>}
          <h1>{title}</h1>
          {desc && <p className="muted" style={{ marginTop: 4 }}>{desc}</p>}
        </div>
      </div>
      {actions && <div className="row">{actions}</div>}
    </div>
  );
}

export function SectionHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="section-header">
      <div>
        <h2>{title}</h2>
        {subtitle && <div className="sub">{subtitle}</div>}
      </div>
      {action && <div className="card-actions">{action}</div>}
    </div>
  );
}

export function Badge({ children, variant = 'default', style }: { children: ReactNode; variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'purple'; style?: React.CSSProperties }) {
  return <span className={`badge badge-${variant}`} style={style}>{children}</span>;
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      {icon && <div className="empty-icon">{icon}</div>}
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action && <div className="mt">{action}</div>}
    </div>
  );
}

export function Alert({ variant = 'info', title, message, icon }: { variant?: 'info' | 'warning' | 'danger' | 'success'; title: string; message?: string; icon?: ReactNode }) {
  const icons: Record<string, ReactNode> = {
    info: <span>ℹ️</span>,
    warning: <span>⚠️</span>,
    danger: <span>🚫</span>,
    success: <span>✅</span>,
  };
  return (
    <div className={`alert alert-${variant}`}>
      <div className="alert-icon">{icon || icons[variant]}</div>
      <div className="alert-content">
        <div className="alert-title">{title}</div>
        {message && <div className="alert-message">{message}</div>}
      </div>
    </div>
  );
}

export function TabBar<T extends string = string>({ tabs, active, onChange }: { tabs: { key: T; label: string; icon?: ReactNode }[]; active: T; onChange: (key: T) => void }) {
  return (
    <div className="tab-bar">
      {tabs.map((t) => (
        <button key={t.key} className={`tab ${active === t.key ? 'active' : ''}`} onClick={() => onChange(t.key)}>
          {t.icon && <span style={{ marginRight: 6, display: 'inline-flex', alignItems: 'center' }}>{t.icon}</span>}
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Progress({ value }: { value: number }) {
  return <div className="progress"><span style={{ width: `${Math.min(100, value)}%` }} /></div>;
}

export function PasswordInput({ value, onChange, placeholder, minLength, required, autoFocus, id }: {
  value: string; onChange: (v: string) => void; placeholder?: string; minLength?: number; required?: boolean; autoFocus?: boolean; id?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <input
        id={id} className="input" type={visible ? 'text' : 'password'} value={value}
        onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        minLength={minLength} required={required} autoFocus={autoFocus}
        style={{ paddingRight: 38 }}
      />
      <button
        type="button" onClick={() => setVisible((v) => !v)} tabIndex={-1}
        aria-label={visible ? 'Hide password' : 'Show password'}
        style={{
          position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
          background: 'none', border: 'none', padding: 6, cursor: 'pointer', color: 'var(--text-soft)',
          display: 'grid', placeItems: 'center', lineHeight: 0,
        }}
      >
        {visible ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

export function OfflineBanner() {
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [queue, setQueue] = useState<QueuedWrite[]>(getQueue());
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    initOfflineSync();
    const unsub = subscribeQueue(setQueue);
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => { unsub(); window.removeEventListener('online', goOnline); window.removeEventListener('offline', goOffline); };
  }, []);

  if (online && queue.length === 0) return null;

  return (
    <div style={{ position: 'fixed', bottom: 16, right: 16, zIndex: 200, maxWidth: 300 }}>
      <div
        className="card" style={{ padding: '10px 14px', boxShadow: 'var(--shadow)', cursor: queue.length ? 'pointer' : 'default' }}
        onClick={() => queue.length && setExpanded((v) => !v)}
      >
        <div className="row" style={{ gap: 8, alignItems: 'center' }}>
          {online ? <CloudUpload size={16} color="var(--warn)" /> : <WifiOff size={16} color="var(--danger)" />}
          <span style={{ fontSize: 13, fontWeight: 600 }}>{online ? 'Syncing pending entries…' : "You're offline"}</span>
        </div>
        {!online && (
          <p className="muted" style={{ fontSize: 11, marginTop: 4 }}>
            Daily logs are saved on this device and will sync automatically once you reconnect.
          </p>
        )}
        {queue.length > 0 && (
          <p style={{ fontSize: 11, marginTop: 4, color: 'var(--text-soft)' }}>
            {queue.length} pending {queue.length === 1 ? 'entry' : 'entries'} — tap to view
          </p>
        )}
        {expanded && (
          <div style={{ marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 8, maxHeight: 140, overflowY: 'auto' }}>
            {queue.map((item) => (
              <div key={item.id} style={{ fontSize: 11, padding: '3px 0', color: 'var(--text-soft)' }}>
                {item.label} · {new Date(item.createdAt).toLocaleTimeString()}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function PasswordStrengthMeter({ password }: { password: string }) {
  const { score, label, color } = passwordStrength(password);
  if (!password) return null;
  return (
    <div style={{ marginTop: -8, marginBottom: 14 }}>
      <div style={{ display: 'flex', gap: 4 }}>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} style={{ height: 4, flex: 1, borderRadius: 2, background: i < score ? color : 'var(--border)', transition: 'background 0.2s' }} />
        ))}
      </div>
      <span style={{ fontSize: 11, color, marginTop: 3, display: 'block' }}>{label}</span>
    </div>
  );
}

// ---------- Async data hook ----------
export interface UseAsyncOptions {
  // Refetch when the tab/window regains focus or becomes visible again, and whenever a
  // 'dairyos:refresh' event fires (dispatched after the offline queue syncs, or manually
  // after a mutation elsewhere in the app) — the default "the system refreshes itself
  // automatically" behavior. Set false for a one-shot fetch that should never re-run itself.
  refetchOnFocus?: boolean;
  // Optional interval (ms) to also poll on, for views that want to stay live even while
  // the tab sits in the foreground untouched (e.g. the Command Center).
  pollMs?: number;
}

export function useAsync<T>(fn: () => Promise<T>, deps: any[], options?: UseAsyncOptions): { data: T | null; loading: boolean; error: string | null; refresh: () => void } {
  const { refetchOnFocus = true, pollMs } = options || {};
  const [state, setState] = useState<{ data: T | null; loading: boolean; error: string | null }>({ data: null, loading: true, error: null });
  const fnRef = useRef(fn);
  fnRef.current = fn;

  // background=true skips the loading-spinner flash — used for refetches the user didn't
  // explicitly ask for (focus/poll/sync), so the screen doesn't blank out data they're
  // already looking at just because it's being silently refreshed underneath them.
  const load = useCallback((background: boolean) => {
    if (!background) setState((s) => ({ ...s, loading: true, error: null }));
    return fnRef.current()
      .then((d) => setState({ data: d, loading: false, error: null }))
      .catch((e) => setState((s) => ({ ...s, loading: false, error: e.message || 'Failed to load' })));
  }, []);

  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    fnRef.current()
      .then((d) => alive && setState({ data: d, loading: false, error: null }))
      .catch((e) => alive && setState((s) => ({ ...s, loading: false, error: e.message || 'Failed to load' })));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    if (!refetchOnFocus) return;
    const refetch = () => { if (document.visibilityState === 'visible') load(true); };
    window.addEventListener('focus', refetch);
    document.addEventListener('visibilitychange', refetch);
    window.addEventListener('dairyos:refresh', refetch);
    return () => {
      window.removeEventListener('focus', refetch);
      document.removeEventListener('visibilitychange', refetch);
      window.removeEventListener('dairyos:refresh', refetch);
    };
  }, [refetchOnFocus, load]);

  useEffect(() => {
    if (!pollMs) return;
    const id = setInterval(() => load(true), pollMs);
    return () => clearInterval(id);
  }, [pollMs, load]);

  return { ...state, refresh: () => load(false) };
}

// ---------- Plan / paywall ----------
export function Paywall({ feature, onClose, onUpgrade }: { feature?: string; onClose: () => void; onUpgrade: () => void }) {
  return (
    <Modal title="Upgrade required" onClose={onClose}>
      <div style={{ fontSize: 15, lineHeight: 1.6 }}>
        <p><b>{feature ? `The "${feature}" feature` : 'This feature'}</b> isn't included in your current plan.</p>
        <p className="muted" style={{ marginTop: 8 }}>Upgrade to Pro or Enterprise to unlock AI predictions, analytics, finance, weather, sustainability, and more.</p>
        <div className="row mt" style={{ gap: 10, marginTop: 18 }}>
          <button className="btn gold" onClick={onUpgrade}>View plans & upgrade</button>
          <button className="btn ghost" onClick={onClose}>Maybe later</button>
        </div>
      </div>
    </Modal>
  );
}

// ---------- Global Search ----------
export interface SearchResult {
  id: string;
  type: string;
  title: string;
  subtitle?: string;
  icon: ReactNode;
  route: string;
  tone?: 'primary' | 'info' | 'warn' | 'danger' | 'purple' | 'default' | 'accent';
}

export function GlobalSearch({ open, onClose, farmId, navigate }: {
  open: boolean; onClose: () => void; farmId: string; navigate: (route: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
      setQuery('');
      setResults([]);
    }
  }, [open]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setActiveIndex(0);

    const s = query.toLowerCase().trim();
    const matches = (text: string) => text.toLowerCase().includes(s);
    const timeout = setTimeout(async () => {
      const out: SearchResult[] = [];

      try {
        const cows = await data.listCows(farmId, { search: query });
        cows.forEach((c: any) => {
          out.push({
            id: c.id, type: 'Animal', title: c.name || c.cowCode,
            subtitle: `${c.breed} · ${c.cowCode}`,
            icon: <Beef size={16} />, route: `/app/cow/${c.id}`,
            tone: c.health === 'sick' ? 'danger' : c.health === 'under_treatment' ? 'warn' : 'primary',
          });
        });
      } catch {}

      try {
        const emps = await data.employees(farmId);
        emps.filter((e: any) => matches(e.name) || matches(e.role) || matches(e.email || '')).forEach((e: any) => {
          out.push({
            id: e.id, type: 'Employee', title: e.name,
            subtitle: e.role,
            icon: <User size={16} />, route: '/app/team',
            tone: 'info',
          });
        });
      } catch {}

      try {
        const tlist = await data.tasks();
        tlist.filter((t: any) => matches(t.title) || matches(t.description || '')).forEach((t: any) => {
          out.push({
            id: t.id, type: 'Task', title: t.title,
            subtitle: `${t.category} · Due ${t.due_date}`,
            icon: <FileText size={16} />, route: '/app/tasks',
            tone: t.priority === 'urgent' ? 'danger' : t.priority === 'high' ? 'warn' : 'default',
          });
        });
      } catch {}

      try {
        const recs = await data.healthRecords(farmId);
        recs.filter((r: any) => matches(r.cow_code || '') || matches(r.condition || '') || matches(r.notes || '')).forEach((r: any) => {
          out.push({
            id: r.id, type: 'Health record', title: r.cow_code || 'Unknown cow',
            subtitle: r.condition || r.notes || '',
            icon: <Activity size={16} />, route: '/app/health',
            tone: 'info',
          });
        });
      } catch {}

      try {
        const breeds = await data.breedingRecords(farmId);
        breeds.filter((b: any) => matches(b.cow_code || '') || matches(b.method || '') || matches(b.result || '')).forEach((b: any) => {
          out.push({
            id: b.id, type: 'Breeding record', title: b.cow_code || 'Unknown cow',
            subtitle: `${b.method} · ${b.result || '—'}`,
            icon: <Syringe size={16} />, route: '/app/breeding',
            tone: 'purple',
          });
        });
      } catch {}

      try {
        const pregs = await data.pregnancies(farmId);
        pregs.filter((p: any) => matches(p.cow_code || '') || matches(p.status || '') || matches(p.diagnosed_on || '')).forEach((p: any) => {
          out.push({
            id: p.id, type: 'Pregnancy', title: p.cow_code || 'Unknown cow',
            subtitle: `${p.status} · Due ${p.expected_calving || p.due_date || '—'}`,
            icon: <Activity size={16} />, route: '/app/breeding',
            tone: 'info',
          });
        });
      } catch {}

      try {
        const meds = await data.medicines(farmId);
        meds.filter((m: any) => matches(m.name || '') || matches(m.category || '')).forEach((m: any) => {
          out.push({
            id: m.id, type: 'Medicine', title: m.name,
            subtitle: `${m.category} · ${m.quantity_on_hand || m.quantity || 0} ${m.unit || ''}`,
            icon: <Package size={16} />, route: '/app/health',
            tone: 'warn',
          });
        });
      } catch {}

      try {
        const cows = await data.listCows(farmId);
        const milk = await data.listMilkRecords();
        const cowMap = new Map(cows.map((c: any) => [c.id, c]));
        milk.filter((m: any) => matches(m.cowId || '') || matches(m.date || '')).forEach((m: any) => {
          const cow = cowMap.get(m.cowId);
          out.push({
            id: m.id, type: 'Milk record', title: cow ? (cow.name || cow.cowCode) : `Cow #${m.cowId?.slice(0, 8)}`,
            subtitle: `${m.date} · ${(m.morning || 0) + (m.afternoon || 0) + (m.evening || 0)} L`,
            icon: <Wheat size={16} />, route: '/app/management',
            tone: 'accent',
          });
        });
      } catch {}

      try {
        const custs = await data.customers(farmId);
        custs.filter((c: any) => matches(c.name || '') || matches(c.email || '')).forEach((c: any) => {
          out.push({
            id: c.id, type: 'Customer', title: c.name,
            subtitle: c.email || c.phone || '',
            icon: <Users size={16} />, route: '/app/customers',
            tone: 'info',
          });
        });
      } catch {}

      setResults(out.slice(0, 12));
      setLoading(false);
    }, 300);

    return () => clearTimeout(timeout);
  }, [query, farmId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex((i) => Math.min(i + 1, results.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex((i) => Math.max(i - 1, 0)); }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (results[activeIndex]) {
        navigate(results[activeIndex].route);
        onClose();
      }
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    if (open) {
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }
  }, [open, onClose]);

  const grouped = results.reduce((acc: Record<string, SearchResult[]>, r) => {
    (acc[r.type] = acc[r.type] || []).push(r);
    return acc;
  }, {});

  if (!open) return null;

  return (
    <div className="global-search-backdrop" onClick={onClose}>
      <div className={`global-search-panel ${window.innerWidth < 768 ? '' : 'desktop'}`} onClick={(e) => e.stopPropagation()}>
        <div className="global-search-input-row">
          <Search size={18} color="var(--text-soft)" style={{ marginRight: 8 }} />
          <input
            ref={inputRef}
            className="input"
            type="search"
            placeholder="Search animals, employees, tasks, records…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            style={{ border: 0, boxShadow: 'none', background: 'transparent', fontSize: 16, flex: 1, minWidth: 0 }}
            autoComplete="off"
            autoFocus
          />
          {query && loading && <Spinner size={18} />}
        </div>

        <div className="global-search-results">
          {Object.keys(grouped).length === 0 && !loading && query && (
            <div className="global-search-empty">No results found for “{query}”</div>
          )}
          {Object.keys(grouped).length === 0 && loading && (
            <div className="global-search-empty">
              <Spinner size={20} style={{ margin: '12px auto' }} />
            </div>
          )}
          {Object.entries(grouped).map(([type, items]) => (
            <div key={type} className="global-search-group">
              <div className="global-search-group-label">{type}{items.length > 0 && ` · ${items.length}`}</div>
              {items.map((r, i) => (
                <button
                  key={r.id}
                  className={`global-search-result ${i === activeIndex ? 'active' : ''}`}
                  onClick={() => { navigate(r.route); onClose(); }}
                  onMouseEnter={() => setActiveIndex(results.indexOf(r))}
                >
                  <span className={`global-search-result-icon ${r.tone ? `tone-${r.tone}` : ''}`}>{r.icon}</span>
                  <div className="global-search-result-content">
                    <div className="global-search-result-title">{r.title}</div>
                    {r.subtitle && <div className="global-search-result-subtitle">{r.subtitle}</div>}
                  </div>
                  <Badge variant="default" style={{ fontSize: 10, marginLeft: 'auto' }}>{r.type}</Badge>
                  <ChevronRight size={14} color="var(--text-soft)" style={{ marginLeft: 8 }} />
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
