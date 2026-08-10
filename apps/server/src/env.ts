import dotenv from 'dotenv';
import path from 'path';

// npm workspace scripts run with cwd set to this package (apps/server), not the repo
// root, so dotenv's default (look in process.cwd()) silently finds nothing here. Point
// it at the root .env explicitly.
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (!v) throw new Error(`Missing required environment variable: ${name}`);
  return v;
}

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required('DATABASE_URL', 'postgresql://dairy:local_dev_password@localhost:5432/dairy'),
  jwtSecret: required('JWT_SECRET', 'development-only-secret-change-me'),
  // Access tokens are now short-lived; a long-lived refresh token (below) is what keeps a
  // session going, and can be revoked (logout, password reset) unlike the old 7-day JWT.
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '30m',
  refreshTokenExpiresInDays: Number(process.env.REFRESH_TOKEN_EXPIRES_IN_DAYS ?? 30),
  isLive: Boolean(process.env.DATABASE_URL),
  learningCycleIntervalHours: Number(process.env.LEARNING_CYCLE_INTERVAL_HOURS ?? 6),
  googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY ?? '',
};

export type AppConfig = typeof config;
