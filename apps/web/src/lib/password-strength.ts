export interface PasswordStrength { score: 0 | 1 | 2 | 3 | 4; label: string; color: string; }

// A lightweight heuristic (length + character-class variety), not a full entropy
// estimate — enough to steer users away from "password1" without pulling in a scoring
// library for a UI meter.
export function passwordStrength(pw: string): PasswordStrength {
  if (!pw) return { score: 0, label: '', color: 'transparent' };
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const clamped = Math.min(score, 4) as 0 | 1 | 2 | 3 | 4;
  const levels: { label: string; color: string }[] = [
    { label: 'Very weak', color: 'var(--danger)' },
    { label: 'Weak', color: 'var(--danger)' },
    { label: 'Fair', color: 'var(--warn)' },
    { label: 'Good', color: 'var(--primary)' },
    { label: 'Strong', color: 'var(--primary)' },
  ];
  return { score: clamped, ...levels[clamped] };
}
