import { useState } from 'react';
import { useAsync } from '../../ui';
import { useFarm } from '../../app';
import { apiSend } from '../../api';
import { isLive } from '../../api';

type Scenario = 'feed_reduction' | 'heat_stress' | 'disease_outbreak';

const SCENARIOS: Record<Scenario, { label: string; description: string; params: string[] }> = {
  feed_reduction: { label: 'Feed Cost Reduction', description: 'Simulate reducing feed costs by X%', params: ['reduction_pct'] },
  heat_stress: { label: 'Heat Stress Event', description: 'Simulate a 3-day heat wave (THI > 80)', params: ['days'] },
  disease_outbreak: { label: 'Disease Outbreak', description: 'Simulate a respiratory outbreak', params: ['affected_cows'] },
};

export default function ScenarioSimulatorPage() {
  const { farmId } = useFarm();
  const [selectedScenario, setSelectedScenario] = useState<Scenario>('feed_reduction');
  const [params, setParams] = useState<Record<string, string>>({ reduction_pct: '10', days: '3', affected_cows: '5' });
  const [result, setResult] = useState<any>(null);

  const { loading, refresh } = useAsync(async () => {
    const res = await apiSend<any>('/executive/scenario', 'POST', { scenario: selectedScenario, params: { ...params, farmId } });
    return res;
  }, [selectedScenario, JSON.stringify(params)]);

  const handleRun = () => {
    refresh();
  };

  const currentScenario = SCENARIOS[selectedScenario];

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Scenario Simulator</h1>
          <p className="muted">Model "what-if" decisions before committing</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="card">
          <h3 style={{ marginBottom: 16 }}>Select Scenario</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {(Object.keys(SCENARIOS) as Scenario[]).map((key) => (
              <button
                key={key}
                className={`btn ${selectedScenario === key ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => { setSelectedScenario(key); setResult(null); }}
                style={{ textAlign: 'left' }}
              >
                <strong>{SCENARIOS[key].label}</strong>
                <p className="muted" style={{ fontSize: 12, margin: 0 }}>{SCENARIOS[key].description}</p>
              </button>
            ))}
          </div>

          <h4 style={{ marginBottom: 8 }}>Parameters</h4>
          {currentScenario.params.map((param) => (
            <div key={param} style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 12, marginBottom: 4, textTransform: 'capitalize' }}>
                {param.replace(/_/g, ' ')}
              </label>
              <input
                type="number"
                value={params[param]}
                onChange={(e) => setParams({ ...params, [param]: e.target.value })}
                style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: 4 }}
              />
            </div>
          ))}

          <button
            className="btn btn-primary"
            onClick={handleRun}
            disabled={loading}
            style={{ width: '100%' }}
          >
            {loading ? 'Simulating...' : 'Run Simulation'}
          </button>
        </div>

        <div className="card">
          <h3>Simulation Results</h3>
          {!result ? (
            <p className="muted">Run a simulation to see projected outcomes.</p>
          ) : (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                <div style={{ padding: 12, background: '#f0fdf4', borderRadius: 8 }}>
                  <div className="muted" style={{ fontSize: 12 }}>Current State</div>
                  <div style={{ fontSize: 20, fontWeight: 700 }}>{result.current?.summary || '—'}</div>
                </div>
                <div style={{ padding: 12, background: '#fef3c7', borderRadius: 8 }}>
                  <div className="muted" style={{ fontSize: 12 }}>Projected State</div>
                  <div style={{ fontSize: 20, fontWeight: 700 }}>{result.projected?.summary || '—'}</div>
                </div>
              </div>

              {result.impacts && (
                <div>
                  <h4>Key Impacts</h4>
                  <ul>
                    {result.impacts.map((impact: any, i: number) => (
                      <li key={i} style={{ marginBottom: 8 }}>
                        <strong>{impact.metric}</strong>: {impact.change} — {impact.description}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {result.recommendations && (
                <div>
                  <h4>Recommendations</h4>
                  <ul>
                    {result.recommendations.map((rec: string, i: number) => (
                      <li key={i}>{rec}</li>
                    ))}
                  </ul>
                </div>
              )}

              {result.confidence && (
                <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>
                  Confidence: {(result.confidence * 100).toFixed(0)}% — based on historical farm data
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
