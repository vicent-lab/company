import { query } from '../../db/index.js';
import { recallMemory, storeMemory } from '../executive/memory/store.js';

export interface ConversationContext {
  farmId: string;
  conversationId?: string;
  userId: string;
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string; metadata?: Record<string, any> }>;
}

export async function getOrCreateConversation(farmId: string, userId: string, title?: string): Promise<string> {
  const existing = await query(`SELECT id FROM ai_conversations WHERE farm_id=$1 AND user_id=$2 AND updated_at >= now() - interval '24 hours' ORDER BY updated_at DESC LIMIT 1`, [farmId, userId]);
  if (existing.rows.length) return existing.rows[0].id;

  const row = await query(`INSERT INTO ai_conversations (farm_id, user_id, title, context) VALUES ($1,$2,$3,$4) RETURNING id`, [farmId, userId, title || 'New conversation', JSON.stringify({ turns: 0, topics: [] })]);
  return row.rows[0].id;
}

export async function loadConversationMessages(conversationId: string, farmId: string, limit = 50) {
  const rows = await query(
    `SELECT id, role, content, attachments, metadata, created_at FROM ai_messages WHERE conversation_id=$1 AND farm_id=$2 ORDER BY created_at ASC LIMIT $3`,
    [conversationId, farmId, limit]
  );
  return rows.rows;
}

export async function appendMessage(conversationId: string, farmId: string, role: 'user' | 'assistant' | 'system', content: string, attachments: any[] = [], metadata: Record<string, any> = {}) {
  const row = await query(
    `INSERT INTO ai_messages (conversation_id, farm_id, role, content, attachments, metadata) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, created_at`,
    [conversationId, farmId, role, content, JSON.stringify(attachments), JSON.stringify(metadata)]
  );
  await query(`UPDATE ai_conversations SET updated_at=now() WHERE id=$1`, [conversationId]);
  return row.rows[0];
}

export async function getRelevantMemory(farmId: string, topic: string, limit = 10) {
  const memories = await recallMemory(farmId);
  const scored = memories
    .map((m: any) => ({ ...m, relevance: topicRelevance(m.key, m.value, topic) }))
    .sort((a: any, b: any) => b.relevance - a.relevance)
    .slice(0, limit);
  return scored;
}

function topicRelevance(key: string, value: any, topic: string): number {
  const text = `${key} ${JSON.stringify(value)}`.toLowerCase();
  const words = topic.toLowerCase().split(/\s+/);
  let score = 0;
  for (const word of words) {
    if (text.includes(word)) score += 0.2;
  }
  return Math.min(1.0, score);
}

export async function generateFollowUpQuestions(farmId: string, lastAnswer: string, context: ConversationContext): Promise<string[]> {
  const suggestions: string[] = [];
  const lower = lastAnswer.toLowerCase();

  if (lower.includes('milk') && lower.includes('decline')) {
    suggestions.push('Which cows are most affected?');
    suggestions.push('Is heat stress a factor?');
    suggestions.push('What should I change in the ration?');
  } else if (lower.includes('profit') || lower.includes('margin')) {
    suggestions.push('Which expense categories are highest?');
    suggestions.push('Which cows are least profitable?');
    suggestions.push('What if I reduce feed costs by 10%?');
  } else if (lower.includes('sick') || lower.includes('health')) {
    suggestions.push('Schedule a vet visit');
    suggestions.push('Show me treatment history');
    suggestions.push('Are there any vaccination gaps?');
  } else if (lower.includes('feed')) {
    suggestions.push('How many days of feed remain?');
    suggestions.push('What is the current feed cost per liter?');
    suggestions.push('Suggest alternative rations');
  } else if (lower.includes('weather') || lower.includes('heat')) {
    suggestions.push('What is the current THI?');
    suggestions.push('Forecast for the next 3 days');
    suggestions.push('Which cows are most vulnerable?');
  } else {
    suggestions.push('Run full farm analysis');
    suggestions.push('Show my daily action plan');
    suggestions.push('Generate a financial report');
  }

  return suggestions.slice(0, 4);
}
