import { runExecutiveOrchestrator } from '../orchestrator.js';
import { storeMemory } from '../memory/store.js';
import { query } from '../../../db/index.js';

function pct(n: number): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
}

function timeGreeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'Good night';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export async function generateDailyBrief(farmId: string, userName?: string): Promise<any> {
  const insights = await runExecutiveOrchestrator(farmId);
  const greeting = `${timeGreeting()}${userName ? `, ${userName}` : ''}`;

  const critical = insights.filter((i: any) => i.severity === 'critical');
  const high = insights.filter((i: any) => i.severity === 'high');
  const medium = insights.filter((i: any) => i.severity === 'medium');

  const topActions: string[] = [];
  for (const insight of insights) {
    if (insight.actions.length) topActions.push(`• [${insight.agent.toUpperCase()}] ${insight.title}: ${insight.actions[0]}`);
    if (topActions.length >= 5) break;
  }

  const summary = [
    `${greeting}. Here is your farm executive briefing.`,
    ``,
    `Farm health: ${critical.length} critical, ${high.length} high-priority, ${medium.length} medium-priority items.`,
    ``,
    critical.length
      ? `CRITICAL ALERTS:\n${critical.map((i: any) => `• [${i.agent.toUpperCase()}] ${i.title}\n  ${i.description}\n  Action: ${i.actions[0]}`).join('\n\n')}`
      : '',
    ``,
    high.length
      ? `HIGH PRIORITY:\n${high.slice(0, 5).map((i: any) => `• [${i.agent.toUpperCase()}] ${i.title}`).join('\n')}`
      : '',
    ``,
    topActions.length ? `TOP ACTIONS TODAY:\n${topActions.join('\n')}` : 'No urgent actions today.',
  ]
    .filter(Boolean)
    .join('\n');

  const brief = {
    kind: 'daily',
    greeting,
    generatedAt: new Date().toISOString(),
    summary,
    stats: {
      total: insights.length,
      critical: critical.length,
      high: high.length,
      medium: medium.length,
      low: insights.filter((i) => i.severity === 'low').length,
    },
    insights,
    topActions: topActions.slice(0, 5),
  };

  await query(`INSERT INTO ai_executive_briefs (farm_id, kind, data) VALUES ($1, 'daily', $2)`, [farmId, JSON.stringify(brief)]);
  await storeMemory(farmId, 'event', 'daily_brief', { stats: brief.stats, topActionCount: topActions.length }, 1.0, 'system');

  return brief;
}
