import { query } from '../../../db/index.js';

export interface FinanceInsight {
  agent: 'finance';
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  actions: string[];
  evidence: Record<string, any>;
  reasoning?: string[];
}

export async function runFinanceAgent(farmId: string): Promise<FinanceInsight[]> {
  const [incomeRes, expensesRes, lastMonthRes, feedExpenseRes] = await Promise.all([
    query(`SELECT COALESCE(SUM(amount),0) AS v FROM income WHERE farm_id=$1 AND received_on >= date_trunc('month', current_date)`, [farmId]),
    query(`SELECT COALESCE(SUM(amount),0) AS v FROM expenses WHERE farm_id=$1 AND incurred_on >= date_trunc('month', current_date)`, [farmId]),
    query(`SELECT COALESCE(SUM(amount),0) AS v FROM expenses WHERE farm_id=$1 AND incurred_on >= date_trunc('month', current_date - interval '1 month') AND incurred_on < date_trunc('month', current_date)`, [farmId]),
    query(`SELECT COALESCE(SUM(amount),0) AS v FROM expenses WHERE farm_id=$1 AND category ILIKE '%feed%' AND incurred_on >= CURRENT_DATE - INTERVAL '30 days'`, [farmId]),
  ]);

  const income = Number(incomeRes.rows[0]?.v || 0);
  const expenses = Number(expensesRes.rows[0]?.v || 0);
  const lastMonthExpenses = Number(lastMonthRes.rows[0]?.v || 0);
  const marginPct = income > 0 ? ((income - expenses) / income) * 100 : 0;
  const growthPct = lastMonthExpenses > 0 ? ((expenses - lastMonthExpenses) / lastMonthExpenses) * 100 : 0;
  const feedExpense = Number(feedExpenseRes.rows[0]?.v || 0);
  const feedShare = expenses > 0 ? (feedExpense / expenses) * 100 : 0;

  const insights: FinanceInsight[] = [];

  if (income > 0 && marginPct < 5) {
    insights.push({
      agent: 'finance',
      title: `Profit margin critically low: ${marginPct.toFixed(1)}%`,
      description: `This month's net margin is ${marginPct.toFixed(1)}%. Immediate cost review required.`,
      severity: 'critical',
      confidence: 0.95,
      actions: ['Audit top expense categories', 'Review milk pricing contracts', 'Identify quick cost reductions'],
      evidence: { income, expenses, marginPct, growthPct },
    });
  } else if (income > 0 && marginPct < 15) {
    insights.push({
      agent: 'finance',
      title: `Profit margin below target: ${marginPct.toFixed(1)}%`,
      description: `Margin is below the 15% target. Look for feed and vet cost reductions.`,
      severity: 'high',
      confidence: 0.85,
      actions: ['Review feed costs', 'Negotiate vet contracts', 'Analyze expense trends'],
      evidence: { income, expenses, marginPct },
    });
  }

  if (growthPct > 20) {
    insights.push({
      agent: 'finance',
      title: `Expenses rose ${growthPct.toFixed(0)}% vs last month`,
      description: `Significant expense growth detected. Investigate the categories driving the increase.`,
      severity: 'medium',
      confidence: 0.8,
      actions: ['Investigate expense drivers', 'Review recent purchases', 'Check for price increases'],
      evidence: { expenses, lastMonthExpenses, growthPct },
    });
  }

  if (feedShare > 40) {
    insights.push({
      agent: 'finance',
      title: `Feed represents ${feedShare.toFixed(0)}% of expenses`,
      description: `High feed cost share. Consider bulk purchasing or alternative feed sources.`,
      severity: 'low',
      confidence: 0.7,
      actions: ['Negotiate bulk feed pricing', 'Review feed wastage', 'Explore alternative feed sources'],
      evidence: { feedExpense, expenses, feedShare },
    });
  }

  return insights;
}
