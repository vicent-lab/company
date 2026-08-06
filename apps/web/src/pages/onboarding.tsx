import { useState } from 'react';
import logoImg from '../assets/logo.png';
import {
  Milk, Beef, Layers, ArrowRight, Mail, RefreshCw, Users, LogOut, X, CheckCircle2, ImagePlus,
  FileSpreadsheet, Upload, Keyboard,
} from 'lucide-react';
import { useAuth } from '../auth';
import { useToast } from '../ui';
import {
  createFarm, inviteToFarm, resendVerification, verifyEmail, updateFarmMedia,
  createBarns, importCows, ImportCowRow,
} from '../data';
import { setTokens, getRefreshToken } from '../api';
import { COUNTRIES } from '../lib/countries';

// Step 4 of the signup flow: shown right after account creation, before the farm
// wizard / waiting screen. Not a hard gate — "Skip for now" lets an impatient owner
// get to their farm immediately, matching the rest of onboarding's non-blocking design;
// EmailVerifyBanner below still nudges them later if they skip here.
export function EmailVerificationStep({ onDone }: { onDone: () => void }) {
  const { user, refreshMe } = useAuth();
  const { push } = useToast();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setBusy(true);
    try {
      await verifyEmail(code);
      await refreshMe();
      onDone();
    } catch (err: any) {
      setError(err.message || 'That code is incorrect or has expired');
      setBusy(false);
    }
  };

  const resend = async () => {
    setResending(true);
    try {
      const res = await resendVerification();
      push(res.devVerifyCode ? `Dev mode — verification code: ${res.devVerifyCode}` : res.message);
    } catch {
      push('Could not send a new code');
    } finally {
      setResending(false);
    }
  };

  return (
    <main style={{ minHeight: '100vh', padding: '40px 20px', background: 'var(--bg)' }}>
      <div style={{ maxWidth: 420, margin: '0 auto' }}>
        <div className="brand" style={{ justifyContent: 'center', marginBottom: 20 }}>
          <img className="logo" src={logoImg} alt="DairyOS" /><div><b>DairyOS</b><small>SMART DAIRY</small></div>
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <CheckCircle2 size={32} color="var(--primary)" style={{ margin: '0 auto' }} />
          <h2 style={{ fontSize: 20, marginTop: 10 }}>Account created</h2>
          <p className="muted" style={{ fontSize: 14, marginTop: 6 }}>A verification code has been sent to</p>
          <p style={{ fontSize: 15, fontWeight: 700, marginTop: 2 }}>{user?.email}</p>
          <form onSubmit={submit}>
            <input
              className="input" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoFocus
              placeholder="6-digit code" value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              style={{ textAlign: 'center', fontSize: 22, letterSpacing: 6, marginTop: 16 }}
              required
            />
            {error && <p className="error" style={{ color: 'var(--danger)', fontSize: 13, marginTop: 8 }}>{error}</p>}
            <button className="btn mt" style={{ width: '100%', justifyContent: 'center' }} disabled={busy || code.length !== 6}>
              {busy ? 'Verifying…' : 'Verify'}
            </button>
          </form>
          <button className="btn ghost sm mt" style={{ width: '100%', justifyContent: 'center' }} onClick={resend} disabled={resending}>
            <RefreshCw size={14} /> {resending ? 'Sending…' : "Didn't get a code? Resend"}
          </button>
          <button className="btn ghost sm mt" style={{ width: '100%', justifyContent: 'center' }} onClick={onDone}>Skip for now</button>
        </div>
      </div>
    </main>
  );
}

function EmailVerifyBanner() {
  const { user, refreshMe } = useAuth();
  const { push } = useToast();
  const [dismissed, setDismissed] = useState(false);
  const [sending, setSending] = useState(false);
  const [entering, setEntering] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  if (!user || user.emailVerified || dismissed) return null;

  const resend = async () => {
    setSending(true);
    try {
      const res = await resendVerification();
      push(res.devVerifyCode ? `Dev mode — verification code: ${res.devVerifyCode}` : res.message);
      setEntering(true);
    } catch { push('Could not send a new code'); }
    finally { setSending(false); }
  };
  const confirm = async () => {
    setBusy(true);
    try { await verifyEmail(code); await refreshMe(); }
    catch { push('That code is incorrect or has expired'); }
    finally { setBusy(false); }
  };

  return (
    <div className="card" style={{ background: 'var(--warn-soft)', borderColor: 'transparent', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Mail size={16} color="var(--warn)" />
        <span style={{ fontSize: 13, flex: 1 }}>Verify {user.email} to secure your account.</span>
        {!entering && <button className="btn ghost sm" onClick={resend} disabled={sending}>{sending ? 'Sending…' : 'Send code'}</button>}
        <button className="btn ghost sm" onClick={() => setDismissed(true)}><X size={14} /></button>
      </div>
      {entering && (
        <div className="row" style={{ gap: 8, marginTop: 10 }}>
          <input className="input" inputMode="numeric" maxLength={6} placeholder="6-digit code" value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} style={{ flex: 1 }} />
          <button className="btn sm" onClick={confirm} disabled={busy || code.length !== 6}>{busy ? 'Checking…' : 'Confirm'}</button>
        </div>
      )}
    </div>
  );
}

interface CreatedFarm { id: string; name: string; }

const PRODUCTION_OPTIONS: { id: 'milk' | 'beef' | 'mixed'; label: string; icon: React.ReactNode }[] = [
  { id: 'milk', label: 'Milk', icon: <Milk size={16} /> },
  { id: 'beef', label: 'Beef', icon: <Beef size={16} /> },
  { id: 'mixed', label: 'Mixed', icon: <Layers size={16} /> },
];

function CreateFarmWizard({ onCreated }: { onCreated: (farm: CreatedFarm) => void }) {
  const [name, setName] = useState('');
  const [country, setCountry] = useState('');
  const [district, setDistrict] = useState('');
  const [farmSizeValue, setFarmSizeValue] = useState('');
  const [farmSizeUnit, setFarmSizeUnit] = useState<'acres' | 'hectares'>('acres');
  const [herdSize, setHerdSize] = useState('');
  const [production, setProduction] = useState<'milk' | 'beef' | 'mixed'>('milk');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError('');
    try {
      const res = await createFarm({
        name, country, district,
        farmSizeValue: Number(farmSizeValue), farmSizeUnit,
        expectedHerdSize: Number(herdSize), primaryProduction: production,
        refreshToken: getRefreshToken(),
      });
      setTokens(res.token, res.refreshToken);
      onCreated({ id: res.farm.id, name: res.farm.name });
    } catch (err: any) {
      setError(err.message || 'Could not create farm');
      setBusy(false);
    }
  };

  return (
    <form className="card" style={{ maxWidth: 480, margin: '0 auto' }} onSubmit={submit}>
      <div className="eyebrow">WELCOME!</div>
      <h2 style={{ fontSize: 20, marginTop: 4 }}>Let's set up your farm.</h2>
      <label className="field">Farm name<input className="input" value={name} onChange={(e) => setName(e.target.value)} required autoFocus /></label>
      <div className="two">
        <label className="field">Country
          <select className="select" value={country} onChange={(e) => setCountry(e.target.value)} required>
            <option value="" disabled>Select…</option>
            {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="field">District<input className="input" value={district} onChange={(e) => setDistrict(e.target.value)} required /></label>
      </div>
      <div className="two">
        <label className="field">Farm size
          <div className="row" style={{ gap: 6 }}>
            <input className="input" type="number" min="0" step="0.1" value={farmSizeValue} onChange={(e) => setFarmSizeValue(e.target.value)} required style={{ flex: 1 }} />
            <select className="select" value={farmSizeUnit} onChange={(e) => setFarmSizeUnit(e.target.value as 'acres' | 'hectares')} style={{ width: 108 }}>
              <option value="acres">acres</option>
              <option value="hectares">hectares</option>
            </select>
          </div>
        </label>
        <label className="field">Number of cows<input className="input" type="number" min="0" step="1" value={herdSize} onChange={(e) => setHerdSize(e.target.value)} required /></label>
      </div>
      <label className="field">Primary production
        <div className="row" style={{ gap: 8 }} role="radiogroup" aria-label="Primary production">
          {PRODUCTION_OPTIONS.map((opt) => (
            <button
              key={opt.id} type="button" role="radio" aria-checked={production === opt.id}
              onClick={() => setProduction(opt.id)}
              className="btn sm" style={{
                flex: 1, justifyContent: 'center',
                background: production === opt.id ? 'var(--primary)' : 'transparent',
                color: production === opt.id ? '#fff' : 'var(--text)',
                border: `1px solid ${production === opt.id ? 'var(--primary)' : 'var(--border)'}`,
              }}
            >{opt.icon} {opt.label}</button>
          ))}
        </div>
      </label>
      {error && <p className="error" style={{ color: 'var(--danger)', fontSize: 13, marginTop: 4 }}>{error}</p>}
      <button className="btn mt" style={{ width: '100%', justifyContent: 'center' }} disabled={busy}>{busy ? 'Creating…' : <>Continue <ArrowRight size={15} /></>}</button>
    </form>
  );
}

const MAX_IMAGE_BYTES = 1_500_000;

function readImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (file.size > MAX_IMAGE_BYTES) { reject(new Error('Image must be under 1.5MB')); return; }
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Could not read that file'));
    reader.readAsDataURL(file);
  });
}

function ImageUploadField({ label, value, onChange }: { label: string; value: string; onChange: (dataUrl: string) => void }) {
  const [error, setError] = useState('');
  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try { onChange(await readImageFile(file)); setError(''); }
    catch (err: any) { setError(err.message); }
  };
  return (
    <div>
      <div className="muted" style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{label}</div>
      <label style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
        border: '1.5px dashed var(--border)', borderRadius: 12, cursor: 'pointer', overflow: 'hidden',
        height: 120, background: 'var(--surface-2)',
      }}>
        {value ? (
          <img src={value} alt={label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <>
            <ImagePlus size={20} color="var(--text-soft)" />
            <span className="muted" style={{ fontSize: 12 }}>Click to upload</span>
          </>
        )}
        <input type="file" accept="image/*" onChange={pick} style={{ display: 'none' }} />
      </label>
      {error && <p className="error" style={{ color: 'var(--danger)', fontSize: 12, marginTop: 4 }}>{error}</p>}
    </div>
  );
}

function FarmSetupWizard({ farm, onDone }: { farm: CreatedFarm; onDone: () => void }) {
  const [logo, setLogo] = useState('');
  const [photo, setPhoto] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!logo && !photo) { onDone(); return; }
    setBusy(true); setError('');
    try {
      await updateFarmMedia(farm.id, { logoUrl: logo || undefined, photoUrl: photo || undefined });
      onDone();
    } catch (err: any) {
      setError(err.message || 'Could not save your images');
      setBusy(false);
    }
  };

  return (
    <div className="card" style={{ maxWidth: 480, margin: '0 auto' }}>
      <div className="eyebrow">FARM SETUP — STEP 1</div>
      <h2 style={{ fontSize: 20, marginTop: 4 }}>Add a face to {farm.name}</h2>
      <p className="muted" style={{ fontSize: 13 }}>Optional — helps your team recognize the farm at a glance. You can always add these later.</p>
      <div className="two mt">
        <ImageUploadField label="Farm logo" value={logo} onChange={setLogo} />
        <ImageUploadField label="Farm photo" value={photo} onChange={setPhoto} />
      </div>
      {error && <p className="error" style={{ color: 'var(--danger)', fontSize: 13, marginTop: 10 }}>{error}</p>}
      <div className="row mt" style={{ justifyContent: 'flex-end', gap: 10 }}>
        <button className="btn ghost" onClick={onDone} disabled={busy}>Skip for now</button>
        <button className="btn" onClick={submit} disabled={busy}>{busy ? 'Saving…' : <>Continue <ArrowRight size={15} /></>}</button>
      </div>
    </div>
  );
}

function pillStyle(active: boolean): React.CSSProperties {
  return {
    background: active ? 'var(--primary)' : 'transparent',
    color: active ? '#fff' : 'var(--text)',
    border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
  };
}

const BARN_PRESETS = ['Barn A', 'Barn B', 'Calf House', 'Isolation Barn', 'Milking Parlor'];

function BarnsStep({ onDone }: { onDone: () => void }) {
  const [selected, setSelected] = useState<Set<string>>(new Set(['Barn A', 'Barn B']));
  const [customList, setCustomList] = useState<string[]>([]);
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const toggle = (name: string) => setSelected((s) => {
    const next = new Set(s);
    if (next.has(name)) next.delete(name); else next.add(name);
    return next;
  });
  const addCustom = () => {
    const name = custom.trim();
    if (!name) return;
    if (!BARN_PRESETS.includes(name) && !customList.includes(name)) setCustomList((l) => [...l, name]);
    setSelected((s) => new Set(s).add(name));
    setCustom('');
  };

  const submit = async () => {
    const names = Array.from(selected);
    if (names.length === 0) { onDone(); return; }
    setBusy(true); setError('');
    try {
      await createBarns(names.map((name) => ({ name })));
      onDone();
    } catch (err: any) {
      setError(err.message || 'Could not create barns');
      setBusy(false);
    }
  };

  const allOptions = [...BARN_PRESETS, ...customList];

  return (
    <div className="card" style={{ maxWidth: 480, margin: '0 auto' }}>
      <div className="eyebrow">FARM SETUP — STEP 2</div>
      <h2 style={{ fontSize: 20, marginTop: 4 }}>Create barns</h2>
      <p className="muted" style={{ fontSize: 13 }}>Pick the areas your herd is organized into. You can rename or add more later.</p>
      <div className="mt" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {allOptions.map((name) => (
          <button key={name} type="button" className="btn sm" onClick={() => toggle(name)} style={pillStyle(selected.has(name))}>
            {selected.has(name) && <CheckCircle2 size={14} />} {name}
          </button>
        ))}
      </div>
      <div className="row mt" style={{ gap: 8 }}>
        <input
          className="input" placeholder="Add another barn…" value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }}
          style={{ flex: 1 }}
        />
        <button type="button" className="btn ghost sm" onClick={addCustom}>Add</button>
      </div>
      {error && <p className="error" style={{ color: 'var(--danger)', fontSize: 13, marginTop: 10 }}>{error}</p>}
      <div className="row mt" style={{ justifyContent: 'flex-end', gap: 10 }}>
        <button className="btn ghost" onClick={onDone} disabled={busy}>Skip for now</button>
        <button className="btn" onClick={submit} disabled={busy}>{busy ? 'Creating…' : <>Continue <ArrowRight size={15} /></>}</button>
      </div>
    </div>
  );
}

// Header aliases accepted from an uploaded CSV/Excel sheet — matched case- and
// separator-insensitively so "Cow Code", "cow_code", and "COWCODE" all resolve the same way.
const IMPORT_HEADER_MAP: Record<string, keyof ImportCowRow> = {
  cowcode: 'cowCode', code: 'cowCode', id: 'cowCode', tagid: 'cowCode',
  eartag: 'earTag', tag: 'earTag',
  name: 'name', breed: 'breed', gender: 'gender', sex: 'gender',
  weight: 'weightKg', weightkg: 'weightKg',
};
function normalizeHeader(h: string): string { return h.toLowerCase().replace(/[\s_-]+/g, ''); }

function rowsFromRecords(records: Record<string, string>[]): ImportCowRow[] {
  return records
    .map((rec): ImportCowRow => {
      const out: any = { gender: 'female' };
      for (const [key, val] of Object.entries(rec)) {
        const field = IMPORT_HEADER_MAP[normalizeHeader(key)];
        if (!field || val === undefined || val === null || val === '') continue;
        if (field === 'gender') out.gender = /^m/i.test(String(val)) ? 'male' : 'female';
        else if (field === 'weightKg') { const n = Number(val); if (!Number.isNaN(n)) out.weightKg = n; }
        else out[field] = String(val).trim();
      }
      return out;
    })
    .filter((r) => r.cowCode && r.earTag);
}

type ImportMethod = 'excel' | 'csv' | 'manual';
const EMPTY_DRAFT = { cowCode: '', earTag: '', name: '', breed: '', gender: 'female' as 'female' | 'male' };

function ImportCowsStep({ onDone }: { onDone: () => void }) {
  const { push } = useToast();
  const [method, setMethod] = useState<ImportMethod | null>(null);
  const [rows, setRows] = useState<ImportCowRow[]>([]);
  const [parseError, setParseError] = useState('');
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState(EMPTY_DRAFT);

  const parseFile = async (file: File, kind: 'excel' | 'csv') => {
    setParseError('');
    try {
      let records: Record<string, string>[] = [];
      if (kind === 'csv') {
        const Papa = (await import('papaparse')).default;
        const text = await file.text();
        records = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true }).data;
      } else {
        const readXlsxFile = (await import('read-excel-file/browser')).default;
        const sheets = await readXlsxFile(file);
        const [headerRow, ...dataRows] = sheets[0]?.data ?? [];
        records = dataRows.map((r) => Object.fromEntries(headerRow.map((h, i) => [String(h ?? ''), r[i] != null ? String(r[i]) : ''])));
      }
      const parsed = rowsFromRecords(records);
      if (parsed.length === 0) { setParseError('No valid rows found — make sure your file has Cow Code and Ear Tag columns.'); return; }
      setRows(parsed);
    } catch {
      setParseError('Could not read that file.');
    }
  };

  const addDraftRow = () => {
    if (!draft.cowCode.trim() || !draft.earTag.trim()) return;
    setRows((r) => [...r, {
      cowCode: draft.cowCode.trim(), earTag: draft.earTag.trim(),
      name: draft.name.trim() || undefined, breed: draft.breed.trim() || undefined, gender: draft.gender,
    }]);
    setDraft(EMPTY_DRAFT);
  };
  const removeRow = (i: number) => setRows((r) => r.filter((_, idx) => idx !== i));

  const submit = async () => {
    if (rows.length === 0) { onDone(); return; }
    setBusy(true);
    try {
      const res = await importCows(rows);
      push(`Imported ${res.created} cow${res.created === 1 ? '' : 's'}${res.errors.length ? `, ${res.errors.length} skipped` : ''}.`);
      onDone();
    } catch (err: any) {
      push(err.message || 'Could not import cows');
      setBusy(false);
    }
  };

  return (
    <div className="card" style={{ maxWidth: 520, margin: '0 auto' }}>
      <div className="eyebrow">FARM SETUP — STEP 3</div>
      <h2 style={{ fontSize: 20, marginTop: 4 }}>Import cows</h2>
      <p className="muted" style={{ fontSize: 13 }}>Optional — bring in your existing herd now, or add cows later from the Herd page.</p>
      <div className="row mt" style={{ gap: 8 }}>
        <button type="button" className="btn sm" onClick={() => setMethod('excel')} style={pillStyle(method === 'excel')}><FileSpreadsheet size={14} /> Import Excel</button>
        <button type="button" className="btn sm" onClick={() => setMethod('csv')} style={pillStyle(method === 'csv')}><Upload size={14} /> Upload CSV</button>
        <button type="button" className="btn sm" onClick={() => setMethod('manual')} style={pillStyle(method === 'manual')}><Keyboard size={14} /> Add Manually</button>
      </div>

      {(method === 'excel' || method === 'csv') && (
        <div className="mt">
          <input
            key={method} type="file" accept={method === 'excel' ? '.xlsx,.xls' : '.csv'}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) parseFile(f, method); }}
          />
          {parseError && <p className="error" style={{ color: 'var(--danger)', fontSize: 13, marginTop: 6 }}>{parseError}</p>}
        </div>
      )}

      {method === 'manual' && (
        <div className="mt">
          <div className="two">
            <input className="input" placeholder="Cow code" value={draft.cowCode} onChange={(e) => setDraft((d) => ({ ...d, cowCode: e.target.value }))} />
            <input className="input" placeholder="Ear tag" value={draft.earTag} onChange={(e) => setDraft((d) => ({ ...d, earTag: e.target.value }))} />
          </div>
          <div className="two mt">
            <input className="input" placeholder="Name (optional)" value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
            <input className="input" placeholder="Breed (optional)" value={draft.breed} onChange={(e) => setDraft((d) => ({ ...d, breed: e.target.value }))} />
          </div>
          <div className="row mt" style={{ gap: 8 }}>
            <select className="select" value={draft.gender} onChange={(e) => setDraft((d) => ({ ...d, gender: e.target.value as 'female' | 'male' }))}>
              <option value="female">Female</option>
              <option value="male">Male</option>
            </select>
            <button type="button" className="btn sm" onClick={addDraftRow}>Add cow</button>
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <div className="mt" style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 10 }}>
          {rows.map((r, i) => (
            <div key={i} className="row" style={{ justifyContent: 'space-between', padding: '6px 10px', borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none', fontSize: 13 }}>
              <span>{r.cowCode} — {r.earTag}{r.name ? ` — ${r.name}` : ''}</span>
              <button type="button" className="btn ghost sm" onClick={() => removeRow(i)}><X size={12} /></button>
            </div>
          ))}
        </div>
      )}

      <div className="row mt" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="muted" style={{ fontSize: 12 }}>{rows.length > 0 ? `${rows.length} cow${rows.length === 1 ? '' : 's'} ready to import` : ''}</span>
        <div className="row" style={{ gap: 10 }}>
          <button className="btn ghost" onClick={onDone} disabled={busy}>Skip for now</button>
          <button className="btn" onClick={submit} disabled={busy}>{busy ? 'Importing…' : <>Continue <ArrowRight size={15} /></>}</button>
        </div>
      </div>
    </div>
  );
}

function InviteEmployeesStep({ farm, onDone }: { farm: CreatedFarm; onDone: () => void }) {
  const { push } = useToast();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('worker');
  const [sent, setSent] = useState<{ email: string; role: string }[]>([]);
  const [busy, setBusy] = useState(false);

  const send = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    try {
      const res = await inviteToFarm(farm.id, email, role);
      push(res.devInviteLink ? `Dev mode — invite link: ${res.devInviteLink}` : res.message);
      setSent((s) => [...s, { email, role }]);
      setEmail('');
    } catch (err: any) {
      push(err.message || 'Could not send invitation');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card" style={{ maxWidth: 480, margin: '0 auto' }}>
      <div className="eyebrow">FARM SETUP — STEP 4</div>
      <h2 style={{ fontSize: 20, marginTop: 4 }}>Invite people to {farm.name}</h2>
      <p className="muted" style={{ fontSize: 13 }}>Optional — you can always invite people later from Team settings.</p>
      <form onSubmit={send} className="row mt" style={{ gap: 8 }}>
        <input className="input" type="email" placeholder="teammate@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required style={{ flex: 1 }} />
        <select className="select" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="administrator">Owner</option>
          <option value="farm_manager">Manager</option>
          <option value="veterinarian">Veterinarian</option>
          <option value="worker">Worker</option>
          <option value="accountant">Accountant</option>
          <option value="milk_collector">Milk Collector</option>
          <option value="viewer">Viewer</option>
        </select>
        <button className="btn sm" disabled={busy}>Invite</button>
      </form>
      <p className="muted" style={{ fontSize: 11, marginTop: 4 }}>Send invitation emails automatically.</p>
      {sent.length > 0 && (
        <ul className="mt" style={{ fontSize: 13 }}>
          {sent.map((s, i) => <li key={i} className="row" style={{ gap: 6, padding: '4px 0' }}><CheckCircle2 size={14} color="var(--primary)" /> {s.email} — {s.role.replace('_', ' ')}</li>)}
        </ul>
      )}
      <div className="row mt" style={{ justifyContent: 'flex-end', gap: 10 }}>
        <button className="btn ghost" onClick={onDone}>Skip for now</button>
        <button className="btn" onClick={onDone}>Go to dashboard <ArrowRight size={15} /></button>
      </div>
    </div>
  );
}

// Mirrors apps/server/src/lib/account-types.ts's flow/hintRole mapping — duplicated here
// (rather than fetched) because Onboarding needs to decide its mode synchronously, before
// any network round-trip, to avoid a flash of the wrong screen.
const OWNER_TYPES = new Set(['farm_owner', 'dairy_cooperative', 'research_institution']);
const HINT_ROLE_LABEL: Record<string, string> = {
  farm_manager: 'Farm Manager', veterinarian: 'Veterinarian', farm_worker: 'Farm Worker', accountant: 'Accountant',
};

function WaitingForInvite({ onCreateFarmInstead }: { onCreateFarmInstead: () => void }) {
  const { user, refreshMe, logout } = useAuth();
  const [checking, setChecking] = useState(false);
  const check = async () => {
    setChecking(true);
    try { await refreshMe(); } finally { setChecking(false); }
  };
  const roleLabel = user?.accountType ? HINT_ROLE_LABEL[user.accountType] : undefined;
  return (
    <div className="card" style={{ maxWidth: 420, margin: '0 auto', textAlign: 'center' }}>
      <Users size={28} color="var(--primary)" style={{ margin: '0 auto' }} />
      <h2 style={{ fontSize: 20, marginTop: 10 }}>Waiting for an invite</h2>
      {roleLabel && <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>You said you're a {roleLabel} — once a farm invites you, you'll get {roleLabel.toLowerCase()}-level access.</p>}
      <p className="muted" style={{ fontSize: 14, marginTop: 6 }}>Ask your farm administrator to invite <b>{user?.email}</b> from their Team settings. Once they do, refresh below to jump straight into the dashboard.</p>
      <button className="btn mt" style={{ width: '100%', justifyContent: 'center' }} onClick={check} disabled={checking}><RefreshCw size={15} /> {checking ? 'Checking…' : "I've been invited — check again"}</button>
      <button className="btn ghost sm mt" style={{ width: '100%', justifyContent: 'center' }} onClick={onCreateFarmInstead}>Or set up my own farm instead</button>
      <button className="btn ghost sm mt" style={{ width: '100%', justifyContent: 'center' }} onClick={logout}><LogOut size={14} /> Sign out</button>
    </div>
  );
}

export function Onboarding() {
  const { user, refreshMe } = useAuth();
  const [mode, setMode] = useState<'wizard' | 'farmSetup' | 'barns' | 'importCows' | 'invite' | 'waiting'>(
    user?.accountType && OWNER_TYPES.has(user.accountType) ? 'wizard' : 'waiting'
  );
  const [createdFarm, setCreatedFarm] = useState<CreatedFarm | null>(null);

  // farms stays empty in auth context until this resolves — that's what keeps AppShell
  // showing this onboarding flow instead of the dashboard through all the wizard steps.
  const finish = async () => { await refreshMe(); };

  return (
    <main style={{ minHeight: '100vh', padding: '40px 20px', background: 'var(--bg)' }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <div className="brand" style={{ justifyContent: 'center', marginBottom: 20 }}>
          <img className="logo" src={logoImg} alt="DairyOS" /><div><b>DairyOS</b><small>SMART DAIRY</small></div>
        </div>
        <EmailVerifyBanner />
        {mode === 'wizard' && <CreateFarmWizard onCreated={(f) => { setCreatedFarm(f); setMode('farmSetup'); }} />}
        {mode === 'farmSetup' && createdFarm && <FarmSetupWizard farm={createdFarm} onDone={() => setMode('barns')} />}
        {mode === 'barns' && createdFarm && <BarnsStep onDone={() => setMode('importCows')} />}
        {mode === 'importCows' && createdFarm && <ImportCowsStep onDone={() => setMode('invite')} />}
        {mode === 'invite' && createdFarm && <InviteEmployeesStep farm={createdFarm} onDone={finish} />}
        {mode === 'waiting' && <WaitingForInvite onCreateFarmInstead={() => setMode('wizard')} />}
      </div>
    </main>
  );
}
