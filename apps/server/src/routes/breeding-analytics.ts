import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/index.js';
import { requireAuth, resolveFarmId, audit } from '../middleware/auth.js';
import { HttpError, asyncHandler } from '../lib/errors.js';

const router = Router();
router.use(requireAuth);

const schema = z.object({
  cowId: z.string().uuid().optional(),
  breed: z.string().optional(),
  method: z.string().optional(),
  technician: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

router.get('/', asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const f = schema.parse(req.query);
  await audit(req.user, 'read', 'breeding_analytics', farmId, f);

  const conditions: string[] = ['c.farm_id=$1'];
  const params: any[] = [farmId];

  if (f.cowId) { conditions.push('br.cow_id=$2'); params.push(f.cowId); }
  if (f.breed) { conditions.push('c.breed ILIKE $' + (params.length + 1)); params.push(`%${f.breed}%`); }
  if (f.method) { conditions.push('br.method ILIKE $' + (params.length + 1)); params.push(`%${f.method}%`); }
  if (f.technician) { conditions.push('br.technician ILIKE $' + (params.length + 1)); params.push(`%${f.technician}%`); }
  if (f.startDate) { conditions.push('br.breeding_date >= $' + (params.length + 1)); params.push(f.startDate); }
  if (f.endDate) { conditions.push('br.breeding_date <= $' + (params.length + 1)); params.push(f.endDate); }

  const where = conditions.join(' AND ');

  const [conceptionRes, calvingIntervalRes, servicesRes, daysOpenRes, ageFirstRes, calvingSuccessRes, pregnancyRateRes] = await Promise.all([
    query(`
      SELECT
        COUNT(*) FILTER (WHERE lower(coalesce(br.result, '')) = 'pregnant') AS pregnant,
        COUNT(*) AS total
      FROM breeding_records br
      JOIN cows c ON c.id = br.cow_id
      WHERE ${where}
    `, params),
    query(`
      SELECT AVG(EXTRACT(EPOCH FROM (cr.calving_date - br.breeding_date)) / 86400) AS avg_days
      FROM calving_records cr
      JOIN breeding_records br ON br.id = cr.pregnancy_id
      JOIN cows c ON c.id = br.cow_id
      WHERE ${where} AND cr.calving_date IS NOT NULL AND br.breeding_date IS NOT NULL
    `, params),
    query(`
      SELECT ROUND(COUNT(*)::numeric / NULLIF(COUNT(DISTINCT br.cow_id) FILTER (WHERE lower(coalesce(br.result, '')) = 'pregnant'), 0), 2) AS avg_services
      FROM breeding_records br
      JOIN cows c ON c.id = br.cow_id
      WHERE ${where}
    `, params),
    query(`
      SELECT AVG(EXTRACT(EPOCH FROM (COALESCE(p.expected_calving_date, CURRENT_DATE) - br.breeding_date)) / 86400) AS avg_days
      FROM breeding_records br
      JOIN cows c ON c.id = br.cow_id
      LEFT JOIN pregnancies p ON p.breeding_id = br.id
      WHERE ${where} AND lower(coalesce(br.result, '')) = 'pregnant'
    `, params),
    query(`
      SELECT AVG(EXTRACT(YEAR FROM AGE(c.date_of_birth, cr.calving_date))) AS avg_age
      FROM calving_records cr
      JOIN breeding_records br ON br.id = cr.pregnancy_id
      JOIN cows c ON c.id = br.cow_id
      WHERE ${where} AND c.date_of_birth IS NOT NULL AND cr.calving_date IS NOT NULL
    `, params),
    query(`
      SELECT
        COUNT(*) FILTER (WHERE cr.difficulty_score IS NOT NULL) AS total_calvings,
        COUNT(*) FILTER (WHERE cr.difficulty_score <= 2) AS easy_calvings
      FROM calving_records cr
      JOIN breeding_records br ON br.id = cr.pregnancy_id
      JOIN cows c ON c.id = br.cow_id
      WHERE ${where}
    `, params),
    query(`
      SELECT
        COUNT(*) FILTER (WHERE lower(p.status) = 'confirmed' OR lower(p.status) = 'completed') AS pregnant,
        COUNT(*) AS total
      FROM pregnancies p
      JOIN cows c ON c.id = p.cow_id
      WHERE ${where.replace(/br\.cow_id/g, 'p.cow_id').replace(/c\.breed/g, 'c.breed').replace(/c\.farm_id/g, 'p.farm_id').replace(/br\.method/g, 'p.expected_calving_date').replace(/br\.technician/g, 'p.confirmation_date')}
    `, params),
  ]);

  const conception = Number(conceptionRes.rows[0]?.pregnant || 0);
  const totalBreeding = Number(conceptionRes.rows[0]?.total || 0);
  const conceptionRate = totalBreeding > 0 ? +(conception / totalBreeding * 100).toFixed(1) : 0;

  const calvingInterval = Number(calvingIntervalRes.rows[0]?.avg_days || 0);
  const servicesPerConception = Number(servicesRes.rows[0]?.avg_services || 0);
  const daysOpen = Number(daysOpenRes.rows[0]?.avg_days || 0);
  const ageAtFirstCalving = Number(ageFirstRes.rows[0]?.avg_age || 0);

  const totalCalvings = Number(calvingSuccessRes.rows[0]?.total_calvings || 0);
  const easyCalvings = Number(calvingSuccessRes.rows[0]?.easy_calvings || 0);
  const calvingSuccessRate = totalCalvings > 0 ? +(easyCalvings / totalCalvings * 100).toFixed(1) : 0;

  const pregConfirmed = Number(pregnancyRateRes.rows[0]?.pregnant || 0);
  const pregTotal = Number(pregnancyRateRes.rows[0]?.total || 0);
  const pregnancyRate = pregTotal > 0 ? +(pregConfirmed / pregTotal * 100).toFixed(1) : 0;

  res.json({
    conceptionRate,
    pregnancyRate,
    calvingInterval: +calvingInterval.toFixed(1),
    servicesPerConception: +servicesPerConception.toFixed(1),
    daysOpen: +daysOpen.toFixed(1),
    ageAtFirstCalving: +ageAtFirstCalving.toFixed(1),
    calvingSuccessRate,
    totalBreeding,
    totalCalvings,
  });
}));

export default router;
