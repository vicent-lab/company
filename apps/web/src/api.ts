const API = (import.meta.env.VITE_API_URL as string | undefined) || '';

export const isLive = Boolean(API);
const TOKEN_KEY = 'dairy-token';
const REFRESH_KEY = 'dairy-refresh-token';

export function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) || '';
}
export function setToken(t: string) {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}
export function getRefreshToken(): string {
  return localStorage.getItem(REFRESH_KEY) || '';
}
export function setRefreshToken(t: string) {
  if (t) localStorage.setItem(REFRESH_KEY, t);
  else localStorage.removeItem(REFRESH_KEY);
}
export function setTokens(token: string, refreshToken: string) {
  setToken(token);
  setRefreshToken(refreshToken);
}
export function clearTokens() {
  setToken('');
  setRefreshToken('');
}

// Called when a refresh attempt fails outright (refresh token missing/expired/revoked) —
// AuthProvider registers this to drop its user state so the app falls back to the login
// screen instead of every page silently failing its own requests one by one.
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}

export class ApiError extends Error {
  status: number;
  body: any;
  constructor(status: number, message: string, body?: any) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

// Access tokens are short-lived by design (see server env.ts); concurrent requests that
// 401 at the same time must share one in-flight refresh instead of each racing the
// refresh-token rotation (only the first would win, the rest would revoke each other).
let refreshPromise: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const refreshToken = getRefreshToken();
      if (!refreshToken) return false;
      try {
        const res = await fetch(API + '/auth/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });
        if (!res.ok) return false;
        const json = await res.json();
        setTokens(json.token, json.refreshToken);
        return true;
      } catch {
        return false;
      } finally {
        refreshPromise = null;
      }
    })();
  }
  return refreshPromise;
}

async function request<T>(path: string, method = 'GET', body?: any, _retried = false): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(API + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && !_retried && !path.startsWith('/auth/')) {
    const refreshed = await tryRefresh();
    if (refreshed) return request<T>(path, method, body, true);
    clearTokens();
    onUnauthorized?.();
  }

  if (res.status === 204) return undefined as T;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, json.error || `Request failed (${res.status})`, json);
  return json as T;
}

export const apiGet = <T,>(path: string) => request<T>(path, 'GET');
export const apiSend = <T,>(path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: any) =>
  request<T>(path, method, body);
