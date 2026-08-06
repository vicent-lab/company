import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/index.js';
import { requireAuth, audit } from '../middleware/auth.js';
import { hashToken } from '../lib/tokens.js';
import { generateTotpSecret, totpAuthUrl, verifyTotp } from '../lib/totp.js';
import { HttpError, asyncHandler } from '../lib/errors.js';

const router = Router();
router.use(requireAuth);

// ---------- login history ----------

router.get('/login-history', asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT success, reason, ip_address, user_agent, created_at
     FROM login_history WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [req.user!.id]
  );
  res.json({ data: rows });
}));

// ---------- active sessions / device management ----------

// The access token doesn't carry a session id, so the client passes the refresh token it
// holds (same one used elsewhere for switch-farm/create-farm) purely to let this endpoint
// flag which row is "this device" — it isn't used to authenticate the request.
router.get('/sessions', asyncHandler(async (req, res) => {
  const currentTokenHash = typeof req.query.refreshToken === 'string' ? hashToken(req.query.refreshToken) : null;
  const { rows } = await query(
    `SELECT id, user_agent, ip_address, device_label, created_at, last_seen_at, expires_at, token_hash
     FROM sessions WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()
     ORDER BY last_seen_at DESC`,
    [req.user!.id]
  );
  res.json({
    data: rows.map((r) => ({
      id: r.id, userAgent: r.user_agent, ipAddress: r.ip_address, deviceLabel: r.device_label,
      createdAt: r.created_at, lastSeenAt: r.last_seen_at, expiresAt: r.expires_at,
      isCurrent: currentTokenHash !== null && r.token_hash === currentTokenHash,
    })),
  });
}));

router.post('/sessions/:id/revoke', asyncHandler(async (req, res) => {
  const { rows } = await query(
    `UPDATE sessions SET revoked_at = now() WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL RETURNING id`,
    [req.params.id, req.user!.id]
  );
  if (!rows[0]) throw new HttpError(404, 'Session not found');
  await audit(req.user, 'revoke', 'session', req.params.id);
  res.json({ message: 'Device signed out.' });
}));

const revokeAllSchema = z.object({ refreshToken: z.string().min(1) });

router.post('/sessions/revoke-all-others', asyncHandler(async (req, res) => {
  const { refreshToken } = revokeAllSchema.parse(req.body);
  const { rows } = await query(
    `UPDATE sessions SET revoked_at = now()
     WHERE user_id = $1 AND revoked_at IS NULL AND token_hash <> $2
     RETURNING id`,
    [req.user!.id, hashToken(refreshToken)]
  );
  await audit(req.user, 'revoke_all_others', 'session', null, { count: rows.length });
  res.json({ message: `Signed out of ${rows.length} other device${rows.length === 1 ? '' : 's'}.`, count: rows.length });
}));

// ---------- two-factor authentication ----------

router.get('/2fa/status', asyncHandler(async (req, res) => {
  const { rows } = await query('SELECT totp_enabled FROM users WHERE id = $1', [req.user!.id]);
  res.json({ enabled: !!rows[0]?.totp_enabled });
}));

router.post('/2fa/setup', asyncHandler(async (req, res) => {
  const secret = generateTotpSecret();
  await query('UPDATE users SET totp_pending_secret = $1 WHERE id = $2', [secret, req.user!.id]);
  res.json({ secret, otpauthUrl: totpAuthUrl(secret, req.user!.email) });
}));

const enable2faSchema = z.object({ code: z.string().length(6) });

router.post('/2fa/enable', asyncHandler(async (req, res) => {
  const { code } = enable2faSchema.parse(req.body);
  const { rows } = await query('SELECT totp_pending_secret FROM users WHERE id = $1', [req.user!.id]);
  const pending = rows[0]?.totp_pending_secret;
  if (!pending) throw new HttpError(400, 'Start setup first — no pending secret found');
  if (!verifyTotp(pending, code)) throw new HttpError(400, 'Incorrect code — check your authenticator app and try again');
  await query(
    `UPDATE users SET totp_secret = $1, totp_enabled = true, totp_pending_secret = NULL WHERE id = $2`,
    [pending, req.user!.id]
  );
  await audit(req.user, 'enable', '2fa', req.user!.id);
  res.json({ message: 'Two-factor authentication enabled.' });
}));

const disable2faSchema = z.object({ password: z.string().min(1) });

router.post('/2fa/disable', asyncHandler(async (req, res) => {
  const { password } = disable2faSchema.parse(req.body);
  const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [req.user!.id]);
  const ok = await query('SELECT crypt($1, $2) = $2 AS valid', [password, rows[0]?.password_hash]);
  if (!ok.rows[0].valid) throw new HttpError(401, 'Incorrect password');
  await query(
    `UPDATE users SET totp_secret = NULL, totp_enabled = false, totp_pending_secret = NULL WHERE id = $1`,
    [req.user!.id]
  );
  await audit(req.user, 'disable', '2fa', req.user!.id);
  res.json({ message: 'Two-factor authentication disabled.' });
}));

export default router;
