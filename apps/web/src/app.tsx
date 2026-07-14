import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useTheme } from './theme';
import { useHashRoute } from './router';
import { ThemeToggle } from './ui';
import { FARMS, NOTIFICATIONS } from './mock';
import { useAsync } from './ui';
import { isLive } from './api';
import { loadFarms } from './data';
import { useAuth } from './auth';
import {
  LayoutDashboard, Beef, MapPin, Bot, Bell, TrendingUp, BarChart3, DollarSign,
  CloudSun, Leaf, Images, Users, UserCog, Search, Trophy, Milk, Sun, Moon, Contrast,
  ChevronDown, Check, LogOut, ShieldCheck,
} from 'lucide-react';
import { Dashboard } from './pages/dashboard';
import { Herd, CowProfile } from './pages/herd';
import { FarmMap } from './pages/operations';
import { AIAssistant, Predictions } from './pages/insights';
import { Analytics, Financial, Weather, Sustainability } from './pages/insights';
import { Gallery } from './pages/operations';
import { Customers, Employees } from './pages/portals';
import { AdvancedSearch } from './pages/operations';
import { Gamification } from './pages/operations';
import { Alerts } from './pages/insights';

interface FarmCtx { farmId: string; setFarmId: (id: string) => void; }
const FCtx = createContext<FarmCtx>({ farmId: 'f1', setFarmId: () => {} });
export const useFarm = () => useContext(FCtx);

const NAV = [
  { key: 'dashboard', icon: LayoutDashboard, label: 'Overview' },
  { key: 'cows', icon: Beef, label: 'Herd' },
  { key: 'map', icon: MapPin, label: 'Farm map' },
  { key: 'ai', icon: Bot, label: 'AI assistant' },
  { key: 'alerts', icon: Bell, label: 'Alerts', badge: NOTIFICATIONS.length },
  { key: 'predict', icon: TrendingUp, label: 'Predictions' },
  { key: 'analytics', icon: BarChart3, label: 'Analytics' },
  { key: 'finance', icon: DollarSign, label: 'Finance' },
  { key: 'weather', icon: CloudSun, label: 'Weather' },
  { key: 'sustainability', icon: Leaf, label: 'Sustainability' },
  { key: 'gallery', icon: Images, label: 'Gallery' },
  { key: 'customers', icon: Users, label: 'Customers' },
  { key: 'employees', icon: UserCog, label: 'Employees' },
  { key: 'search', icon: Search, label: 'Search' },
  { key: 'gamification', icon: Trophy, label: 'Goals' },
];

function Login({ onLogin }: { onLogin: (e: string, p: string) => Promise<void> }) {
  const [email, setEmail] = useState(isLive ? 'admin@greenfield.test' : 'manager@dairyos.app');
  const [password, setPassword] = useState('ChangeMe123!');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError('');
    try { await onLogin(email, password); } catch (err: any) { setError(err.message); setBusy(false); }
  };
  return (
    <main className="login" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 20 }}>
      <form onSubmit={submit} className="card" style={{ width: 360, maxWidth: '100%' }}>
        <div className="brand" style={{ justifyContent: 'center', marginBottom: 10 }}><div className="logo"><Milk size={18} /></div><div><b>DairyOS</b><small>SMART DAIRY</small></div></div>
        <div className="eyebrow" style={{ textAlign: 'center' }}>SIGN IN</div>
        <h1 style={{ fontSize: 24, textAlign: 'center' }}>Welcome back</h1>
        <label className="field">Email<input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label className="field">Password<input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        {error && <p className="error" style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</p>}
        <button className="btn" style={{ width: '100%', justifyContent: 'center' }} disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        {isLive && <p className="muted" style={{ fontSize: 12, textAlign: 'center', marginTop: 10 }}>Demo: admin@greenfield.test / ChangeMe123!</p>}
      </form>
    </main>
  );
}

export function AppShell() {
  const { theme, setTheme } = useTheme();
  const { user, login, logout } = useAuth();
  const [route, navigate] = useHashRoute();
  const [farmId, setFarmId] = useState('f1');
  const [farmMenu, setFarmMenu] = useState(false);
  const [bell, setBell] = useState(false);
  const [userMenu, setUserMenu] = useState(false);
  const [search, setSearch] = useState('');
  const { data: farms } = useAsync(loadFarms, []);
  const farmList = farms && farms.length ? farms : FARMS;

  useEffect(() => {
    if (isLive && user && farmId === 'f1') {
      const id = user.farmId || (farmList[0] && farmList[0].id);
      if (id) setFarmId(id);
    }
  }, [isLive, user, farmList, farmId]);

  if (isLive && !user) return <Login onLogin={login} />;

  const sub = route.segments[1] || 'dashboard';
  const go = (k: string) => navigate('/app/' + k);
  const farm = farmList.find((f) => f.id === farmId) || farmList[0];

  const page = () => {
    switch (sub) {
      case 'dashboard': return <Dashboard />;
      case 'cows': return <Herd />;
      case 'cow': return <CowProfile id={route.param!} />;
      case 'map': return <FarmMap />;
      case 'ai': return <AIAssistant />;
      case 'alerts': return <Alerts />;
      case 'predict': return <Predictions />;
      case 'analytics': return <Analytics />;
      case 'finance': return <Financial />;
      case 'weather': return <Weather />;
      case 'sustainability': return <Sustainability />;
      case 'gallery': return <Gallery id={route.param} />;
      case 'customers': return <Customers />;
      case 'employees': return <Employees />;
      case 'search': return <AdvancedSearch initial={search} />;
      case 'gamification': return <Gamification />;
      default: return <Dashboard />;
    }
  };

  return (
    <FCtx.Provider value={{ farmId, setFarmId }}>
      <div className="shell">
        <aside className="sidebar">
          <div className="brand">
            <div className="logo"><Milk size={18} /></div>
            <div><b>DairyOS</b><small>SMART DAIRY</small></div>
          </div>
          {NAV.map((n) => (
            <button key={n.key} className={`nav-item ${sub === n.key ? 'active' : ''}`} onClick={() => go(n.key)}>
              <n.icon size={18} /> {n.label}
              {n.badge && <span className="badge-dot">{n.badge}</span>}
            </button>
          ))}
          <button className="nav-item" style={{ marginTop: 'auto' }} onClick={() => navigate('/')}>
            <LogOut size={18} /> View website
          </button>
        </aside>

        <div className="main">
          <header className="topbar">
            <div className="search">
              <input className="input" placeholder="Search cows, breeds, health…" value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && go('search')} />
            </div>

            <div className="menu">
              <button className="btn ghost sm" onClick={() => setFarmMenu((v) => !v)}>
                <MapPin size={15} /> {farm.name} <ChevronDown size={14} />
              </button>
              {farmMenu && (
                <div className="menu-pop" onMouseLeave={() => setFarmMenu(false)}>
                  {farmList.map((f) => (
                    <button key={f.id} onClick={() => { setFarmId(f.id); setFarmMenu(false); }}>
                      {farmId === f.id && <Check size={15} color="var(--primary)" />} {f.name}
                      <span className="muted" style={{ marginLeft: 'auto', fontSize: 12 }}>{f.cows} cows</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <ThemeToggle theme={theme} setTheme={setTheme} />

            <div className="menu">
              <button className="btn ghost sm" style={{ position: 'relative' }} onClick={() => setBell((v) => !v)}>
                <Bell size={16} /> <span className="badge-dot" style={{ position: 'absolute', top: -4, right: -4 }}>{NOTIFICATIONS.length}</span>
              </button>
              {bell && (
                <div className="menu-pop" style={{ minWidth: 300 }} onMouseLeave={() => setBell(false)}>
                  {NOTIFICATIONS.slice(0, 6).map((n) => (
                    <button key={n.id} onClick={() => { setBell(false); go('alerts'); }}>
                      <Bell size={15} color={n.tone === 'danger' ? 'var(--danger)' : n.tone === 'warn' ? 'var(--warn)' : 'var(--info)'} />
                      <span><b>{n.title}</b><br /><span className="muted" style={{ fontSize: 12 }}>{n.body}</span></span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="menu">
              <button className="btn ghost sm" onClick={() => setUserMenu((v) => !v)}>
                <span className="photo" style={{ width: 26, height: 26, fontSize: 11, background: 'var(--primary)' }}>M</span> {user?.name?.split(' ')[0] || 'Manager'} <ChevronDown size={14} />
              </button>
              {userMenu && (
                <div className="menu-pop" onMouseLeave={() => setUserMenu(false)}>
                  <div style={{ padding: '6px 11px', color: 'var(--text-soft)', fontSize: 12 }}>{user?.email}</div>
                  <button><ShieldCheck size={15} /> Security & 2FA</button>
                  <button onClick={() => { logout(); navigate('/'); }}><LogOut size={15} /> Sign out</button>
                </div>
              )}
            </div>
          </header>

          <main className="content">{page()}</main>
        </div>
      </div>
    </FCtx.Provider>
  );
}
