export interface AgentResult {
  agent: string;
  title: string;
  summary: string;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  evidence: string[];
  reasoning: string[];
  risks: string[];
  recommended_actions: string[];
  expected_outcome: string;
  data: Record<string, any>;
  alternatives?: Array<{ description: string; pros: string[]; cons: string[] }>;
}

export interface OrchestrationResult {
  question: string;
  intent: string;
  agents_used: string[];
  agent_results: AgentResult[];
  master_answer: string;
  evidence: string[];
  reasoning: string[];
  confidence: number;
  risks: string[];
  recommended_actions: string[];
  expected_outcome: string;
  follow_up_questions: string[];
  data_sources: string[];
}
