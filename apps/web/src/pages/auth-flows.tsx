import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import logoImg from '../assets/logo.png';
import { resetPassword } from '../data';
import { PasswordStrengthMeter, PasswordInput } from '../ui';

// The hash router (router.ts) only parses path segments, not query strings, so these
// standalone pre-login screens read the token straight off window.location.hash rather
// than extending the shared router's parsing for two one-off links.
function tokenFromHash(): string {
  const q = window.location.hash.split('?')[1] || '';
  return new URLSearchParams(q).get('token') || '';
}

function AuthCard({ children }: { children: React.ReactNode }) {
  return (
    <main className="login" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 20 }}>
      <div className="card" style={{ width: 380, maxWidth: '100%' }}>
        <div className="brand" style={{ justifyContent: 'center', marginBottom: 10 }}>
          <img className="logo" src={logoImg} alt="DairyOS" /><div><b>DairyOS</b><small>SMART DAIRY</small></div>
        </div>
        {children}
      </div>
    </main>
  );
}

export function ResetPasswordPage() {
  const [token] = useState(tokenFromHash);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) return setError('Password must be at least 8 characters.');
    if (password !== confirm) return setError("Passwords don't match.");
    setBusy(true);
    try {
      await resetPassword(token, password);
      setDone(true);
    } catch (err: any) {
      setError(err.message || 'That reset link is invalid or has expired.');
      setBusy(false);
    }
  };

  if (!token) {
    return <AuthCard>
      <div className="eyebrow" style={{ textAlign: 'center' }}>RESET PASSWORD</div>
      <p className="muted" style={{ textAlign: 'center', marginTop: 10 }}>This link is missing its reset token. Request a new one from the sign-in page.</p>
      <a className="btn" style={{ width: '100%', justifyContent: 'center', marginTop: 14 }} href="#/">Back to sign in</a>
    </AuthCard>;
  }

  if (done) {
    return <AuthCard>
      <div style={{ textAlign: 'center' }}><CheckCircle2 size={36} color="var(--primary)" /></div>
      <h1 style={{ fontSize: 22, textAlign: 'center', marginTop: 8 }}>Password updated</h1>
      <p className="muted" style={{ textAlign: 'center', marginTop: 6 }}>All existing sessions were signed out for security. Sign in with your new password.</p>
      <a className="btn" style={{ width: '100%', justifyContent: 'center', marginTop: 14 }} href="#/">Back to sign in</a>
    </AuthCard>;
  }

  return (
    <AuthCard>
      <div className="eyebrow" style={{ textAlign: 'center' }}>RESET PASSWORD</div>
      <h1 style={{ fontSize: 22, textAlign: 'center' }}>Choose a new password</h1>
      <form onSubmit={submit}>
        <label className="field">New password<PasswordInput value={password} onChange={setPassword} minLength={8} required /></label>
        <PasswordStrengthMeter password={password} />
        <label className="field">Confirm password<PasswordInput value={confirm} onChange={setConfirm} minLength={8} required /></label>
        {error && <p className="error" style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</p>}
        <button className="btn" style={{ width: '100%', justifyContent: 'center' }} disabled={busy}>{busy ? 'Saving…' : 'Update password'}</button>
      </form>
    </AuthCard>
  );
}
