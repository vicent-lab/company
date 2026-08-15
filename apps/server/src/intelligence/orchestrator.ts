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
    return this.orchestrateWithContext(question, { turns: [], entities: { cowCodes: [], cowIds: [], counts: [], dates: [], categories: [], lastPregnantCows: [], lastSickCows: [], lastTopProducers: [], lastCalvingCows: [] }, expandedQuestion: question, conversationId: null });
  }

  async orchestrateWithContext(question: string, ctx: { turns: any[]; entities: any; expandedQuestion: string; conversationId: string | null }): Promise<OrchestrationResult> {
    const lower = ctx.expandedQuestion.toLowerCase();
    const intent = this.detectIntent(lower);
    const agentsToRun = this.selectAgents(intent, lower);

    const cowCodeMatch = ctx.expandedQuestion.match(/\b([A-Z]{2,3}-\d{1,4})\b/i);
    const cowIdMatch = ctx.expandedQuestion.match(/\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/i);
    const cowIdentifier = cowCodeMatch?.[1] || cowIdMatch?.[1] || null;

    let cowProfile: any = null;
    let cowHistory: any = null;
    if (cowIdentifier) {
      try {
        cowProfile = await this.knowledge.getCowProfile(cowIdentifier);
        if (cowProfile?.id) {
          cowHistory = await this.knowledge.getCowHistory(cowProfile.id);
        }
      } catch { /* cow-specific data is best-effort */ }
    }

    const [agentResults, predictions, simulation] = await Promise.all([
      Promise.all(agentsToRun.map((name) => this.agents.get(name)!(ctx.expandedQuestion))),
      this.runPredictions(intent),
      this.runSimulation(intent, lower),
    ]);

    const allResults = [...agentResults, ...predictions, ...simulation].filter(Boolean);
    const masterAnswer = this.synthesizeAnswer(ctx.expandedQuestion, allResults, cowProfile, cowHistory, ctx);
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
    if (/\b(cow|calf|tell me about|everything about|history|compare|show me)\b/.test(question)) return 'cow_profile';
    if (/\b(milk|production|yield|liters|produce)\b/.test(question) && /\b(fall|falling|fell|drop|dropp|declin|decreas|down|less|reduc|reduced)\b/.test(question)) return 'milk_analysis';
    if (/\b(how much milk.*today|today's? milk|milk.*today|milk.*this morning|milk.*this evening)\b/.test(question)) return 'milk_analysis';
    if (/\b(which cow.*produce.*most|top.*milk|highest.*milk|best.*milk|most.*milk|top.*producer)\b/.test(question)) return 'milk_analysis';
    if (/\b(sick|unwell|ill|unhealthy|diseased|health problem|health issue|lameness|mastitis|fever|treatment|vet|veterinarian)\b/.test(question)) return 'health_analysis';
    if (/\b((?:which cows?.*(?:sick|unwell|ill|health|attention)|any cows? (?:sick|at risk|unwell|ill)|who.*(?:need|needs).*?(?:attention|check|vet|help|care)))\b/.test(question)) return 'health_analysis';
    if (/\b(profit|expense|income|finance|money|losing|cash|budget|spend|spent|cost)\b/.test(question)) return 'finance_analysis';
    if (/\b(feed|inventory|medicine|expire|equipment|service|stock|supply|running low|shortage)\b/.test(question)) return 'inventory_analysis';
    if (/\b(employee|worker|staff|team|attendance|workload|tasks completed)\b/.test(question)) return 'employee_analysis';
    if (/\b(weather|forecast|temperature|rain|wind|heat)\b/.test(question)) return 'weather_impact';
    if (/\b(breed|breeding|inseminate|pregnant|calve|calving|pregnancy|pregnant|due|expecting)\b/.test(question)) return 'breeding_analysis';
    if (/\b(report|generate report|summary|overview|briefing)\b/.test(question)) return 'report';
    if (/\b(emergency|urgent|critical|help|risk|danger|threat|problem|issue|warning)\b/.test(question)) return 'emergency';
    if (/\b(predict|forecast|will|next)\b/.test(question)) return 'prediction';
    if (/\b(simulate|what if|scenario|what happens)\b/.test(question)) return 'simulation';
    if (/\b(how are|how('s| is)|status|state|condition)\b.*?\b(cow|herd|farm|cattle|animal)\b/.test(question)) return 'report';
    if (/\b(what (should|must|needs?|has to)|priorit|focus|first|urgent|immediate)\b.*?\b(today|now|do|action)\b/.test(question)) return 'report';
    if (/\b(yesterday|last night|previous day|day before|past 24|last 24)\b/.test(question) && /\b(happen|happened|going on|did|occur|activity|work|task|event)\b/.test(question)) return 'report';
    if (/\b(how many|count|number of)\b.*?\b(cow|cattle|animal|head|herd|calves|calf)\b/.test(question)) return 'report';
    if (/\b(which|what|show|list|tell).*?\b(cow|cattle|animal)\b.*?\b(not|haven't|hasn't|never|missing|without|un)\b.*?\b(vaccin|shot|immune|protected|covered)\b/.test(question)) return 'health_analysis';
    if (/\b(not|haven't|hasn't|never|missing|without|un)\b.*?\b(vaccin|shot|immune|protected|covered)\b/.test(question)) return 'health_analysis';
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

  private synthesizeAnswer(question: string, results: AgentResult[], cowProfile: any = null, cowHistory: any = null, ctx: { turns: any[]; entities: any } = { turns: [], entities: { cowCodes: [], cowIds: [], counts: [], dates: [], categories: [], lastPregnantCows: [], lastSickCows: [], lastTopProducers: [], lastCalvingCows: [] } }): string {
    const critical = results.filter((r) => r.severity === 'critical' || r.severity === 'high');
    const parts: string[] = [];

    parts.push('# Farm Intelligence Report');
    parts.push(`**Question:** ${question}`);
    if (ctx.entities.cowCodes.length > 0 && question !== ctx.entities.cowCodes.join(', ')) {
      parts.push(`**Context:** referring to ${ctx.entities.cowCodes.slice(0, 5).join(', ')}${ctx.entities.cowCodes.length > 5 ? ' and others' : ''}`);
    }
    parts.push('');

    if (cowProfile) {
      parts.push('## 🐄 Cow Profile');
      parts.push(`**ID:** ${cowProfile.cow_code} (${cowProfile.id})`);
      parts.push(`**Name:** ${cowProfile.name || 'Unnamed'}`);
      parts.push(`**Breed:** ${cowProfile.breed || 'Unknown'}`);
      parts.push(`**Gender:** ${cowProfile.gender}`);
      parts.push(`**Status:** ${cowProfile.status}`);
      parts.push(`**Health:** ${cowProfile.health}`);
      parts.push(`**Milking:** ${cowProfile.is_milking ? 'Yes' : 'No'}`);
      parts.push(`**Pregnant:** ${cowProfile.is_pregnant ? 'Yes' : 'No'}`);
      parts.push(`**Barn:** ${cowProfile.barn_name || 'Unassigned'}`);
      if (cowProfile.date_of_birth) parts.push(`**Born:** ${cowProfile.date_of_birth}`);
      parts.push('');

      if (cowHistory) {
        if (cowHistory.milk?.length) {
          parts.push('### Recent Milk Production');
          cowHistory.milk.slice(0, 5).forEach((m: any) => {
            parts.push(`• ${m.recorded_on}: ${Number(m.total).toFixed(1)} L (morning ${Number(m.morning_liters).toFixed(1)}, afternoon ${Number(m.afternoon_liters).toFixed(1)}, evening ${Number(m.evening_liters).toFixed(1)})`);
          });
          parts.push('');
        }
        if (cowHistory.health?.length) {
          parts.push('### Recent Health Records');
          cowHistory.health.slice(0, 5).forEach((h: any) => {
            parts.push(`• ${h.recorded_on}: ${h.health_status}${h.ai_detected_disease ? ` — ${h.ai_detected_disease}` : ''}`);
          });
          parts.push('');
        }
        if (cowHistory.treatments?.length) {
          parts.push('### Recent Treatments');
          cowHistory.treatments.slice(0, 5).forEach((t: any) => {
            parts.push(`• ${t.diagnosed_on}: ${t.diagnosis || t.disease_id || 'Treatment'}${t.treatment_plan ? ` — ${t.treatment_plan}` : ''}`);
          });
          parts.push('');
        }
        if (cowHistory.vaccinations?.length) {
          parts.push('### Vaccinations');
          cowHistory.vaccinations.slice(0, 5).forEach((v: any) => {
            parts.push(`• ${v.vaccine_name}: due ${v.due_on}${v.administered_on ? `, given ${v.administered_on}` : ' (pending)'}`);
          });
          parts.push('');
        }
        if (cowHistory.breeding?.length) {
          parts.push('### Breeding Records');
          cowHistory.breeding.slice(0, 5).forEach((b: any) => {
            parts.push(`• ${b.breeding_date}: ${b.method}${b.expected_calving_on ? `, expected calving ${b.expected_calving_on}` : ''}${b.result ? ` (${b.result})` : ''}`);
          });
          parts.push('');
        }
        if (cowHistory.calving?.length) {
          parts.push('### Calving History');
          cowHistory.calving.slice(0, 5).forEach((c: any) => {
            parts.push(`• ${c.calving_date}: difficulty ${c.difficulty_score}/5${c.assistance_required ? ' (assistance required)' : ''}`);
          });
          parts.push('');
        }
      }
    }

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
