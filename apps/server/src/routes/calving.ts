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
    `SELECT cr.*, c.cow_code, c.name as cow_name, cal.id as calf_id, cal.birth_weight_kg
     FROM calving_records cr
     JOIN cows c ON c.id = cr.cow_id
     LEFT JOIN calves cal ON cal.id = cr.calf_id
     WHERE cr.farm_id=$1 ORDER BY cr.calving_date DESC`,
    [farmId]
  );
  res.json({ data: rows, count: rows.length });
}));

const schema = z.object({
  cowId: z.string().min(1),
  calvingDate: z.string(),
  pregnancyId: z.string().uuid().optional(),
  difficultyScore: z.number().min(1).max(5).optional(),
  assistanceRequired: z.boolean().default(false),
  assistanceType: z.string().optional(),
  veterinarianName: z.string().optional(),
  calfId: z.string().optional(),
  calfName: z.string().optional(),
  calfSex: z.enum(['male', 'female']).optional(),
  calfBreed: z.string().optional(),
  birthWeightKg: z.number().optional(),
  notes: z.string().optional(),
});

router.post('/', requirePermission('cow:manage'), asyncHandler(async (req, res) => {
  const b = schema.parse(req.body);
  const farmId = resolveFarmId(req);
  const cow = await query('SELECT id, farm_id FROM cows WHERE id=$1', [b.cowId]);
  if (!cow.rows[0]) throw new HttpError(404, 'Cow not found');
  if (cow.rows[0].farm_id !== farmId) throw new HttpError(403, 'Access denied');

  let calfId = b.calfId || null;

  if (!calfId && b.calfName && b.calfSex) {
    const sireId = await query(
      `SELECT sire_id FROM breeding_records WHERE id = (SELECT breeding_id FROM pregnancies WHERE id=$1)`,
      [b.pregnancyId]
    );
    const sire = sireId.rows[0]?.sire_id || null;

    const calfRes = await query(
      `INSERT INTO cows (farm_id, cow_code, name, breed, gender, date_of_birth, status, health, mother_id, father_id, weight_kg)
       VALUES ($1,$2,$3,$4,$5,$6,'active','healthy',$7,$8,$9) RETURNING id`,
      [
        farmId,
        `${farmId.toUpperCase().slice(0,2)}-${String(Date.now()).slice(-3)}`,
        b.calfName.trim(),
        b.calfBreed || 'Holstein',
        b.calfSex,
        b.calvingDate,
        b.cowId,
        sire,
        b.birthWeightKg || null,
      ]
    );
    calfId = calfRes.rows[0].id;

    await query(
      `INSERT INTO offspring (animal_id, mother_id, father_id) VALUES ($1,$2,$3)`,
      [calfId, b.cowId, sire]
    );
  }

  const { rows } = await query(
    `INSERT INTO calving_records (farm_id, cow_id, pregnancy_id, calving_date, difficulty_score, assistance_required, assistance_type, veterinarian_name, calf_id, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
     [farmId, b.cowId, b.pregnancyId || null, b.calvingDate, b.difficultyScore ?? null, b.assistanceRequired, b.assistanceType || null, b.veterinarianName || null, calfId, b.notes || null]
  );
  await audit(req.user, 'create', 'calving_record', rows[0].id, { cowId: b.cowId, calfId });
  res.status(201).json(rows[0]);
}));

router.patch('/:id', requirePermission('cow:manage'), asyncHandler(async (req, res) => {
  const b = schema.partial().parse(req.body);
  const existing = await query('SELECT farm_id FROM calving_records WHERE id=$1', [req.params.id]);
  if (!existing.rows[0]) throw new HttpError(404, 'Calving record not found');
  if (existing.rows[0].farm_id !== resolveFarmId(req)) throw new HttpError(403, 'Access denied');
  const sets: string[] = [];
  const params: any[] = [];
  let i = 1;
  const map: Record<string, string> = { cowId: 'cow_id', calvingDate: 'calving_date', pregnancyId: 'pregnancy_id', difficultyScore: 'difficulty_score', assistanceRequired: 'assistance_required', assistanceType: 'assistance_type', veterinarianName: 'veterinarian_name', calfId: 'calf_id', notes: 'notes' };
  for (const [k, col] of Object.entries(map)) {
    if ((b as any)[k] !== undefined) { sets.push(`${col}=$${i}`); params.push((b as any)[k]); i++; }
  }
  params.push(req.params.id);
  const { rows } = await query(`UPDATE calving_records SET ${sets.join(', ')} WHERE id=$${i} RETURNING *`, params);
  await audit(req.user, 'update', 'calving_record', req.params.id, b);
  res.json(rows[0]);
}));

router.delete('/:id', requirePermission('cow:manage'), asyncHandler(async (req, res) => {
  const existing = await query('SELECT farm_id FROM calving_records WHERE id=$1', [req.params.id]);
  if (!existing.rows[0]) throw new HttpError(404, 'Calving record not found');
  if (existing.rows[0].farm_id !== resolveFarmId(req)) throw new HttpError(403, 'Access denied');
  await query('DELETE FROM calving_records WHERE id=$1', [req.params.id]);
  await audit(req.user, 'delete', 'calving_record', req.params.id);
  res.status(204).end();
}));

export default router;
