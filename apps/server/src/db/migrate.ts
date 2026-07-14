import fs from 'fs';
import path from 'path';
import { pool, query } from './index.js';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../../../database/migrations');
const SEEDS_DIR = path.resolve(__dirname, '../../../../database/seeds');

async function runDir(dir: string, label: string) {
  if (!fs.existsSync(dir)) {
    console.error(`Directory not found: ${dir}`);
    process.exit(1);
  }
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    console.log(`→ applying ${label}: ${file}`);
    await query(sql);
  }
}

async function main() {
  console.log('Running migrations…');
  await runDir(MIGRATIONS_DIR, 'migration');
  console.log('Migrations complete.');
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
