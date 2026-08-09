import { type AgentResult, type OrchestrationResult } from './agents/types.js';
import { HealthAgent } from './agents/health-agent.js';
import { NutritionAgent } from './agents/nutrition-agent.js';
import { MilkProductionAgent } from './agents/milk-production-agent.js';
import { BreedingAgent } from './agents/breeding-agent.js';
import { FinanceAgent } from './agents/finance-agent.js';
import { WeatherAgent } from './agents/weather-agent.js';
import { InventoryAgent } from './agents/inventory-agent.js';
import { EmployeeAgent } from './agents/employee-agent.js';
import { EquipmentAgent } from './agents/equipment-agent.js';
import { SustainabilityAgent } from './agents/sustainability-agent.js';
import { ComplianceAgent } from './agents/compliance-agent.js';
import { EmergencyResponseAgent } from './agents/emergency-agent.js';
import { FarmKnowledgeEngine } from './knowledge/farm-data.js';
import { PredictionEngine } from './predictions/engine.js';
import { SimulationEngine } from './simulation/engine.js';

export type { AgentResult, OrchestrationResult } from './agents/types.js';

export class MasterOrchestrator {
  private knowledge: FarmKnowledgeEngine;
  private agents: Map<string, (question: string) => Promise<AgentResult>>;
  private predictions: PredictionEngine;
  private simulation: SimulationEngine;

  constructor(farmId: string) {
    this.knowledge = new FarmKnowledgeEngine(farmId);
    this.predictions = new PredictionEngine(this.knowledge);
    this.simulation = new SimulationEngine(this.knowledge);
    this.agents = new Map([
      ['health', (q) => new HealthAgent(this.knowledge).analyze(q)],
      ['nutrition', (q) => new NutritionAgent(this.knowledge).analyze(q)],
      ['milk_production', (q) => new MilkProductionAgent(this.knowledge).analyze(q)],
      ['breeding', (q) => new BreedingAgent(this.knowledge).analyze(q)],
      ['finance', (q) => new FinanceAgent(this.knowledge).analyze(q)],
      ['weather', (q) => new WeatherAgent(this.knowledge).analyze(q)],
      ['inventory', (q) => new InventoryAgent(this.knowledge).analyze(q)],
      ['employee', (q) => new EmployeeAgent(this.knowledge).analyze(q)],
      ['equipment', (q) => new EquipmentAgent(this.knowledge).analyze(q)],
      ['sustainability', (q) => new SustainabilityAgent(this.knowledge).analyze(q)],
      ['compliance', (q) => new ComplianceAgent(this.knowledge).analyze(q)],
      ['emergency', (q) => new EmergencyResponseAgent(this.knowledge).analyze(q)],
    ]);
  }

  async orchestrate(question: string): Promise<OrchestrationResult> {
    const lower = question.toLowerCase();
    const intent = this.detectIntent(lower);
    const agentsToRun = this.selectAgents(intent, lower);

    const [agentResults, predictions, simulation] = await Promise.all([
      Promise.all(agentsToRun.map((name) => this.agents.get(name)!(question))),
      this.runPredictions(intent),
      this.runSimulation(intent, lower),
    ]);

    const allResults = [...agentResults, ...predictions, ...simulation].filter(Boolean);
    const masterAnswer = this.synthesizeAnswer(question, allResults);
    const allEvidence = allResults.flatMap((r) => r.evidence);
    const allReasoning = allResults.flatMap((r) => r.reasoning);
    const allRisks = allResults.flatMap((r) => r.risks);
    const allActions = allResults.flatMap((r) => r.recommended_actions);
    const confidence = this.computeConfidence(allResults);

    return {
      question,
      intent,
      agents_used: agentsToRun,
      agent_results: allResults,
      master_answer: masterAnswer,
      evidence: [...new Set(allEvidence)],
      reasoning: [...new Set(allReasoning)],
      confidence,
      risks: [...new Set(allRisks)],
      recommended_actions: [...new Set(allActions)].slice(0, 10),
      expected_outcome: allResults[0]?.expected_outcome || 'Improved farm operations through data-driven decisions.',
      follow_up_questions: this.generateFollowUps(intent, allResults),
      data_sources: [...new Set([...agentsToRun, ...predictions.map((p) => (p as any).type), ...(simulation ? [(simulation as any).scenario] : [])])],
    };
  }

  async generateDailyBriefing(): Promise<OrchestrationResult> {
    const question = 'Generate daily briefing for the farm manager';
    const agentsToRun = ['health', 'nutrition', 'milk_production', 'breeding', 'finance', 'weather', 'inventory', 'employee', 'equipment', 'sustainability', 'compliance', 'emergency'];

    const [agentResults, predictions] = await Promise.all([
      Promise.all(agentsToRun.map((name) => this.agents.get(name)!(question))),
      this.predictions.predict('all'),
    ]);

    const allResults = [...agentResults];
    const critical = allResults.filter((r) => r.severity === 'critical' || r.severity === 'high');
    const parts: string[] = [];

    parts.push('# Daily Farm Briefing');
    parts.push(`**Generated:** ${new Date().toLocaleDateString()}`);
    parts.push('');

    if (critical.length > 0) {
      parts.push('## 🚨 Urgent Alerts');
      critical.forEach((r) => {
        parts.push(`- **${r.agent.toUpperCase()}**: ${r.title}`);
        parts.push(`  - ${r.summary}`);
        if (r.recommended_actions.length) {
          parts.push(`  - Action: ${r.recommended_actions[0]}`);
        }
      });
      parts.push('');
    }

    parts.push('## 📊 Farm Summary');
    const overview = await this.knowledge.getOverview();
    parts.push(`- **Total Cows:** ${overview.total_cows}`);
    parts.push(`- **Milking:** ${overview.milking_cows}`);
    parts.push(`- **Sick:** ${overview.sick_cows}`);
    parts.push(`- **Today's Milk:** ${overview.today_milk_liters.toFixed(1)} L`);
    parts.push(`- **Feed Days Remaining:** ${overview.feed_days_remaining.toFixed(1)}`);
    parts.push(`- **Net Profit (MTD):** ${overview.net_profit_this_month.toFixed(2)}`);
    if (overview.current_thi != null) parts.push(`- **THI:** ${overview.current_thi.toFixed(1)}`);
    parts.push('');

    parts.push('## 🎯 Today\'s Priorities');
    const allActions = allResults.flatMap((r) => r.recommended_actions);
    [...new Set(allActions)].slice(0, 5).forEach((action, i) => {
      parts.push(`${i + 1}. ${action}`);
    });
    parts.push('');

    parts.push('## 🔮 Predictions');
    predictions.slice(0, 5).forEach((p) => {
      parts.push(`- **${p.description}**: ${p.predicted_value} (${(p.confidence * 100).toFixed(0)}% confidence)`);
    });
    parts.push('');

    parts.push('## 💡 Opportunities');
    const opportunities = allResults.filter((r) => r.severity === 'low' && r.recommended_actions.length > 0).slice(0, 3);
    opportunities.forEach((o) => {
      parts.push(`- **${o.agent.toUpperCase()}**: ${o.recommended_actions[0]}`);
    });

    return {
      question,
      intent: 'daily_briefing',
      agents_used: agentsToRun,
      agent_results: allResults,
      master_answer: parts.join('\n'),
      evidence: allResults.flatMap((r) => r.evidence),
      reasoning: allResults.flatMap((r) => r.reasoning),
      confidence: this.computeConfidence(allResults),
      risks: [...new Set(allResults.flatMap((r) => r.risks))],
      recommended_actions: [...new Set(allActions)].slice(0, 10),
      expected_outcome: 'Daily briefing helps farmer prioritize actions and stay ahead of issues.',
      follow_up_questions: [
        'Which cows need immediate attention?',
        'Show me detailed health report',
        'What are today\'s financial priorities?',
        'Run full farm analysis',
      ],
      data_sources: agentsToRun,
    };
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
    if (/\b(report|generate report|summary|overview|briefing)\b/.test(question)) return 'report';
    if (/\b(emergency|urgent|critical|help)\b/.test(question)) return 'emergency';
    if (/\b(predict|forecast|will|next)\b/.test(question)) return 'prediction';
    if (/\b(simulate|what if|scenario|what happens)\b/.test(question)) return 'simulation';
    return 'overview';
  }

  private selectAgents(intent: string, question: string): string[] {
    const emergencyAgents = ['emergency', 'health', 'nutrition', 'finance'];

    switch (intent) {
      case 'cow_profile':
        return ['health', 'milk_production', 'breeding'];
      case 'milk_analysis':
        return ['milk_production', 'nutrition', 'health'];
      case 'health_analysis':
        return ['health', 'compliance', 'emergency'];
      case 'finance_analysis':
        return ['finance', 'inventory', 'employee'];
      case 'inventory_analysis':
        return ['inventory', 'nutrition', 'equipment'];
      case 'employee_analysis':
        return ['employee', 'equipment'];
      case 'weather_impact':
        return ['weather', 'nutrition', 'milk_production'];
      case 'breeding_analysis':
        return ['breeding', 'health', 'nutrition'];
      case 'report':
        return ['health', 'nutrition', 'milk_production', 'breeding', 'finance', 'weather', 'inventory', 'employee', 'equipment', 'sustainability', 'compliance'];
      case 'emergency':
        return emergencyAgents;
      case 'prediction':
        return ['milk_production', 'health', 'nutrition', 'finance', 'weather', 'breeding'];
      case 'simulation':
        return ['finance', 'nutrition', 'milk_production'];
      default:
        return ['health', 'nutrition', 'milk_production', 'finance', 'weather', 'inventory'];
    }
  }

  private async runPredictions(intent: string): Promise<AgentResult[]> {
    if (intent === 'prediction' || intent === 'report' || intent === 'overview') {
      const predictions = await this.predictions.predict('all');
      return predictions.map((p) => ({
        agent: 'prediction',
        title: p.description,
        summary: `${p.description}: ${p.predicted_value} (${(p.confidence * 100).toFixed(0)}% confidence)`,
        severity: p.confidence > 0.8 ? 'high' : 'medium',
        confidence: p.confidence,
        evidence: [p.basis],
        reasoning: [`Timeframe: ${p.timeframe}`, p.recommendation],
        risks: [],
        recommended_actions: [p.recommendation],
        expected_outcome: 'Predictions help farmer prepare for future events.',
        data: p,
      }));
    }
    return [];
  }

  private async runSimulation(intent: string, question: string): Promise<AgentResult[]> {
    if (intent === 'simulation') {
      const scenarioMatch = question.match(/(?:what happens if|simulate|what if)\s+(.+?)(?:\?|$)/i);
      if (scenarioMatch) {
        const scenario = scenarioMatch[1].trim().toLowerCase();
        const scenarioMap: Record<string, string> = {
          'feed prices increase': 'feed_price_increase',
          'milk prices fall': 'milk_price_fall',
          'rainfall decreases': 'rainfall_decrease',
          'hire more workers': 'hire_workers',
          'buy more cows': 'add_cows',
          'add more cows': 'add_cows',
          'remove cows': 'remove_cows',
          'heat wave': 'heat_wave',
          'disease outbreak': 'disease_outbreak',
          'reduce feed': 'feed_reduction',
        };
        const scenarioKey = scenarioMap[scenario] || 'generic';
        const result = await this.simulation.simulate(scenarioKey, {});
        return [{
          agent: 'simulation',
          title: `Simulation: ${scenario}`,
          summary: result.impacts.map((i) => `${i.metric}: ${i.change}`).join(', '),
          severity: 'info',
          confidence: result.confidence,
          evidence: result.impacts.map((i) => `${i.metric}: ${i.description}`),
          reasoning: result.recommendations,
          risks: [],
          recommended_actions: result.recommendations,
          expected_outcome: 'Simulation helps farmer understand potential outcomes before making decisions.',
          data: result,
        }];
      }
    }
    return [];
  }

  private synthesizeAnswer(question: string, results: AgentResult[]): string {
    const critical = results.filter((r) => r.severity === 'critical' || r.severity === 'high');
    const parts: string[] = [];

    parts.push('# Farm Intelligence Report');
    parts.push(`**Question:** ${question}`);
    parts.push('');

    if (critical.length > 0) {
      parts.push('## 🚨 Critical & High Priority');
      critical.forEach((r) => {
        parts.push(`### ${r.agent.toUpperCase()}: ${r.title}`);
        parts.push(`**Severity:** ${r.severity.toUpperCase()}`);
        parts.push(`**Confidence:** ${(r.confidence * 100).toFixed(0)}%`);
        parts.push('');
        parts.push(r.summary);
        parts.push('');
        if (r.recommended_actions.length) {
          parts.push('**Immediate Actions:**');
          r.recommended_actions.forEach((a) => parts.push(`- ${a}`));
          parts.push('');
        }
      });
    }

    const predictions = results.filter((r) => r.agent === 'prediction');
    if (predictions.length > 0) {
      parts.push('## 🔮 Predictions');
      predictions.forEach((p) => {
        parts.push(`- **${p.title}**: ${p.summary}`);
      });
      parts.push('');
    }

    const simulations = results.filter((r) => r.agent === 'simulation');
    if (simulations.length > 0) {
      parts.push('## 🎬 Simulation Results');
      simulations.forEach((s) => {
        parts.push(`### ${s.title}`);
        parts.push(s.summary);
        parts.push('');
        if (s.recommended_actions.length) {
          parts.push('**Recommendations:**');
          s.recommended_actions.forEach((a) => parts.push(`- ${a}`));
          parts.push('');
        }
      });
    }

    parts.push('## 📊 Detailed Analysis');
    const regularResults = results.filter((r) => !['prediction', 'simulation'].includes(r.agent));
    regularResults.forEach((r) => {
      if (r.severity === 'low' && critical.length > 0) return;
      parts.push(`### ${r.agent.toUpperCase()}: ${r.title}`);
      parts.push(r.summary);
      parts.push('');
      if (r.evidence.length) {
        parts.push('**Evidence:**');
        r.evidence.forEach((e) => parts.push(`- ${e}`));
        parts.push('');
      }
      if (r.reasoning.length) {
        parts.push('**Reasoning:**');
        r.reasoning.forEach((rn) => parts.push(`- ${rn}`));
        parts.push('');
      }
    });

    return parts.join('\n');
  }

  private computeConfidence(results: AgentResult[]): number {
    if (!results.length) return 0.5;
    const sum = results.reduce((acc, r) => acc + r.confidence, 0);
    return Math.min(0.98, sum / results.length);
  }

  private generateFollowUps(intent: string, results: AgentResult[]): string[] {
    const suggestions: string[] = [];
    const agents = results.map((r) => r.agent);

    if (agents.includes('health')) {
      suggestions.push('Which cows need immediate veterinary attention?');
      suggestions.push('Show me treatment history for sick cows');
    }
    if (agents.includes('milk_production')) {
      suggestions.push('Why is milk production declining?');
      suggestions.push('Which cows are top producers?');
    }
    if (agents.includes('nutrition')) {
      suggestions.push('How many days of feed remain?');
      suggestions.push('What is the current feed cost per liter?');
    }
    if (agents.includes('finance')) {
      suggestions.push('Which expenses increased this month?');
      suggestions.push('How can I improve profit?');
    }
    if (agents.includes('breeding')) {
      suggestions.push('Which cows are due to calve soon?');
      suggestions.push('Show me pregnancy candidates');
    }
    if (agents.includes('weather')) {
      suggestions.push('What is the current THI?');
      suggestions.push('How will tomorrow\'s weather affect my cows?');
    }

    suggestions.push('Run full farm analysis');
    suggestions.push('Generate today\'s executive briefing');
    suggestions.push('What happens if milk prices fall?');
    suggestions.push('What happens if feed prices increase?');

    return suggestions.slice(0, 6);
  }
}
