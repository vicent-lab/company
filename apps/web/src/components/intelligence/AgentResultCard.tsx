import React from 'react';

interface AgentResultCardProps {
  agent: {
    agent: string;
    title: string;
    summary: string;
    severity: string;
    confidence: number;
    evidence: string[];
    reasoning: string[];
    risks: string[];
    recommended_actions: string[];
    expected_outcome: string;
  };
}

const severityConfig = {
  critical: { color: '#dc2626', bg: '#fef2f2', icon: '🚨' },
  high: { color: '#f59e0b', bg: '#fffbeb', icon: '⚠️' },
  medium: { color: '#3b82f6', bg: '#eff6ff', icon: 'ℹ️' },
  low: { color: '#6b7280', bg: '#f9fafb', icon: '✅' },
  info: { color: '#6b7280', bg: '#f9fafb', icon: 'ℹ️' },
};

export function AgentResultCard({ agent }: AgentResultCardProps) {
  const config = severityConfig[agent.severity as keyof typeof severityConfig] || severityConfig.low;

  return (
    <div style={{
      background: config.bg,
      borderLeft: `4px solid ${config.color}`,
      borderRadius: 8,
      padding: 16,
      marginBottom: 12,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div>
          <span style={{ fontSize: 20, marginRight: 8 }}>{config.icon}</span>
          <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: config.color, fontWeight: 600 }}>
            {agent.agent}
          </span>
        </div>
        <span style={{ fontSize: 12, color: '#6b7280' }}>{(agent.confidence * 100).toFixed(0)}% confidence</span>
      </div>

      <h4 style={{ margin: '0 0 8px', fontSize: 16, color: '#111827' }}>{agent.title}</h4>
      <p style={{ margin: '0 0 12px', fontSize: 14, color: '#4b5563', lineHeight: 1.6 }}>{agent.summary}</p>

      {agent.evidence.length > 0 && (
        <details style={{ marginBottom: 12 }}>
          <summary style={{ cursor: 'pointer', fontSize: 12, color: '#6b7280', marginBottom: 8 }}>View Evidence</summary>
          <ul style={{ paddingLeft: 20, margin: '8px 0 0', fontSize: 13 }}>
            {agent.evidence.map((e, i) => (
              <li key={i} style={{ marginBottom: 4 }}>{e}</li>
            ))}
          </ul>
        </details>
      )}

      {agent.reasoning.length > 0 && (
        <details style={{ marginBottom: 12 }}>
          <summary style={{ cursor: 'pointer', fontSize: 12, color: '#6b7280', marginBottom: 8 }}>View Reasoning</summary>
          <ol style={{ paddingLeft: 20, margin: '8px 0 0', fontSize: 13 }}>
            {agent.reasoning.map((r, i) => (
              <li key={i} style={{ marginBottom: 4 }}>{r}</li>
            ))}
          </ol>
        </details>
      )}

      {agent.risks.length > 0 && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: 10, marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#991b1b', marginBottom: 6 }}>⚠️ Risks</div>
          {agent.risks.map((risk, i) => (
            <div key={i} style={{ fontSize: 13, color: '#991b1b', marginBottom: 4 }}>• {risk}</div>
          ))}
        </div>
      )}

      {agent.recommended_actions.length > 0 && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, padding: 10, marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#166534', marginBottom: 6 }}>✅ Recommended Actions</div>
          {agent.recommended_actions.map((action, i) => (
            <div key={i} style={{ fontSize: 13, color: '#166534', marginBottom: 4 }}>• {action}</div>
          ))}
        </div>
      )}

      <div style={{ fontSize: 12, color: '#6b7280', fontStyle: 'italic' }}>
        Expected outcome: {agent.expected_outcome}
      </div>
    </div>
  );
}
