import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/index.js';
import { requireAuth, requirePermission, resolveFarmId, audit } from '../middleware/auth.js';
import { HttpError, asyncHandler } from '../lib/errors.js';

const router = Router();
router.use(requireAuth);

router.get('/', asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const { rows } = await query('SELECT * FROM fertility_stats WHERE farm_id=$1 ORDER BY period_start DESC', [farmId]);
  res.json({ data: rows, count: rows.length });
}));

const schema = z.object({
  periodStart: z.string(),
  periodEnd: z.string(),
  conceptionRate: z.number().min(0).max(100).default(0),
  calvingRate: z.number().min(0).max(100).default(0),
  abortionRate: z.number().min(0).max(100).default(0),
  avgServicesPerConception: z.number().min(0).default(0),
  cowsServiced: z.number().min(0).default(0),
  cowsPregnant: z.number().min(0).default(0),
});

router.post('/', requirePermission('cow:manage'), asyncHandler(async (req, res) => {
  const b = schema.parse(req.body);
  const farmId = resolveFarmId(req);
  const { rows } = await query(
    `INSERT INTO fertility_stats (farm_id, period_start, period_end, conception_rate, calving_rate, abortion_rate, avg_services_per_conception, cows_serviced, cows_pregnant)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [farmId, b.periodStart, b.periodEnd, b.conceptionRate, b.calvingRate, b.abortionRate, b.avgServicesPerConception, b.cowsServiced, b.cowsPregnant]
  );
  await audit(req.user, 'create', 'fertility_stats', rows[0].id);
  res.status(201).json(rows[0]);
}));

router.patch('/:id', requirePermission('cow:manage'), asyncHandler(async (req, res) => {
  const b = schema.partial().parse(req.body);
  const existing = await query('SELECT farm_id FROM fertility_stats WHERE id=$1', [req.params.id]);
  if (!existing.rows[0]) throw new HttpError(404, 'Fertility stats not found');
  if (existing.rows[0].farm_id !== resolveFarmId(req)) throw new HttpError(403, 'Access denied');
  const sets: string[] = [];
  const params: any[] = [];
  let i = 1;
  const map: Record<string, string> = { periodStart: 'period_start', periodEnd: 'period_end', conceptionRate: 'conception_rate', calvingRate: 'calving_rate', abortionRate: 'abortion_rate', avgServicesPerConception: 'avg_services_per_conception', cowsServiced: 'cows_serviced', cowsPregnant: 'cows_pregnant' };
  for (const [k, col] of Object.entries(map)) {
    if ((b as any)[k] !== undefined) { sets.push(`${col}=$${i}`); params.push((b as any)[k]); i++; }
  }
  params.push(req.params.id);
  const { rows } = await query(`UPDATE fertility_stats SET ${sets.join(', ')} WHERE id=$${i} RETURNING *`, params);
  await audit(req.user, 'update', 'fertility_stats', req.params.id, b);
  res.json(rows[0]);
}));

export default router;
