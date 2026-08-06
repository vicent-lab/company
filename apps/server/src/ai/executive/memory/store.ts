import { query } from '../../../db/index.js';

export interface Memory {
  id: string;
  farmId: string;
  kind: 'fact' | 'decision' | 'outcome' | 'preference' | 'event';
  key: string;
  value: any;
  confidence: number;
  source: string;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

const MEMORY_TTL_DAYS: Record<string, number> = {
  fact: 365,
  decision: 180,
  outcome: 365,
  preference: 90,
  event: 30,
};

export async function storeMemory(farmId: string, kind: Memory['kind'], key: string, value: any, confidence = 1.0, source = 'system', ttlDays?: number) {
  const expiresAt = ttlDays ?? MEMORY_TTL_DAYS[kind];
  await query(
    `INSERT INTO ai_memories (farm_id, kind, key, value, confidence, source, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6, now() + ($7 || ' days')::interval)
     ON CONFLICT (farm_id, kind, key) DO UPDATE SET value=$4, confidence=$5, source=$6, updated_at=now()`,
    [farmId, kind, key, JSON.stringify(value), confidence, source, String(expiresAt)]
  );
}

export async function recallMemory(farmId: string, kind?: Memory['kind']) {
  const rows = await query<Memory>(
    `SELECT id, farm_id, kind, key, value, confidence, source, expires_at, created_at, updated_at
     FROM ai_memories
     WHERE farm_id=$1 AND (expires_at IS NULL OR expires_at > now())
       AND ($2::text IS NULL OR kind=$2)
     ORDER BY confidence DESC, updated_at DESC`,
    [farmId, kind || null]
  );
  return rows.rows.map((r) => ({ ...r, value: JSON.parse(r.value || '{}') }));
}

export async function recallMemoryByKey(farmId: string, key: string): Promise<Memory | null> {
  const rows = await query<Memory>(
    `SELECT id, farm_id, kind, key, value, confidence, source, expires_at, created_at, updated_at
     FROM ai_memories WHERE farm_id=$1 AND key=$2 AND (expires_at IS NULL OR expires_at > now())
     ORDER BY confidence DESC LIMIT 1`,
    [farmId, key]
  );
  if (!rows.rows.length) return null;
  return { ...rows.rows[0], value: JSON.parse(rows.rows[0].value || '{}') };
}

export async function forgetMemory(farmId: string, key: string) {
  await query(`DELETE FROM ai_memories WHERE farm_id=$1 AND key=$2`, [farmId, key]);
}

export async function consolidateMemories(farmId: string) {
  await query(
    `UPDATE ai_memories SET updated_at=now() WHERE farm_id=$1 AND expires_at IS NULL AND updated_at < now() - interval '30 days'`,
    [farmId]
  );
}
