import crypto from 'crypto';

// Opaque random tokens (refresh, password-reset, email-verification) are never stored
// raw — only a SHA-256 hash goes in the DB, same principle as the password hash, so a
// database read alone can't be replayed as a live credential.
export function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Short numeric OTP for the email-verification screen (typed by hand, unlike the opaque
// hex tokens above) — still hashed at rest via hashToken before it touches the DB.
export function generateCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}
