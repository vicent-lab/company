import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { isLive, getToken, getRefreshToken, setTokens, clearTokens, setUnauthorizedHandler, apiGet, apiSend, ApiError } from './api';
import { useHashRoute } from './router';

export type AccountType =
  | 'farm_owner' | 'farm_manager' | 'veterinarian' | 'farm_worker';
export interface FarmMembership { farmId: string; farmName: string; role: string; isDefault: boolean; isActive: boolean; }
interface AuthUser {
  id: string; name: string; email: string;
  farmId: string | null; role: string | null;
  permissions?: string[];
  accountType?: AccountType | null;
  emailVerified?: boolean;
  isSuperAdmin?: boolean;
}
export interface RegisterInput {
  firstName: string; lastName: string; email: string; phone: string; country: string;
  password: string; accountType: AccountType; termsAccepted: boolean; inviteToken?: string;
}
export type LoginResult = { mfaRequired: false } | { mfaRequired: true; mfaToken: string };
interface SessionResponse { token: string; refreshToken: string; user: AuthUser; farms: FarmMembership[]; }

interface AuthCtx {
  user: AuthUser | null;
  farms: FarmMembership[];
  loading: boolean;
  login: (email: string, password: string, captcha?: { token: string; answer: string }) => Promise<LoginResult>;
  completeMfaLogin: (mfaToken: string, code: string) => Promise<void>;
  loginWithPhoneOtp: (phone: string, code: string) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => void;
  switchFarm: (farmId: string) => Promise<void>;
  refreshMe: () => Promise<void>;
  oauthLogin: (token: string, refreshToken: string) => void;
}
const Ctx = createContext<AuthCtx>({
  user: null, farms: [], loading: false,
  login: async () => ({ mfaRequired: false }), completeMfaLogin: async () => {}, loginWithPhoneOtp: async () => {},
  register: async () => {}, logout: () => {}, switchFarm: async () => {}, refreshMe: async () => {},
  oauthLogin: () => {},
});
export function OAuthCallback() {
  const { oauthLogin } = useAuth();
  const [, navigate] = useHashRoute();

  useEffect(() => {
    const hash = window.location.hash;
    const query = hash.split('?')[1] || '';
    const params = new URLSearchParams(query);
    const token = params.get('token');
    const refreshToken = params.get('refreshToken');
    const error = params.get('error');

    if (error) {
      navigate('/login?error=' + encodeURIComponent(error));
      return;
    }

    if (token && refreshToken) {
      oauthLogin(token, refreshToken);
      navigate('/app');
    } else {
      navigate('/login?error=missing_tokens');
    }
  }, [navigate, oauthLogin]);

  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 20 }}>
      <div className="card" style={{ width: 360, maxWidth: '100%', textAlign: 'center' }}>
        <div className="muted">Completing sign-in…</div>
      </div>
    </main>
  );
}

export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [farms, setFarms] = useState<FarmMembership[]>([]);
  // Starts true whenever a token is already on disk (page refresh) so the login screen
  // doesn't flash before /auth/me has had a chance to confirm the session is still good.
  const [loading, setLoading] = useState(isLive && !!getToken());

  useEffect(() => {
    setUnauthorizedHandler(() => { setUser(null); setFarms([]); });
    return () => setUnauthorizedHandler(null);
  }, []);

  const refreshMe = async () => {
    if (!isLive) return;
    const res = await apiGet<{ user: AuthUser; farms: FarmMembership[] }>('/auth/me');
    setUser(res.user);
    setFarms(res.farms);
  };

  useEffect(() => {
    if (!isLive || !getToken()) { setLoading(false); return; }
    let alive = true;
    apiGet<{ user: AuthUser; farms: FarmMembership[] }>('/auth/me')
      .then((res) => { if (alive) { setUser(res.user); setFarms(res.farms); } })
      .catch(() => { if (alive) clearTokens(); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applySession = (res: SessionResponse) => {
    setTokens(res.token, res.refreshToken);
    setUser(res.user);
    setFarms(res.farms);
  };

  // Left un-caught (unlike register/switchFarm below) so the login form can read
  // err.status (423 = locked) and err.body.captchaRequired directly off the ApiError,
  // instead of just a flattened message string.
  const login = async (email: string, password: string, captcha?: { token: string; answer: string }): Promise<LoginResult> => {
    if (!isLive) { setUser({ id: 'me', name: 'Manager', email, farmId: '', role: 'administrator', permissions: ['farm:manage','cow:manage','task:manage'] }); return { mfaRequired: false }; }
    const res = await apiSend<SessionResponse | { mfaRequired: true; mfaToken: string }>('/auth/login', 'POST', {
      email, password, captchaToken: captcha?.token, captchaAnswer: captcha?.answer,
    });
    if ('mfaRequired' in res) return res;
    applySession(res);
    return { mfaRequired: false };
  };

  const completeMfaLogin = async (mfaToken: string, code: string) => {
    const res = await apiSend<SessionResponse>('/auth/2fa/verify-login', 'POST', { mfaToken, code });
    applySession(res);
  };

  const loginWithPhoneOtp = async (phone: string, code: string) => {
    const res = await apiSend<SessionResponse>('/auth/phone/verify-otp', 'POST', { phone, code });
    applySession(res);
  };

  const register = async (input: RegisterInput) => {
    const fullName = `${input.firstName} ${input.lastName}`.trim();
    if (!isLive) { setUser({ id: 'me', name: fullName, email: input.email, farmId: '', role: 'administrator', permissions: ['farm:manage','cow:manage','task:manage'] }); return; }
    try {
      const res = await apiSend<SessionResponse>('/auth/register', 'POST', input);
      applySession(res);
    } catch (e) {
      if (e instanceof ApiError) throw new Error(e.message);
      throw new Error('Registration failed');
    }
  };

  const logout = () => {
    const refreshToken = getRefreshToken();
    clearTokens();
    setUser(null);
    setFarms([]);
    if (isLive && refreshToken) apiSend('/auth/logout', 'POST', { refreshToken }).catch(() => {});
  };

  const switchFarm = async (farmId: string) => {
    const refreshToken = getRefreshToken();
    const res = await apiSend<SessionResponse>('/auth/switch-farm', 'POST', { farmId, refreshToken });
    applySession(res);
  };

  const oauthLogin = (token: string, refreshToken: string) => {
    setTokens(token, refreshToken);
    refreshMe();
  };

  return (
    <Ctx.Provider value={{ user, farms, loading, login, completeMfaLogin, loginWithPhoneOtp, register, logout, switchFarm, refreshMe, oauthLogin }}>
      {children}
    </Ctx.Provider>
  );
}
