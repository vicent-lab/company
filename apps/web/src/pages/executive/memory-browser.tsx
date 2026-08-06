import { useAsync } from '../../ui';
import { useFarm } from '../../app';
import { apiGet } from '../../api';
import { isLive } from '../../api';

interface Memory {
  id: string;
  kind: string;
  key: string;
  value: any;
  confidence: number;
  source: string;
  updatedAt: string;
}

export default function MemoryBrowserPage() {
  const { farmId } = useFarm();
  const { data: memories, loading } = useAsync(async () => {
    if (!farmId || !isLive) return [];
    const res = await apiGet<any>('/executive/memory');
    return res.data || [];
  }, [farmId]);

  const kindColors: Record<string, string> = {
    fact: '#3b82f6',
    decision: '#8b5cf6',
    outcome: '#10b981',
    preference: '#f59e0b',
    event: '#6b7280',
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Farm Memory</h1>
          <p className="muted">Long-term AI memory and learned preferences</p>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div className="loading">Loading memory...</div>
        ) : !memories || memories.length === 0 ? (
          <p className="muted">No memories stored yet. The AI will automatically learn from your interactions.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Kind</th>
                <th>Key</th>
                <th>Value</th>
                <th>Confidence</th>
                <th>Source</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {memories.map((m: Memory) => (
                <tr key={m.id}>
                  <td>
                    <span className="badge" style={{ background: kindColors[m.kind] || '#6b7280' }}>
                      {m.kind}
                    </span>
                  </td>
                  <td><code>{m.key}</code></td>
                  <td>
                    <pre style={{ margin: 0, fontSize: 12, maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {JSON.stringify(m.value)}
                    </pre>
                  </td>
                  <td>{(m.confidence * 100).toFixed(0)}%</td>
                  <td className="muted">{m.source}</td>
                  <td className="muted">{new Date(m.updatedAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
