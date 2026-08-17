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

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

let loadedConfig: Record<string, any> | null = null;
try {
  loadedConfig = {
    env: process.env.NODE_ENV ?? 'development',
    port: Number(process.env.PORT ?? 4000),
    databaseUrl: required('DATABASE_URL'),
    jwtSecret: required('JWT_SECRET'),
    jwtExpiresIn: optional('JWT_EXPIRES_IN', '30m'),
    refreshTokenExpiresInDays: Number(optional('REFRESH_TOKEN_EXPIRES_IN_DAYS', '30')),
    isLive: Boolean(process.env.DATABASE_URL),
    learningCycleIntervalHours: Number(optional('LEARNING_CYCLE_INTERVAL_HOURS', '6')),
    googleMapsApiKey: optional('GOOGLE_MAPS_API_KEY', ''),
    googleOAuthClientId: optional('OAUTH_GOOGLE_CLIENT_ID', ''),
    googleOAuthClientSecret: optional('OAUTH_GOOGLE_CLIENT_SECRET', ''),
    googleOAuthCallbackUrl: optional('OAUTH_GOOGLE_CALLBACK_URL', ''),
    microsoftOAuthClientId: optional('OAUTH_MICROSOFT_CLIENT_ID', ''),
    microsoftOAuthClientSecret: optional('OAUTH_MICROSOFT_CLIENT_SECRET', ''),
    microsoftOAuthCallbackUrl: optional('OAUTH_MICROSOFT_CALLBACK_URL', ''),
    appleOAuthClientId: optional('OAUTH_APPLE_CLIENT_ID', ''),
    appleOAuthTeamId: optional('OAUTH_APPLE_TEAM_ID', ''),
    appleOAuthKeyId: optional('OAUTH_APPLE_KEY_ID', ''),
    appleOAuthPrivateKey: optional('OAUTH_APPLE_PRIVATE_KEY', ''),
    appleOAuthCallbackUrl: optional('OAUTH_APPLE_CALLBACK_URL', ''),
    frontendUrl: optional('FRONTEND_URL', 'http://localhost:5173'),
  };
} catch (e) {
  console.error('Failed to load server configuration:', e);
  loadedConfig = {
    env: process.env.NODE_ENV ?? 'development',
    port: Number(process.env.PORT ?? 4000),
    databaseUrl: process.env.DATABASE_URL ?? '',
    jwtSecret: process.env.JWT_SECRET ?? '',
    jwtExpiresIn: optional('JWT_EXPIRES_IN', '30m'),
    refreshTokenExpiresInDays: Number(optional('REFRESH_TOKEN_EXPIRES_IN_DAYS', '30')),
    isLive: Boolean(process.env.DATABASE_URL),
    learningCycleIntervalHours: Number(optional('LEARNING_CYCLE_INTERVAL_HOURS', '6')),
    googleMapsApiKey: optional('GOOGLE_MAPS_API_KEY', ''),
    googleOAuthClientId: optional('OAUTH_GOOGLE_CLIENT_ID', ''),
    googleOAuthClientSecret: optional('OAUTH_GOOGLE_CLIENT_SECRET', ''),
    googleOAuthCallbackUrl: optional('OAUTH_GOOGLE_CALLBACK_URL', ''),
    microsoftOAuthClientId: optional('OAUTH_MICROSOFT_CLIENT_ID', ''),
    microsoftOAuthClientSecret: optional('OAUTH_MICROSOFT_CLIENT_SECRET', ''),
    microsoftOAuthCallbackUrl: optional('OAUTH_MICROSOFT_CALLBACK_URL', ''),
    appleOAuthClientId: optional('OAUTH_APPLE_CLIENT_ID', ''),
    appleOAuthTeamId: optional('OAUTH_APPLE_TEAM_ID', ''),
    appleOAuthKeyId: optional('OAUTH_APPLE_KEY_ID', ''),
    appleOAuthPrivateKey: optional('OAUTH_APPLE_PRIVATE_KEY', ''),
    appleOAuthCallbackUrl: optional('OAUTH_APPLE_CALLBACK_URL', ''),
    frontendUrl: optional('FRONTEND_URL', 'http://localhost:5173'),
  };
}

export const config = loadedConfig as any;

export type AppConfig = typeof loadedConfig;
