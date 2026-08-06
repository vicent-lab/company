import jwt from 'jsonwebtoken';
import { config } from '../env.js';

export interface TokenPayload {
  sub: string;
  email: string;
  farmId: string | null;
  role: string | null;
  permissions: string[];
  isSuperAdmin?: boolean;
}

export function signToken(payload: Omit<TokenPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload as any, config.jwtSecret, { expiresIn: config.jwtExpiresIn as any });
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, config.jwtSecret) as TokenPayload;
}

// A separate, short-lived, narrow-purpose token issued after password/phone verification
// succeeds but before 2FA is checked — it can only ever be redeemed at /auth/2fa/verify-login,
// never accepted by requireAuth, so it can't be used to skip the second factor anywhere else.
export interface MfaPendingPayload {
  sub: string;
  mfaPending: true;
}

export function signMfaPendingToken(userId: string): string {
  return jwt.sign({ sub: userId, mfaPending: true } as MfaPendingPayload, config.jwtSecret, { expiresIn: '5m' });
}

export function verifyMfaPendingToken(token: string): MfaPendingPayload {
  const payload = jwt.verify(token, config.jwtSecret) as MfaPendingPayload;
  if (!payload.mfaPending) throw new Error('Not an MFA-pending token');
  return payload;
}
