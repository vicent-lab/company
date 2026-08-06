import React, { createContext, useContext, useCallback, useEffect, useRef, useState, ReactNode } from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, PointElement, LineElement, ArcElement, Tooltip, Legend, Filler } from 'chart.js';
import { Bar, Line, Doughnut } from 'react-chartjs-2';
import { Eye, EyeOff, WifiOff, CloudUpload } from 'lucide-react';
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
  const push = (msg: string, icon?: ReactNode) => {
    const id = Date.now();
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

// ---------- Section / page header ----------
export function PageHeader({ eyebrow, title, desc, actions }: { eyebrow?: string; title: string; desc?: string; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {desc && <p className="muted" style={{ marginTop: 4 }}>{desc}</p>}
      </div>
      {actions && <div className="row">{actions}</div>}
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
        <p><b>{feature ? `The "${feature}" feature` : 'This feature'}</b> isn’t included in your current plan.</p>
        <p className="muted" style={{ marginTop: 8 }}>Upgrade to Pro or Enterprise to unlock AI predictions, analytics, finance, weather, sustainability, and more.</p>
        <div className="row mt" style={{ gap: 10, marginTop: 18 }}>
          <button className="btn gold" onClick={onUpgrade}>View plans & upgrade</button>
          <button className="btn ghost" onClick={onClose}>Maybe later</button>
        </div>
      </div>
    </Modal>
  );
}
