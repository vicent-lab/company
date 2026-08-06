import { useState, useEffect } from 'react';
import { Tractor, ArrowRight, CheckCircle2, Building2, FlaskConical, UserCog, Syringe, HardHat, Calculator, GraduationCap } from 'lucide-react';
import logoImg from '../assets/logo.png';
import { useAuth, AccountType } from '../auth';
import { getInvitePreview, getAccountTypes, InvitePreview, AccountTypeInfo } from '../data';
import { isLive } from '../api';
import { PasswordStrengthMeter, PasswordInput } from '../ui';
import { COUNTRIES } from '../lib/countries';

// The hash router only parses path segments, not query strings — a query glued onto the
// first segment (e.g. "signup?invite=xyz") needs to be pulled apart manually here rather
// than by extending the shared router for these two one-off pre-login pages.
function hashQuery(): URLSearchParams {
  return new URLSearchParams(window.location.hash.split('?')[1] || '');
}

function AuthCard({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <main className="login" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 20 }}>
      <div className="card" style={{ width: wide ? 520 : 380, maxWidth: '100%' }}>
        <div className="brand" style={{ justifyContent: 'center', marginBottom: 10 }}>
          <img className="logo" src={logoImg} alt="DairyOS" /><div><b>DairyOS</b><small>SMART DAIRY</small></div>
        </div>
        {children}
      </div>
    </main>
  );
}

const TYPE_ICON: Record<string, React.ReactNode> = {
  farm_owner: <Tractor size={18} />,
  dairy_cooperative: <Building2 size={18} />,
  research_institution: <FlaskConical size={18} />,
  farm_manager: <UserCog size={18} />,
  veterinarian: <Syringe size={18} />,
  farm_worker: <HardHat size={18} />,
  accountant: <Calculator size={18} />,
  student_demo: <GraduationCap size={18} />,
};
const TYPE_BLURB: Record<string, string> = {
  farm_owner: 'Set up your farm and invite your team.',
  dairy_cooperative: 'Manage multiple member farms under one account.',
  research_institution: 'Set up a site to track herds for research.',
  farm_manager: "You'll get manager access once a farm invites you.",
  veterinarian: "You'll get vet access once a farm invites you.",
  farm_worker: "You'll get worker access once a farm invites you.",
  accountant: "You'll get financial access once a farm invites you.",
  student_demo: 'Jump straight into a pre-populated sample farm to explore.',
};

// Fallback list so this still renders (without live data) if the account-types
// endpoint can't be reached — same 8 ids/labels the backend serves.
const FALLBACK_TYPES: AccountTypeInfo[] = [
  { id: 'farm_owner', flow: 'owner', label: 'Farm Owner', framing: 'farm' },
  { id: 'dairy_cooperative', flow: 'owner', label: 'Dairy Cooperative', framing: 'cooperative' },
  { id: 'research_institution', flow: 'owner', label: 'Research Institution', framing: 'research site' },
  { id: 'farm_manager', flow: 'team_member', label: 'Farm Manager', framing: 'farm', hintRole: 'farm_manager' },
  { id: 'veterinarian', flow: 'team_member', label: 'Veterinarian', framing: 'farm', hintRole: 'veterinarian' },
  { id: 'farm_worker', flow: 'team_member', label: 'Farm Worker', framing: 'farm', hintRole: 'worker' },
  { id: 'accountant', flow: 'team_member', label: 'Accountant', framing: 'farm', hintRole: 'accountant' },
  { id: 'student_demo', flow: 'demo', label: 'Student / Demo User', framing: 'demo farm' },
];

export function GetStarted() {
  const [types, setTypes] = useState<AccountTypeInfo[]>(FALLBACK_TYPES);
  const [selected, setSelected] = useState('farm_owner');

  useEffect(() => {
    if (!isLive) return;
    getAccountTypes().then(setTypes).catch(() => {});
  }, []);

  return (
    <AuthCard wide>
      <div className="eyebrow" style={{ textAlign: 'center' }}>GET STARTED</div>
      <h1 style={{ fontSize: 24, textAlign: 'center' }}>I am a:</h1>
      <div className="mt" role="radiogroup" aria-label="Account type">
        {types.map((t) => (
          <label key={t.id} className="row" style={{
            gap: 10, padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
            border: `1px solid ${selected === t.id ? 'var(--primary)' : 'var(--border)'}`,
            background: selected === t.id ? 'var(--primary-soft)' : 'transparent',
            marginBottom: 8,
          }}>
            <input type="radio" name="accountType" value={t.id} checked={selected === t.id} onChange={() => setSelected(t.id)} />
            <span style={{ color: 'var(--primary)', display: 'grid', placeItems: 'center' }}>{TYPE_ICON[t.id]}</span>
            <span style={{ flex: 1 }}>
              <b style={{ fontSize: 14 }}>{t.label}</b>
              <div className="muted" style={{ fontSize: 12 }}>{TYPE_BLURB[t.id]}</div>
            </span>
          </label>
        ))}
      </div>
      <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>Different account types unlock different permissions.</p>
      <button className="btn mt" style={{ width: '100%', justifyContent: 'center' }} onClick={() => { window.location.hash = `#/signup?type=${selected}`; }}>
        Continue <ArrowRight size={16} />
      </button>
      <p className="muted" style={{ textAlign: 'center', marginTop: 14, fontSize: 13 }}>Already have an account? <a href="#/app">Sign in</a></p>
    </AuthCard>
  );
}

export function SignUp() {
  const { register } = useAuth();
  const [params] = useState(hashQuery);
  const inviteToken = params.get('invite') || '';
  const typeParam = params.get('type') || 'farm_owner';

  const [types, setTypes] = useState<AccountTypeInfo[]>(FALLBACK_TYPES);
  useEffect(() => { if (isLive) getAccountTypes().then(setTypes).catch(() => {}); }, []);
  const accountType = types.find((t) => t.id === typeParam) ?? FALLBACK_TYPES.find((t) => t.id === typeParam) ?? FALLBACK_TYPES[0];

  const [invite, setInvite] = useState<InvitePreview | null>(null);
  const [inviteError, setInviteError] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [country, setCountry] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!inviteToken || !isLive) return;
    getInvitePreview(inviteToken)
      .then((p) => { setInvite(p); setEmail(p.email); })
      .catch(() => setInviteError('This invitation link is invalid or has expired.'));
  }, [inviteToken]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setError('');
    if (password !== confirmPassword) { setError('Passwords do not match'); return; }
    setBusy(true);
    try {
      await register({
        firstName, lastName, email, phone, country, password,
        accountType: accountType.id as AccountType, termsAccepted, inviteToken: inviteToken || undefined,
      });
      window.location.hash = '#/app';
    } catch (err: any) {
      setError(err.message);
      setBusy(false);
    }
  };

  if (inviteToken && inviteError) {
    return <AuthCard>
      <p className="error" style={{ color: 'var(--danger)', textAlign: 'center' }}>{inviteError}</p>
      <a className="btn" style={{ width: '100%', justifyContent: 'center', marginTop: 14 }} href="#/get-started">Start over</a>
    </AuthCard>;
  }

  return (
    <AuthCard>
      <div className="eyebrow" style={{ textAlign: 'center' }}>CREATE ACCOUNT</div>
      <h1 style={{ fontSize: 22, textAlign: 'center' }}>
        {invite ? `Join ${invite.farmName}` : accountType.flow === 'owner' ? `Set up your ${accountType.framing}` : accountType.flow === 'demo' ? 'Create your sandbox account' : 'Create your account'}
      </h1>
      {invite && (
        <div className="card" style={{ background: 'var(--primary-soft)', borderColor: 'transparent', marginTop: 10 }}>
          <div className="row" style={{ gap: 6 }}><CheckCircle2 size={15} color="var(--primary)" />
            <span style={{ fontSize: 13 }}>{invite.invitedBy || 'A farm administrator'} invited you to join <b>{invite.farmName}</b> as <b>{invite.role.replace('_', ' ')}</b>.</span>
          </div>
        </div>
      )}
      {!invite && accountType.flow === 'demo' && (
        <div className="card" style={{ background: 'var(--primary-soft)', borderColor: 'transparent', marginTop: 10 }}>
          <p style={{ fontSize: 13 }}>We'll generate a sample farm — real cows, milk records, and breeding data — so you can explore DairyOS immediately.</p>
        </div>
      )}
      <form onSubmit={submit}>
        <div className="two">
          <label className="field">First name<input className="input" value={firstName} onChange={(e) => setFirstName(e.target.value)} required autoFocus /></label>
          <label className="field">Last name<input className="input" value={lastName} onChange={(e) => setLastName(e.target.value)} required /></label>
        </div>
        <label className="field">Email<input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={!!invite} required /></label>
        <div className="two">
          <label className="field">Phone number<input className="input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required /></label>
          <label className="field">Country
            <select className="select" value={country} onChange={(e) => setCountry(e.target.value)} required>
              <option value="" disabled>Select…</option>
              {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
        </div>
        <div className="two">
          <label className="field">Password<PasswordInput value={password} onChange={setPassword} minLength={8} required /></label>
          <PasswordStrengthMeter password={password} />
          <label className="field">Confirm password<PasswordInput value={confirmPassword} onChange={setConfirmPassword} minLength={8} required /></label>
        </div>
        <label className="row" style={{ gap: 8, fontSize: 13, alignItems: 'flex-start', marginTop: 4, marginBottom: 14 }}>
          <input type="checkbox" checked={termsAccepted} onChange={(e) => setTermsAccepted(e.target.checked)} required style={{ marginTop: 2 }} />
          <span>I agree to the <a href="#" onClick={(e) => e.preventDefault()}>Terms of Service</a> and <a href="#" onClick={(e) => e.preventDefault()}>Privacy Policy</a></span>
        </label>
        {error && <p className="error" style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</p>}
        <button className="btn" style={{ width: '100%', justifyContent: 'center' }} disabled={busy || !termsAccepted}>{busy ? 'Creating account…' : <>Create account <ArrowRight size={16} /></>}</button>
      </form>
      <p className="muted" style={{ textAlign: 'center', marginTop: 14, fontSize: 13 }}>Already have an account? <a href="#/app">Sign in</a></p>
    </AuthCard>
  );
}
