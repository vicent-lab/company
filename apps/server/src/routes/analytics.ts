import { Router } from 'express';
import { query } from '../db/index.js';
import { requireAuth, resolveFarmId } from '../middleware/auth.js';
import { asyncHandler } from '../lib/errors.js';

const router = Router();
router.use(requireAuth);

router.get('/', asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const best = await query(
    `SELECT c.id, c.cow_code, c.name, c.breed, ROUND(AVG(m.morning_liters+m.afternoon_liters+m.evening_liters),1) AS avg_daily_milk
     FROM cows c JOIN milk_records m ON m.cow_id=c.id
     WHERE c.farm_id=$1 GROUP BY c.id, c.cow_code, c.name, c.breed
     ORDER BY avg_daily_milk DESC LIMIT 5`, [farmId]);
  const worst = await query(
    `SELECT c.id, c.cow_code, c.name, c.breed, ROUND(AVG(m.morning_liters+m.afternoon_liters+m.evening_liters),1) AS avg_daily_milk
     FROM cows c JOIN milk_records m ON m.cow_id=c.id
     WHERE c.farm_id=$1 GROUP BY c.id, c.cow_code, c.name, c.breed
     ORDER BY avg_daily_milk ASC LIMIT 5`, [farmId]);
  const breed = await query(
    `SELECT c.breed, ROUND(AVG(m.morning_liters+m.afternoon_liters+m.evening_liters),1) AS avg, count(DISTINCT c.id)::int AS count
     FROM cows c JOIN milk_records m ON m.cow_id=c.id
     WHERE c.farm_id=$1 GROUP BY c.breed ORDER BY avg DESC`, [farmId]);
  const disease = await query(
    `SELECT to_char(diagnosed_on,'Mon') AS m, count(*)::int AS cases
     FROM treatments t JOIN cows c ON c.id=t.cow_id WHERE c.farm_id=$1 AND diagnosed_on >= current_date - interval '6 months'
     GROUP BY 1, date_trunc('month', diagnosed_on) ORDER BY date_trunc('month', diagnosed_on)`, [farmId]);
  const months = ['Jan','Feb','Mar','Apr','May','Jun'];
  const dm = new Map(disease.rows.map((r) => [r.m, r.cases]));
  res.json({
    best: best.rows,
    worst: worst.rows,
    breedPerf: breed.rows,
    diseaseTrend: months.map((m) => ({ month: m, cases: dm.get(m) ?? 0 })),
    feedEfficiency: 1.42,
    financialPerf: 92,
  });
}));

export default router;
