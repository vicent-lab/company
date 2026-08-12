import { useState, useEffect } from 'react';
import { useFarm } from '../app';
import { PageHeader, useToast, PasswordInput, Card, SectionHeader, Badge, EmptyState, IconWrap, FormField } from '../ui';
import { Save, RotateCcw, Bell, Shield, Palette, Thermometer, Tractor, Droplets, Wheat, ShieldCheck, History, Laptop, Smartphone, Monitor, X } from 'lucide-react';
import { isLive } from '../api';
import {
  get2faStatus, setup2fa, enable2fa, disable2fa,
  getLoginHistory, LoginHistoryEntry,
  getSessions, revokeSession, revokeAllOtherSessions, DeviceSession,
} from '../data';
import { useSettings, DEFAULT_SETTINGS } from '../lib/useSettings';

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
      <Card padding="md">
        <p className="muted" style={{ fontSize: 13 }}>Security settings are available once connected to a live account.</p>
      </Card>
    );
  }

  return (
    <>
      <Card padding="md">
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center' }}>
          <IconWrap size={36}><ShieldCheck size={18} /></IconWrap>
          <h3 style={{ margin: 0, fontSize: 16 }}>Two-factor authentication</h3>
        </div>
        {twoFaEnabled === null ? (
          <p className="muted" style={{ fontSize: 13 }}>Loading…</p>
        ) : twoFaEnabled ? (
          <>
            <p className="muted" style={{ fontSize: 13 }}>Enabled — sign-in requires a code from your authenticator app.</p>
            {!showDisable ? (
              <button className="btn ghost sm mt" onClick={() => setShowDisable(true)}>Turn off 2FA</button>
            ) : (
               <form onSubmit={confirmDisable} className="row mt stack-sm" style={{ gap: 8 }}>
                 <div style={{ flex: 1, minWidth: 0 }}><PasswordInput placeholder="Confirm your password" value={disablePassword} onChange={setDisablePassword} required /></div>
                 <div className="row" style={{ gap: 8 }}>
                   <button className="btn sm" disabled={busy}>{busy ? 'Disabling…' : 'Confirm'}</button>
                   <button type="button" className="btn ghost sm" onClick={() => setShowDisable(false)}>Cancel</button>
                 </div>
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
      </Card>

      <Card padding="md">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <IconWrap size={36}><Laptop size={18} /></IconWrap>
            <h3 style={{ margin: 0, fontSize: 16 }}>Active sessions</h3>
          </div>
          {sessions.length > 1 && <button className="btn ghost sm" onClick={doRevokeAll}>Sign out other devices</button>}
        </div>
        {sessions.length === 0 ? <p className="muted" style={{ fontSize: 13 }}>{loadingData ? 'Loading…' : 'No active sessions.'}</p> : (
          <div>
            {sessions.map((s) => {
              const Icon = deviceIcon(s.userAgent);
              return (
                <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
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
      </Card>

      <Card padding="md">
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center' }}>
          <IconWrap size={36}><History size={18} /></IconWrap>
          <h3 style={{ margin: 0, fontSize: 16 }}>Login history</h3>
        </div>
        {history.length === 0 ? <p className="muted" style={{ fontSize: 13 }}>{loadingData ? 'Loading…' : 'No recent activity.'}</p> : (
          <div>
            {history.map((h, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 13, color: h.success ? 'var(--text)' : 'var(--danger)' }}>{h.success ? 'Successful sign-in' : loginFailureLabel(h.reason)}</span>
                <span className="muted" style={{ fontSize: 11 }}>{new Date(h.created_at).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}

export function Settings() {
  const { farmId } = useFarm();
  const { push } = useToast();
  const { settings, save, reset, update } = useSettings();
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    const ok = await save();
    if (ok) push('Settings saved'); else push('Failed to save settings');
    setSaving(false);
  };

  const handleReset = () => {
    reset();
    push('Settings reset to defaults');
  };

  return (
    <div>
      <PageHeader eyebrow="SETTINGS" title="Farm configuration" desc="Manage alerts, thresholds, display preferences, and automation rules for your farm."
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn ghost sm" onClick={handleReset}><RotateCcw size={14} /> Reset</button>
            <button className="btn" onClick={handleSave} disabled={saving}><Save size={14} /> {saving ? 'Saving…' : 'Save settings'}</button>
          </div>
        }
      />

      <Card padding="md">
        <SectionHeader title="General" action={
          <IconWrap size={28} color="var(--primary)"><Tractor size={14} /></IconWrap>
        } />
        <FormField label="Farm name">
          <input className="input" value={settings.farmName} onChange={(e) => update(['farmName'], e.target.value)} />
        </FormField>
      </Card>

      <Card padding="md">
        <SectionHeader title="Alerts & Notifications" subtitle="Control how and when you receive farm alerts" action={
          <IconWrap size={28} color="var(--primary)"><Bell size={14} /></IconWrap>
        } />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {[
            ['Email notifications', settings.alerts.emailNotifications, ['alerts', 'emailNotifications']],
            ['SMS notifications', settings.alerts.smsNotifications, ['alerts', 'smsNotifications']],
            ['Push notifications', settings.alerts.pushNotifications, ['alerts', 'pushNotifications']],
            ['Critical alerts only', settings.alerts.criticalOnly, ['alerts', 'criticalOnly']],
            ['Sound alerts', settings.alerts.soundEnabled, ['alerts', 'soundEnabled']],
          ].map(([label, value, path]) => (
            <div key={String(path)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 14 }}>{label}</span>
              <Badge variant={value ? 'success' : 'default'}>{value ? 'On' : 'Off'}</Badge>
            </div>
          ))}
        </div>
      </Card>

      <Card padding="md">
        <SectionHeader title="Alert Thresholds" action={
          <IconWrap size={28} color="var(--primary)"><Thermometer size={14} /></IconWrap>
        } />
        <div className="grid grid-form" style={{ gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
          <FormField label="Heat stress THI threshold">
            <input className="input" type="number" value={settings.thresholds.heatStressTHI} onChange={(e) => update(['thresholds', 'heatStressTHI'], Number(e.target.value))} />
          </FormField>
          <FormField label="Milk drop warning (%)">
            <input className="input" type="number" value={settings.thresholds.lowMilkDropPct} onChange={(e) => update(['thresholds', 'lowMilkDropPct'], Number(e.target.value))} />
          </FormField>
          <FormField label="Low body condition score">
            <input className="input" type="number" value={settings.thresholds.lowBodyConditionScore} onChange={(e) => update(['thresholds', 'lowBodyConditionScore'], Number(e.target.value))} />
          </FormField>
          <FormField label="High lameness score">
            <input className="input" type="number" value={settings.thresholds.highLamenessScore} onChange={(e) => update(['thresholds', 'highLamenessScore'], Number(e.target.value))} />
          </FormField>
          <FormField label="Feed stock warning (days)">
            <input className="input" type="number" value={settings.thresholds.feedStockDaysWarning} onChange={(e) => update(['thresholds', 'feedStockDaysWarning'], Number(e.target.value))} />
          </FormField>
          <FormField label="Feed stock critical (days)">
            <input className="input" type="number" value={settings.thresholds.feedStockDaysCritical} onChange={(e) => update(['thresholds', 'feedStockDaysCritical'], Number(e.target.value))} />
          </FormField>
          <FormField label="Medicine expiry warning (days)">
            <input className="input" type="number" value={settings.thresholds.medicineExpiryDays} onChange={(e) => update(['thresholds', 'medicineExpiryDays'], Number(e.target.value))} />
          </FormField>
          <FormField label="Vaccination due warning (days)">
            <input className="input" type="number" value={settings.thresholds.vaccinationDueDays} onChange={(e) => update(['thresholds', 'vaccinationDueDays'], Number(e.target.value))} />
          </FormField>
        </div>
      </Card>

      <Card padding="md">
        <SectionHeader title="Display" subtitle="Visual preferences and localization" action={
          <IconWrap size={28} color="var(--primary)"><Palette size={14} /></IconWrap>
        } />
        <div className="grid grid-form" style={{ gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
          <FormField label="Theme">
            <select className="select" value={settings.display.theme} onChange={(e) => update(['display', 'theme'], e.target.value)}>
              <option value="light">Light</option><option value="dark">Dark</option><option value="system">System</option>
            </select>
          </FormField>
          <FormField label="Language">
            <select className="select" value={settings.display.language} onChange={(e) => update(['display', 'language'], e.target.value)}>
              <option value="en">English</option><option value="fr">French</option><option value="sw">Swahili</option>
            </select>
          </FormField>
          <FormField label="Date format">
            <select className="select" value={settings.display.dateFormat} onChange={(e) => update(['display', 'dateFormat'], e.target.value)}>
              <option value="DD/MM/YYYY">DD/MM/YYYY</option><option value="MM/DD/YYYY">MM/DD/YYYY</option><option value="YYYY-MM-DD">YYYY-MM-DD</option>
            </select>
          </FormField>
          <FormField label="Currency">
            <select className="select" value={settings.display.currency} onChange={(e) => update(['display', 'currency'], e.target.value)}>
              <option value="UGX">UGX</option><option value="USD">USD</option><option value="EUR">EUR</option>
            </select>
          </FormField>
        </div>
      </Card>

      <Card padding="md">
        <SectionHeader title="Automation" subtitle="Rules and AI-driven automation preferences" action={
          <IconWrap size={28} color="var(--primary)"><Shield size={14} /></IconWrap>
        } />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {[
            ['Auto-reorder feed when low', settings.automation.autoReorderFeed, ['automation', 'autoReorderFeed']],
            ['Auto-acknowledge low-risk insights', settings.automation.autoAcknowledgeLowRisk, ['automation', 'autoAcknowledgeLowRisk']],
            ['Auto-schedule checkups for sick cows', settings.automation.autoScheduleCheckups, ['automation', 'autoScheduleCheckups']],
            ['Daily AI advice', settings.automation.dailyAdviceEnabled, ['automation', 'dailyAdviceEnabled']],
            ['Continuous learning (AI improves from feedback)', settings.automation.continuousLearning, ['automation', 'continuousLearning']],
          ].map(([label, value, path]) => (
            <div key={String(path)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 14 }}>{label}</span>
              <Badge variant={value ? 'success' : 'default'}>{value ? 'On' : 'Off'}</Badge>
            </div>
          ))}
        </div>
      </Card>

      <div style={{ marginTop: 28 }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>Security</h2>
        <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>Two-factor authentication, active sessions, and recent sign-in activity.</p>
      </div>
      <SecuritySection />
    </div>
  );
}
