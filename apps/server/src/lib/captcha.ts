import crypto from 'crypto';

// Self-hosted stand-in for reCAPTCHA/hCaptcha (no third-party site key configured yet) — a
// simple arithmetic challenge is enough to stop unattended brute-force scripts, which is
// what this gate is actually defending against once account lockout also kicks in.
export function generateChallenge(): { question: string; answer: string } {
  const a = crypto.randomInt(1, 10);
  const b = crypto.randomInt(1, 10);
  const op = crypto.randomInt(0, 2) === 0 ? '+' : '-';
  const answer = op === '+' ? a + b : a - b;
  return { question: `${a} ${op} ${b}`, answer: String(answer) };
}
