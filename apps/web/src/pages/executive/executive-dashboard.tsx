import React, { useState, useEffect } from 'react';
import { useFarm } from '../../app';
import { apiSend, apiGet } from '../../api';
import { isLive } from '../../api';
import { HealthGauge } from '../../components/gauges/HealthGauge';
import { RiskIndicator } from '../../components/gauges/RiskIndicator';
import { ActionCard } from '../../components/gauges/ActionCard';

interface BriefingData {
  question: string;
  intent: string;
  agents_used: string[];
  agent_results: any[];
  master_answer: string;
  evidence: string[];
  reasoning: string[];
  confidence: number;
  risks: string[];
  recommended_actions: string[];
  expected_outcome: string;
  follow_up_questions: string[];
  data_sources: string[];
}

export default function ExecutiveDashboard() {
  const { farmId } = useFarm();
  const [briefing, setBriefing] = useState<BriefingData | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>('');

  const loadBriefing = async () => {
    if (!isLive) return;
    setLoading(true);
    try {
      const res = await apiGet<{ ok: boolean; data: BriefingData }>('/intelligence/briefing/daily');
      if (res.ok) {
        setBriefing(res.data);
        setLastUpdated(new Date().toLocaleTimeString());
      }
    } catch (e) {
      console.error('Failed to load briefing', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBriefing();
    const interval = setInterval(loadBriefing, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const criticalRisks = briefing?.risks?.filter((r) => r.includes('CRITICAL') || r.includes('critical') || r.includes('overdue') || r.includes('sick')) || [];
  const healthScore = briefing?.agent_results?.find((r) => r.agent === 'health')?.confidence || 0.75;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Executive Dashboard</h1>
          <p className="muted">Daily AI-powered farm intelligence briefing</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {lastUpdated && <span className="muted" style={{ fontSize: 12 }}>Updated: {lastUpdated}</span>}
          <button className="btn btn-primary" onClick={loadBriefing} disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh Briefing'}
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 24 }}>
        <div className="card" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
          <HealthGauge score={healthScore * 100} />
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0, marginBottom: 12 }}>🚨 Critical Alerts</h3>
          {criticalRisks.length > 0 ? (
            criticalRisks.slice(0, 5).map((risk, i) => (
              <RiskIndicator key={i} label={`Alert ${i + 1}`} value={risk} severity="critical" />
            ))
          ) : (
            <div style={{ color: '#6b7280', fontSize: 14 }}>No critical alerts at this time.</div>
          )}
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0, marginBottom: 12 }}>📈 Risk Overview</h3>
          {briefing?.agent_results?.slice(0, 4).map((agent, i) => (
            <RiskIndicator
              key={i}
              label={agent.title}
              value={`${(agent.confidence * 100).toFixed(0)}% confidence`}
              severity={agent.severity as any}
            />
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginBottom: 24 }}>
        <div className="card">
          <h3 style={{ marginTop: 0, marginBottom: 12 }}>🎯 Today's Priorities</h3>
          {briefing?.recommended_actions?.slice(0, 5).map((action, i) => (
            <ActionCard
              key={i}
              title={`Priority ${i + 1}`}
              description={action}
              priority={i === 0 ? 'high' : i === 1 ? 'medium' : 'low'}
            />
          ))}
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0, marginBottom: 12 }}>🔮 Predictions</h3>
          {briefing?.agent_results?.filter((r) => r.agent === 'prediction').slice(0, 5).map((pred, i) => (
            <div key={i} style={{ padding: '10px 0', borderBottom: '1px solid #f3f4f6' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{pred.title}</div>
              <div style={{ fontSize: 12, color: '#4b5563', marginTop: 4 }}>{pred.summary}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0, marginBottom: 12 }}>📋 Full Daily Briefing</h3>
        <pre style={{ whiteSpace: 'pre-wrap', fontSize: 13, color: '#374151', lineHeight: 1.6, fontFamily: 'inherit' }}>
          {briefing?.master_answer || 'Loading briefing...'}
        </pre>
      </div>
    </div>
  );
}
