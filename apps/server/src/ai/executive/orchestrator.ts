import { runVeterinaryAgent } from './agents/veterinary-agent.js';
import { runNutritionAgent } from './agents/nutrition-agent.js';
import { runFinanceAgent } from './agents/finance-agent.js';
import { runWeatherAgent } from './agents/weather-agent.js';
import { buildChainOfThought, quantifyUncertainty } from '../executive/reasoning/chain-of-thought.js';
import { storeMemory, recallMemory } from '../executive/memory/store.js';
import { query } from '../../db/index.js';

export interface ExecutiveInsight {
  agent: string;
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  actions: string[];
  evidence: Record<string, any>;
  reasoning?: string[];
}

export async function runExecutiveOrchestrator(farmId: string): Promise<ExecutiveInsight[]> {
  const [veterinary, nutrition, finance, weather] = await Promise.all([
    runVeterinaryAgent(farmId),
    runNutritionAgent(farmId),
    runFinanceAgent(farmId),
    runWeatherAgent(farmId),
  ]);

  const all = [...veterinary, ...nutrition, ...finance, ...weather];

  for (const insight of all) {
    const reasoning = await buildChainOfThought(farmId, insight.title, [
      { source: insight.agent, signal_type: insight.title, confidence: insight.confidence, metrics: insight.evidence },
    ]);
    insight.reasoning = reasoning.map((r) => `${r.step}: ${r.evidence} (${quantifyUncertainty(r.confidence)})`);
  }

  all.sort((a, b) => {
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    const sevDiff = severityOrder[a.severity] - severityOrder[b.severity];
    if (sevDiff !== 0) return sevDiff;
    return b.confidence - a.confidence;
  });

  await storeMemory(farmId, 'event', 'last_executive_run', {
    timestamp: new Date().toISOString(),
    insightCount: all.length,
    critical: all.filter((i) => i.severity === 'critical').length,
  }, 1.0, 'system');

  return all;
}

export async function getAgentStatus(farmId: string) {
  const rows = await query(
    `SELECT agent_name, status, started_at, finished_at, error FROM ai_agent_runs WHERE farm_id=$1 ORDER BY started_at DESC LIMIT 20`,
    [farmId]
  );
  return rows.rows;
}
