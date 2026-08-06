import { query } from '../../db/index.js';
import { FarmKnowledgeEngine } from '../knowledge/farm-data.js';
import { type AgentResult } from './types.js';

export class FinanceAgent {
  constructor(private knowledge: FarmKnowledgeEngine) {}

  async analyze(question: string): Promise<AgentResult> {
    const [finance, topExpenses] = await Promise.all([
      this.knowledge.getFinancialAnalysis(),
      this.knowledge.getTopExpenses(),
    ]);

    const evidence: string[] = [];
    const reasoning: string[] = [];
    const recommendedActions: string[] = [];
    const risks: string[] = [];

    evidence.push(`Income: ${finance.income.toFixed(2)}`);
    evidence.push(`Expenses: ${finance.expenses.toFixed(2)}`);
    evidence.push(`Net profit: ${finance.net_profit.toFixed(2)}`);
    evidence.push(`Margin: ${finance.margin_pct.toFixed(1)}%`);

    if (topExpenses.length > 0) {
      evidence.push(`Top expenses: ${topExpenses.map((e: any) => `${e.category} (${e.total.toFixed(2)})`).join(', ')}`);
    }

    if (finance.net_profit < 0) {
      risks.push('Negative profit this month — immediate review required');
      reasoning.push('Expenses exceed income. Need to identify cost reduction opportunities');
      recommendedActions.push('Review all expense categories for reductions');
      recommendedActions.push('Negotiate better pricing with suppliers');
      recommendedActions.push('Identify quick cost-saving measures');
    } else if (finance.margin_pct < 15) {
      risks.push(`Profit margin below target: ${finance.margin_pct.toFixed(1)}%`);
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
      risks,
      recommended_actions: recommendedActions.length ? recommendedActions : ['Continue current financial management'],
      expected_outcome: 'Optimizing expenses and revenue improves farm sustainability and profitability.',
      data: { finance, topExpenses },
    };
  }
}
