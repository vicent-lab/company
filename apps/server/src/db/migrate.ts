import fs from 'fs';
import path from 'path';
import { pool, query } from './index.js';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../../../database/migrations');
const SEEDS_DIR = path.resolve(__dirname, '../../../../database/seeds');

async function ensureMigrationsTable() {
  await query(`CREATE TABLE IF NOT EXISTS schema_migrations (filename TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
}

async function runDir(dir: string, label: string) {
  if (!fs.existsSync(dir)) {
    console.error(`Directory not found: ${dir}`);
    process.exit(1);
  }
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const row = await query(`SELECT filename FROM schema_migrations WHERE filename=$1`, [file]);
    if (row.rows.length > 0) {
      console.log(`→ skipping ${label}: ${file}`);
      continue;
    }
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    console.log(`→ applying ${label}: ${file}`);
    await query(sql);
    await query(`INSERT INTO schema_migrations (filename) VALUES ($1)`, [file]);
  }
}

async function main() {
  console.log('Running migrations…');
  await ensureMigrationsTable();
  await runDir(MIGRATIONS_DIR, 'migration');
  console.log('Migrations complete.');
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
