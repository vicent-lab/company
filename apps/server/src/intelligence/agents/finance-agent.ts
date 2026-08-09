import { query } from '../../db/index.js';
import { FarmKnowledgeEngine } from '../knowledge/farm-data.js';
import { type AgentResult } from './types.js';

export class FinanceAgent {
  constructor(private knowledge: FarmKnowledgeEngine) {}

  async analyze(question: string): Promise<AgentResult> {
    const [finance, topExpenses, topIncome, recentTransactions] = await Promise.all([
      this.knowledge.getFinancialAnalysis(),
      this.knowledge.getTopExpenses(),
      query(`SELECT category, SUM(amount) AS total, COUNT(*) AS count FROM income WHERE farm_id=$1 AND received_on >= date_trunc('month', current_date) GROUP BY category ORDER BY total DESC LIMIT 5`, [this.knowledge['farmId']]),
      query(`SELECT * FROM expenses WHERE farm_id=$1 AND incurred_on >= CURRENT_DATE - INTERVAL '30 days' ORDER BY incurred_on DESC LIMIT 10`, [this.knowledge['farmId']]),
    ]);

    const evidence: string[] = [];
    const reasoning: string[] = [];
    const recommendedActions: string[] = [];
    const risksList: string[] = [];

    evidence.push(`Income: ${finance.income.toFixed(2)}`);
    evidence.push(`Expenses: ${finance.expenses.toFixed(2)}`);
    evidence.push(`Net profit: ${finance.net_profit.toFixed(2)}`);
    evidence.push(`Margin: ${finance.margin_pct.toFixed(1)}%`);
    if (topExpenses.length > 0) {
      evidence.push(`Top expenses: ${topExpenses.map((e: any) => `${e.category} (${e.total.toFixed(2)})`).join(', ')}`);
    }
    if (topIncome.rows.length > 0) {
      evidence.push(`Top income: ${topIncome.rows.map((i: any) => `${i.category} (${i.total.toFixed(2)})`).join(', ')}`);
    }

    if (finance.net_profit < 0) {
      risksList.push('Negative profit this month — immediate review required');
      reasoning.push('Expenses exceed income. Need to identify cost reduction opportunities');
      recommendedActions.push('Review all expense categories for reductions');
      recommendedActions.push('Negotiate better pricing with suppliers');
      recommendedActions.push('Identify quick cost-saving measures');
    } else if (finance.margin_pct < 15) {
      risksList.push(`Profit margin below target: ${finance.margin_pct.toFixed(1)}%`);
      reasoning.push('Margin is below healthy threshold — optimize costs or increase revenue');
      recommendedActions.push('Focus on reducing top expense categories');
      recommendedActions.push('Review pricing strategy');
    } else {
      reasoning.push('Financial health is good — maintain current practices');
      recommendedActions.push('Continue monitoring expenses');
      recommendedActions.push('Invest in efficiency improvements');
    }

    const severity = finance.net_profit < 0 ? 'critical' : finance.margin_pct < 15 ? 'high' : 'low';
    const confidence = Math.min(0.95, 0.8 + Math.abs(finance.margin_pct) * 0.01);

    return {
      agent: 'finance',
      title: `Financial status: ${finance.net_profit >= 0 ? 'profit' : 'loss'} of ${finance.net_profit.toFixed(2)}`,
      summary: finance.net_profit >= 0
        ? `Net profit: ${finance.net_profit.toFixed(2)} (${finance.margin_pct.toFixed(1)}% margin). ${finance.margin_pct < 15 ? 'Margin below target.' : 'Financial health good.'}`
        : `Net loss: ${Math.abs(finance.net_profit).toFixed(2)}. Immediate cost review needed.`,
      severity,
      confidence,
      evidence,
      reasoning,
      risks: risksList,
      recommended_actions: recommendedActions.length ? recommendedActions : ['Continue current financial management'],
      expected_outcome: 'Optimizing expenses and revenue improves farm sustainability and profitability.',
      data: { finance, topExpenses, topIncome: topIncome.rows, recentTransactions: recentTransactions.rows },
    };
  }
}
