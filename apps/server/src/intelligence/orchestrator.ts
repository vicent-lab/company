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

export type { AgentResult, OrchestrationResult } from './agents/types.js';

export class MasterOrchestrator {
  private knowledge: FarmKnowledgeEngine;
  private agents: Map<string, (question: string) => Promise<AgentResult>>;

  constructor(farmId: string) {
    this.knowledge = new FarmKnowledgeEngine(farmId);
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

    const agentResults = await Promise.all(
      agentsToRun.map((name) => this.agents.get(name)!(question))
    );

    const masterAnswer = this.synthesizeAnswer(question, agentResults);
    const allEvidence = agentResults.flatMap((r) => r.evidence);
    const allReasoning = agentResults.flatMap((r) => r.reasoning);
    const allRisks = agentResults.flatMap((r) => r.risks);
    const allActions = agentResults.flatMap((r) => r.recommended_actions);
    const confidence = this.computeConfidence(agentResults);

    return {
      question,
      intent,
      agents_used: agentsToRun,
      agent_results: agentResults,
      master_answer: masterAnswer,
      evidence: [...new Set(allEvidence)],
      reasoning: [...new Set(allReasoning)],
      confidence,
      risks: [...new Set(allRisks)],
      recommended_actions: [...new Set(allActions)].slice(0, 8),
      expected_outcome: agentResults[0]?.expected_outcome || 'Improved farm operations through data-driven decisions.',
      follow_up_questions: this.generateFollowUps(intent, agentResults),
      data_sources: agentsToRun.map((a) => `${a} agent`),
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
    if (/\b(report|generate report|summary|overview)\b/.test(question)) return 'report';
    if (/\b(emergency|urgent|critical|help)\b/.test(question)) return 'emergency';
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
      default:
        return ['health', 'nutrition', 'milk_production', 'finance', 'weather', 'inventory'];
    }
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

    parts.push('## 📊 Detailed Analysis');
    results.forEach((r) => {
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

    return suggestions.slice(0, 6);
  }
}
