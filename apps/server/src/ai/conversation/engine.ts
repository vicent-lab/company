import { query } from '../../db/index.js';
import { recallMemory } from '../executive/memory/store.js';

export interface ConversationContext {
  farmId: string;
  conversationId?: string;
  userId: string;
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string; metadata?: Record<string, any> }>;
}

export interface ConversationTurn {
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: string;
  metadata?: Record<string, any>;
}

export interface ResolvedContext {
  conversationId: string;
  turns: ConversationTurn[];
  entities: ExtractedEntities;
  expandedQuestion: string;
}

export interface ExtractedEntities {
  cowCodes: string[];
  cowIds: string[];
  counts: { label: string; value: number }[];
  dates: string[];
  categories: string[];
  lastPregnantCows: string[];
  lastSickCows: string[];
  lastTopProducers: string[];
  lastCalvingCows: string[];
}

const MAX_TURNS = 20;
const PRONOUNS = /\b(they|them|their|she|her|he|him|his|it|its|those|these|this|that)\b/gi;
const COW_CODE_RE = /\b([A-Z]{2,3}-\d{1,4})\b/i;
const COW_ID_RE = /\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/i;

export async function getOrCreateConversation(farmId: string, userId: string, title?: string): Promise<string> {
  const existing = await query(`SELECT id FROM ai_conversations WHERE farm_id=$1 AND user_id=$2 AND updated_at >= now() - interval '2 hours' ORDER BY updated_at DESC LIMIT 1`, [farmId, userId]);
  if (existing.rows.length) return existing.rows[0].id;

  const row = await query(`INSERT INTO ai_conversations (farm_id, user_id, title, context) VALUES ($1,$2,$3,$4) RETURNING id`, [farmId, userId, title || 'Conversation', JSON.stringify({ turns: 0, topics: [] })]);
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

export async function loadConversationContext(farmId: string, userId: string, currentQuestion: string): Promise<ResolvedContext> {
  const conversationId = await getOrCreateConversation(farmId, userId);
  const turns = await loadRecentTurns(conversationId, farmId, MAX_TURNS);
  const entities = extractEntities(turns);
  const expandedQuestion = resolvePronouns(currentQuestion, entities);

  return {
    conversationId,
    turns,
    entities,
    expandedQuestion,
  };
}

export async function saveTurn(conversationId: string, farmId: string, role: 'user' | 'assistant', content: string, metadata: Record<string, any> = {}) {
  await query(
    `INSERT INTO ai_messages (conversation_id, farm_id, role, content, metadata) VALUES ($1,$2,$3,$4,$5)`,
    [conversationId, farmId, role, content, JSON.stringify(metadata)]
  );
  await query(`UPDATE ai_conversations SET updated_at=now(), context=$1 WHERE id=$2`, [JSON.stringify({ turns: Math.min(await countMessages(conversationId) + 1, MAX_TURNS) }), conversationId]);
}

async function loadRecentTurns(conversationId: string, farmId: string, limit: number): Promise<ConversationTurn[]> {
  const rows = await query(
    `SELECT role, content, metadata, created_at FROM ai_messages WHERE conversation_id=$1 AND farm_id=$2 ORDER BY created_at DESC LIMIT $3`,
    [conversationId, farmId, limit]
  );
  return rows.rows.reverse().map((r: any) => ({ role: r.role, content: r.content, metadata: r.metadata, created_at: r.created_at }));
}

async function countMessages(conversationId: string): Promise<number> {
  const r = await query(`SELECT count(*)::int AS n FROM ai_messages WHERE conversation_id=$1`, [conversationId]);
  return r.rows[0]?.n || 0;
}

export function extractEntities(turns: ConversationTurn[]): ExtractedEntities {
  const entities: ExtractedEntities = {
    cowCodes: [],
    cowIds: [],
    counts: [],
    dates: [],
    categories: [],
    lastPregnantCows: [],
    lastSickCows: [],
    lastTopProducers: [],
    lastCalvingCows: [],
  };

  for (const turn of turns) {
    if (turn.role !== 'assistant') continue;
    const text = turn.content;

    const codeMatches = text.match(COW_CODE_RE);
    if (codeMatches) entities.cowCodes.push(...codeMatches);

    const idMatches = text.match(COW_ID_RE);
    if (idMatches) entities.cowIds.push(...idMatches);

    const pregnantMatch = text.match(/(\d+)\s+cow\(s\)\s+(?:confirmed\s+)?pregnant/i);
    if (pregnantMatch) entities.counts.push({ label: 'pregnant_cows', value: Number(pregnantMatch[1]) });

    const sickMatch = text.match(/(\d+)\s+cow\(s\)\s+(?:need|needs)?\s+(?:health\s+)?attention/i);
    if (sickMatch) entities.counts.push({ label: 'sick_cows', value: Number(sickMatch[1]) });

    if (/pregnant/i.test(text)) entities.categories.push('pregnant');
    if (/sick|under_treatment|treatment/i.test(text)) entities.categories.push('sick');
    if (/calv/i.test(text)) entities.categories.push('calving');
    if (/milk|production|yield/i.test(text)) entities.categories.push('milk');
    if (/feed|inventory/i.test(text)) entities.categories.push('feed');
    if (/vaccin/i.test(text)) entities.categories.push('vaccination');

    const cowListMatch = text.match(/(\d+)\.\s+([A-Za-z]+)\s+\(([A-Z]{2,3}-\d{1,4})\):/g);
    if (cowListMatch) {
      const codes = cowListMatch.map(m => m.match(/\(([A-Z]{2,3}-\d{1,4})\)/)?.[1]).filter(Boolean) as string[];
      if (/pregnant/i.test(text)) entities.lastPregnantCows.push(...codes);
      else if (/sick|treatment|attention/i.test(text)) entities.lastSickCows.push(...codes);
      else if (/milk|producer|production/i.test(text)) entities.lastTopProducers.push(...codes);
      else if (/calv/i.test(text)) entities.lastCalvingCows.push(...codes);
      else entities.cowCodes.push(...codes);
    }
  }

  entities.cowCodes = [...new Set(entities.cowCodes)];
  entities.cowIds = [...new Set(entities.cowIds)];
  entities.categories = [...new Set(entities.categories)];

  return entities;
}

export function resolvePronouns(question: string, entities: ExtractedEntities): string {
  if (!PRONOUNS.test(question)) return question;
  PRONOUNS.lastIndex = 0;

  let expanded = question;

  const allCows = entities.cowCodes.length > 0 ? entities.cowCodes : entities.cowIds;
  const allCowsStr = allCows.length > 0 ? allCows.join(', ') : 'the cows mentioned';

  if (entities.lastPregnantCows.length > 0) {
    expanded = expanded.replace(/\bthey\b/gi, entities.lastPregnantCows.join(' and '));
    expanded = expanded.replace(/\bthem\b/gi, entities.lastPregnantCows.join(' and '));
    expanded = expanded.replace(/\btheir\b/gi, 'their');
  }
  if (entities.lastSickCows.length > 0) {
    expanded = expanded.replace(/\bthey\b/gi, entities.lastSickCows.join(' and '));
    expanded = expanded.replace(/\bthem\b/gi, entities.lastSickCows.join(' and '));
    expanded = expanded.replace(/\btheir\b/gi, 'their');
  }
  if (entities.lastTopProducers.length > 0) {
    expanded = expanded.replace(/\bthey\b/gi, entities.lastTopProducers.join(' and '));
    expanded = expanded.replace(/\bthem\b/gi, entities.lastTopProducers.join(' and '));
    expanded = expanded.replace(/\btheir\b/gi, 'their');
  }
  if (entities.lastCalvingCows.length > 0) {
    expanded = expanded.replace(/\bthey\b/gi, entities.lastCalvingCows.join(' and '));
    expanded = expanded.replace(/\bthem\b/gi, entities.lastCalvingCows.join(' and '));
    expanded = expanded.replace(/\btheir\b/gi, 'their');
  }

  if (/\bshe\b|\bher\b|\bhis\b/i.test(expanded) && allCows.length > 0) {
    expanded = expanded.replace(/\bshe\b/gi, allCows[0]);
    expanded = expanded.replace(/\bher\b/gi, `${allCows[0]}'s`);
    expanded = expanded.replace(/\bhis\b/gi, `${allCows[0]}'s`);
  }

  if (/\bthey\b|\bthem\b/i.test(expanded) && allCows.length > 0) {
    expanded = expanded.replace(/\bthey\b/gi, allCows.join(' and '));
    expanded = expanded.replace(/\bthem\b/gi, allCows.join(' and '));
  }

  if (/\bit\b|\bits\b/i.test(expanded) && allCows.length > 0) {
    expanded = expanded.replace(/\bit\b/gi, allCows[0]);
    expanded = expanded.replace(/\bits\b/gi, `${allCows[0]}'s`);
  }

  if (/\bthose\b|\bthese\b/i.test(expanded) && allCows.length > 0) {
    expanded = expanded.replace(/\bthose\b/gi, allCows.join(' and '));
    expanded = expanded.replace(/\bthese\b/gi, allCows.join(' and '));
  }

  return expanded;
}

export function buildContextSummary(turns: ConversationTurn[]): string {
  if (!turns.length) return '';
  const recent = turns.slice(-6);
  const parts: string[] = [];
  for (const turn of recent) {
    if (turn.role === 'user') parts.push(`User asked: ${turn.content}`);
    else if (turn.role === 'assistant') parts.push(`AI answered: ${turn.content.slice(0, 300)}`);
  }
  return parts.join('\n');
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
