import jwt from 'jsonwebtoken';
import { config } from '../env.js';

export interface TokenPayload {
  sub: string;
  email: string;
  farmId: string;
  role: string;
  permissions: string[];
}

export function signToken(payload: Omit<TokenPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload as any, config.jwtSecret, { expiresIn: config.jwtExpiresIn as any });
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, config.jwtSecret) as TokenPayload;
}
