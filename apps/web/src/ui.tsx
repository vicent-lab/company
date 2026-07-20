import React, { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, PointElement, LineElement, ArcElement, Tooltip, Legend, Filler } from 'chart.js';
import { Bar, Line, Doughnut } from 'react-chartjs-2';

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

// ---------- Cow photo (SVG) ----------
export function CowPhoto({ name, color, size = 64 }: { name: string; color: string; size?: number }) {
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

export function CowIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 420 320" className={className} style={{ width: '100%', height: '100%', display: 'block' }} aria-hidden="true">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#c9e4ca" />
          <stop offset="1" stopColor="#e9f5e6" />
        </linearGradient>
        <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="6" stdDeviation="6" floodColor="#00000030" />
        </filter>
      </defs>
      <rect width="420" height="320" fill="url(#sky)" rx="18" />
      <g filter="url(#shadow)">
        {/* body */}
        <ellipse cx="210" cy="188" rx="110" ry="68" fill="#fff" stroke="#243b2e" strokeWidth="3" />
        {/* spots */}
        <path d="M160,160 q28,-18 54,4 q-14,28 -54,4 z" fill="#243b2e" />
        <path d="M250,190 q22,-14 42,4 q-10,22 -42,4 z" fill="#243b2e" />
        <path d="M180,210 q18,-10 32,3 q-8,18 -32,3 z" fill="#243b2e" />
        {/* udder */}
        <ellipse cx="210" cy="238" rx="22" ry="14" fill="#f7c5c5" stroke="#243b2e" strokeWidth="2" />
        {/* legs */}
        <rect x="155" y="230" width="14" height="44" rx="6" fill="#fff" stroke="#243b2e" strokeWidth="3" />
        <rect x="251" y="230" width="14" height="44" rx="6" fill="#fff" stroke="#243b2e" strokeWidth="3" />
        <rect x="185" y="234" width="14" height="40" rx="6" fill="#fff" stroke="#243b2e" strokeWidth="3" />
        <rect x="221" y="234" width="14" height="40" rx="6" fill="#fff" stroke="#243b2e" strokeWidth="3" />
        {/* hooves */}
        <rect x="154" y="266" width="16" height="8" rx="4" fill="#5c4033" />
        <rect x="250" y="266" width="16" height="8" rx="4" fill="#5c4033" />
        <rect x="184" y="266" width="16" height="8" rx="4" fill="#5c4033" />
        <rect x="220" y="266" width="16" height="8" rx="4" fill="#5c4033" />
        {/* neck */}
        <path d="M130,175 q20,-40 0,-60" fill="none" stroke="#fff" strokeWidth="34" strokeLinecap="round" />
        <path d="M130,175 q20,-40 0,-60" fill="none" stroke="#243b2e" strokeWidth="3" />
        {/* head */}
        <ellipse cx="108" cy="108" rx="34" ry="30" fill="#fff" stroke="#243b2e" strokeWidth="3" />
        {/* muzzle */}
        <ellipse cx="92" cy="118" rx="16" ry="12" fill="#f7c5c5" stroke="#243b2e" strokeWidth="2" />
        {/* eyes */}
        <circle cx="100" cy="100" r="3.5" fill="#243b2e" />
        <circle cx="118" cy="100" r="3.5" fill="#243b2e" />
        <circle cx="101" cy="99" r="1.2" fill="#fff" />
        <circle cx="119" cy="99" r="1.2" fill="#fff" />
        {/* ears */}
        <path d="M84,86 q-10,-14 2,-18 q8,8 2,18 z" fill="#fff" stroke="#243b2e" strokeWidth="2.5" />
        <path d="M128,86 q10,-14 -2,-18 q-8,8 -2,18 z" fill="#fff" stroke="#243b2e" strokeWidth="2.5" />
        {/* horns */}
        <path d="M90,88 q-6,-16 2,-22" fill="none" stroke="#d8b88a" strokeWidth="4" strokeLinecap="round" />
        <path d="M124,88 q6,-16 -2,-22" fill="none" stroke="#d8b88a" strokeWidth="4" strokeLinecap="round" />
        {/* tail */}
        <path d="M315,180 q28,-8 30,18" fill="none" stroke="#243b2e" strokeWidth="3" strokeLinecap="round" />
        <circle cx="345" cy="178" r="5" fill="#243b2e" />
      </g>
      {/* ground */}
      <ellipse cx="210" cy="286" rx="160" ry="14" fill="#cfe6cd" opacity="0.6" />
    </svg>
  );
}

// ---------- Async data hook ----------
export function useAsync<T>(fn: () => Promise<T>, deps: any[]): { data: T | null; loading: boolean; error: string | null } {
  const [state, setState] = useState<{ data: T | null; loading: boolean; error: string | null }>({ data: null, loading: true, error: null });
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    fn()
      .then((d) => alive && setState({ data: d, loading: false, error: null }))
      .catch((e) => alive && setState({ data: null, loading: false, error: e.message || 'Failed to load' }));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
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
