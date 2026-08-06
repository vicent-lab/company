import { useAsync } from '../../ui';
import { useFarm } from '../../app';
import { apiGet } from '../../api';
import { isLive } from '../../api';

interface AgentRun {
  agent_name: string;
  status: string;
  started_at: string;
  finished_at?: string;
  error?: string;
}

export default function AgentStatusPage() {
  const { farmId } = useFarm();
  const { data: runs, loading } = useAsync(async () => {
    if (!farmId || !isLive) return [];
    const res = await apiGet<any>('/executive/agents');
    return res.data || [];
  }, [farmId]);

  const agents = ['veterinary', 'nutrition', 'finance', 'weather'];
  const latestByAgent = agents.map((agent) => (runs || []).find((r: AgentRun) => r.agent_name === agent) || null);

  const statusColor: Record<string, string> = {
    running: '#f59e0b',
    completed: '#10b981',
    failed: '#dc2626',
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Agent Status</h1>
          <p className="muted">Real-time multi-agent monitoring</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 24 }}>
        {latestByAgent.map((run, i) => {
          const agent = agents[i];
          return (
            <div key={agent} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <h3 style={{ margin: 0, textTransform: 'capitalize' }}>{agent}</h3>
                {run && (
                  <span className="badge" style={{ background: statusColor[run.status] || '#6b7280' }}>
                    {run.status}
                  </span>
                )}
              </div>
              {run ? (
                <>
                  <p className="muted" style={{ fontSize: 12 }}>
                    Last run: {new Date(run.started_at).toLocaleString()}
                    {run.finished_at && ` → ${new Date(run.finished_at).toLocaleString()}`}
                  </p>
                  {run.error && <p style={{ color: '#dc2626', fontSize: 12 }}>{run.error}</p>}
                </>
              ) : (
                <p className="muted" style={{ fontSize: 12 }}>No recent runs</p>
              )}
            </div>
          );
        })}
      </div>

      <div className="card">
        <h3>Recent Agent Runs</h3>
        {!runs || runs.length === 0 ? (
          <p className="muted">No agent runs yet</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Agent</th>
                <th>Status</th>
                <th>Started</th>
                <th>Finished</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run: AgentRun, i: number) => (
                <tr key={i}>
                  <td style={{ textTransform: 'capitalize' }}>{run.agent_name}</td>
                  <td>
                    <span className="badge" style={{ background: statusColor[run.status] || '#6b7280' }}>
                      {run.status}
                    </span>
                  </td>
                  <td>{new Date(run.started_at).toLocaleString()}</td>
                  <td>{run.finished_at ? new Date(run.finished_at).toLocaleString() : '—'}</td>
                  <td className="muted">{run.error || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
