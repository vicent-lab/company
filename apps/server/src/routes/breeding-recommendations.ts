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
    `SELECT br.*, c.cow_code, c.name as cow_name
     FROM breeding_recommendations br
     JOIN cows c ON c.id = br.cow_id
     WHERE br.farm_id=$1 ORDER BY br.recommended_date DESC`,
    [farmId]
  );
  res.json({ data: rows, count: rows.length });
}));

const schema = z.object({
  cowId: z.string().min(1),
  recommendedDate: z.string(),
  recommendedSire: z.string().optional(),
  reason: z.string().min(1),
  confidence: z.number().min(0).max(1).default(0.5),
  status: z.string().default('pending'),
});

router.post('/', requirePermission('cow:manage'), asyncHandler(async (req, res) => {
  const b = schema.parse(req.body);
  const farmId = resolveFarmId(req);
  const cow = await query('SELECT id, farm_id FROM cows WHERE id=$1', [b.cowId]);
  if (!cow.rows[0]) throw new HttpError(404, 'Cow not found');
  if (cow.rows[0].farm_id !== farmId) throw new HttpError(403, 'Access denied');
  const { rows } = await query(
    `INSERT INTO breeding_recommendations (farm_id, cow_id, recommended_date, recommended_sire, reason, confidence, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [farmId, b.cowId, b.recommendedDate, b.recommendedSire || null, b.reason, b.confidence, b.status]
  );
  await audit(req.user, 'create', 'breeding_recommendation', rows[0].id);
  res.status(201).json(rows[0]);
}));

router.patch('/:id', requirePermission('cow:manage'), asyncHandler(async (req, res) => {
  const b = schema.partial().parse(req.body);
  const existing = await query('SELECT farm_id FROM breeding_recommendations WHERE id=$1', [req.params.id]);
  if (!existing.rows[0]) throw new HttpError(404, 'Recommendation not found');
  if (existing.rows[0].farm_id !== resolveFarmId(req)) throw new HttpError(403, 'Access denied');
  const sets: string[] = [];
  const params: any[] = [];
  let i = 1;
  const map: Record<string, string> = { cowId: 'cow_id', recommendedDate: 'recommended_date', recommendedSire: 'recommended_sire', reason: 'reason', confidence: 'confidence', status: 'status' };
  for (const [k, col] of Object.entries(map)) {
    if ((b as any)[k] !== undefined) { sets.push(`${col}=$${i}`); params.push((b as any)[k]); i++; }
  }
  if (b.status === 'acted' && !req.body.actedOn) {
    sets.push(`acted_on=true`);
  }
  params.push(req.params.id);
  const { rows } = await query(`UPDATE breeding_recommendations SET ${sets.join(', ')} WHERE id=$${i} RETURNING *`, params);
  await audit(req.user, 'update', 'breeding_recommendation', req.params.id, b);
  res.json(rows[0]);
}));

export default router;
