import { runExecutiveOrchestrator } from '../orchestrator.js';
import { query } from '../../../db/index.js';

export async function generateWeeklyReview(farmId: string): Promise<any> {
  const [expenseRes, incomeRes, milkRes, insightsRes, followUpRes] = await Promise.all([
    query(`SELECT category, SUM(amount) AS total FROM expenses WHERE farm_id=$1 AND incurred_on >= CURRENT_DATE - INTERVAL '7 days' GROUP BY category ORDER BY total DESC`, [farmId]),
    query(`SELECT COALESCE(SUM(amount),0) AS income FROM income WHERE farm_id=$1 AND received_on >= CURRENT_DATE - INTERVAL '7 days'`, [farmId]),
    query(`SELECT COALESCE(SUM(morning_liters+afternoon_liters+evening_liters),0) AS milk FROM milk_records WHERE farm_id=$1 AND recorded_on >= CURRENT_DATE - INTERVAL '7 days'`, [farmId]),
    query(`SELECT severity, count(*)::int AS n FROM ai_insights WHERE farm_id=$1 AND created_at >= CURRENT_DATE - INTERVAL '7 days' GROUP BY severity`, [farmId]),
    query(`SELECT count(*)::int AS n FROM ai_insights WHERE farm_id=$1 AND actions_completed_at >= CURRENT_DATE - INTERVAL '7 days'`, [farmId]),
  ]);

  const totalExpenses = expenseRes.rows.reduce((s: number, r: any) => s + Number(r.total || 0), 0);
  const income = Number(incomeRes.rows[0]?.income || 0);
  const milk = Number(milkRes.rows[0]?.milk || 0);
  const insightsBySeverity = insightsRes.rows.reduce((acc: Record<string, number>, r: any) => ({ ...acc, [r.severity]: Number(r.n || 0) }), {} as Record<string, number>);
  const followUps = Number(followUpRes.rows[0]?.n || 0);

  const insights = await runExecutiveOrchestrator(farmId);
  const topExpenses = expenseRes.rows.slice(0, 5);

  const review = {
    kind: 'weekly',
    generatedAt: new Date().toISOString(),
    period: 'Last 7 days',
    summary: `Weekly farm review: ${income.toFixed(0)} income, ${totalExpenses.toFixed(0)} expenses, ${milk.toFixed(0)} L milk.`,
    metrics: {
      income,
      expenses: totalExpenses,
      milkVolumeLiters: milk,
      netProfit: income - totalExpenses,
      insightsGenerated: Object.values(insightsBySeverity).reduce((s: number, v: any) => s + Number(v || 0), 0),
      actionsCompleted: followUps,
      insightsBySeverity,
    },
    topExpenses,
    insights: insights.slice(0, 10),
  };

  await query(`INSERT INTO ai_executive_briefs (farm_id, kind, data) VALUES ($1, 'weekly', $2)`, [farmId, JSON.stringify(review)]);
  return review;
}
