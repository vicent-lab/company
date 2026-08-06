import { query } from '../../db/index.js';
import { FarmKnowledgeEngine } from '../knowledge/farm-data.js';
import { ReasoningEngine, type Explanation } from '../reasoning/engine.js';
import { MasterOrchestrator, type OrchestrationResult } from '../orchestrator.js';

export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface ConversationContext {
  farmId: string;
  userId: string;
  messages: ConversationMessage[];
  topics: string[];
}

export class IntelligenceConversationEngine {
  private farmId: string;
  private userId: string;
  private context: ConversationContext;
  private knowledge: FarmKnowledgeEngine;
  private reasoning: ReasoningEngine;

  constructor(farmId: string, userId: string) {
    this.farmId = farmId;
    this.userId = userId;
    this.knowledge = new FarmKnowledgeEngine(farmId);
    this.reasoning = new ReasoningEngine(farmId);
    this.context = { farmId, userId, messages: [], topics: [] };
  }

  async chat(question: string): Promise<{ answer: string; explanation: Explanation; dataUsed: string[] }> {
    const lower = question.toLowerCase();
    const dataUsed: string[] = [];

    this.context.messages.push({ role: 'user', content: question, timestamp: new Date().toISOString() });
    this.extractTopics(question);

    const orchestrator = new MasterOrchestrator(this.farmId);
    const result = await orchestrator.orchestrate(question);

    const explanation: Explanation = {
      evidence: result.evidence,
      confidence: result.confidence,
      reasoning: result.reasoning,
      risks: result.risks,
      recommended_action: result.recommended_actions[0] || 'Continue current management',
      expected_outcome: result.expected_outcome,
    };

    const answer = result.master_answer;
    dataUsed.push(...result.data_sources);

    this.context.messages.push({ role: 'assistant', content: answer, timestamp: new Date().toISOString(), metadata: { explanation, dataUsed: result.data_sources, followUps: result.follow_up_questions } });

    return { answer, explanation, dataUsed };
  }

  private detectIntent(question: string): string {
    if (/\b(cow|calf|tell me about|everything about|history|compare)\b/.test(question)) return 'cow_profile';
    if (/\b(milk|production|yield|liters|produce)\b/.test(question)) return 'milk_analysis';
    if (/\b(sick|health|disease|risk|lameness|mastitis|fever)\b/.test(question)) return 'health_analysis';
    if (/\b(profit|expense|income|finance|money|losing|cash)\b/.test(question)) return 'finance_analysis';
    if (/\b(feed|inventory|medicine|expire|equipment|service)\b/.test(question)) return 'inventory_analysis';
    if (/\b(employee|worker|attendance|workload|tasks completed)\b/.test(question)) return 'employee_analysis';
    if (/\b(weather|forecast|temperature|rain|wind|heat)\b/.test(question)) return 'weather_impact';
    if (/\b(breed|breeding|inseminate|pregnant|calve|calving|pregnancy)\b/.test(question)) return 'breeding_analysis';
    if (/\b(report|generate report)\b/.test(question)) return 'report';
    return 'overview';
  }

  private async handleCowQuestion(question: string): Promise<Record<string, any>> {
    const cowMatch = question.match(/\b(cow\s*)?(\d+|[a-z]+\d*)\b/i);
    if (!cowMatch) return { error: 'No cow identifier found in question' };

    const cowId = cowMatch[2];
    const profile = await this.knowledge.getCowProfile(cowId);
    if (!profile) return { error: `Cow ${cowId} not found` };

    const history = await this.knowledge.getCowHistory(profile.id);
    return { cow: profile, history };
  }

  private async handleMilkQuestion(question: string): Promise<Record<string, any>> {
    return await this.knowledge.getMilkAnalysis();
  }

  private async handleHealthQuestion(question: string): Promise<Record<string, any>> {
    return await this.knowledge.getHealthAnalysis();
  }

  private async handleFinanceQuestion(question: string): Promise<Record<string, any>> {
    return await this.knowledge.getFinancialAnalysis();
  }

  private async handleInventoryQuestion(question: string): Promise<Record<string, any>> {
    return await this.knowledge.getInventoryAnalysis();
  }

  private async handleEmployeeQuestion(question: string): Promise<Record<string, any>> {
    return await this.knowledge.getEmployeeAnalysis();
  }

  private async handleWeatherQuestion(question: string): Promise<Record<string, any>> {
    return await this.knowledge.getWeatherImpact();
  }

  private async handleBreedingQuestion(question: string): Promise<Record<string, any>> {
    const result = await this.knowledge.getBreedingAnalysis();
    return { breeding: result };
  }

  private async handleOverviewQuestion(question: string): Promise<Record<string, any>> {
    const [overview, recentActivities, activeTasks] = await Promise.all([
      this.knowledge.getOverview(),
      this.knowledge.getRecentActivities(),
      this.knowledge.getActiveTasks(),
    ]);
    return { overview, recentActivities, activeTasks };
  }

  private async handleReportQuestion(question: string): Promise<Record<string, any>> {
    const [overview, milk, health, finance, inventory, breeding, weather, tasks] = await Promise.all([
      this.knowledge.getOverview(),
      this.knowledge.getMilkAnalysis(),
      this.knowledge.getHealthAnalysis(),
      this.knowledge.getFinancialAnalysis(),
      this.knowledge.getInventoryAnalysis(),
      this.knowledge.getBreedingAnalysis(),
      this.knowledge.getWeatherImpact(),
      this.knowledge.getActiveTasks(),
    ]);
    return { overview, milk, health, finance, inventory, breeding, weather, tasks };
  }

  private generateAnswer(intent: string, question: string, data: Record<string, any>, explanation: Explanation): string {
    const parts: string[] = [];

    parts.push('## Analysis');
    parts.push(explanation.reasoning.map((r) => `• ${r}`).join('\n'));
    parts.push('');

    parts.push('## Evidence');
    explanation.evidence.forEach((e) => parts.push(`• ${e}`));
    parts.push('');

    if (intent === 'cow_profile' && data.cow) {
      const cow = data.cow as any;
      const history = data.history as any;
      parts.push(`## ${cow.cow_code} — ${cow.name || 'Unnamed'}`);
      parts.push(`**Breed:** ${cow.breed || 'Unknown'} | **Status:** ${cow.status} | **Health:** ${cow.health}`);
      parts.push(`**Milking:** ${cow.is_milking ? 'Yes' : 'No'} | **Pregnant:** ${cow.is_pregnant ? 'Yes' : 'No'}`);
      if (cow.date_of_birth) parts.push(`**Age:** ${new Date().getFullYear() - new Date(cow.date_of_birth).getFullYear()} years`);
      if (history.milk.length) parts.push(`\n**Milk Records (last ${history.milk.length} entries):**\n${history.milk.slice(0, 5).map((m: any) => `• ${m.recorded_on}: ${m.total.toFixed(1)} L`).join('\n')}`);
      if (history.health.length) parts.push(`\n**Health Records:**\n${history.health.slice(0, 5).map((h: any) => `• ${h.recorded_on}: ${h.health_status}${h.ai_detected_disease ? ` — ${h.ai_detected_disease}` : ''}`).join('\n')}`);
    } else if (intent === 'milk_analysis' && data.milk) {
      const milk = data.milk as any;
      parts.push('## Milk Production Analysis');
      if (milk.topProducers?.length) {
        parts.push('**Top Producers (last 30 days):**');
        milk.topProducers.slice(0, 5).forEach((c: any) => parts.push(`• ${c.cow_code} (${c.name || 'Unnamed'}): ${c.total_liters.toFixed(0)} L total, ${c.avg_daily.toFixed(1)} L/day`));
      }
      if (milk.decliningCows?.length) {
        parts.push('\n**Declining Production:**');
        milk.decliningCows.slice(0, 5).forEach((c: any) => parts.push(`• ${c.cow_code}: ${c.avg_30d.toFixed(1)} L/day → ${c.avg_7d.toFixed(1)} L/day (${c.change.toFixed(1)} L change)`));
      }
    } else if (intent === 'health_analysis' && data.health) {
      const health = data.health as any;
      parts.push('## Health Analysis');
      if (health.sickCows?.length) {
        parts.push('**Currently Sick:**');
        health.sickCows.slice(0, 10).forEach((c: any) => parts.push(`• ${c.cow_code}: ${c.health_status}${c.ai_detected_disease ? ` — ${c.ai_detected_disease}` : ''}`));
      }
      if (health.riskCows?.length) {
        parts.push('\n**At Risk:**');
        health.riskCows.slice(0, 10).forEach((c: any) => parts.push(`• ${c.cow_code}: BCS ${c.body_condition_score}, Lameness ${c.lameness_score}${c.ai_detected_disease ? `, ${c.ai_detected_disease}` : ''}`));
      }
    } else if (intent === 'finance_analysis' && data.finance) {
      const fin = data.finance as any;
      parts.push('## Financial Analysis');
      parts.push(`**Income:** ${fin.income.toFixed(2)} | **Expenses:** ${fin.expenses.toFixed(2)} | **Net Profit:** ${fin.net_profit.toFixed(2)} | **Margin:** ${fin.margin_pct.toFixed(1)}%`);
      if (fin.expense_breakdown?.length) {
        parts.push('\n**Top Expenses:**');
        fin.expense_breakdown.slice(0, 5).forEach((e: any) => parts.push(`• ${e.category}: ${e.total.toFixed(2)}`));
      }
    } else if (intent === 'breeding_analysis' && data.breeding) {
      const b = data.breeding as any;
      parts.push('## Breeding Analysis');
      if (b.pregnant?.length) {
        parts.push(`**Confirmed Pregnant (${b.pregnant.length}):**`);
        b.pregnant.slice(0, 10).forEach((c: any) => parts.push(`• ${c.cow_code} (${c.name || 'Unnamed'})`));
      }
      if (b.candidates?.length) {
        parts.push(`\n**Likely Pregnant — Awaiting Confirmation (${b.candidates.length}):**`);
        b.candidates.slice(0, 10).forEach((c: any) => parts.push(`• ${c.cow_code}: serviced ${c.days_since} days ago via ${c.method}`));
      }
      if (b.calvingSoon?.length) {
        parts.push(`\n**Expected to Calve Soon (${b.calvingSoon.length}):**`);
        b.calvingSoon.slice(0, 10).forEach((c: any) => parts.push(`• ${c.cow_code}: expected ${c.expected_calving_on}`));
      }
    } else if (intent === 'overview' && data.overview) {
      const o = data.overview as any;
      parts.push('## Farm Overview');
      parts.push(`**Total Cows:** ${o.total_cows} | **Milking:** ${o.milking_cows} | **Sick:** ${o.sick_cows}`);
      parts.push(`**Today's Milk:** ${o.today_milk_liters.toFixed(1)} L | **Week:** ${o.week_milk_liters.toFixed(1)} L`);
      parts.push(`**Feed Days:** ${o.feed_days_remaining.toFixed(1)} | **Profit:** ${o.net_profit_this_month.toFixed(2)}`);
      if (o.current_thi != null) parts.push(`**THI:** ${o.current_thi.toFixed(1)}`);
    }

    parts.push('');
    parts.push('## Reasoning');
    explanation.reasoning.forEach((r) => parts.push(`• ${r}`));
    parts.push('');
    parts.push(`**Confidence:** ${(explanation.confidence * 100).toFixed(0)}%`);
    parts.push('');
    parts.push('## Risks');
    if (explanation.risks.length) explanation.risks.forEach((r) => parts.push(`⚠️ ${r}`));
    else parts.push('No significant risks detected.');
    parts.push('');
    parts.push('## Recommendation');
    parts.push(`✅ **${explanation.recommended_action}**`);
    parts.push('');
    parts.push('## Expected Outcome');
    parts.push(`📈 ${explanation.expected_outcome}`);

    return parts.join('\n');
  }

  private extractTopics(question: string) {
    const words = question.toLowerCase().split(/\s+/);
    const newTopics = words.filter((w) => w.length > 3 && !this.context.topics.includes(w)).slice(0, 5);
    this.context.topics.push(...newTopics);
    if (this.context.topics.length > 20) this.context.topics = this.context.topics.slice(-20);
  }

  getContext(): ConversationContext {
    return this.context;
  }
}
