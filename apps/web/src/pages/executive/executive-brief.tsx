import { useState, useEffect, useRef } from 'react';
import { useAsync } from '../../ui';
import { useFarm } from '../../app';
import { apiGet } from '../../api';
import { isLive } from '../../api';

interface Insight {
  agent: string;
  title: string;
  description: string;
  severity: string;
  confidence: number;
  actions: string[];
  reasoning?: string[];
}

interface Brief {
  kind: string;
  greeting: string;
  generatedAt: string;
  summary: string;
  stats: { total: number; critical: number; high: number; medium: number; low: number };
  insights: Insight[];
  topActions: string[];
}

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function ExecutiveBriefPage() {
  const { farmId } = useFarm();
  const [brief, setBrief] = useState<Brief | null>(null);
  const { loading, refresh } = useAsync(async () => {
    if (!farmId || !isLive) return null;
    const res = await apiGet<any>('/executive/brief/daily');
    return res.data;
  }, [farmId]);

  const severityColor: Record<string, string> = {
    critical: '#dc2626',
    high: '#f59e0b',
    medium: '#3b82f6',
    low: '#6b7280',
  };

  useEffect(() => {
    refresh();
  }, [farmId]);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Executive Briefing</h1>
          <p className="muted">AI-powered daily farm intelligence</p>
        </div>
        <button className="btn btn-primary" onClick={() => refresh()} disabled={loading}>
          {loading ? 'Analyzing...' : 'Refresh'}
        </button>
      </div>

      {brief && (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-header">
              <h2>{brief.greeting}</h2>
              <span className="muted">{timeAgo(brief.generatedAt)}</span>
            </div>
            <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>{brief.summary}</pre>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 16 }}>
            {[
              { label: 'Critical', value: brief.stats.critical, color: severityColor.critical },
              { label: 'High', value: brief.stats.high, color: severityColor.high },
              { label: 'Medium', value: brief.stats.medium, color: severityColor.medium },
              { label: 'Low', value: brief.stats.low, color: severityColor.low },
            ].map((stat) => (
              <div key={stat.label} className="card" style={{ textAlign: 'center', borderTop: `3px solid ${stat.color}` }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: stat.color }}>{stat.value}</div>
                <div className="muted" style={{ fontSize: 12 }}>{stat.label}</div>
              </div>
            ))}
          </div>

          {brief.topActions.length > 0 && (
            <div className="card" style={{ marginBottom: 16 }}>
              <h3>Top Actions Today</h3>
              <ul style={{ paddingLeft: 20 }}>
                {brief.topActions.map((action, i) => (
                  <li key={i} style={{ marginBottom: 8 }}>{action}</li>
                ))}
              </ul>
            </div>
          )}

          <h3 style={{ marginBottom: 12 }}>Executive Insights</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {brief.insights.map((insight, i) => (
              <div key={i} className="card" style={{ borderLeft: `4px solid ${severityColor[insight.severity]}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div>
                    <span className="badge" style={{ background: severityColor[insight.severity], marginRight: 8 }}>{insight.severity}</span>
                    <span className="badge badge-secondary">{insight.agent}</span>
                  </div>
                  <span className="muted" style={{ fontSize: 12 }}>{(insight.confidence * 100).toFixed(0)}% confidence</span>
                </div>
                <h4 style={{ marginBottom: 4 }}>{insight.title}</h4>
                <p className="muted" style={{ marginBottom: 8 }}>{insight.description}</p>
                {insight.reasoning && insight.reasoning.length > 0 && (
                  <details style={{ marginBottom: 8 }}>
                    <summary className="muted" style={{ cursor: 'pointer', fontSize: 12 }}>View reasoning chain</summary>
                    <ul style={{ paddingLeft: 20, marginTop: 8 }}>
                      {insight.reasoning.map((r, j) => (
                        <li key={j} style={{ fontSize: 12, marginBottom: 4 }}>{r}</li>
                      ))}
                    </ul>
                  </details>
                )}
                {insight.actions.length > 0 && (
                  <div style={{ background: '#f9fafb', padding: 8, borderRadius: 4 }}>
                    <strong style={{ fontSize: 12 }}>Recommended action:</strong>
                    <p style={{ margin: '4px 0 0', fontSize: 14 }}>{insight.actions[0]}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {loading && <div className="loading">Generating executive briefing...</div>}
    </div>
  );
}
