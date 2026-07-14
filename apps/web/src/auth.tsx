import { createContext, useContext, useState, ReactNode } from 'react';
import { isLive, getToken, setToken, apiSend, ApiError } from './api';
import { loadFarms } from './data';

interface AuthUser { id: string; name: string; email: string; farmId: string; role: string; }
interface AuthCtx { user: AuthUser | null; login: (email: string, password: string) => Promise<void>; logout: () => void; }
const Ctx = createContext<AuthCtx>({ user: null, login: async () => {}, logout: () => {} });
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => (getToken() && isLive ? { id: 'me', name: 'Manager', email: 'manager@dairyos.app', farmId: '', role: 'administrator' } : null));

  const login = async (email: string, password: string) => {
    if (!isLive) { setUser({ id: 'me', name: 'Manager', email, farmId: '', role: 'administrator' }); return; }
    try {
      const res = await apiSend<{ token: string; user: AuthUser }>('/auth/login', 'POST', { email, password });
      setToken(res.token);
      setUser(res.user);
    } catch (e) {
      if (e instanceof ApiError) throw new Error(e.message);
      throw new Error('Login failed');
    }
  };
  const logout = () => { setToken(''); setUser(null); };

  return <Ctx.Provider value={{ user, login, logout }}>{children}</Ctx.Provider>;
}
