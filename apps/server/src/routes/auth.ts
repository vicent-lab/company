import { Router, Request } from 'express';
import { z } from 'zod';
import { query, getClient } from '../db/index.js';
import { signToken, signMfaPendingToken, verifyMfaPendingToken } from '../lib/jwt.js';
import { generateToken, hashToken, generateCode } from '../lib/tokens.js';
import { generateTotpSecret, totpAuthUrl, verifyTotp } from '../lib/totp.js';
import { generateChallenge } from '../lib/captcha.js';
import { HttpError, asyncHandler } from '../lib/errors.js';
import { requireAuth, audit } from '../middleware/auth.js';
import { config } from '../env.js';
import { ACCOUNT_TYPES, ACCOUNT_TYPE_CONFIG } from '../lib/account-types.js';
import { provisionDemoFarm } from '../lib/provision-demo-farm.js';
import crypto from 'crypto';

const router = Router();

// Simple in-memory rate limiter for sensitive auth endpoints. For production, replace
// with Redis or a dedicated rate-limiting store so limits are shared across instances.
interface RateLimitEntry { count: number; firstAttempt: number; }
const rateLimits = new Map<string, RateLimitEntry>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 10;

function rateLimit(key: string): void {
  const now = Date.now();
  const entry = rateLimits.get(key);
  if (!entry || now - entry.firstAttempt > RATE_LIMIT_WINDOW_MS) {
    rateLimits.set(key, { count: 1, firstAttempt: now });
    return;
  }
  entry.count += 1;
  if (entry.count > RATE_LIMIT_MAX) {
    throw new HttpError(429, 'Too many attempts. Please try again later.');
  }
}

// Brute-force controls on password login: a challenge is demanded once too many attempts
// have failed, and the account locks outright well before a script could exhaust a
// meaningful fraction of the password space.
const CAPTCHA_AFTER_ATTEMPTS = 3;
const LOCK_AFTER_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

// ---------- helpers ----------

async function permissionsForRole(roleName: string): Promise<string[]> {
  const { rows } = await query<{ code: string }>(
    `SELECT p.code FROM permissions p JOIN role_permissions rp ON rp.permission_id=p.id
     JOIN roles r ON r.id=rp.role_id WHERE r.name=$1`,
    [roleName]
  );
  return rows.map((p) => p.code);
}

async function farmsForUser(userId: string, activeFarmId?: string) {
  const { rows } = await query<{ farm_id: string; farm_name: string; role: string; is_default: boolean }>(
    `SELECT uf.farm_id, f.name AS farm_name, r.name AS role, uf.is_default
     FROM user_farms uf
     JOIN farms f ON f.id = uf.farm_id
     JOIN roles r ON r.id = uf.role_id
     WHERE uf.user_id = $1
     ORDER BY uf.is_default DESC, f.name`,
    [userId]
  );
  return rows.map((r) => ({
    farmId: r.farm_id,
    farmName: r.farm_name,
    role: r.role,
    isDefault: r.is_default,
    isActive: r.farm_id === activeFarmId,
  }));
}

// Issues a fresh access token + a rotated, DB-backed refresh token for one (user, farm)
// context. Every login/refresh/switch-farm goes through here so revocation (logout,
// password reset) and the farm-scoped session record stay consistent in one place.
// farmId/role are null for an account that hasn't created or joined a farm yet.
async function issueSession(opts: {
  userId: string; email: string; farmId: string | null; role: string | null; permissions: string[];
  userAgent?: string; replaceSessionId?: string;
}) {
  const token = signToken({ sub: opts.userId, email: opts.email, farmId: opts.farmId, role: opts.role, permissions: opts.permissions });
  const refreshToken = generateToken();
  const expiresAt = new Date(Date.now() + config.refreshTokenExpiresInDays * 86400000);
  const { rows } = await query(
    `INSERT INTO sessions (user_id, farm_id, token_hash, expires_at, user_agent) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [opts.userId, opts.farmId, hashToken(refreshToken), expiresAt, opts.userAgent ?? null]
  );
  if (opts.replaceSessionId) {
    await query(`UPDATE sessions SET revoked_at = now(), replaced_by = $1 WHERE id = $2`, [rows[0].id, opts.replaceSessionId]);
  }
  return { token, refreshToken };
}

// Picks which farm a session should be scoped to: whichever one it was last on, else the
// account's default, else its first membership, else null (no farms at all yet).
function pickActiveFarm(farms: Awaited<ReturnType<typeof farmsForUser>>, preferFarmId?: string | null) {
  return farms.find((f) => f.farmId === preferFarmId) ?? farms.find((f) => f.isDefault) ?? farms[0] ?? null;
}

async function findActiveSession(refreshToken: string) {
  const { rows } = await query(
    `SELECT id, user_id, farm_id FROM sessions WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()`,
    [hashToken(refreshToken)]
  );
  return rows[0] as { id: string; user_id: string; farm_id: string } | undefined;
}

// No email provider is wired up — the link is logged, and returned directly in the
// response outside production so the flow is testable without one. Swap this for a real
// provider (SES/SendGrid/Resend) before shipping to real users.
function deliverLink(kind: string, email: string, token: string, path: string) {
  const link = `${path}?token=${token}`;
  console.log(`[auth] ${kind} for ${email}: ${link}`);
  return config.env !== 'production' ? link : undefined;
}

function deliverCode(kind: string, email: string, code: string) {
  console.log(`[auth] ${kind} for ${email}: ${code}`);
  return config.env !== 'production' ? code : undefined;
}

function deliverLoginAlert(email: string, userAgent?: string) {
  const message = `New login to your account from ${userAgent || 'an unknown device'}.`;
  console.log(`[auth] login alert for ${email}: ${message}`);
  return config.env !== 'production' ? message : undefined;
}

// Shared by every path that completes a login (password, 2FA verification, phone OTP) —
// resolves which farm the session resumes on, issues the token pair, and fires a "new
// device" alert the first time this exact user-agent has ever signed in successfully.
async function finishLogin(
  user: { id: string; email: string; name: string; account_type: string | null; email_verified_at: Date | null; is_super_admin?: boolean },
  userAgent: string | undefined
) {
  const { rows: existingUA } = await query(
    `SELECT 1 FROM sessions WHERE user_id = $1 AND user_agent = $2 AND revoked_at IS NULL LIMIT 1`,
    [user.id, userAgent ?? null]
  );
  const isNewDevice = existingUA.length === 0;

  const { rows: lastFarmRows } = await query(
    `SELECT farm_id FROM sessions WHERE user_id=$1 AND farm_id IS NOT NULL ORDER BY created_at DESC LIMIT 1`,
    [user.id]
  );
  const farms = await farmsForUser(user.id);
  const activeFarm = pickActiveFarm(farms, lastFarmRows[0]?.farm_id);
  const permissions = activeFarm ? await permissionsForRole(activeFarm.role) : [];
  const { token, refreshToken } = await issueSession({
    userId: user.id, email: user.email, farmId: activeFarm?.farmId ?? null, role: activeFarm?.role ?? null, permissions, userAgent,
  });

  const devLoginAlert = isNewDevice ? deliverLoginAlert(user.email, userAgent) : undefined;

  return {
    token, refreshToken,
    user: { id: user.id, name: user.name, email: user.email, farmId: activeFarm?.farmId ?? null, role: activeFarm?.role ?? null, accountType: user.account_type, emailVerified: !!user.email_verified_at, isSuperAdmin: !!user.is_super_admin },
    farms: farms.map((f) => ({ ...f, isActive: f.farmId === activeFarm?.farmId })),
    ...(devLoginAlert ? { devLoginAlert } : {}),
  };
}

async function recordLoginAttempt(userId: string | null, email: string, success: boolean, reason: string, req: Request) {
  await query(
    `INSERT INTO login_history (user_id, email, success, reason, ip_address, user_agent) VALUES ($1,$2,$3,$4,$5,$6)`,
    [userId, email, success, reason, req.ip ?? null, req.header('user-agent') ?? null]
  );
}

// ---------- register ----------

// Registration no longer creates or joins a farm by itself (it used to silently join
// "whichever farm is oldest," a demo-only shortcut). An account starts farmless — the
// owner path creates one afterward (POST /farms); the team-member path waits to be
// invited, or redeems an invite right here via inviteToken.
const registerSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(1),
  country: z.string().min(1),
  password: z.string().min(8),
  accountType: z.enum(ACCOUNT_TYPES as [string, ...string[]]),
  termsAccepted: z.literal(true),
  inviteToken: z.string().optional(),
});

router.post('/register', asyncHandler(async (req, res) => {
  rateLimit(`register:${req.ip}`);
  const body = registerSchema.parse(req.body);
  const { rows: existing } = await query('SELECT id FROM users WHERE email = $1', [body.email]);
  if (existing.length) throw new HttpError(409, 'Email already registered');

  // An invite token resolves who invited them, to what farm, and as what role, before we
  // touch the users table — so a bad/expired token fails before any account is created.
  let invitation: { id: string; farm_id: string; role_id: string; role_name: string } | null = null;
  if (body.inviteToken) {
    const { rows } = await query<{ id: string; farm_id: string; role_id: string; role_name: string }>(
      `SELECT fi.id, fi.farm_id, fi.role_id, r.name as role_name
       FROM farm_invitations fi JOIN roles r ON r.id = fi.role_id
       WHERE fi.token_hash = $1 AND fi.accepted_at IS NULL AND fi.expires_at > now() AND lower(fi.email) = lower($2)`,
      [hashToken(body.inviteToken), body.email]
    );
    if (!rows[0]) throw new HttpError(400, 'This invitation is invalid, expired, or was sent to a different email address');
    invitation = rows[0];
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');
    const fullName = `${body.firstName} ${body.lastName}`.trim();
    const u = await client.query(
      `INSERT INTO users (farm_id, role_id, name, first_name, last_name, email, phone, country, password_hash, email_verified_at, account_type, terms_accepted_at)
       VALUES (NULL, NULL, $1,$2,$3,$4,$5,$6,crypt($7,gen_salt('bf')),NULL,$8,now())
       RETURNING id, email, name, first_name, last_name`,
      [fullName, body.firstName, body.lastName, body.email, body.phone, body.country, body.password, body.accountType]
    );
    const user = u.rows[0];

    let farmId: string | null = null;
    let role: string | null = null;
    if (invitation) {
      await client.query(
        `INSERT INTO user_farms (user_id, farm_id, role_id, is_default) VALUES ($1,$2,$3,true)`,
        [user.id, invitation.farm_id, invitation.role_id]
      );
      await client.query(`UPDATE farm_invitations SET accepted_at = now() WHERE id = $1`, [invitation.id]);
      await client.query(`UPDATE users SET farm_id=$1, role_id=$2 WHERE id=$3`, [invitation.farm_id, invitation.role_id, user.id]);
      farmId = invitation.farm_id;
      role = invitation.role_name;
    }
    await client.query('COMMIT');

    // Auto-provision a populated sandbox for demo signups, once the user row is safely
    // committed. This runs on separate connections from the transaction above (it's a
    // couple dozen small inserts) — best-effort, not something that needs to be atomic
    // with account creation.
    if (!invitation && ACCOUNT_TYPE_CONFIG[body.accountType as keyof typeof ACCOUNT_TYPE_CONFIG].flow === 'demo') {
      const demo = await provisionDemoFarm(user.first_name);
      const adminRole = await query<{ id: string }>(`SELECT id FROM roles WHERE name='administrator'`);
      await query(`INSERT INTO user_farms (user_id, farm_id, role_id, is_default) VALUES ($1,$2,$3,true)`, [user.id, demo.farmId, adminRole.rows[0].id]);
      await query(`UPDATE users SET farm_id=$1, role_id=$2 WHERE id=$3`, [demo.farmId, adminRole.rows[0].id, user.id]);
      farmId = demo.farmId;
      role = 'administrator';
    }

    const permissions = role ? await permissionsForRole(role) : [];
    const { token, refreshToken } = await issueSession({ userId: user.id, email: user.email, farmId, role, permissions, userAgent: req.header('user-agent') });

    const verifyCode = generateCode();
    await query(
      `INSERT INTO email_verification_tokens (user_id, token_hash, expires_at) VALUES ($1,$2, now() + interval '15 minutes')`,
      [user.id, hashToken(verifyCode)]
    );
    const devVerifyCode = deliverCode('email verification code', user.email, verifyCode);

    res.status(201).json({
      token, refreshToken,
      user: { id: user.id, name: user.name, email: user.email, farmId, role, accountType: body.accountType, emailVerified: false, isSuperAdmin: false },
      farms: await farmsForUser(user.id, farmId ?? undefined),
      ...(devVerifyCode ? { devVerifyCode } : {}),
    });
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}));

// ---------- login ----------

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  captchaToken: z.string().optional(),
  captchaAnswer: z.string().optional(),
});

router.post('/login', asyncHandler(async (req, res) => {
  rateLimit(`login:${req.ip}`);
  const body = loginSchema.parse(req.body);
  const { rows } = await query<{
    id: string; email: string; name: string; password_hash: string; email_verified_at: Date | null; account_type: string | null;
    failed_login_count: number; locked_until: Date | null; totp_enabled: boolean; totp_secret: string | null; is_super_admin: boolean;
  }>(
    `SELECT id, email, name, password_hash, email_verified_at, account_type,
            failed_login_count, locked_until, totp_enabled, totp_secret, is_super_admin
     FROM users WHERE email = $1 AND is_active = true`,
    [body.email]
  );
  const user = rows[0];

  // A locked account is rejected before touching the password at all — no point paying
  // the bcrypt cost, and it gives the legitimate owner a clear "try again in N minutes"
  // instead of a generic failure that looks like a typo.
  if (user?.locked_until && new Date(user.locked_until) > new Date()) {
    await recordLoginAttempt(user.id, body.email, false, 'locked', req);
    const minutesLeft = Math.ceil((new Date(user.locked_until).getTime() - Date.now()) / 60000);
    throw new HttpError(423, `Too many failed attempts. Try again in ${minutesLeft} minute${minutesLeft === 1 ? '' : 's'}.`);
  }

  const captchaRequired = (user?.failed_login_count ?? 0) >= CAPTCHA_AFTER_ATTEMPTS;
  if (captchaRequired) {
    if (!body.captchaToken || !body.captchaAnswer) {
      return res.status(400).json({ error: 'Please complete the challenge below.', captchaRequired: true });
    }
    const { rows: challengeRows } = await query(
      `SELECT id, answer_hash FROM captcha_challenges WHERE token_hash = $1 AND consumed_at IS NULL AND expires_at > now()`,
      [hashToken(body.captchaToken)]
    );
    const challenge = challengeRows[0];
    if (!challenge || challenge.answer_hash !== hashToken(body.captchaAnswer.trim())) {
      return res.status(400).json({ error: 'That answer was incorrect — try a new challenge.', captchaRequired: true });
    }
    await query(`UPDATE captcha_challenges SET consumed_at = now() WHERE id = $1`, [challenge.id]);
  }

  const ok = user && (await query('SELECT crypt($1, $2) = $2 AS valid', [body.password, user.password_hash])).rows[0].valid;
  if (!ok) {
    if (user) {
      const newCount = user.failed_login_count + 1;
      const locked = newCount >= LOCK_AFTER_ATTEMPTS;
      await query(
        `UPDATE users SET failed_login_count = $1, locked_until = $2 WHERE id = $3`,
        [locked ? 0 : newCount, locked ? new Date(Date.now() + LOCK_MINUTES * 60000) : null, user.id]
      );
      await recordLoginAttempt(user.id, body.email, false, locked ? 'locked' : 'invalid_password', req);
      if (locked) throw new HttpError(423, `Too many failed attempts. Try again in ${LOCK_MINUTES} minutes.`);
      return res.status(401).json({ error: 'Invalid credentials', captchaRequired: newCount >= CAPTCHA_AFTER_ATTEMPTS });
    }
    throw new HttpError(401, 'Invalid credentials');
  }

  await query(`UPDATE users SET failed_login_count = 0, locked_until = NULL WHERE id = $1`, [user.id]);

  if (user.totp_enabled) {
    await recordLoginAttempt(user.id, body.email, true, 'password_ok_awaiting_2fa', req);
    return res.json({ mfaRequired: true, mfaToken: signMfaPendingToken(user.id) });
  }

  await recordLoginAttempt(user.id, body.email, true, 'success', req);
  res.json(await finishLogin(user, req.header('user-agent')));
}));

// ---------- CAPTCHA (self-hosted stand-in until a real reCAPTCHA/hCaptcha key exists) ----------

router.get('/captcha', asyncHandler(async (_req, res) => {
  const { question, answer } = generateChallenge();
  const token = generateToken();
  await query(
    `INSERT INTO captcha_challenges (token_hash, answer_hash, expires_at) VALUES ($1,$2, now() + interval '5 minutes')`,
    [hashToken(token), hashToken(answer)]
  );
  res.json({ token, question: `${question} = ?` });
}));

// ---------- two-factor authentication (completing a login that returned mfaRequired) ----------

const mfaVerifySchema = z.object({ mfaToken: z.string().min(1), code: z.string().length(6) });

router.post('/2fa/verify-login', asyncHandler(async (req, res) => {
  rateLimit(`2fa-verify:${req.ip}`);
  const body = mfaVerifySchema.parse(req.body);
  let userId: string;
  try {
    userId = verifyMfaPendingToken(body.mfaToken).sub;
  } catch {
    throw new HttpError(401, 'This verification step has expired — please sign in again');
  }
  const { rows } = await query<{
    id: string; email: string; name: string; account_type: string | null; email_verified_at: Date | null; totp_secret: string | null; is_super_admin: boolean;
  }>(
    `SELECT id, email, name, account_type, email_verified_at, totp_secret, is_super_admin FROM users WHERE id = $1 AND is_active = true`,
    [userId]
  );
  const user = rows[0];
  if (!user || !user.totp_secret || !verifyTotp(user.totp_secret, body.code)) {
    await recordLoginAttempt(userId, user?.email ?? 'unknown', false, '2fa_invalid', req);
    throw new HttpError(401, 'Incorrect code');
  }
  await recordLoginAttempt(user.id, user.email, true, '2fa_verified', req);
  res.json(await finishLogin(user, req.header('user-agent')));
}));

// ---------- phone number + OTP login ----------

const requestPhoneOtpSchema = z.object({ phone: z.string().min(1) });

router.post('/phone/request-otp', asyncHandler(async (req, res) => {
  rateLimit(`phone-otp:${req.ip}`);
  const { phone } = requestPhoneOtpSchema.parse(req.body);
  const { rows } = await query('SELECT id FROM users WHERE phone = $1 AND is_active = true', [phone]);
  let devOtpCode: string | undefined;
  if (rows[0]) {
    const code = generateCode();
    await query(
      `INSERT INTO phone_otp_tokens (user_id, phone, code_hash, expires_at) VALUES ($1,$2,$3, now() + interval '10 minutes')`,
      [rows[0].id, phone, hashToken(code)]
    );
    devOtpCode = deliverCode('phone login code', phone, code);
  }
  // Same response whether or not the phone number has an account — avoids leaking which
  // numbers are registered, same reasoning as forgot-password.
  res.json({ message: 'If that phone number has an account, a login code has been sent.', ...(devOtpCode ? { devOtpCode } : {}) });
}));

const verifyPhoneOtpSchema = z.object({ phone: z.string().min(1), code: z.string().length(6) });

router.post('/phone/verify-otp', asyncHandler(async (req, res) => {
  rateLimit(`phone-verify:${req.ip}`);
  const body = verifyPhoneOtpSchema.parse(req.body);
  const { rows } = await query(
    `SELECT po.id, u.id as user_id, u.email, u.name, u.account_type, u.email_verified_at, u.is_super_admin
     FROM phone_otp_tokens po JOIN users u ON u.id = po.user_id
     WHERE po.phone = $1 AND po.code_hash = $2 AND po.expires_at > now()
     ORDER BY po.created_at DESC LIMIT 1`,
    [body.phone, hashToken(body.code)]
  );
  const row = rows[0];
  if (!row) throw new HttpError(400, 'That code is incorrect or has expired');
  await query(`DELETE FROM phone_otp_tokens WHERE user_id = $1`, [row.user_id]);
  await recordLoginAttempt(row.user_id, row.email, true, 'phone_otp', req);
  res.json(await finishLogin({ id: row.user_id, email: row.email, name: row.name, account_type: row.account_type, email_verified_at: row.email_verified_at, is_super_admin: row.is_super_admin }, req.header('user-agent')));
}));

// ---------- OAuth (Google / Microsoft / Apple) ----------

const OAUTH_PROVIDERS = ['google', 'microsoft', 'apple'] as const;
type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];

function oauthClientId(provider: OAuthProvider): string | undefined {
  return process.env[`OAUTH_${provider.toUpperCase()}_CLIENT_ID`];
}

function oauthClientSecret(provider: OAuthProvider): string | undefined {
  return process.env[`OAUTH_${provider.toUpperCase()}_CLIENT_SECRET`];
}

function oauthCallbackUrl(provider: OAuthProvider): string | undefined {
  return process.env[`OAUTH_${provider.toUpperCase()}_CALLBACK_URL`];
}

// In-memory OAuth state store. For production, replace with Redis or database.
interface OAuthState {
  codeVerifier: string;
  redirectUri: string;
  createdAt: number;
  linkingUserId?: string;
}
const oauthStates = new Map<string, OAuthState>();
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function generateOAuthState(redirectUri: string, linkingUserId?: string): string {
  const state = generateToken();
  const codeVerifier = generateToken();
  oauthStates.set(state, { codeVerifier, redirectUri, createdAt: Date.now(), linkingUserId });
  // Clean up expired states periodically
  setTimeout(() => oauthStates.delete(state), OAUTH_STATE_TTL_MS);
  return state;
}

function consumeOAuthState(state: string): OAuthState | undefined {
  const entry = oauthStates.get(state);
  if (!entry) return undefined;
  oauthStates.delete(state);
  if (Date.now() - entry.createdAt > OAUTH_STATE_TTL_MS) return undefined;
  return entry;
}

function base64UrlEncode(buffer: Buffer): string {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function exchangeCodeForTokens(provider: OAuthProvider, code: string, codeVerifier: string): Promise<any> {
  if (provider === 'google') {
    const clientId = oauthClientId('google');
    const clientSecret = oauthClientSecret('google');
    const callbackUrl = oauthCallbackUrl('google');
    if (!clientId || !clientSecret || !callbackUrl) throw new HttpError(500, 'Google OAuth is not configured on the server');

    const params = new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: callbackUrl,
      grant_type: 'authorization_code',
      code_verifier: codeVerifier,
    });

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      throw new HttpError(400, `Google token exchange failed: ${text}`);
    }

    const tokens = await tokenRes.json() as any;
    const userinfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!userinfoRes.ok) {
      throw new HttpError(400, 'Failed to fetch Google user info');
    }

    const profile = await userinfoRes.json() as any;
    return { profile, tokens };
  }

  if (provider === 'microsoft') {
    const clientId = oauthClientId('microsoft');
    const clientSecret = oauthClientSecret('microsoft');
    const callbackUrl = oauthCallbackUrl('microsoft');
    if (!clientId || !clientSecret || !callbackUrl) throw new HttpError(500, 'Microsoft OAuth is not configured on the server');

    const params = new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: callbackUrl,
      grant_type: 'authorization_code',
      code_verifier: codeVerifier,
      scope: 'openid email profile offline_access',
    });

    const tokenRes = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      throw new HttpError(400, `Microsoft token exchange failed: ${text}`);
    }

    const tokens = await tokenRes.json() as any;
    const userinfoRes = await fetch('https://graph.microsoft.com/oidc/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!userinfoRes.ok) {
      throw new HttpError(400, 'Failed to fetch Microsoft user info');
    }

    const profile = await userinfoRes.json() as any;
    return { profile, tokens };
  }

  if (provider === 'apple') {
    const clientId = oauthClientId('apple');
    const teamId = process.env.OAUTH_APPLE_TEAM_ID;
    const keyId = process.env.OAUTH_APPLE_KEY_ID;
    const privateKey = process.env.OAUTH_APPLE_PRIVATE_KEY;
    const callbackUrl = oauthCallbackUrl('apple');
    if (!clientId || !teamId || !keyId || !privateKey || !callbackUrl) throw new HttpError(500, 'Apple OAuth is not configured on the server');

    const clientSecret = generateAppleClientSecret(clientId, teamId, keyId, privateKey);

    const params = new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: callbackUrl,
      grant_type: 'authorization_code',
      code_verifier: codeVerifier,
    });

    const tokenRes = await fetch('https://appleid.apple.com/auth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      throw new HttpError(400, `Apple token exchange failed: ${text}`);
    }

    const tokens = await tokenRes.json() as any;
    const idToken = tokens.id_token as string | undefined;
    if (!idToken) throw new HttpError(400, 'Apple did not return an id_token');

    const profile = decodeAppleIdToken(idToken);
    return { profile, tokens };
  }

  throw new HttpError(501, `${provider} OAuth not implemented`);
}

function generateAppleClientSecret(clientId: string, teamId: string, keyId: string, privateKeyPem: string): string {
  const privateKey = crypto.createPrivateKey(privateKeyPem);
  const header = base64UrlEncode(Buffer.from(JSON.stringify({ alg: 'ES256', kid: keyId, typ: 'JWT' })));
  const now = Math.floor(Date.now() / 1000);
  const payload = base64UrlEncode(Buffer.from(JSON.stringify({
    iss: teamId,
    iat: now,
    exp: now + 1800,
    aud: 'https://appleid.apple.com',
    sub: clientId,
  })));

  const data = `${header}.${payload}`;
  const sign = crypto.createSign('SHA256');
  sign.update(data);
  sign.end();
  const signature = sign.sign(privateKey, 'base64');

  // Convert DER signature to IEEE P1363 format for ES256
  const derBuffer = Buffer.from(signature, 'base64');
  const ieeeSignature = derToIeeeP1363(derBuffer, 32);
  const signatureB64 = base64UrlEncode(ieeeSignature);

  return `${data}.${signatureB64}`;
}

function derToIeeeP1363(der: Buffer, keySize: number): Buffer {
  if (der[0] !== 0x30) throw new Error('Invalid DER signature');
  const seqLen = der[1];
  let offset = 2;

  if (der[offset] !== 0x02) throw new Error('Invalid DER signature');
  const rLen = der[offset + 1];
  const r = der.slice(offset + 2, offset + 2 + rLen);
  offset += 2 + rLen;

  if (der[offset] !== 0x02) throw new Error('Invalid DER signature');
  const sLen = der[offset + 1];
  const s = der.slice(offset + 2, offset + 2 + sLen);

  const paddedR = Buffer.alloc(keySize, 0);
  const paddedS = Buffer.alloc(keySize, 0);
  r.copy(paddedR, keySize - r.length);
  s.copy(paddedS, keySize - s.length);

  return Buffer.concat([paddedR, paddedS]);
}

function decodeAppleIdToken(idToken: string): any {
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new HttpError(400, 'Invalid Apple id_token');
  const payload = parts[1];
  // Add padding if needed
  const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
  const decoded = Buffer.from(padded, 'base64').toString('utf8');
  return JSON.parse(decoded);
}

async function findOrCreateOAuthUser(provider: OAuthProvider, profile: any, appleName?: string, linkingUserId?: string): Promise<{ userId: string; email: string; name: string; isNew: boolean; ambiguity?: boolean }> {
  const { rows: existingLinks } = await query(
    `SELECT user_id FROM oauth_accounts WHERE provider=$1 AND provider_account_id=$2`,
    [provider, profile.sub]
  );

  if (existingLinks.length > 0) {
    const linkedUserId = existingLinks[0].user_id;
    if (linkingUserId && linkedUserId !== linkingUserId) {
      return { userId: '', email: '', name: '', isNew: false, ambiguity: true };
    }
    const { rows: userRows } = await query(`SELECT email, name FROM users WHERE id=$1`, [linkedUserId]);
    const user = userRows[0];
    return { userId: linkedUserId, email: user.email, name: user.name, isNew: false };
  }

  if (linkingUserId) {
    const { rows: existingUsers } = await query(`SELECT id FROM users WHERE email=$1`, [profile.email]);
    if (existingUsers.length > 0 && existingUsers[0].id !== linkingUserId) {
      return { userId: '', email: '', name: '', isNew: false, ambiguity: true };
    }
    const displayName = appleName || profile.name || profile.email || '';
    const { rows: newLink } = await query(
      `INSERT INTO oauth_accounts (user_id, provider, provider_account_id, email, name) VALUES ($1, $2, $3, $4, $5) RETURNING user_id`,
      [linkingUserId, provider, profile.sub, profile.email, displayName]
    );
    const { rows: userRows } = await query(`SELECT email, name FROM users WHERE id=$1`, [linkingUserId]);
    const user = userRows[0];
    return { userId: linkingUserId, email: user.email, name: user.name, isNew: false };
  }

  let userId: string;
  let isNew = false;

  const emailVerified = profile.email_verified === true;

  const { rows: existingUsers } = await query(`SELECT id FROM users WHERE email=$1`, [profile.email]);
  if (existingUsers.length > 0) {
    if (!emailVerified || linkingUserId) {
      if (linkingUserId && existingUsers[0].id !== linkingUserId) {
        return { userId: '', email: '', name: '', isNew: false, ambiguity: true };
      }
      if (!emailVerified && !linkingUserId) {
        return { userId: '', email: '', name: '', isNew: false, ambiguity: true };
      }
    }
    userId = existingUsers[0].id;
  } else {
    const displayName = appleName || profile.name || profile.email || '';
    const { rows: newUser } = await query(
      `INSERT INTO users (email, name, account_type, password_hash) VALUES ($1, $2, $3, $4) RETURNING id`,
      [profile.email, displayName, 'farm_owner', '']
    );
    userId = newUser[0].id;
    isNew = true;
  }

  await query(
    `INSERT INTO oauth_accounts (user_id, provider, provider_account_id, email, name) VALUES ($1, $2, $3, $4, $5)`,
    [userId, provider, profile.sub, profile.email, appleName || profile.name || null]
  );

  const { rows: userRows } = await query(`SELECT email, name FROM users WHERE id=$1`, [userId]);
  const user = userRows[0];
  return { userId, email: user.email, name: user.name, isNew };
}

router.get('/oauth/:provider', asyncHandler(async (req, res) => {
  const provider = req.params.provider as OAuthProvider;
  if (!OAUTH_PROVIDERS.includes(provider)) throw new HttpError(404, 'Unknown provider');

  const clientId = oauthClientId(provider);
  const callbackUrl = oauthCallbackUrl(provider);
  if (!clientId || !callbackUrl) {
    return res.json({ enabled: false, message: `${provider[0].toUpperCase()}${provider.slice(1)} login isn't configured yet.` });
  }

  const linkingUserId = (req.query.linkUserId as string | undefined) || undefined;
  const state = generateOAuthState(callbackUrl, linkingUserId);
  const codeVerifier = oauthStates.get(state)!.codeVerifier;
  const codeChallenge = base64UrlEncode(crypto.createHash('sha256').update(codeVerifier).digest());

  let authUrl: string;
  if (provider === 'google') {
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: callbackUrl,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      access_type: 'offline',
      prompt: 'consent',
    });
    authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  } else if (provider === 'microsoft') {
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: callbackUrl,
      response_type: 'code',
      scope: 'openid email profile offline_access',
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      response_mode: 'query',
    });
    authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;
  } else {
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: callbackUrl,
      response_type: 'code',
      scope: 'openid email name',
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      response_mode: 'query',
    });
    authUrl = `https://appleid.apple.com/auth/authorize?${params.toString()}`;
  }

  res.redirect(authUrl);
}));

router.get('/oauth/:provider/callback', asyncHandler(async (req, res) => {
  const provider = req.params.provider as OAuthProvider;
  if (provider !== 'google' && provider !== 'microsoft' && provider !== 'apple') throw new HttpError(404, 'Not configured');

  const { code, state, error: oauthError, user: appleUser } = req.query as any;
  if (oauthError) {
    return res.redirect(`/#/login?error=oauth_denied`);
  }
  if (!code || !state) throw new HttpError(400, 'Missing code or state');

  const stateEntry = consumeOAuthState(state as string);
  if (!stateEntry) {
    return res.redirect(`/#/login?error=invalid_state`);
  }

  const { profile } = await exchangeCodeForTokens(provider, code as string, stateEntry.codeVerifier);

  // Apple may provide the user's name in the authorization response on first login.
  // It is passed as a base64url-encoded JSON string in the `user` query param.
  let appleName: string | undefined;
  if (provider === 'apple' && appleUser) {
    try {
      const padded = (appleUser as string) + '='.repeat((4 - ((appleUser as string).length % 4)) % 4);
      const decoded = JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
      if (decoded.name) {
        const firstName = decoded.name.firstName || '';
        const lastName = decoded.name.lastName || '';
        appleName = `${firstName} ${lastName}`.trim() || undefined;
      }
    } catch {
      // ignore malformed user payload
    }
  }

  const linkingUserId = stateEntry.linkingUserId;
  const { userId, email, name, isNew, ambiguity } = await findOrCreateOAuthUser(provider, profile, appleName, linkingUserId);

  if (ambiguity) {
    return res.redirect(`/#/login?error=oauth_ambiguity&provider=${provider}`);
  }

  const { rows: lastFarmRows } = await query(
    `SELECT farm_id FROM sessions WHERE user_id=$1 AND farm_id IS NOT NULL ORDER BY created_at DESC LIMIT 1`,
    [userId]
  );
  const farms = await farmsForUser(userId);
  const active = pickActiveFarm(farms, lastFarmRows[0]?.farm_id);
  const permissions = active ? await permissionsForRole(active.role) : [];
  const { token, refreshToken } = await issueSession({
    userId,
    email,
    farmId: active?.farmId ?? null,
    role: active?.role ?? null,
    permissions,
    userAgent: req.header('user-agent'),
  });

  await audit({ id: userId, email, name, farmId: active?.farmId ?? null, role: active?.role ?? null, permissions, isSuperAdmin: false }, 'login', 'oauth', userId, { provider, isNew, linking: !!linkingUserId });

  const frontendBase = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/#/oauth-callback`;
  const params = new URLSearchParams();
  params.set('token', token);
  params.set('refreshToken', refreshToken);
  params.set('isNew', isNew ? 'true' : 'false');
  params.set('linking', linkingUserId ? 'true' : 'false');
  res.redirect(`${frontendBase}?${params.toString()}`);
}));

// ---------- refresh ----------

const refreshSchema = z.object({ refreshToken: z.string().min(1) });

router.post('/refresh', asyncHandler(async (req, res) => {
  const { refreshToken } = refreshSchema.parse(req.body);
  const session = await findActiveSession(refreshToken);
  if (!session) throw new HttpError(401, 'Session expired — please sign in again');

  const { rows } = await query(
    `SELECT u.id, u.email, u.is_active FROM users u WHERE u.id = $1`,
    [session.user_id]
  );
  const user = rows[0];
  if (!user || !user.is_active) throw new HttpError(401, 'Account inactive or not found');

  const farms = await farmsForUser(user.id);
  const active = pickActiveFarm(farms, session.farm_id);

  const permissions = active ? await permissionsForRole(active.role) : [];
  const { token, refreshToken: newRefreshToken } = await issueSession({
    userId: user.id, email: user.email, farmId: active?.farmId ?? null, role: active?.role ?? null, permissions,
    userAgent: req.header('user-agent'), replaceSessionId: session.id,
  });
  res.json({ token, refreshToken: newRefreshToken });
}));

// ---------- logout ----------

router.post('/logout', asyncHandler(async (req, res) => {
  const refreshToken = typeof req.body?.refreshToken === 'string' ? req.body.refreshToken : null;
  if (refreshToken) {
    await query(`UPDATE sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL`, [hashToken(refreshToken)]);
  }
  res.status(204).end();
}));

// ---------- account linking ----------

interface LinkedIdentity {
  id: string;
  provider: string;
  providerAccountId: string;
  email: string;
  name: string | null;
  createdAt: string;
}

router.get('/identities', requireAuth, asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT id, provider, provider_account_id, email, name, created_at FROM oauth_accounts WHERE user_id=$1 ORDER BY created_at`,
    [req.user!.id]
  );
  const identities: LinkedIdentity[] = rows.map((r: any) => ({
    id: r.id,
    provider: r.provider,
    providerAccountId: r.provider_account_id,
    email: r.email,
    name: r.name,
    createdAt: r.created_at,
  }));

  const { rows: userRows } = await query(`SELECT password_hash, phone FROM users WHERE id=$1`, [req.user!.id]);
  const user = userRows[0] as any;

  const methods = [
    ...identities.map((i) => ({ provider: i.provider, connected: true, identity: i })),
    { provider: 'password', connected: !!user?.password_hash, identity: null as any },
    { provider: 'phone', connected: !!user?.phone, identity: null as any },
  ];

  res.json({ data: methods });
}));

router.delete('/identities/:provider/:id', requireAuth, asyncHandler(async (req, res) => {
  const { provider, id } = req.params as { provider: string; id: string };
  if (!['google', 'microsoft', 'apple', 'phone'].includes(provider)) throw new HttpError(400, 'Invalid provider');

  const { rows: identities } = await query(
    `SELECT id FROM oauth_accounts WHERE id=$1 AND user_id=$2`,
    [id, req.user!.id]
  );
  if (identities.length === 0) throw new HttpError(404, 'Identity not found');

  const { rows: remaining } = await query(
    `SELECT count(*) FROM oauth_accounts WHERE user_id=$1`,
    [req.user!.id]
  );
  const oauthCount = Number(remaining[0]?.count ?? 0);

  const { rows: userRows } = await query(`SELECT password_hash, phone FROM users WHERE id=$1`, [req.user!.id]);
  const user = userRows[0] as any;
  const hasPassword = !!user?.password_hash;
  const hasPhone = !!user?.phone;

  const isPhone = provider === 'phone';
  const remainingMethods = (isPhone ? 0 : 1) + (hasPassword ? 1 : 0) + (hasPhone ? 1 : 0) + (oauthCount - 1);

  if (remainingMethods === 0) throw new HttpError(400, 'You must have at least one sign-in method remaining');

  if (isPhone) {
    await query(`UPDATE users SET phone=NULL WHERE id=$1`, [req.user!.id]);
  } else {
    await query(`DELETE FROM oauth_accounts WHERE id=$1 AND user_id=$2`, [id, req.user!.id]);
  }

  await audit(req.user, 'unlink_identity', 'oauth', req.user!.id, { provider });
  res.json({ ok: true });
}));

// ---------- switch farm ----------

const switchFarmSchema = z.object({ farmId: z.string().min(1), refreshToken: z.string().min(1) });

router.post('/switch-farm', requireAuth, asyncHandler(async (req, res) => {
  const body = switchFarmSchema.parse(req.body);
  const session = await findActiveSession(body.refreshToken);
  if (!session || session.user_id !== req.user!.id) throw new HttpError(401, 'Session expired — please sign in again');

  const farms = await farmsForUser(req.user!.id);
  const target = farms.find((f) => f.farmId === body.farmId);
  if (!target) throw new HttpError(403, "You don't have access to that farm");

  const permissions = await permissionsForRole(target.role);
  const { token, refreshToken } = await issueSession({
    userId: req.user!.id, email: req.user!.email, farmId: target.farmId, role: target.role, permissions,
    userAgent: req.header('user-agent'), replaceSessionId: session.id,
  });
  await audit(req.user, 'switch_farm', 'farm', target.farmId);

  res.json({
    token, refreshToken,
    user: { id: req.user!.id, name: req.user!.name, email: req.user!.email, farmId: target.farmId, role: target.role, isSuperAdmin: req.user!.isSuperAdmin },
    farms: farms.map((f) => ({ ...f, isActive: f.farmId === target.farmId })),
  });
}));

// ---------- farms I belong to ----------

router.get('/farms', requireAuth, asyncHandler(async (req, res) => {
  res.json({ data: await farmsForUser(req.user!.id, req.user!.farmId) });
}));

// ---------- forgot / reset password ----------

const forgotSchema = z.object({ email: z.string().email() });

router.post('/forgot-password', asyncHandler(async (req, res) => {
  rateLimit(`forgot-password:${req.ip}`);
  const { email } = forgotSchema.parse(req.body);
  const { rows } = await query('SELECT id FROM users WHERE email = $1 AND is_active = true', [email]);
  let devLink: string | undefined;
  if (rows[0]) {
    const token = generateToken();
    await query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1,$2, now() + interval '1 hour')`,
      [rows[0].id, hashToken(token)]
    );
    devLink = deliverLink('password reset link', email, token, '/#/reset-password');
  }
  // Same response whether or not the email exists — otherwise this endpoint becomes a way
  // to check which emails have accounts.
  res.json({ message: 'If an account exists for that email, a reset link has been sent.', ...(devLink ? { devResetLink: devLink } : {}) });
}));

const resetSchema = z.object({ token: z.string().min(1), newPassword: z.string().min(8) });

router.post('/reset-password', asyncHandler(async (req, res) => {
  rateLimit(`reset-password:${req.ip}`);
  const body = resetSchema.parse(req.body);
  const { rows } = await query(
    `SELECT id, user_id FROM password_reset_tokens WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()`,
    [hashToken(body.token)]
  );
  const row = rows[0];
  if (!row) throw new HttpError(400, 'This reset link is invalid or has expired');

  await query(`UPDATE users SET password_hash = crypt($1, gen_salt('bf')), updated_at = now() WHERE id = $2`, [body.newPassword, row.user_id]);
  await query(`UPDATE password_reset_tokens SET used_at = now() WHERE id = $1`, [row.id]);
  // A password reset invalidates every existing session — if the reset was prompted by a
  // compromised account, whoever had the old sessions loses access immediately.
  await query(`UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [row.user_id]);

  res.json({ message: 'Password updated. Please sign in again.' });
}));

// ---------- email verification ----------

const verifyEmailSchema = z.object({ code: z.string().length(6) });

// Scoped to the logged-in user rather than a public token lookup: a 6-digit code is
// guessable in a way a 32-byte hex token isn't, so this must only ever check the code
// against the account that's already asking (via requireAuth), never an arbitrary user_id.
router.post('/verify-email', requireAuth, asyncHandler(async (req, res) => {
  const { code } = verifyEmailSchema.parse(req.body);
  const { rows } = await query(
    `SELECT id FROM email_verification_tokens WHERE user_id = $1 AND token_hash = $2 AND expires_at > now()`,
    [req.user!.id, hashToken(code)]
  );
  const row = rows[0];
  if (!row) throw new HttpError(400, 'That code is incorrect or has expired');

  await query(`UPDATE users SET email_verified_at = now() WHERE id = $1`, [req.user!.id]);
  await query(`DELETE FROM email_verification_tokens WHERE user_id = $1`, [req.user!.id]);
  res.json({ message: 'Email verified.' });
}));

router.post('/resend-verification', requireAuth, asyncHandler(async (req, res) => {
  const { rows } = await query('SELECT email, email_verified_at FROM users WHERE id = $1', [req.user!.id]);
  if (rows[0]?.email_verified_at) return res.json({ message: 'Email is already verified.' });

  await query('DELETE FROM email_verification_tokens WHERE user_id = $1', [req.user!.id]);
  const code = generateCode();
  await query(
    `INSERT INTO email_verification_tokens (user_id, token_hash, expires_at) VALUES ($1,$2, now() + interval '15 minutes')`,
    [req.user!.id, hashToken(code)]
  );
  const devVerifyCode = deliverCode('email verification code', rows[0].email, code);
  res.json({ message: 'Verification code sent.', ...(devVerifyCode ? { devVerifyCode } : {}) });
}));

// ---------- me ----------

router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  await audit(req.user, 'read', 'user', req.user!.id);
  const { rows } = await query('SELECT email_verified_at, account_type FROM users WHERE id = $1', [req.user!.id]);
  res.json({
    user: { ...req.user, emailVerified: !!rows[0]?.email_verified_at, accountType: rows[0]?.account_type ?? null },
    farms: await farmsForUser(req.user!.id, req.user!.farmId ?? undefined),
  });
}));

// ---------- account types (public — powers the "I am a..." step on Get Started) ----------

router.get('/account-types', asyncHandler(async (_req, res) => {
  res.json({ data: ACCOUNT_TYPES.map((id) => ({ id, ...ACCOUNT_TYPE_CONFIG[id] })) });
}));

// ---------- invite preview (public — shown on the signup page before an account exists) ----------

router.get('/invitations/:token', asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT fi.email, f.name as farm_name, r.name as role, u.name as invited_by_name
     FROM farm_invitations fi
     JOIN farms f ON f.id = fi.farm_id
     JOIN roles r ON r.id = fi.role_id
     LEFT JOIN users u ON u.id = fi.invited_by
     WHERE fi.token_hash = $1 AND fi.accepted_at IS NULL AND fi.expires_at > now()`,
    [hashToken(req.params.token)]
  );
  if (!rows[0]) throw new HttpError(404, 'This invitation is invalid or has expired');
  res.json({
    email: rows[0].email,
    farmName: rows[0].farm_name,
    role: rows[0].role,
    invitedBy: rows[0].invited_by_name,
  });
}));

export default router;
