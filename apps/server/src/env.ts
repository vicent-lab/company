import dotenv from 'dotenv';
import path from 'path';

// npm workspace scripts run with cwd set to this package (apps/server), not the repo
// root, so dotenv's default (look in process.cwd()) silently finds nothing here. Point
// it at the root .env explicitly.
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (!v) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v;
}

let loadedConfig: Record<string, any> | null = null;
try {
  loadedConfig = {
    env: process.env.NODE_ENV ?? 'development',
    port: Number(process.env.PORT ?? 4000),
    databaseUrl: required('DATABASE_URL', 'postgresql://dairy:local_dev_password@localhost:5432/dairy'),
    jwtSecret: required('JWT_SECRET'),
    jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '30m',
    refreshTokenExpiresInDays: Number(process.env.REFRESH_TOKEN_EXPIRES_IN_DAYS ?? 30),
    isLive: Boolean(process.env.DATABASE_URL),
    learningCycleIntervalHours: Number(process.env.LEARNING_CYCLE_INTERVAL_HOURS ?? 6),
    googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY ?? '',
    googleOAuthClientId: process.env.OAUTH_GOOGLE_CLIENT_ID ?? '',
    googleOAuthClientSecret: process.env.OAUTH_GOOGLE_CLIENT_SECRET ?? '',
    googleOAuthCallbackUrl: process.env.OAUTH_GOOGLE_CALLBACK_URL ?? '',
    microsoftOAuthClientId: process.env.OAUTH_MICROSOFT_CLIENT_ID ?? '',
    microsoftOAuthClientSecret: process.env.OAUTH_MICROSOFT_CLIENT_SECRET ?? '',
    microsoftOAuthCallbackUrl: process.env.OAUTH_MICROSOFT_CALLBACK_URL ?? '',
    appleOAuthClientId: process.env.OAUTH_APPLE_CLIENT_ID ?? '',
    appleOAuthTeamId: process.env.OAUTH_APPLE_TEAM_ID ?? '',
    appleOAuthKeyId: process.env.OAUTH_APPLE_KEY_ID ?? '',
    appleOAuthPrivateKey: process.env.OAUTH_APPLE_PRIVATE_KEY ?? '',
    appleOAuthCallbackUrl: process.env.OAUTH_APPLE_CALLBACK_URL ?? '',
    frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:5173',
  };
} catch (e) {
  console.error('Failed to load server configuration:', e);
  loadedConfig = {
    env: process.env.NODE_ENV ?? 'development',
    port: Number(process.env.PORT ?? 4000),
    databaseUrl: process.env.DATABASE_URL ?? 'postgresql://dairy:local_dev_password@localhost:5432/dairy',
    jwtSecret: '',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '30m',
    refreshTokenExpiresInDays: Number(process.env.REFRESH_TOKEN_EXPIRES_IN_DAYS ?? 30),
    isLive: Boolean(process.env.DATABASE_URL),
    learningCycleIntervalHours: Number(process.env.LEARNING_CYCLE_INTERVAL_HOURS ?? 6),
    googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY ?? '',
    googleOAuthClientId: process.env.OAUTH_GOOGLE_CLIENT_ID ?? '',
    googleOAuthClientSecret: process.env.OAUTH_GOOGLE_CLIENT_SECRET ?? '',
    googleOAuthCallbackUrl: process.env.OAUTH_GOOGLE_CALLBACK_URL ?? '',
    microsoftOAuthClientId: process.env.OAUTH_MICROSOFT_CLIENT_ID ?? '',
    microsoftOAuthClientSecret: process.env.OAUTH_MICROSOFT_CLIENT_SECRET ?? '',
    microsoftOAuthCallbackUrl: process.env.OAUTH_MICROSOFT_CALLBACK_URL ?? '',
    appleOAuthClientId: process.env.OAUTH_APPLE_CLIENT_ID ?? '',
    appleOAuthTeamId: process.env.OAUTH_APPLE_TEAM_ID ?? '',
    appleOAuthKeyId: process.env.OAUTH_APPLE_KEY_ID ?? '',
    appleOAuthPrivateKey: process.env.OAUTH_APPLE_PRIVATE_KEY ?? '',
    appleOAuthCallbackUrl: process.env.OAUTH_APPLE_CALLBACK_URL ?? '',
    frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:5173',
  };
}

export const config = loadedConfig as any;

export type AppConfig = typeof loadedConfig;
