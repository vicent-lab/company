import { Pool } from 'pg';
import { config } from '../env.js';

export const pool = new Pool({
  connectionString: config.databaseUrl,
  max: Number(process.env.PG_POOL_MAX ?? 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

export interface QueryResultRow {
  [column: string]: any;
}

export async function query<T = QueryResultRow>(text: string, params: any[] = []): Promise<{ rows: T[]; rowCount: number }> {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    return { rows: res.rows as T[], rowCount: res.rowCount ?? 0 };
  } finally {
    if (config.env === 'development' && Date.now() - start > 200) {
      // slow query logging hook
    }
  }
}

export async function getClient() {
  return pool.connect();
}

export async function withTransaction<T>(fn: (client: import('pg').PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function healthCheck(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

process.on('SIGINT', () => pool.end().then(() => process.exit(0)).catch(() => process.exit(0)));
process.on('SIGTERM', () => pool.end().then(() => process.exit(0)).catch(() => process.exit(0)));
