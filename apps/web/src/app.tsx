import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useTheme } from './theme';
import { useHashRoute } from './router';
import { ThemeToggle, PageHeader, Modal, PasswordInput, OfflineBanner } from './ui';
import { FARMS, NOTIFICATIONS } from './mock';
import { useAsync } from './ui';
import { isLive, ApiError } from './api';
import { loadFarms, forgotPassword, getCaptcha, requestPhoneOtp, notifications } from './data';
import { useAuth, LoginResult } from './auth';
import {
  LayoutDashboard, Beef, MapPin, Activity, Bot, Bell, TrendingUp, BarChart3, DollarSign,
  CloudSun, Leaf, Images, Users, UserCog, Search, Trophy, Sun, Moon, Contrast,
  ChevronDown, Check, LogOut, ShieldCheck, ClipboardList, FlaskConical, Sparkles, Calendar, Gauge, Settings as SettingsIcon, Crown,
  Phone, KeyRound, ShieldAlert, Brain, Menu, X, Home, Milk, HeartPulse, Package, Wrench,
  ChevronRight, Plus,
} from 'lucide-react';
import logoImg from './assets/logo.png';
import { useToast } from './ui';
import { Dashboard } from './pages/dashboard';
import { Herd, CowProfile } from './pages/herd';
import { FarmMap } from './pages/operations';
import { AIAssistant, Predictions } from './pages/insights';
import { Analytics, Financial, Weather, Sustainability } from './pages/insights';
import { Gallery } from './pages/operations';
import { Customers } from './pages/portals';
import { Team } from './pages/team';
import { TaskManager } from './pages/tasks';
import { DailySchedule } from './pages/schedule';
import { AdvancedSearch } from './pages/operations';
import { Gamification } from './pages/operations';
import { Alerts } from './pages/insights';
import { Management } from './pages/management';
import { Breeding } from './pages/breeding';
import { Health } from './pages/health';
import { AIAdvisor } from './pages/ai-advisor';
import { FarmScore } from './pages/farm-score';
import { CommandCenter } from './pages/command-center';
import { Settings } from './pages/settings';
import { PlatformAdmin } from './pages/platform-admin';
import { Onboarding, EmailVerificationStep } from './pages/onboarding';

interface FarmCtx { farmId: string; farmName: string; setFarmId: (id: string) => void; }
const FCtx = createContext<FarmCtx>({ farmId: 'f1', farmName: '', setFarmId: () => {} });
export const useFarm = () => useContext(FCtx);

interface NavItem {
  key: string;
  icon: any;
  label: string;
  badge?: number;
}
interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Main',
    items: [
      { key: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
      { key: 'command-center', icon: Gauge, label: 'Command Center' },
    ],
  },
  {
    label: 'Farm',
    items: [
      { key: 'map', icon: MapPin, label: 'Farm Map' },
      { key: 'weather', icon: CloudSun, label: 'Weather' },
    ],
  },
  {
    label: 'Animals',
    items: [
      { key: 'cows', icon: Beef, label: 'Herd' },
    ],
  },
  {
    label: 'Breeding',
    items: [
      { key: 'breeding', icon: FlaskConical, label: 'Breeding' },
    ],
  },
  {
    label: 'Production',
    items: [
      { key: 'management', icon: ClipboardList, label: 'Milk & Feed' },
      { key: 'analytics', icon: BarChart3, label: 'Analytics' },
    ],
  },
  {
    label: 'Health',
    items: [
      { key: 'health', icon: Activity, label: 'Health' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { key: 'team', icon: Users, label: 'Team' },
      { key: 'tasks', icon: ClipboardList, label: 'Tasks' },
      { key: 'schedule', icon: Calendar, label: 'Schedule' },
    ],
  },
  {
    label: 'Business',
    items: [
      { key: 'finance', icon: DollarSign, label: 'Finance' },
      { key: 'customers', icon: Users, label: 'Customers' },
    ],
  },
  {
    label: 'AI',
    items: [
      { key: 'ai-advisor', icon: Sparkles, label: 'AI Advisor' },
      { key: 'predict', icon: TrendingUp, label: 'Predictions' },
      { key: 'farm-score', icon: Gauge, label: 'Farm Score' },
    ],
  },
  {
    label: 'System',
    items: [
      { key: 'settings', icon: SettingsIcon, label: 'Settings' },
    ],
  },
];

const NAV = NAV_GROUPS.flatMap((g) => g.items);

import { usePlan } from './planGuard';
import { PlanProvider, PLAN_FEATURES } from './plans';

import { PlanGuard } from './planGuard';

function ForgotPasswordModal({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [devLink, setDevLink] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    try {
      const res = await forgotPassword(email);
      setMessage(res.message);
      if (res.devResetLink) setDevLink(res.devResetLink);
    } catch {
      setMessage('If an account exists for that email, a reset link has been sent.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="Reset your password" onClose={onClose}>
      {message ? (
        <div>
          <p style={{ fontSize: 14 }}>{message}</p>
          {devLink && <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>Dev mode (no email provider configured): <a href={devLink}>{devLink}</a></p>}
          <button className="btn mt" onClick={onClose}>Close</button>
        </div>
      ) : (
        <form onSubmit={submit}>
          <label className="field">Account email<input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus /></label>
          <button className="btn" style={{ width: '100%', justifyContent: 'center' }} disabled={busy}>{busy ? 'Sending…' : 'Send reset link'}</button>
        </form>
      )}
    </Modal>
  );
}

function OAuthButtons() {
  const providers: { id: 'google' | 'microsoft' | 'apple'; label: string }[] = [
    { id: 'google', label: 'Google' }, { id: 'microsoft', label: 'Microsoft' }, { id: 'apple', label: 'Apple' },
  ];
  return (
    <div className="row" style={{ gap: 8, marginTop: 10 }}>
      {providers.map((p) => (
        <button key={p.id} type="button" className="btn ghost sm" disabled title={`${p.label} sign-in isn't configured yet`} style={{ flex: 1, justifyContent: 'center' }}>
          {p.label}
        </button>
      ))}
    </div>
  );
}

function Login({ onLogin }: { onLogin: (e: string, p: string, captcha?: { token: string; answer: string }) => Promise<LoginResult> }) {
  const { completeMfaLogin, loginWithPhoneOtp } = useAuth();
  const { push } = useToast();
  const [authTab, setAuthTab] = useState<'password' | 'phone'>('password');

  const [email, setEmail] = useState(isLive ? 'admin@greenfield.test' : 'manager@dairyos.app');
  const [password, setPassword] = useState('ChangeMe123!');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [captcha, setCaptcha] = useState<{ token: string; question: string } | null>(null);
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState('');

  const loadCaptcha = async () => { try { setCaptcha(await getCaptcha()); setCaptchaAnswer(''); } catch { /* best-effort */ } };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError('');
    try {
      const result = await onLogin(email, password, captcha ? { token: captcha.token, answer: captchaAnswer } : undefined);
      if (result.mfaRequired) { setMfaToken(result.mfaToken); setBusy(false); return; }
    } catch (err: any) {
      setBusy(false);
      if (err instanceof ApiError && err.body?.captchaRequired) await loadCaptcha();
      setError(err.message);
    }
  };

  const submitMfa = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError('');
    try { await completeMfaLogin(mfaToken!, mfaCode); }
    catch (err: any) { setError(err.message); setBusy(false); }
  };

  const [phone, setPhone] = useState('');
  const [phoneStep, setPhoneStep] = useState<'phone' | 'code'>('phone');
  const [phoneCode, setPhoneCode] = useState('');
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [phoneError, setPhoneError] = useState('');

  const requestPhone = async (e: React.FormEvent) => {
    e.preventDefault(); setPhoneBusy(true); setPhoneError('');
    try {
      const res = await requestPhoneOtp(phone);
      push(res.devOtpCode ? `Dev mode — login code: ${res.devOtpCode}` : res.message);
      setPhoneStep('code');
    } catch (err: any) { setPhoneError(err.message); }
    finally { setPhoneBusy(false); }
  };
  const verifyPhone = async (e: React.FormEvent) => {
    e.preventDefault(); setPhoneBusy(true); setPhoneError('');
    try { await loginWithPhoneOtp(phone, phoneCode); }
    catch (err: any) { setPhoneError(err.message); setPhoneBusy(false); }
  };

  if (mfaToken) {
    return (
      <main className="login" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 20 }}>
        <form onSubmit={submitMfa} className="card" style={{ width: 360, maxWidth: '100%', textAlign: 'center' }}>
          <ShieldAlert size={28} color="var(--primary)" style={{ margin: '0 auto' }} />
          <h1 style={{ fontSize: 20, marginTop: 8 }}>Two-factor code</h1>
          <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>Enter the 6-digit code from your authenticator app.</p>
          <input
            className="input" inputMode="numeric" maxLength={6} autoFocus placeholder="6-digit code" value={mfaCode}
            onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            style={{ textAlign: 'center', fontSize: 20, letterSpacing: 6, marginTop: 14 }} required
          />
          {error && <p className="error" style={{ color: 'var(--danger)', fontSize: 13, marginTop: 8 }}>{error}</p>}
          <button className="btn mt" style={{ width: '100%', justifyContent: 'center' }} disabled={busy || mfaCode.length !== 6}>{busy ? 'Verifying…' : 'Verify'}</button>
          <button type="button" className="btn ghost sm mt" style={{ width: '100%', justifyContent: 'center' }} onClick={() => { setMfaToken(null); setMfaCode(''); setError(''); }}>Back to sign in</button>
        </form>
      </main>
    );
  }

  return (
    <main className="login" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 20 }}>
      <div className="card" style={{ width: 360, maxWidth: '100%' }}>
        <div className="brand" style={{ justifyContent: 'center', marginBottom: 10 }}><img className="logo" src={logoImg} alt="DairyOS" /><div><b>DairyOS</b><small>SMART DAIRY</small></div></div>
        <div className="eyebrow" style={{ textAlign: 'center' }}>SIGN IN</div>
        <h1 style={{ fontSize: 24, textAlign: 'center' }}>Welcome back</h1>

        <div className="row" style={{ gap: 6, marginTop: 12, marginBottom: 4 }}>
          <button type="button" className="btn sm" style={{ flex: 1, justifyContent: 'center', background: authTab === 'password' ? 'var(--primary)' : 'transparent', color: authTab === 'password' ? '#fff' : 'var(--text)', border: `1px solid ${authTab === 'password' ? 'var(--primary)' : 'var(--border)'}` }} onClick={() => setAuthTab('password')}>
            <KeyRound size={14} /> Password
          </button>
          <button type="button" className="btn sm" style={{ flex: 1, justifyContent: 'center', background: authTab === 'phone' ? 'var(--primary)' : 'transparent', color: authTab === 'phone' ? '#fff' : 'var(--text)', border: `1px solid ${authTab === 'phone' ? 'var(--primary)' : 'var(--border)'}` }} onClick={() => setAuthTab('phone')}>
            <Phone size={14} /> Phone
          </button>
        </div>

        {authTab === 'password' ? (
          <form onSubmit={submit}>
            <label className="field mt">Email<input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
            <label className="field">Password<PasswordInput value={password} onChange={setPassword} /></label>
            {captcha && (
              <label className="field">
                Challenge — what is {captcha.question}
                <input className="input" value={captchaAnswer} onChange={(e) => setCaptchaAnswer(e.target.value)} required />
              </label>
            )}
            {error && <p className="error" style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</p>}
            <button className="btn" style={{ width: '100%', justifyContent: 'center' }} disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
            {isLive && <button type="button" className="btn ghost sm" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }} onClick={() => setForgotOpen(true)}>Forgot password?</button>}
            {isLive && <p className="muted" style={{ fontSize: 12, textAlign: 'center', marginTop: 10 }}>Demo: admin@greenfield.test / ChangeMe123!</p>}
          </form>
        ) : phoneStep === 'phone' ? (
          <form onSubmit={requestPhone}>
            <label className="field mt">Phone number<input className="input" type="tel" placeholder="+256701234567" value={phone} onChange={(e) => setPhone(e.target.value)} required /></label>
            {phoneError && <p className="error" style={{ color: 'var(--danger)', fontSize: 13 }}>{phoneError}</p>}
            <button className="btn" style={{ width: '100%', justifyContent: 'center' }} disabled={phoneBusy}>{phoneBusy ? 'Sending…' : 'Send login code'}</button>
          </form>
        ) : (
          <form onSubmit={verifyPhone}>
            <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>Enter the code sent to {phone}.</p>
            <input
              className="input" inputMode="numeric" maxLength={6} autoFocus placeholder="6-digit code" value={phoneCode}
              onChange={(e) => setPhoneCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              style={{ textAlign: 'center', fontSize: 20, letterSpacing: 6, marginTop: 6, marginBottom: 14 }} required
            />
            {phoneError && <p className="error" style={{ color: 'var(--danger)', fontSize: 13 }}>{phoneError}</p>}
            <button className="btn" style={{ width: '100%', justifyContent: 'center' }} disabled={phoneBusy || phoneCode.length !== 6}>{phoneBusy ? 'Verifying…' : 'Verify & sign in'}</button>
            <button type="button" className="btn ghost sm mt" style={{ width: '100%', justifyContent: 'center' }} onClick={() => { setPhoneStep('phone'); setPhoneCode(''); setPhoneError(''); }}>Use a different number</button>
          </form>
        )}

        <div className="row" style={{ alignItems: 'center', gap: 8, margin: '14px 0 2px' }}>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          <span className="muted" style={{ fontSize: 11 }}>OR</span>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        </div>
        <OAuthButtons />
      </div>
      {forgotOpen && <ForgotPasswordModal onClose={() => setForgotOpen(false)} />}
    </main>
  );
}

export function AppShell() {
  const { theme, setTheme } = useTheme();
  const { user, farms: authFarms, loading, login, logout, switchFarm } = useAuth();
  const [route, navigate] = useHashRoute();
  const [farmId, setFarmId] = useState('f1');
  const [farmMenu, setFarmMenu] = useState(false);
  const [farmSwitching, setFarmSwitching] = useState(false);
  const [bell, setBell] = useState(false);
  const [userMenu, setUserMenu] = useState(false);
  const [search, setSearch] = useState('');
  const [verifySkipped, setVerifySkipped] = useState(false);
  const [notificationsList, setNotificationsList] = useState<any[]>([]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [moreDrawerOpen, setMoreDrawerOpen] = useState(false);
  const [quickActionsOpen, setQuickActionsOpen] = useState(false);
  const { data: farms } = useAsync(loadFarms, [user?.id, user?.farmId]);
  const farmList = farms && farms.length ? farms : FARMS;
  const { canAccess, upgradeModal, setUpgradeModal } = usePlan();

  useEffect(() => {
    if (isLive && user && farmId === 'f1') {
      const id = user.farmId || (farmList[0] && farmList[0].id);
      if (id) setFarmId(id);
    }
  }, [isLive, user, farmList, farmId]);

  useEffect(() => {
    if (!isLive) {
      setNotificationsList(NOTIFICATIONS);
      return;
    }
    notifications().then((r: any) => setNotificationsList(r.data || r || [])).catch(() => {});
  }, [isLive, user, farmId]);

  if (isLive && loading) {
    return <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}><p className="muted">Loading…</p></main>;
  }
  if (isLive && !user) return <Login onLogin={login} />;
  // Shown once right after registration, before onboarding — "Skip for now" resets per
  // page load (verifySkipped is local state), so it doesn't hard-block an unverified
  // account forever, just nudges on every fresh session until they verify or skip.
  if (isLive && user && !user.emailVerified && !verifySkipped) {
    return <EmailVerificationStep onDone={() => setVerifySkipped(true)} />;
  }
  // A freshly registered account has no farm yet (owner hasn't created one, or team
  // member hasn't been invited) — send it through onboarding instead of a broken shell.
  // Super Admin is exempt: it's a platform-wide account that may legitimately never own
  // or join any single farm, and still needs to reach the shell to use Platform Admin.
  if (isLive && user && authFarms.length === 0 && !user.isSuperAdmin) return <Onboarding />;

  // Admins can peek at any farm's data instantly (the backend honors ?farmId= for them).
  // Everyone else's access token is scoped to one farm at a time, so picking a different
  // one has to mint a new token via switch-farm before the view actually changes.
  const selectFarm = async (id: string) => {
    setFarmMenu(false);
    if (!isLive || user?.role === 'administrator') { setFarmId(id); return; }
    setFarmSwitching(true);
    try {
      await switchFarm(id);
      setFarmId(id);
    } catch {
      // leave farmId unchanged — the switch failed, current farm stays active
    } finally {
      setFarmSwitching(false);
    }
  };

  const sub = route.segments[1] || 'dashboard';

  const isMobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 1100px)').matches;
  const isTablet = typeof window !== 'undefined' && window.matchMedia('(max-width: 1440px) and (min-width: 720px)').matches;

  const mobileNavItems = [
    { key: 'dashboard', icon: Home, label: 'Home' },
    { key: 'cows', icon: Beef, label: 'Animals' },
    { key: 'map', icon: MapPin, label: 'Map' },
    { key: 'ai-advisor', icon: Bot, label: 'AI' },
  ];

  const moreNavGroups = [
    { label: 'Farm', items: NAV_GROUPS.find(g => g.label === 'Farm')?.items || [] },
    { label: 'Animals & Breeding', items: [...(NAV_GROUPS.find(g => g.label === 'Animals')?.items || []), ...(NAV_GROUPS.find(g => g.label === 'Breeding')?.items || [])] },
    { label: 'Production', items: [...(NAV_GROUPS.find(g => g.label === 'Production')?.items || []), ...(NAV_GROUPS.find(g => g.label === 'Health')?.items || [])] },
    { label: 'Operations', items: NAV_GROUPS.find(g => g.label === 'Operations')?.items || [] },
    { label: 'Business', items: [...(NAV_GROUPS.find(g => g.label === 'Business')?.items || []), ...(NAV_GROUPS.find(g => g.label === 'AI')?.items || [])] },
    { label: 'System', items: [...(NAV_GROUPS.find(g => g.label === 'System')?.items || []), ...(user?.isSuperAdmin ? [{ key: 'platform-admin', icon: Crown, label: 'Platform Admin' }] : [])] },
  ];

  const go = (k: string) => {
    const featureMap: Record<string, string> = {
      'dashboard': 'dashboard', 'command-center': 'command-center', cows: 'cows', cow: 'cow', map: 'map',
      'ai': 'ai', 'ai-advisor': 'ai-advisor', alerts: 'alerts', predict: 'predict', analytics: 'analytics',
      'finance': 'finance', weather: 'weather', sustainability: 'sustainability', gallery: 'gallery',
      'customers': 'customers', team: 'team', tasks: 'tasks', schedule: 'schedule', search: 'search',
      'gamification': 'gamification', management: 'management', breeding: 'breeding', health: 'health',
      settings: 'settings', 'farm-score': 'farm-score',
    };
    const feature = featureMap[k];
    if (feature && !canAccess(feature)) {
      setUpgradeModal({ open: true, feature });
    } else {
      navigate('/app/' + k);
    }
    setMobileMenuOpen(false);
    setMoreDrawerOpen(false);
  };

  const farm = farmList.find((f) => f.id === farmId) || farmList[0];

  const page = () => {
    const featureMap: Record<string, string> = {
      'command-center': 'command-center', dashboard: 'dashboard', cows: 'cows', cow: 'cow', map: 'map', ai: 'ai', 'ai-advisor': 'ai-advisor',
      alerts: 'alerts', predict: 'predict', analytics: 'analytics', finance: 'finance',
      weather: 'weather', sustainability: 'sustainability', gallery: 'gallery',
      customers: 'customers', team: 'team', tasks: 'tasks', schedule: 'schedule', search: 'search', gamification: 'gamification', management: 'management',
    };
    const feature = featureMap[sub];
    const content = (() => {
      switch (sub) {
        case 'command-center': return <CommandCenter />;
        case 'dashboard': return <Dashboard />;
        case 'cows': return <Herd />;
        case 'cow': return <CowProfile id={route.param!} />;
        case 'map': return <FarmMap />;
        case 'ai': return <AIAssistant />;
        case 'ai-advisor': return <AIAdvisor />;
        case 'farm-score': return <FarmScore />;
        case 'alerts': return <Alerts />;
        case 'predict': return <Predictions />;
        case 'analytics': return <Analytics />;
        case 'finance': return <Financial />;
        case 'weather': return <Weather />;
        case 'sustainability': return <Sustainability />;
        case 'gallery': return <Gallery id={route.param} />;
        case 'customers': return <Customers />;
        case 'team': return <Team />;
        case 'tasks': return <TaskManager />;
        case 'schedule': return <DailySchedule />;
        case 'search': return <AdvancedSearch initial={search} />;
        case 'gamification': return <Gamification />;
        case 'management': return <Management />;
        case 'breeding': return <Breeding />;
        case 'health': return <Health />;
        case 'settings': return <Settings />;
        case 'platform-admin': return user?.isSuperAdmin ? <PlatformAdmin /> : <CommandCenter />;
        default: return <CommandCenter />;
      }
    })();

    if (feature && !canAccess(feature)) {
      return (
        <div className="card" style={{ padding: 40, textAlign: 'center', marginTop: 40 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
          <h2 style={{ fontSize: 24, marginBottom: 8 }}>Upgrade to unlock</h2>
          <p className="muted" style={{ fontSize: 15, maxWidth: 480, margin: '0 auto 24px' }}>
            This feature requires a higher plan. Upgrade to {Object.keys(PLAN_FEATURES).find((p) => PLAN_FEATURES[p as keyof typeof PLAN_FEATURES].includes(feature))} to access it.
          </p>
          <div className="row" style={{ justifyContent: 'center', gap: 10 }}>
            <button className="btn gold" onClick={() => { window.location.hash = '#/pricing'; }}>View plans & upgrade</button>
                    <button className="btn ghost" onClick={() => navigate('/app/command-center')}>Go to Command Center</button>
          </div>
        </div>
      );
    }

    return content;
  };

  return (
    <PlanProvider>
      <FCtx.Provider value={{ farmId, farmName: farm?.name || '', setFarmId }}>
        <div className="shell">
        {(isMobile || isTablet) && (
          <div className="mobile-topbar">
            <button className="btn ghost sm" onClick={() => setMobileMenuOpen((v) => !v)}>
              <Menu size={20} />
            </button>
            <div className="brand" style={{ padding: 0, flex: 1, justifyContent: 'center' }}>
              <img className="logo" src={logoImg} alt="DairyOS" />
              <div><b>DairyOS</b><small>SMART DAIRY</small></div>
            </div>
            <div className="row" style={{ gap: 4, position: 'relative' }}>
              <button className="btn ghost sm" style={{ position: 'relative' }} onClick={() => setBell((v) => !v)}>
                <Bell size={18} />
                {notificationsList.filter((n: any) => !n.read_at).length > 0 && (
                  <span className="badge-dot" style={{ position: 'absolute', top: -2, right: -2, fontSize: 9, padding: '1px 4px' }}>{notificationsList.filter((n: any) => !n.read_at).length}</span>
                )}
              </button>
              <button className="btn ghost sm" onClick={() => setUserMenu((v) => !v)}>
                <span className="photo" style={{ width: 24, height: 24, fontSize: 10, background: 'var(--primary)' }}>{user?.name?.charAt(0) || 'M'}</span>
              </button>
            </div>
          </div>
        )}
        {(isMobile || isTablet) && bell && (
          <div className="mobile-drawer-backdrop" onClick={() => setBell(false)}>
            <div className="more-drawer" onClick={(e) => e.stopPropagation()}>
              <div className="between" style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                <b>Notifications</b>
                <button className="btn ghost sm" onClick={() => setBell(false)}><X size={18} /></button>
              </div>
              <div style={{ padding: 10, maxHeight: '60vh', overflow: 'auto' }}>
                {notificationsList.length === 0 ? (
                  <p className="muted" style={{ padding: 20, textAlign: 'center', fontSize: 13 }}>No notifications</p>
                ) : (
                  notificationsList.slice(0, 6).map((n: any) => (
                    <button key={n.id} onClick={() => { setBell(false); go('alerts'); }} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', width: '100%', padding: '10px 12px', borderRadius: 8, textAlign: 'left', border: 0, background: 'none', color: 'inherit', cursor: 'pointer' }}>
                      <Bell size={15} color={n.tone === 'danger' ? 'var(--danger)' : n.tone === 'warn' ? 'var(--warn)' : 'var(--info)'} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{n.title}</div>
                        <div className="muted" style={{ fontSize: 12 }}>{n.body}</div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
        {(isMobile || isTablet) && userMenu && (
          <div className="mobile-drawer-backdrop" onClick={() => setUserMenu(false)}>
            <div className="more-drawer" onClick={(e) => e.stopPropagation()}>
              <div style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{user?.name}</div>
                <div className="muted" style={{ fontSize: 12 }}>{user?.email}</div>
              </div>
              <div style={{ padding: 10 }}>
                <button className="nav-item" onClick={() => { navigate('/app/settings'); setUserMenu(false); }}><ShieldCheck size={18} /> Security & 2FA</button>
                <button className="nav-item" onClick={() => { logout(); navigate('/'); setUserMenu(false); }}><LogOut size={18} /> Sign out</button>
              </div>
            </div>
          </div>
        )}
        {(isMobile || isTablet) && mobileMenuOpen && (
          <div className="mobile-drawer-backdrop" onClick={() => setMobileMenuOpen(false)}>
            <div className="mobile-drawer" onClick={(e) => e.stopPropagation()}>
              <div className="between" style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                <div className="brand" style={{ padding: 0 }}><img className="logo" src={logoImg} alt="DairyOS" /><div><b>DairyOS</b><small>SMART DAIRY</small></div></div>
                <button className="btn ghost sm" onClick={() => setMobileMenuOpen(false)}><X size={18} /></button>
              </div>
              <nav style={{ padding: 10 }}>
                {NAV_GROUPS.map((group) => (
                  <div key={group.label} style={{ marginBottom: 8 }}>
                    <div style={{ padding: '4px 12px', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.2, color: 'var(--text-soft)', fontWeight: 700 }}>{group.label}</div>
                    {group.items.map((n) => (
                      <button key={n.key} className={`nav-item ${sub === n.key ? 'active' : ''}`} onClick={() => go(n.key)}>
                        <n.icon size={18} /> {n.label}
                      </button>
                    ))}
                  </div>
                ))}
                {user?.isSuperAdmin && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ padding: '4px 12px', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.2, color: 'var(--text-soft)', fontWeight: 700 }}>System</div>
                    <button className={`nav-item ${sub === 'platform-admin' ? 'active' : ''}`} onClick={() => { navigate('/app/platform-admin'); setMobileMenuOpen(false); }}>
                      <Crown size={18} /> Platform Admin
                    </button>
                  </div>
                )}
                <button className="nav-item" onClick={() => { navigate('/'); setMobileMenuOpen(false); }}>
                  <LogOut size={18} /> View website
                </button>
              </nav>
            </div>
          </div>
        )}
        <aside className={`sidebar${(isMobile || isTablet) ? ' hidden' : ''}`}>
          <div className="brand">
            <img className="logo" src={logoImg} alt="DairyOS" />
            <div><b>DairyOS</b><small>SMART DAIRY</small></div>
          </div>
          {NAV_GROUPS.map((group) => (
            <div key={group.label} style={{ marginBottom: 6 }}>
              <div style={{ padding: '6px 12px', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.2, color: 'var(--text-soft)', fontWeight: 700 }}>{group.label}</div>
              {group.items.map((n) => (
                <button key={n.key} className={`nav-item ${sub === n.key ? 'active' : ''}`} onClick={() => go(n.key)}>
                  <n.icon size={18} /> {n.label}
                  {n.badge && <span className="badge-dot">{n.badge}</span>}
                </button>
              ))}
            </div>
          ))}
          {user?.isSuperAdmin && (
            <button className={`nav-item ${sub === 'platform-admin' ? 'active' : ''}`} onClick={() => navigate('/app/platform-admin')}>
              <Crown size={18} /> Platform Admin
            </button>
          )}
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
              <button className="btn ghost sm" onClick={() => setFarmMenu((v) => !v)} disabled={farmSwitching}>
                <MapPin size={15} /> {farmSwitching ? 'Switching…' : farm.name} <ChevronDown size={14} />
              </button>
              {farmMenu && (
                <div className="menu-pop" onMouseLeave={() => setFarmMenu(false)}>
                  {farmList.map((f) => (
                    <button key={f.id} onClick={() => selectFarm(f.id)}>
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
                <Bell size={16} /> <span className="badge-dot" style={{ position: 'absolute', top: -4, right: -4 }}>{notificationsList.filter((n: any) => !n.read_at).length}</span>
              </button>
              {bell && (
                <div className="menu-pop" style={{ minWidth: 300 }} onMouseLeave={() => setBell(false)}>
                  {notificationsList.slice(0, 6).map((n: any) => (
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
                  <button onClick={() => { navigate('/app/settings'); setUserMenu(false); }}><ShieldCheck size={15} /> Security & 2FA</button>
                  <button onClick={() => { logout(); navigate('/'); }}><LogOut size={15} /> Sign out</button>
                </div>
              )}
            </div>
          </header>

          <main className="content">{page()}</main>
        </div>
        {(isMobile || isTablet) && (
          <>
            <button className="fab fab-quick" onClick={() => setQuickActionsOpen((v) => !v)}>
              <Plus size={22} />
            </button>
            {quickActionsOpen && (
              <div className="more-drawer-backdrop" onClick={() => setQuickActionsOpen(false)}>
                <div className="more-drawer" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '50vh' }}>
                  <div className="between" style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                    <b>Quick Actions</b>
                    <button className="btn ghost sm" onClick={() => setQuickActionsOpen(false)}><X size={18} /></button>
                  </div>
                  <div style={{ padding: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <button className="btn sm" onClick={() => { go('cows'); setQuickActionsOpen(false); }}><Beef size={16} /> Add Animal</button>
                    <button className="btn sm" onClick={() => { go('management'); setQuickActionsOpen(false); }}><Milk size={16} /> Record Milk</button>
                    <button className="btn sm" onClick={() => { go('health'); setQuickActionsOpen(false); }}><HeartPulse size={16} /> Record Health</button>
                    <button className="btn sm" onClick={() => { go('breeding'); setQuickActionsOpen(false); }}><FlaskConical size={16} /> Record Breeding</button>
                    <button className="btn sm" onClick={() => { go('tasks'); setQuickActionsOpen(false); }}><ClipboardList size={16} /> Add Task</button>
                    <button className="btn sm ghost" onClick={() => { go('team'); setQuickActionsOpen(false); }}><Users size={16} /> Add Employee</button>
                  </div>
                </div>
              </div>
            )}
            <button className="fab fab-menu" onClick={() => setMoreDrawerOpen((v) => !v)}>
              <Menu size={22} />
            </button>
            <nav className="bottom-nav">
              {mobileNavItems.map((item) => {
                const Icon = item.icon;
                const active = sub === item.key;
                return (
                  <button key={item.key} className={`bottom-nav-item ${active ? 'active' : ''}`} onClick={() => go(item.key)}>
                    <Icon size={20} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
              <button className={`bottom-nav-item ${moreDrawerOpen ? 'active' : ''}`} onClick={() => setMoreDrawerOpen((v) => !v)}>
                <Menu size={20} />
                <span>More</span>
              </button>
            </nav>
            {moreDrawerOpen && (
              <div className="more-drawer-backdrop" onClick={() => setMoreDrawerOpen(false)}>
                <div className="more-drawer" onClick={(e) => e.stopPropagation()}>
                  <div className="between" style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                    <b>More</b>
                    <button className="btn ghost sm" onClick={() => setMoreDrawerOpen(false)}><X size={18} /></button>
                  </div>
                  <div style={{ padding: 10, maxHeight: '60vh', overflow: 'auto' }}>
                    {moreNavGroups.map((group) => (
                      <div key={group.label} style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-soft)', fontWeight: 700, padding: '4px 12px' }}>{group.label}</div>
                        {group.items.map((n) => (
                          <button key={n.key} className={`nav-item ${sub === n.key ? 'active' : ''}`} onClick={() => go(n.key)}>
                            <n.icon size={18} /> {n.label}
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
        {isLive && <OfflineBanner />}
      </div>
    </FCtx.Provider>
    </PlanProvider>
  );
}
