import { query } from '../../db/index.js';

export interface MemoryEntry {
  id: string;
  farm_id: string;
  kind: 'conversation' | 'fact' | 'decision' | 'outcome' | 'preference' | 'event';
  key: string;
  value: any;
  confidence: number;
  source: string;
  created_at: string;
  updated_at: string;
}

export class MemoryEngine {
  constructor(private farmId: string) {}

  async store(kind: MemoryEntry['kind'], key: string, value: any, confidence = 1.0, source = 'system') {
    await query(
      `INSERT INTO ai_memories (farm_id, kind, key, value, confidence, source)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (farm_id, kind, key) DO UPDATE SET value=$4, confidence=$5, source=$6, updated_at=now()`,
      [this.farmId, kind, key, JSON.stringify(value), confidence, source]
    );
  }

  async recall(kind?: MemoryEntry['kind'], limit = 50): Promise<MemoryEntry[]> {
    const rows = await query(
      `SELECT id, farm_id, kind, key, value, confidence, source, created_at, updated_at
       FROM ai_memories
       WHERE farm_id=$1 AND (expires_at IS NULL OR expires_at > now())
         AND ($2::text IS NULL OR kind=$2)
       ORDER BY updated_at DESC
       LIMIT $3`,
      [this.farmId, kind || null, limit]
    );
    return rows.rows.map((r: any): MemoryEntry => ({ id: r.id, farm_id: r.farm_id, kind: r.kind, key: r.key, value: JSON.parse(r.value || '{}'), confidence: r.confidence, source: r.source, created_at: r.created_at, updated_at: r.updated_at }));
  }

  async recallByKey(key: string): Promise<MemoryEntry | null> {
    const rows = await query(
      `SELECT id, farm_id, kind, key, value, confidence, source, created_at, updated_at
       FROM ai_memories
       WHERE farm_id=$1 AND key=$2
       ORDER BY updated_at DESC
       LIMIT 1`,
      [this.farmId, key]
    );
    if (!rows.rows.length) return null;
    const r = rows.rows[0] as any;
    return { id: r.id, farm_id: r.farm_id, kind: r.kind, key: r.key, value: JSON.parse(r.value || '{}'), confidence: r.confidence, source: r.source, created_at: r.created_at, updated_at: r.updated_at };
  }

  async forget(key: string) {
    await query(`DELETE FROM ai_memories WHERE farm_id=$1 AND key=$2`, [this.farmId, key]);
  }

  async getTopics(limit = 20): Promise<string[]> {
    const rows = await query(
      `SELECT DISTINCT key FROM ai_memories WHERE farm_id=$1 AND kind='conversation' ORDER BY updated_at DESC LIMIT $2`,
      [this.farmId, limit]
    );
    return rows.rows.map((r: any) => r.key);
  }
}
