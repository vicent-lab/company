import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/index.js';
import { requireAuth, requirePermission, resolveFarmId, audit } from '../middleware/auth.js';
import { HttpError, asyncHandler } from '../lib/errors.js';

const router = Router();
router.use(requireAuth);

router.get('/', asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const { rows } = await query(
    `SELECT ga.*, c.cow_code, c.name as cow_name
     FROM genetic_analysis ga
     JOIN cows c ON c.id = ga.cow_id
     WHERE ga.farm_id=$1 ORDER BY ga.analyzed_on DESC`,
    [farmId]
  );
  res.json({ data: rows, count: rows.length });
}));

const schema = z.object({
  cowId: z.string().min(1),
  sireId: z.string().min(1),
  compatibilityScore: z.number().min(0).max(1).default(0.5),
  inbreedingCoefficient: z.number().min(0).max(1).optional(),
  traitsAnalysis: z.record(z.any()).default({}),
  recommendation: z.string().optional(),
});

router.post('/', requirePermission('cow:manage'), asyncHandler(async (req, res) => {
  const b = schema.parse(req.body);
  const farmId = resolveFarmId(req);
  const cow = await query('SELECT id, farm_id FROM cows WHERE id=$1', [b.cowId]);
  if (!cow.rows[0]) throw new HttpError(404, 'Cow not found');
  if (cow.rows[0].farm_id !== farmId) throw new HttpError(403, 'Access denied');
  const { rows } = await query(
    `INSERT INTO genetic_analysis (farm_id, cow_id, sire_id, compatibility_score, inbreeding_coefficient, traits_analysis, recommendation)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [farmId, b.cowId, b.sireId, b.compatibilityScore, b.inbreedingCoefficient ?? null, JSON.stringify(b.traitsAnalysis), b.recommendation || null]
  );
  await audit(req.user, 'create', 'genetic_analysis', rows[0].id);
  res.status(201).json(rows[0]);
}));

export default router;
