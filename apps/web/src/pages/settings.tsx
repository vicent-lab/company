import { useState, useEffect } from 'react';
import { useFarm } from '../app';
import { PageHeader, useToast, PasswordInput } from '../ui';
import { Save, RotateCcw, Bell, Shield, Palette, Thermometer, Tractor, Droplets, Wheat, ShieldCheck, History, Laptop, Smartphone, Monitor, X } from 'lucide-react';
import { isLive } from '../api';
import {
  get2faStatus, setup2fa, enable2fa, disable2fa,
  getLoginHistory, LoginHistoryEntry,
  getSessions, revokeSession, revokeAllOtherSessions, DeviceSession,
} from '../data';

const STORAGE_KEY = 'dairyos_settings';

interface FarmSettings {
  farmName: string;
  alerts: {
    emailNotifications: boolean;
    smsNotifications: boolean;
    pushNotifications: boolean;
    criticalOnly: boolean;
    soundEnabled: boolean;
  };
  thresholds: {
    heatStressTHI: number;
    lowMilkDropPct: number;
    lowBodyConditionScore: number;
    highLamenessScore: number;
    feedStockDaysWarning: number;
    feedStockDaysCritical: number;
    medicineExpiryDays: number;
    vaccinationDueDays: number;
  };
  display: {
    theme: 'light' | 'dark' | 'system';
    language: 'en' | 'fr' | 'sw';
    dateFormat: 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';
    currency: 'UGX' | 'USD' | 'EUR';
  };
  automation: {
    autoReorderFeed: boolean;
    autoAcknowledgeLowRisk: boolean;
    autoScheduleCheckups: boolean;
    dailyAdviceEnabled: boolean;
    continuousLearning: boolean;
  };
}

const DEFAULT_SETTINGS: FarmSettings = {
  farmName: 'Greenfield Farm',
  alerts: {
    emailNotifications: true,
    smsNotifications: false,
    pushNotifications: true,
    criticalOnly: false,
    soundEnabled: true,
  },
  thresholds: {
    heatStressTHI: 72,
    lowMilkDropPct: 15,
    lowBodyConditionScore: 2,
    highLamenessScore: 3,
    feedStockDaysWarning: 7,
    feedStockDaysCritical: 3,
    medicineExpiryDays: 14,
    vaccinationDueDays: 7,
  },
  display: {
    theme: 'system',
    language: 'en',
    dateFormat: 'DD/MM/YYYY',
    currency: 'UGX',
  },
  automation: {
    autoReorderFeed: true,
    autoAcknowledgeLowRisk: false,
    autoScheduleCheckups: true,
    dailyAdviceEnabled: true,
    continuousLearning: true,
  },
};

function deviceIcon(userAgent: string | null) {
  if (!userAgent) return Monitor;
  if (/mobile|android|iphone/i.test(userAgent)) return Smartphone;
  return Laptop;
}

function loginFailureLabel(reason: string): string {
  switch (reason) {
    case 'invalid_password': return 'Failed sign-in — wrong password';
    case 'locked': return 'Blocked — account locked';
    case '2fa_invalid': return 'Failed sign-in — wrong 2FA code';
    default: return 'Failed sign-in';
  }
}

function SecuritySection() {
  const { push } = useToast();
  const [twoFaEnabled, setTwoFaEnabled] = useState<boolean | null>(null);
  const [setupData, setSetupData] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');
  const [showDisable, setShowDisable] = useState(false);

  const [history, setHistory] = useState<LoginHistoryEntry[]>([]);
  const [sessions, setSessions] = useState<DeviceSession[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  const load = async () => {
    setLoadingData(true);
    try {
      const [status, hist, sess] = await Promise.all([get2faStatus(), getLoginHistory(), getSessions()]);
      setTwoFaEnabled(status.enabled);
      setHistory(hist.data);
      setSessions(sess.data);
    } catch { /* best-effort */ }
    finally { setLoadingData(false); }
  };
  useEffect(() => { if (isLive) load(); }, []);

  const startSetup = async () => {
    setBusy(true);
    try { setSetupData(await setup2fa()); } catch (err: any) { push(err.message || 'Could not start 2FA setup'); }
    finally { setBusy(false); }
  };
  const confirmEnable = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    try { await enable2fa(code); push('Two-factor authentication enabled.'); setSetupData(null); setCode(''); await load(); }
    catch (err: any) { push(err.message || 'Incorrect code'); }
    finally { setBusy(false); }
  };
  const confirmDisable = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    try { await disable2fa(disablePassword); push('Two-factor authentication disabled.'); setShowDisable(false); setDisablePassword(''); await load(); }
    catch (err: any) { push(err.message || 'Incorrect password'); }
    finally { setBusy(false); }
  };

  const doRevoke = async (id: string) => {
    try { await revokeSession(id); push('Device signed out.'); await load(); }
    catch (err: any) { push(err.message || 'Could not sign out that device'); }
  };
  const doRevokeAll = async () => {
    try { const res = await revokeAllOtherSessions(); push(res.message); await load(); }
    catch (err: any) { push(err.message || 'Could not sign out other devices'); }
  };

  if (!isLive) {
    return (
      <div className="card mt" style={{ padding: 20 }}>
        <p className="muted" style={{ fontSize: 13 }}>Security settings are available once connected to a live account.</p>
      </div>
    );
  }

  return (
    <>
      <div className="card mt" style={{ padding: 20 }}>
        <div className="row" style={{ gap: 10, marginBottom: 16, alignItems: 'center' }}>
          <div className="icon" style={{ width: 36, height: 36, borderRadius: 10, display: 'grid', placeItems: 'center', background: 'var(--primary-soft)', color: 'var(--primary)' }}><ShieldCheck size={18} /></div>
          <h3 style={{ margin: 0 }}>Two-factor authentication</h3>
        </div>
        {twoFaEnabled === null ? (
          <p className="muted" style={{ fontSize: 13 }}>Loading…</p>
        ) : twoFaEnabled ? (
          <>
            <p className="muted" style={{ fontSize: 13 }}>Enabled — sign-in requires a code from your authenticator app.</p>
            {!showDisable ? (
              <button className="btn ghost sm mt" onClick={() => setShowDisable(true)}>Turn off 2FA</button>
            ) : (
              <form onSubmit={confirmDisable} className="row mt" style={{ gap: 8 }}>
                <div style={{ flex: 1 }}><PasswordInput placeholder="Confirm your password" value={disablePassword} onChange={setDisablePassword} required /></div>
                <button className="btn sm" disabled={busy}>{busy ? 'Disabling…' : 'Confirm'}</button>
                <button type="button" className="btn ghost sm" onClick={() => setShowDisable(false)}>Cancel</button>
              </form>
            )}
          </>
        ) : setupData ? (
          <form onSubmit={confirmEnable}>
            <p className="muted" style={{ fontSize: 13 }}>Add this account to your authenticator app (Google Authenticator, Authy, 1Password…) by entering the key manually:</p>
            <code style={{ display: 'block', background: 'var(--surface-2)', padding: '10px 12px', borderRadius: 8, fontSize: 13, wordBreak: 'break-all', margin: '8px 0' }}>{setupData.secret}</code>
            <label className="field">Enter the 6-digit code it generates
              <input className="input" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} required />
            </label>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn sm" disabled={busy || code.length !== 6}>{busy ? 'Verifying…' : 'Enable 2FA'}</button>
              <button type="button" className="btn ghost sm" onClick={() => { setSetupData(null); setCode(''); }}>Cancel</button>
            </div>
          </form>
        ) : (
          <>
            <p className="muted" style={{ fontSize: 13 }}>Not enabled. Add a second step to sign-in using an authenticator app.</p>
            <button className="btn sm mt" onClick={startSetup} disabled={busy}>{busy ? 'Starting…' : 'Set up 2FA'}</button>
          </>
        )}
      </div>

      <div className="card mt" style={{ padding: 20 }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div className="row" style={{ gap: 10, alignItems: 'center' }}>
            <div className="icon" style={{ width: 36, height: 36, borderRadius: 10, display: 'grid', placeItems: 'center', background: 'var(--primary-soft)', color: 'var(--primary)' }}><Laptop size={18} /></div>
            <h3 style={{ margin: 0 }}>Active sessions</h3>
          </div>
          {sessions.length > 1 && <button className="btn ghost sm" onClick={doRevokeAll}>Sign out other devices</button>}
        </div>
        {sessions.length === 0 ? <p className="muted" style={{ fontSize: 13 }}>{loadingData ? 'Loading…' : 'No active sessions.'}</p> : (
          <div>
            {sessions.map((s) => {
              const Icon = deviceIcon(s.userAgent);
              return (
                <div key={s.id} className="row" style={{ justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                  <div className="row" style={{ gap: 10, alignItems: 'center' }}>
                    <Icon size={16} color="var(--text-soft)" />
                    <div>
                      <div style={{ fontSize: 13 }}>
                        {s.userAgent || 'Unknown device'}
                        {s.isCurrent && <span className="muted" style={{ marginLeft: 8, fontSize: 11, border: '1px solid var(--border)', borderRadius: 6, padding: '1px 6px' }}>This device</span>}
                      </div>
                      <div className="muted" style={{ fontSize: 11 }}>Last active {new Date(s.lastSeenAt).toLocaleString()}</div>
                    </div>
                  </div>
                  {!s.isCurrent && <button className="btn ghost sm" onClick={() => doRevoke(s.id)}><X size={12} /> Sign out</button>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="card mt" style={{ padding: 20 }}>
        <div className="row" style={{ gap: 10, marginBottom: 16, alignItems: 'center' }}>
          <div className="icon" style={{ width: 36, height: 36, borderRadius: 10, display: 'grid', placeItems: 'center', background: 'var(--primary-soft)', color: 'var(--primary)' }}><History size={18} /></div>
          <h3 style={{ margin: 0 }}>Login history</h3>
        </div>
        {history.length === 0 ? <p className="muted" style={{ fontSize: 13 }}>{loadingData ? 'Loading…' : 'No recent activity.'}</p> : (
          <div>
            {history.map((h, i) => (
              <div key={i} className="row" style={{ justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 13, color: h.success ? 'var(--text)' : 'var(--danger)' }}>{h.success ? 'Successful sign-in' : loginFailureLabel(h.reason)}</span>
                <span className="muted" style={{ fontSize: 11 }}>{new Date(h.created_at).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

export function Settings() {
  const { farmId } = useFarm();
  const { push } = useToast();
  const [settings, setSettings] = useState<FarmSettings>(DEFAULT_SETTINGS);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        setSettings({ ...DEFAULT_SETTINGS, ...parsed, alerts: { ...DEFAULT_SETTINGS.alerts, ...(parsed.alerts || {}) }, thresholds: { ...DEFAULT_SETTINGS.thresholds, ...(parsed.thresholds || {}) }, display: { ...DEFAULT_SETTINGS.display, ...(parsed.display || {}) }, automation: { ...DEFAULT_SETTINGS.automation, ...(parsed.automation || {}) } });
      }
    } catch { /* ignore */ }
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      push('Settings saved');
    } catch { push('Failed to save settings'); }
    setSaving(false);
  };

  const reset = () => {
    setSettings(DEFAULT_SETTINGS);
    push('Settings reset to defaults');
  };

  const update = (path: string[], value: any) => {
    setSettings((prev) => {
      const next = { ...prev };
      let cur: any = next;
      for (let i = 0; i < path.length - 1; i++) cur = cur[path[i]];
      cur[path[path.length - 1]] = value;
      return next;
    });
  };

  const Section = ({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) => (
    <div className="card mt" style={{ padding: 20 }}>
      <div className="row" style={{ gap: 10, marginBottom: 16, alignItems: 'center' }}>
        <div className="icon" style={{ width: 36, height: 36, borderRadius: 10, display: 'grid', placeItems: 'center', background: 'var(--primary-soft)', color: 'var(--primary)' }}><Icon size={18} /></div>
        <h3 style={{ margin: 0 }}>{title}</h3>
      </div>
      {children}
    </div>
  );

  const Toggle = ({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) => (
    <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: 14 }}>{label}</span>
      <button className={`btn sm ${value ? '' : 'ghost'}`} onClick={() => onChange(!value)}>{value ? 'On' : 'Off'}</button>
    </div>
  );

  return (
    <div>
      <PageHeader eyebrow="SETTINGS" title="Farm configuration" desc="Manage alerts, thresholds, display preferences, and automation rules for your farm."
        actions={
          <div className="row" style={{ gap: 8 }}>
            <button className="btn ghost sm" onClick={reset}><RotateCcw size={14} /> Reset</button>
            <button className="btn" onClick={save} disabled={saving}><Save size={14} /> {saving ? 'Saving…' : 'Save settings'}</button>
          </div>
        }
      />

      <Section title="General" icon={Tractor}>
        <div className="field"><label>Farm name</label><input className="input" value={settings.farmName} onChange={(e) => update(['farmName'], e.target.value)} /></div>
      </Section>

      <Section title="Alerts & Notifications" icon={Bell}>
        <Toggle label="Email notifications" value={settings.alerts.emailNotifications} onChange={(v) => update(['alerts', 'emailNotifications'], v)} />
        <Toggle label="SMS notifications" value={settings.alerts.smsNotifications} onChange={(v) => update(['alerts', 'smsNotifications'], v)} />
        <Toggle label="Push notifications" value={settings.alerts.pushNotifications} onChange={(v) => update(['alerts', 'pushNotifications'], v)} />
        <Toggle label="Critical alerts only" value={settings.alerts.criticalOnly} onChange={(v) => update(['alerts', 'criticalOnly'], v)} />
        <Toggle label="Sound alerts" value={settings.alerts.soundEnabled} onChange={(v) => update(['alerts', 'soundEnabled'], v)} />
      </Section>

      <Section title="Alert Thresholds" icon={Thermometer}>
        <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
          <div className="field" style={{ minWidth: 200 }}><label>Heat stress THI threshold</label><input className="input" type="number" value={settings.thresholds.heatStressTHI} onChange={(e) => update(['thresholds', 'heatStressTHI'], Number(e.target.value))} /></div>
          <div className="field" style={{ minWidth: 200 }}><label>Milk drop warning (%)</label><input className="input" type="number" value={settings.thresholds.lowMilkDropPct} onChange={(e) => update(['thresholds', 'lowMilkDropPct'], Number(e.target.value))} /></div>
          <div className="field" style={{ minWidth: 200 }}><label>Low body condition score</label><input className="input" type="number" value={settings.thresholds.lowBodyConditionScore} onChange={(e) => update(['thresholds', 'lowBodyConditionScore'], Number(e.target.value))} /></div>
          <div className="field" style={{ minWidth: 200 }}><label>High lameness score</label><input className="input" type="number" value={settings.thresholds.highLamenessScore} onChange={(e) => update(['thresholds', 'highLamenessScore'], Number(e.target.value))} /></div>
          <div className="field" style={{ minWidth: 200 }}><label>Feed stock warning (days)</label><input className="input" type="number" value={settings.thresholds.feedStockDaysWarning} onChange={(e) => update(['thresholds', 'feedStockDaysWarning'], Number(e.target.value))} /></div>
          <div className="field" style={{ minWidth: 200 }}><label>Feed stock critical (days)</label><input className="input" type="number" value={settings.thresholds.feedStockDaysCritical} onChange={(e) => update(['thresholds', 'feedStockDaysCritical'], Number(e.target.value))} /></div>
          <div className="field" style={{ minWidth: 200 }}><label>Medicine expiry warning (days)</label><input className="input" type="number" value={settings.thresholds.medicineExpiryDays} onChange={(e) => update(['thresholds', 'medicineExpiryDays'], Number(e.target.value))} /></div>
          <div className="field" style={{ minWidth: 200 }}><label>Vaccination due warning (days)</label><input className="input" type="number" value={settings.thresholds.vaccinationDueDays} onChange={(e) => update(['thresholds', 'vaccinationDueDays'], Number(e.target.value))} /></div>
        </div>
      </Section>

      <Section title="Display" icon={Palette}>
        <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
          <div className="field" style={{ minWidth: 200 }}>
            <label>Theme</label>
            <select className="select" value={settings.display.theme} onChange={(e) => update(['display', 'theme'], e.target.value)}>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="system">System</option>
            </select>
          </div>
          <div className="field" style={{ minWidth: 200 }}>
            <label>Language</label>
            <select className="select" value={settings.display.language} onChange={(e) => update(['display', 'language'], e.target.value)}>
              <option value="en">English</option>
              <option value="fr">French</option>
              <option value="sw">Swahili</option>
            </select>
          </div>
          <div className="field" style={{ minWidth: 200 }}>
            <label>Date format</label>
            <select className="select" value={settings.display.dateFormat} onChange={(e) => update(['display', 'dateFormat'], e.target.value)}>
              <option value="DD/MM/YYYY">DD/MM/YYYY</option>
              <option value="MM/DD/YYYY">MM/DD/YYYY</option>
              <option value="YYYY-MM-DD">YYYY-MM-DD</option>
            </select>
          </div>
          <div className="field" style={{ minWidth: 200 }}>
            <label>Currency</label>
            <select className="select" value={settings.display.currency} onChange={(e) => update(['display', 'currency'], e.target.value)}>
              <option value="UGX">UGX</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
            </select>
          </div>
        </div>
      </Section>

      <Section title="Automation" icon={Shield}>
        <Toggle label="Auto-reorder feed when low" value={settings.automation.autoReorderFeed} onChange={(v) => update(['automation', 'autoReorderFeed'], v)} />
        <Toggle label="Auto-acknowledge low-risk insights" value={settings.automation.autoAcknowledgeLowRisk} onChange={(v) => update(['automation', 'autoAcknowledgeLowRisk'], v)} />
        <Toggle label="Auto-schedule checkups for sick cows" value={settings.automation.autoScheduleCheckups} onChange={(v) => update(['automation', 'autoScheduleCheckups'], v)} />
        <Toggle label="Daily AI advice" value={settings.automation.dailyAdviceEnabled} onChange={(v) => update(['automation', 'dailyAdviceEnabled'], v)} />
        <Toggle label="Continuous learning (AI improves from feedback)" value={settings.automation.continuousLearning} onChange={(v) => update(['automation', 'continuousLearning'], v)} />
      </Section>

      <h3 style={{ marginTop: 28, marginBottom: 4 }}>Security</h3>
      <p className="muted" style={{ fontSize: 13, margin: 0 }}>Two-factor authentication, active sessions, and recent sign-in activity.</p>
      <SecuritySection />
    </div>
  );
}
