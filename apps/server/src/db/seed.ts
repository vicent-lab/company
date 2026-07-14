import fs from 'fs';
import path from 'path';
import { pool, query } from './index.js';

const SEEDS_DIR = path.resolve(__dirname, '../../../../database/seeds');

async function main() {
  const files = fs.readdirSync(SEEDS_DIR).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const sql = fs.readFileSync(path.join(SEEDS_DIR, file), 'utf8');
    console.log(`→ seeding: ${file}`);
    await query(sql);
  }
  console.log('Seed complete.');
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
