import { useState, useEffect, useRef } from 'react';
import { useAsync } from '../ui';
import { useFarm } from '../app';
import { apiSend } from '../api';
import { isLive } from '../api';
import { ConfidenceGauge } from '../components/intelligence/ConfidenceGauge';
import { FollowUpSuggestions } from '../components/intelligence/FollowUpSuggestions';
import { AIFeedback } from '../components/intelligence/AIFeedback';

interface AgentResult {
  agent: string;
  title: string;
  summary: string;
  severity: string;
  confidence: number;
  evidence: string[];
  reasoning: string[];
  risks: string[];
  recommended_actions: string[];
  expected_outcome: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  agentResults?: AgentResult[];
  explanation?: {
    evidence: string[];
    confidence: number;
    reasoning: string[];
    risks: string[];
    recommended_action: string;
    expected_outcome: string;
  };
  dataUsed?: string[];
  followUps?: string[];
}

export default function IntelligencePage() {
  const { farmId } = useFarm();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const suggestedQuestions = [
    'How is my farm today?',
    'Which cows are sick?',
    'Show me milk production trends',
    'Which cows need attention?',
    'What is my financial status?',
    'How much feed remains?',
    'What are today\'s priorities?',
    'Show breeding advice',
  ];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (question: string) => {
    if (!question.trim() || !isLive) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: question,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const res = await apiSend<any>('/ai-advisor/chat', 'POST', { question });
      const assistantMessage: Message = {
        id: res.id || `assistant-${Date.now()}`,
        role: 'assistant',
        content: res.answer,
        timestamp: res.created_at || new Date().toISOString(),
        explanation: res.explanation,
        dataUsed: res.dataUsed,
        agentResults: res.agentResults,
        followUps: res.followUps,
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error: any) {
      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: `I encountered an error: ${error.message || 'Unknown error'}. Please try again.`,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Farm Intelligence</h1>
          <p className="muted">Multi-agent AI that analyzes your real farm data</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16, minHeight: 500, display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, overflowY: 'auto', maxHeight: 600, marginBottom: 16, padding: 12, background: '#fafafa', borderRadius: 8 }}>
          {messages.length === 0 ? (
            <div>
              <p className="muted" style={{ marginBottom: 16, textAlign: 'center' }}>
                Ask me anything about your farm. I'll analyze your real data using specialized AI agents.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8 }}>
                {suggestedQuestions.map((q, i) => (
                  <button key={i} className="btn btn-secondary" onClick={() => sendMessage(q)} style={{ textAlign: 'left', fontSize: 13 }}>
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg) => (
              <div key={msg.id} style={{ marginBottom: 20, textAlign: msg.role === 'user' ? 'right' : 'left' }}>
                <div
                  style={{
                    display: 'inline-block',
                    padding: '12px 16px',
                    borderRadius: 12,
                    background: msg.role === 'user' ? '#3b82f6' : '#fff',
                    color: msg.role === 'user' ? '#fff' : '#000',
                    maxWidth: '85%',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.6, marginBottom: 8 }}>{msg.content}</div>

                  {msg.explanation && (
                    <div style={{ borderTop: '1px solid rgba(0,0,0,0.1)', paddingTop: 10, marginTop: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                        <ConfidenceGauge value={msg.explanation.confidence} size={80} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Confidence Score</div>
                          <div style={{ fontSize: 11, color: '#6b7280' }}>
                            Based on {msg.explanation.evidence?.length || 0} evidence points
                          </div>
                        </div>
                      </div>

                      {msg.explanation.evidence?.length > 0 && (
                        <div style={{ marginBottom: 10 }}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>EVIDENCE</div>
                          {msg.explanation.evidence.slice(0, 5).map((e, i) => (
                            <div key={i} style={{ fontSize: 12, color: '#4b5563', marginBottom: 2 }}>• {e}</div>
                          ))}
                        </div>
                      )}

                      {msg.explanation.risks?.length > 0 && (
                        <div style={{ background: '#fef2f2', padding: 8, borderRadius: 6, marginBottom: 10 }}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: '#991b1b', marginBottom: 4 }}>⚠️ RISKS</div>
                          {msg.explanation.risks.map((r, i) => (
                            <div key={i} style={{ fontSize: 12, color: '#991b1b', marginBottom: 2 }}>• {r}</div>
                          ))}
                        </div>
                      )}

                      <div style={{ background: '#f0fdf4', padding: 8, borderRadius: 6, marginBottom: 10 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#166534', marginBottom: 4 }}>✅ RECOMMENDATION</div>
                        <div style={{ fontSize: 13, color: '#166534' }}>{msg.explanation.recommended_action}</div>
                      </div>

                      <div style={{ fontSize: 11, color: '#6b7280', fontStyle: 'italic' }}>
                        Expected outcome: {msg.explanation.expected_outcome}
                      </div>
                    </div>
                  )}

                  {msg.agentResults && msg.agentResults.length > 0 && (
                    <div style={{ borderTop: '1px solid rgba(0,0,0,0.1)', paddingTop: 10, marginTop: 8 }}>
                      {msg.agentResults.map((agentResult, i) => (
                        <div key={i} style={{
                          background: '#f9fafb',
                          border: '1px solid #e5e7eb',
                          borderRadius: 6,
                          padding: 10,
                          marginBottom: 8,
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                            <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: '#6b7280' }}>
                              {agentResult.agent}
                            </span>
                            <span style={{ fontSize: 11, color: '#6b7280' }}>
                              {(agentResult.confidence * 100).toFixed(0)}%
                            </span>
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{agentResult.title}</div>
                          <div style={{ fontSize: 12, color: '#4b5563', marginBottom: 6 }}>{agentResult.summary}</div>
                          {agentResult.recommended_actions?.length > 0 && (
                            <div style={{ fontSize: 12, color: '#166534' }}>
                              • {agentResult.recommended_actions[0]}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {msg.dataUsed && msg.dataUsed.length > 0 && (
                    <div style={{ marginTop: 8, fontSize: 11, opacity: 0.7, borderTop: '1px solid rgba(0,0,0,0.1)', paddingTop: 6 }}>
                      Data sources: {msg.dataUsed.join(', ')}
                    </div>
                  )}

                  {msg.role === 'assistant' && msg.id && (
                    <AIFeedback messageId={msg.id} />
                  )}
                </div>
              </div>
            ))
          )}
          {loading && (
            <div style={{ textAlign: 'left', marginBottom: 20 }}>
              <div style={{ display: 'inline-block', padding: '12px 16px', borderRadius: 12, background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                <span className="muted" style={{ fontStyle: 'italic' }}>Analyzing your farm with multiple AI agents...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {messages.length > 0 && messages[messages.length - 1]?.followUps && (
          <FollowUpSuggestions
            suggestions={messages[messages.length - 1].followUps || []}
            onSelect={(q) => sendMessage(q)}
            disabled={loading}
          />
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage(input);
              }
            }}
            placeholder="Ask anything about your farm..."
            rows={2}
            disabled={loading}
            style={{ flex: 1, padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: 6, resize: 'vertical', fontFamily: 'inherit' }}
          />
          <button className="btn btn-primary" onClick={() => sendMessage(input)} disabled={loading || !input.trim()} style={{ alignSelf: 'flex-end' }}>
            {loading ? 'Analyzing...' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}
