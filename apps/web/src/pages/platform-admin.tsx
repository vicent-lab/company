import { useState } from 'react';
import { PageHeader, Kpi, AnimatedCounter, useAsync, Skeleton } from '../ui';
import { getPlatformOverview, getPlatformFarms, getPlatformUsers } from '../data';
import { Building2, Users, Beef, UserPlus, ShieldAlert, MailWarning, Crown } from 'lucide-react';

type Tab = 'farms' | 'users';

export function PlatformAdmin() {
  const [tab, setTab] = useState<Tab>('farms');
  const { data: overview, loading: overviewLoading } = useAsync(getPlatformOverview, []);
  const { data: farmsRes, loading: farmsLoading } = useAsync(getPlatformFarms, []);
  const { data: usersRes, loading: usersLoading } = useAsync(getPlatformUsers, []);

  return (
    <div>
      <PageHeader eyebrow="PLATFORM ADMIN" title="Every farm, every account" desc="Cross-tenant visibility — restricted to Super Admin accounts only." />

      <div className="four mt">
        <Kpi icon={<Building2 size={18} />} label="Total farms" value={overviewLoading ? <Skeleton h={28} w={60} /> : <AnimatedCounter value={overview?.total_farms ?? 0} />} delta={overviewLoading ? '' : `+${overview?.new_farms_7d ?? 0} this week`} />
        <Kpi icon={<Users size={18} />} label="Total users" value={overviewLoading ? <Skeleton h={28} w={60} /> : <AnimatedCounter value={overview?.total_users ?? 0} />} delta={overviewLoading ? '' : `+${overview?.new_users_7d ?? 0} this week`} />
        <Kpi icon={<Beef size={18} />} label="Total cows" value={overviewLoading ? <Skeleton h={28} w={60} /> : <AnimatedCounter value={overview?.total_cows ?? 0} />} delta="across all farms" />
        <Kpi icon={<MailWarning size={18} />} label="Unverified emails" value={overviewLoading ? <Skeleton h={28} w={60} /> : <AnimatedCounter value={overview?.unverified_users ?? 0} />} tone={((overview?.unverified_users ?? 0) > 0) ? 'down' : 'up'} delta={overviewLoading ? '' : `${overview?.super_admin_count ?? 0} super admin${(overview?.super_admin_count ?? 0) === 1 ? '' : 's'}`} />
      </div>

      <div className="card reveal mt" style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', padding: 0, marginBottom: 0 }}>
        <button className={`btn ghost ${tab === 'farms' ? 'active-tab' : ''}`} style={{ borderRadius: 0, flex: 1, justifyContent: 'center', padding: '12px 14px' }} onClick={() => setTab('farms')}>
          <span className="row" style={{ gap: 6, justifyContent: 'center' }}><Building2 size={14} /> Farms</span>
        </button>
        <button className={`btn ghost ${tab === 'users' ? 'active-tab' : ''}`} style={{ borderRadius: 0, flex: 1, justifyContent: 'center', padding: '12px 14px' }} onClick={() => setTab('users')}>
          <span className="row" style={{ gap: 6, justifyContent: 'center' }}><UserPlus size={14} /> Users</span>
        </button>
      </div>

      {tab === 'farms' && (
        <div className="table-wrap mt" style={{ overflowX: 'auto' }}>
          {farmsLoading ? <div style={{ padding: 20 }}><Skeleton h={200} /></div> : (
            <table style={{ fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '10px 16px' }}>Farm</th>
                  <th style={{ textAlign: 'left', padding: '10px 16px' }}>Owner</th>
                  <th style={{ textAlign: 'left', padding: '10px 16px' }}>Location</th>
                  <th style={{ textAlign: 'left', padding: '10px 16px' }}>Production</th>
                  <th style={{ textAlign: 'right', padding: '10px 16px' }}>Cows</th>
                  <th style={{ textAlign: 'right', padding: '10px 16px' }}>Members</th>
                  <th style={{ textAlign: 'left', padding: '10px 16px' }}>Created</th>
                </tr>
              </thead>
              <tbody>
                {(farmsRes?.data ?? []).map((f) => (
                  <tr key={f.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 16px', fontWeight: 600 }}>{f.name}</td>
                    <td style={{ padding: '10px 16px' }}>
                      {f.owner_name ? <>{f.owner_name}<div className="muted" style={{ fontSize: 11 }}>{f.owner_email}</div></> : <span className="muted">—</span>}
                    </td>
                    <td style={{ padding: '10px 16px' }}>{[f.district, f.country].filter(Boolean).join(', ') || <span className="muted">—</span>}</td>
                    <td style={{ padding: '10px 16px', textTransform: 'capitalize' }}>{f.primary_production || <span className="muted">—</span>}</td>
                    <td style={{ padding: '10px 16px', textAlign: 'right' }}>{f.cows}</td>
                    <td style={{ padding: '10px 16px', textAlign: 'right' }}>{f.members}</td>
                    <td style={{ padding: '10px 16px' }} className="muted">{new Date(f.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!farmsLoading && !(farmsRes?.data ?? []).length && <p className="muted" style={{ padding: 20, fontSize: 13 }}>No farms yet.</p>}
        </div>
      )}

      {tab === 'users' && (
        <div className="table-wrap mt" style={{ overflowX: 'auto' }}>
          {usersLoading ? <div style={{ padding: 20 }}><Skeleton h={200} /></div> : (
            <table style={{ fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '10px 16px' }}>User</th>
                  <th style={{ textAlign: 'left', padding: '10px 16px' }}>Account type</th>
                  <th style={{ textAlign: 'right', padding: '10px 16px' }}>Farms</th>
                  <th style={{ textAlign: 'left', padding: '10px 16px' }}>Status</th>
                  <th style={{ textAlign: 'left', padding: '10px 16px' }}>Joined</th>
                </tr>
              </thead>
              <tbody>
                {(usersRes?.data ?? []).map((u) => (
                  <tr key={u.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 16px' }}>
                      <div className="row" style={{ gap: 6, alignItems: 'center' }}>
                        {u.is_super_admin && <Crown size={13} color="var(--warn)" />}
                        <span style={{ fontWeight: 600 }}>{u.name}</span>
                      </div>
                      <div className="muted" style={{ fontSize: 11 }}>{u.email}</div>
                    </td>
                    <td style={{ padding: '10px 16px', textTransform: 'capitalize' }}>{(u.account_type || '').replace(/_/g, ' ') || <span className="muted">—</span>}</td>
                    <td style={{ padding: '10px 16px', textAlign: 'right' }}>{u.farm_count}</td>
                    <td style={{ padding: '10px 16px' }}>
                      <div className="row" style={{ gap: 6 }}>
                        {!u.is_active && <span className="pill danger">Inactive</span>}
                        {!u.email_verified && <span className="pill warn">Unverified</span>}
                        {u.is_active && u.email_verified && <span className="pill ok">Active</span>}
                      </div>
                    </td>
                    <td style={{ padding: '10px 16px' }} className="muted">{new Date(u.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!usersLoading && !(usersRes?.data ?? []).length && <p className="muted" style={{ padding: 20, fontSize: 13 }}>No users yet.</p>}
        </div>
      )}
    </div>
  );
}
