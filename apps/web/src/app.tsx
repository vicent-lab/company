import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useTheme } from './theme';
import { useHashRoute } from './router';
import { ThemeToggle, PageHeader, Modal, PasswordInput, OfflineBanner, GlobalSearch } from './ui';
import { FARMS, NOTIFICATIONS } from './mock';
import { useAsync } from './ui';
import { isLive, ApiError, apiSend } from './api';
import { loadFarms, forgotPassword, getCaptcha, requestPhoneOtp, notifications } from './data';
import { useAuth, LoginResult } from './auth';
import { QuickActions, QuickAction } from './components/QuickActions';
import {
  LayoutDashboard, Beef, MapPin, Activity, Bot, Bell, TrendingUp, BarChart3, DollarSign,
  CloudSun, Leaf, Images, Users, UserCog, Search, Trophy, Sun, Moon, Contrast,
  ChevronDown, Check, LogOut, ShieldCheck, ClipboardList, FlaskConical, Sparkles, Calendar, Gauge, Settings as SettingsIcon, Crown,
  Phone, KeyRound, ShieldAlert, Brain, Menu, X, Home, Milk, HeartPulse, Package, Wrench,
  ChevronRight, Plus, Baby, Heart, Pill, Wheat, AlertTriangle, Syringe,
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
interface MobileNavItem {
  key: string;
  route: string | null;
  icon: any;
  label: string;
  routes: string[];
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
  const { push } = useToast();
  const [loadingProvider, setLoadingProvider] = useState<'google' | 'microsoft' | 'apple' | null>(null);
  const [oauthError, setOauthError] = useState('');

  const handleOAuth = async (provider: 'google' | 'microsoft' | 'apple') => {
    setLoadingProvider(provider);
    setOauthError('');
    try {
      window.location.href = `/api/v1/auth/oauth/${provider}`;
    } catch (err: any) {
      push(err.message || 'OAuth sign-in failed');
      setOauthError(err.message || 'OAuth sign-in failed');
      setLoadingProvider(null);
    }
  };

  const providers: { id: 'google' | 'microsoft' | 'apple'; label: string; icon: React.ReactNode }[] = [
    {
      id: 'google',
      label: 'Google',
      icon: (
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.3v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
      ),
    },
    {
      id: 'microsoft',
      label: 'Microsoft',
      icon: (
        <svg viewBox="0 0 21 21" width="18" height="18" aria-hidden="true">
          <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
          <rect x="11" y="1" width="9" height="9" fill="#00a4ef"/>
          <rect x="1" y="11" width="9" height="9" fill="#7fba00"/>
          <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
        </svg>
      ),
    },
    {
      id: 'apple',
      label: 'Apple',
      icon: (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
          <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.21-1.98 1.07-3.11-1.05.05-2.31.71-3.06 1.57-.68.78-1.28 2.05-1.12 3.16 1.19.09 2.31-.58 3.11-1.62"/>
        </svg>
      ),
    },
  ];

  const loadingMessages: Record<string, string> = {
    google: 'Connecting to Google…',
    microsoft: 'Connecting to Microsoft…',
    apple: 'Connecting to Apple…',
  };

  return (
    <div>
      {oauthError && (
        <p className="error" style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 8, textAlign: 'center' }}>
          {oauthError}
        </p>
      )}
      <div className="oauth-buttons">
        {providers.map((p) => (
          <button
            key={p.id}
            type="button"
            className="oauth-btn"
            onClick={() => handleOAuth(p.id)}
            disabled={loadingProvider !== null}
            aria-label={`Sign in with ${p.label}`}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>{p.icon}</span>
            <span>{loadingProvider === p.id ? loadingMessages[p.id] : p.label}</span>
          </button>
        ))}
      </div>
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

  useEffect(() => {
    const hash = window.location.hash;
    const query = hash.split('?')[1] || '';
    const params = new URLSearchParams(query);
    const err = params.get('error');
    if (err) {
      const provider = params.get('provider');
      const messages: Record<string, string> = {
        oauth_denied: 'Sign-in was cancelled.',
        invalid_state: 'Sign-in session expired. Please try again.',
        oauth_ambiguity: provider
          ? `This ${provider} account is linked to another DairyOS account. Please sign in with that account first, or use a different sign-in method.`
          : 'Account linking conflict. Please try again.',
        missing_tokens: 'Sign-in failed. Please try again.',
      };
      setError(messages[err] || 'Sign-in failed. Please try again.');
      const newUrl = new URL(window.location.href);
      newUrl.hash = newUrl.hash.split('?')[0] || '';
      window.history.replaceState({}, '', newUrl.toString());
    }
  }, []);

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
  const [searchOpen, setSearchOpen] = useState(false);
  const [verifySkipped, setVerifySkipped] = useState(false);
  const [notificationsList, setNotificationsList] = useState<any[]>([]);
   const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
   const [moreDrawerOpen, setMoreDrawerOpen] = useState(false);
   const unreadNotifications = notificationsList.filter((n: any) => !n.read_at).length;
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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

  // Super Admin may peek at any farm's data instantly (the backend honors ?farmId= for them).
  // Everyone else's access token is scoped to one farm at a time, so picking a different
  // one has to mint a new token via switch-farm before the view actually changes.
  const selectFarm = async (id: string) => {
    setFarmMenu(false);
    if (!isLive || user?.isSuperAdmin) { setFarmId(id); return; }
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

  const mobileNavItems: MobileNavItem[] = [
    { key: 'home', route: 'dashboard', icon: Home, label: 'Home', routes: ['dashboard', 'command-center'] },
    { key: 'animals', route: 'cows', icon: Beef, label: 'Animals', routes: ['cows', 'cow'] },
    { key: 'map', route: 'map', icon: MapPin, label: 'Map', routes: ['map', 'gallery'] },
    { key: 'ai', route: 'ai-advisor', icon: Sparkles, label: 'AI', routes: ['ai-advisor', 'ai', 'predict', 'farm-score', 'alerts'] },
    { key: 'more', route: null, icon: Menu, label: 'More', routes: [] },
  ];

  const quickActions: QuickAction[] = [
    { key: 'cows', label: 'Add Animal', icon: Beef, route: '/app/cows', description: 'Register a new cow' },
    { key: 'milk', label: 'Record Milk', icon: Milk, route: '/app/management', description: 'Log milk production' },
    { key: 'health', label: 'Record Health', icon: Activity, route: '/app/health', description: 'Add health record' },
    { key: 'breeding', label: 'Record Breeding', icon: FlaskConical, route: '/app/breeding', description: 'Log heat detection' },
    { key: 'pregnancy', label: 'Record Pregnancy', icon: Heart, route: '/app/breeding', description: 'Record pregnancy check' },
    { key: 'calving', label: 'Record Calving', icon: Baby, route: '/app/breeding', description: 'Log calving event' },
    { key: 'feed', label: 'Add Feed', icon: Wheat, route: '/app/management', description: 'Record feed intake' },
    { key: 'inventory', label: 'Add Inventory', icon: Pill, route: '/app/health', description: 'Add medicine inventory' },
    { key: 'finance', label: 'Finances', icon: DollarSign, route: '/app/finance', description: 'View finances' },
    { key: 'tasks', label: 'Add Task', icon: ClipboardList, route: '/app/tasks', description: 'Create new task' },
  ];

  const moreNavGroups = [
    {
      label: 'Farm',
      items: [
        { key: 'map', icon: MapPin, label: 'Farm Map' },
        { key: 'weather', icon: CloudSun, label: 'Weather' },
        { key: 'gallery', icon: Images, label: 'Gallery' },
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
      label: 'Health',
      items: [
        { key: 'health', icon: Activity, label: 'Health' },
      ],
    },
    {
      label: 'Production',
      items: [
        { key: 'management', icon: Milk, label: 'Milk & Feed' },
        { key: 'analytics', icon: BarChart3, label: 'Analytics' },
      ],
    },
    {
      label: 'Team & Tasks',
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
      label: 'Intelligence',
      items: [
        { key: 'ai-advisor', icon: Sparkles, label: 'AI Advisor' },
        { key: 'predict', icon: TrendingUp, label: 'Predictions' },
        { key: 'farm-score', icon: Gauge, label: 'Farm Score' },
        { key: 'sustainability', icon: Leaf, label: 'Sustainability' },
      ],
    },
    {
      label: 'Alerts',
      items: [
        { key: 'alerts', icon: AlertTriangle, label: 'Alerts & reminders' },
      ],
    },
    {
      label: 'Tools',
      items: [
        { key: 'search', icon: Search, label: 'Advanced Search' },
        { key: 'gamification', icon: Trophy, label: 'Gamification' },
      ],
    },
    {
      label: 'System',
      items: [
        { key: 'settings', icon: SettingsIcon, label: 'Settings' },
        ...(user?.isSuperAdmin ? [{ key: 'platform-admin', icon: Crown, label: 'Platform Admin' }] : []),
      ],
    },
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

  const markAllRead = () => {
    setNotificationsList((prev) => prev.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() })));
    if (isLive) {
      (async () => {
        try { await apiSend('/notifications/read-all', 'POST'); } catch {}
      })();
    }
  };

  const notificationToneColor = (n: any) =>
    n.tone === 'danger' ? 'var(--danger)' : n.tone === 'warn' ? 'var(--warn)' : n.tone === 'info' ? 'var(--info)' : 'var(--text-soft)';

  const notificationIcon = (n: any) => {
    if (n.type === 'sick') return <AlertTriangle size={16} color={notificationToneColor(n)} />;
    if (n.type === 'vaccination') return <Syringe size={16} color={notificationToneColor(n)} />;
    if (n.type === 'feed') return <Wheat size={16} color={notificationToneColor(n)} />;
    if (n.type === 'medicine') return <Pill size={16} color={notificationToneColor(n)} />;
    if (n.type === 'heat' || n.type === 'calving') return <Baby size={16} color={notificationToneColor(n)} />;
    if (n.type === 'task') return <ClipboardList size={16} color={notificationToneColor(n)} />;
    if (n.type === 'payment') return <DollarSign size={16} color={notificationToneColor(n)} />;
    return <Bell size={16} color={notificationToneColor(n)} />;
  };

  const handleNotificationClick = (n: any) => {
    if (!n.read_at) {
      setNotificationsList((prev) => prev.map((x) => x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x));
      if (isLive) {
        apiSend(`/notifications/${n.id}/read`, 'POST').catch(() => {});
      }
    }
    setBell(false);
    navigate(n.link || '/app/alerts');
  };

  const renderNotificationGroups = (items: any[], compact = false) => {
    const cats: Record<string, any[]> = { critical: [], important: [], information: [] };
    items.forEach((n) => {
      const cat = (n.category || 'information').toLowerCase();
      if (cats[cat]) cats[cat].push(n);
      else cats['information'].push(n);
    });
    const catLabels = { critical: 'CRITICAL', important: 'IMPORTANT', information: 'INFORMATION' };
    const catTone: Record<string, string> = { critical: 'danger', important: 'warn', information: 'info' };
    return (
      <>
        {(['critical', 'important', 'information'] as const).map((cat) => {
          const group = cats[cat];
          if (!group || group.length === 0) return null;
          const unreadCount = group.filter((n) => !n.read_at).length;
          const route = (n: any) => n.link || '/app/alerts';
          return (
            <div key={cat} className="notification-group">
              <div className="notification-group-label">
                <span style={{ color: `var(--${catTone[cat]})`, fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6 }}>{catLabels[cat]}</span>
                {unreadCount > 0 && <span className="badge-dot" style={{ marginLeft: 'auto', fontSize: 9, padding: '1px 6px' }}>{unreadCount} unread</span>}
              </div>
              {group.map((n) => (
                <button
                  key={n.id}
                  className={`notification-item ${compact ? 'compact' : ''}`}
                  onClick={() => handleNotificationClick(n)}
                >
                  {notificationIcon(n)}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                      {n.title}
                      {!n.read_at && <span className="badge-dot" style={{ width: 6, height: 6, fontSize: 8, padding: 0 }} />}
                    </div>
                    <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{n.body}</div>
                  </div>
                  <span className="muted" style={{ fontSize: 11, marginLeft: 'auto', whiteSpace: 'nowrap' }}>{n.time}</span>
                </button>
              ))}
            </div>
          );
        })}
      </>
    );
  };

  const farm = farmList.find((f) => f.id === farmId) || farmList[0];

  const page = () => {
    const featureMap: Record<string, string> = {
      'command-center': 'command-center', dashboard: 'dashboard', cows: 'cows', cow: 'cow', map: 'map', ai: 'ai', 'ai-advisor': 'ai-advisor',
      alerts: 'alerts', predict: 'predict', analytics: 'analytics', finance: 'finance',
      weather: 'weather', sustainability: 'sustainability', gallery: 'gallery',
      customers: 'customers', team: 'team', tasks: 'tasks', schedule: 'schedule', search: 'search', gamification: 'gamification', management: 'management',
      breeding: 'breeding', health: 'health', settings: 'settings', 'farm-score': 'farm-score',
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
                {unreadNotifications > 0 && (
                  <span className="badge-dot" style={{ position: 'absolute', top: -2, right: -2, fontSize: 9, padding: '1px 4px' }}>{unreadNotifications}</span>
                )}
              </button>
              <button className="btn ghost sm" onClick={() => setSearchOpen(true)} aria-label="Search">
                <Search size={20} />
              </button>
              <button className="btn ghost sm" onClick={() => setUserMenu((v) => !v)}>
                <span className="photo" style={{ width: 24, height: 24, fontSize: 10, background: 'var(--primary)' }}>{user?.name?.charAt(0) || 'M'}</span>
              </button>
            </div>
          </div>
        )}
        {(isMobile || isTablet) && bell && (
          <div className="mobile-drawer-backdrop" onClick={() => setBell(false)}>
            <div className="more-drawer notification-drawer" onClick={(e) => e.stopPropagation()}>
             <div className="between" style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                <b>Notifications</b>
                <div className="row" style={{ gap: 4 }}>
                  <button className="btn ghost sm" style={{ fontSize: 11 }} onClick={() => { markAllRead(); setBell(false); }} aria-label="Mark all read">Mark all</button>
                  <button className="btn ghost sm" onClick={() => setBell(false)} aria-label="Close"><X size={18} /></button>
                </div>
              </div>
              <div style={{ padding: 10, maxHeight: '60vh', overflow: 'auto', flex: 1, display: 'flex', flexDirection: 'column' }}>
                {notificationsList.length === 0 ? (
                  <p className="muted" style={{ padding: 20, textAlign: 'center', fontSize: 13 }}>No notifications</p>
                ) : (
                  renderNotificationGroups(notificationsList.slice(0, 6))
                )}
              </div>
               <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border)' }}>
                <button className="btn ghost sm" style={{ width: '100%', fontSize: 12 }} onClick={() => { setBell(false); go('alerts'); }}>
                  See all <ChevronRight size={14} style={{ float: 'right' }} />
                </button>
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
            {unreadNotifications > 0 ? (
              <>
                <div style={{ padding: '6px 12px', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.2, color: 'var(--text-soft)', fontWeight: 700 }}>Alerts</div>
                <button className="nav-item" onClick={() => go('alerts')}>
                  <AlertTriangle size={18} /> Alerts
                  <span className="badge-dot" style={{ background: 'var(--danger)', color: 'white', fontSize: 10, padding: '1px 5px', borderRadius: 8 }}>{unreadNotifications}</span>
                </button>
              </>
            ) : (
              <>
                <div style={{ padding: '6px 12px', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.2, color: 'var(--text-soft)', fontWeight: 700 }}>Alerts</div>
                <button className={`nav-item ${sub === 'alerts' ? 'active' : ''}`} onClick={() => go('alerts')}>
                  <AlertTriangle size={18} /> Alerts
                </button>
              </>
            )}
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
              <Search size={16} color="var(--text-soft)" style={{ position: 'absolute', left: 10, zIndex: 1 }} />
               <input className="input" placeholder="Search animals, employees, tasks, records…  ⌘K" value={search}
                onChange={(e) => setSearch(e.target.value)}
                onFocus={() => setSearchOpen(true)}
                onKeyDown={(e) => e.key === 'Enter' && go('search')}
                style={{ paddingLeft: 36 }} />
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

            <QuickActions actions={quickActions} onSelect={(route) => navigate(route)} triggerLabel="Quick Actions" isMobile={false} />

            <div className="menu">
              <button className="btn ghost sm" style={{ position: 'relative' }} onClick={() => setBell((v) => !v)} aria-label="Notifications">
                <Bell size={16} /> <span className="badge-dot" style={{ position: 'absolute', top: -4, right: -4 }}>{unreadNotifications}</span>
              </button>
              {bell && (
                <div className="menu-pop notification-pop" style={{ minWidth: 320, width: 'min(360px, 90vw)' }} onMouseLeave={() => setBell(false)}>
                  <div className="between" style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
                    <b>Notifications</b>
                    <button className="btn ghost sm" style={{ fontSize: 11 }} onClick={() => { markAllRead(); setBell(false); }}>Mark all read</button>
                  </div>
                  {renderNotificationGroups(notificationsList.slice(0, 6), true)}
                  <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border)' }}>
                    <button className="btn ghost sm" style={{ width: '100%', fontSize: 12 }} onClick={() => { setBell(false); go('alerts'); }}>
                      See all notifications <ChevronRight size={14} style={{ float: 'right' }} />
                    </button>
                  </div>
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
            <QuickActions actions={quickActions} onSelect={(route) => navigate(route)} triggerLabel="Quick Actions" isMobile={true} onClose={() => {}} />
            <button className="fab fab-menu" onClick={() => setMoreDrawerOpen((v) => !v)}>
              <Menu size={22} />
            </button>
            <nav className="bottom-nav" role="navigation" aria-label="Main">
              {mobileNavItems.map((item) => {
                const Icon = item.icon;
                const active = item.routes.includes(sub);
                return (
                  <button
                    key={item.key}
                    className={`bottom-nav-item ${active ? 'active' : ''}`}
                    onClick={() => item.route ? go(item.route) : setMoreDrawerOpen((v) => !v)}
                    aria-label={item.label}
                    aria-current={active ? 'page' : undefined}
                  >
                    <Icon size={22} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
            {moreDrawerOpen && (
              <div className="more-drawer-backdrop" onClick={() => setMoreDrawerOpen(false)}>
                <div className="more-drawer" onClick={(e) => e.stopPropagation()}>
                  <div className="more-drawer-header">
                    <b>More</b>
                    <button className="btn ghost sm" onClick={() => setMoreDrawerOpen(false)} aria-label="Close menu"><X size={18} /></button>
                  </div>
                  <div className="more-drawer-body">
                    {moreNavGroups.map((group) => (
                      <div key={group.label} className="more-drawer-group">
                        <div className="more-drawer-group-label">{group.label}</div>
                        {group.items.map((n) => {
                          const Icon = n.icon;
                          const active = sub === n.key;
                          return (
                            <button
                              key={n.key}
                              className={`more-drawer-item ${active ? 'active' : ''}`}
                              onClick={() => go(n.key)}
                              aria-current={active ? 'page' : undefined}
                            >
                              <span className="nav-item-icon"><Icon size={18} /></span>
                              {n.label}
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
         {isLive && <OfflineBanner />}
         <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} farmId={farmId} navigate={navigate} />
       </div>
    </FCtx.Provider>
    </PlanProvider>
  );
}
