import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/index.js';
import { requireAuth, requirePermission, resolveFarmId, audit } from '../middleware/auth.js';
import { HttpError, asyncHandler } from '../lib/errors.js';

const router = Router();
router.use(requireAuth);

router.get('/', asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const limit = Math.min(Number(req.query.limit) || 200, 500);
  const { rows } = await query(
    `SELECT t.id, t.cow_id, c.cow_code, c.name AS cow_name, d.name AS disease_name,
            t.diagnosis, t.treatment_plan, t.veterinarian_name, t.status, t.diagnosed_on
     FROM treatments t
     JOIN cows c ON c.id=t.cow_id
     LEFT JOIN diseases d ON d.id=t.disease_id
     WHERE c.farm_id=$1
     ORDER BY t.diagnosed_on DESC LIMIT $2`, [farmId, limit]
  );
  res.json({ data: rows, count: rows.length });
}));

const schema = z.object({
  cowId: z.string().min(1),
  diseaseId: z.string().optional(),
  diseaseName: z.string().optional(),
  diagnosis: z.string().optional(),
  treatmentPlan: z.string().optional(),
  veterinarianName: z.string().optional(),
  status: z.string().optional(),
});

// The "Disease / Condition" field on the Add Treatment form is free text, not a
// picker over the diseases table, so look up a matching row by name (case-insensitive)
// or create one — that's how a free-text field maps onto the normalized FK column.
async function resolveDiseaseId(diseaseId: string | undefined, diseaseName: string | undefined) {
  if (diseaseId) return diseaseId;
  const name = diseaseName?.trim();
  if (!name) return null;
  const existing = await query('SELECT id FROM diseases WHERE lower(name) = lower($1)', [name]);
  if (existing.rows[0]) return existing.rows[0].id;
  const created = await query('INSERT INTO diseases (name) VALUES ($1) RETURNING id', [name]);
  return created.rows[0].id;
}

router.post('/', requirePermission('health:manage'), asyncHandler(async (req, res) => {
  const b = schema.parse(req.body);
  const farmId = resolveFarmId(req);
  const cow = await query('SELECT id, farm_id FROM cows WHERE id=$1', [b.cowId]);
  if (!cow.rows[0]) throw new HttpError(404, 'Cow not found');
  if (cow.rows[0].farm_id !== farmId) throw new HttpError(403, 'Access denied');
  const diseaseId = await resolveDiseaseId(b.diseaseId, b.diseaseName);
  const { rows } = await query(
    `INSERT INTO treatments (cow_id, disease_id, diagnosis, treatment_plan, veterinarian_name, status, diagnosed_on)
     VALUES ($1,$2,$3,$4,$5,$6,current_date)
     RETURNING *`,
    [b.cowId, diseaseId, b.diagnosis ?? null, b.treatmentPlan ?? null, b.veterinarianName ?? null, b.status ?? 'Active']
  );
  await audit(req.user!, 'create', 'treatment', rows[0].id);
  res.status(201).json(rows[0]);
}));

router.patch('/:id', requirePermission('health:manage'), asyncHandler(async (req, res) => {
  const b = schema.partial().parse(req.body);
  const existing = await query('SELECT t.id, c.farm_id FROM treatments t JOIN cows c ON c.id=t.cow_id WHERE t.id=$1', [req.params.id]);
  if (!existing.rows[0]) throw new HttpError(404, 'Treatment not found');
  if (existing.rows[0].farm_id !== resolveFarmId(req)) throw new HttpError(403, 'Access denied');
  if (b.diseaseName !== undefined) b.diseaseId = (await resolveDiseaseId(b.diseaseId, b.diseaseName)) ?? undefined;
  const sets: string[] = [];
  const params: any[] = [];
  let i = 1;
  const map: Record<string, string> = {
    cowId: 'cow_id', diseaseId: 'disease_id', diagnosis: 'diagnosis',
    treatmentPlan: 'treatment_plan', veterinarianName: 'veterinarian_name', status: 'status',
  };
  for (const [k, col] of Object.entries(map)) {
    if ((b as any)[k] !== undefined) { sets.push(`${col} = $${i}`); params.push((b as any)[k]); i++; }
  }
  params.push(req.params.id);
  const { rows } = await query(`UPDATE treatments SET ${sets.join(', ')} WHERE id=$${i} RETURNING *`, params);
  await audit(req.user!, 'update', 'treatment', req.params.id, b);
  res.json(rows[0]);
}));

router.delete('/:id', requirePermission('health:manage'), asyncHandler(async (req, res) => {
  const existing = await query('SELECT t.id, c.farm_id FROM treatments t JOIN cows c ON c.id=t.cow_id WHERE t.id=$1', [req.params.id]);
  if (!existing.rows[0]) throw new HttpError(404, 'Treatment not found');
  if (existing.rows[0].farm_id !== resolveFarmId(req)) throw new HttpError(403, 'Access denied');
  await query('DELETE FROM treatments WHERE id=$1', [req.params.id]);
  await audit(req.user!, 'delete', 'treatment', req.params.id);
  res.status(204).end();
}));

export default router;
