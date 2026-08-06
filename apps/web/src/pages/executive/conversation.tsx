import { useState, useEffect, useRef } from 'react';
import { useAsync } from '../../ui';
import { useFarm } from '../../app';
import { apiGet, apiSend } from '../../api';
import { isLive } from '../../api';

interface Message {
  id: string;
  role: string;
  content: string;
  created_at: string;
  metadata?: Record<string, any>;
}

interface Conversation {
  id: string;
  title: string;
  updated_at: string;
}

export default function ConversationPage() {
  const { farmId } = useFarm();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: conversations } = useAsync(async () => {
    if (!farmId || !isLive) return [];
    const res = await apiGet<any>('/executive/conversations');
    return res.data || [];
  }, [farmId]);

  useEffect(() => {
    if (!conversationId) return;
    apiGet<any>(`/executive/conversations/${conversationId}/messages`).then((res) => {
      setMessages(res.data || []);
    });
    apiGet<any>(`/executive/conversations/${conversationId}/suggestions`).then((res) => {
      setSuggestions(res.suggestions || []);
    });
  }, [conversationId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || !conversationId) return;
    const res = await apiSend<any>(`/executive/conversations/${conversationId}/messages`, 'POST', { content: input.trim() });
    setMessages((prev) => [...prev, res.userMessage, res.assistantMessage]);
    setSuggestions(res.followUps);
    setInput('');
  };

  const startConversation = async () => {
    const res = await apiSend<any>('/executive/conversations', 'POST', { title: 'New conversation' });
    setConversationId(res.conversationId);
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>AI Conversation</h1>
          <p className="muted">Multi-turn dialogue with farm memory</p>
        </div>
        {!conversationId && (
          <button className="btn btn-primary" onClick={startConversation}>
            Start Conversation
          </button>
        )}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3>Conversations</h3>
        {!conversations || conversations.length === 0 ? (
          <p className="muted">No conversations yet</p>
        ) : (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {conversations.map((c: Conversation) => (
              <button
                key={c.id}
                className={`btn ${c.id === conversationId ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setConversationId(c.id)}
              >
                {c.title || 'Untitled'}
              </button>
            ))}
          </div>
        )}
      </div>

      {conversationId && (
        <>
          <div className="card" style={{ minHeight: 400, maxHeight: 600, overflowY: 'auto', marginBottom: 16, background: '#fafafa' }}>
            {messages.length === 0 ? (
              <p className="muted">Start a conversation with your farm AI advisor.</p>
            ) : (
              messages.map((msg) => (
                <div key={msg.id} style={{ marginBottom: 16, textAlign: msg.role === 'user' ? 'right' : 'left' }}>
                  <div
                    style={{
                      display: 'inline-block',
                      padding: '8px 12px',
                      borderRadius: 8,
                      background: msg.role === 'user' ? '#3b82f6' : '#e5e7eb',
                      color: msg.role === 'user' ? '#fff' : '#000',
                      maxWidth: '70%',
                    }}
                  >
                    {msg.content}
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {suggestions.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <p className="muted" style={{ fontSize: 12, marginBottom: 8 }}>Suggested follow-ups:</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {suggestions.map((s, i) => (
                  <button key={i} className="btn btn-secondary" onClick={() => setInput(s)}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
              placeholder="Ask your farm AI advisor..."
              style={{ flex: 1, padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: 6 }}
            />
            <button className="btn btn-primary" onClick={sendMessage} disabled={!input.trim()}>
              Send
            </button>
          </div>
        </>
      )}
    </div>
  );
}
