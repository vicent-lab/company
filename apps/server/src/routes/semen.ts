import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/index.js';
import { requireAuth, requirePermission, resolveFarmId, audit } from '../middleware/auth.js';
import { HttpError, asyncHandler } from '../lib/errors.js';

const router = Router();
router.use(requireAuth);

router.get('/', asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const { rows } = await query('SELECT * FROM semen_inventory WHERE farm_id=$1 ORDER BY expiry_date ASC', [farmId]);
  res.json({ data: rows, count: rows.length });
}));

const schema = z.object({
  sireName: z.string().min(1),
  breed: z.string().min(1),
  batchNumber: z.string().min(1),
  quantityDoses: z.number().min(0).default(0),
  storageLocation: z.string().optional(),
  expiryDate: z.string().optional(),
  costPerDose: z.number().min(0).optional(),
  notes: z.string().optional(),
});

router.post('/', requirePermission('cow:manage'), asyncHandler(async (req, res) => {
  const b = schema.parse(req.body);
  const farmId = resolveFarmId(req);
  const { rows } = await query(
    `INSERT INTO semen_inventory (farm_id, sire_name, breed, batch_number, quantity_doses, storage_location, expiry_date, cost_per_dose, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [farmId, b.sireName, b.breed, b.batchNumber, b.quantityDoses, b.storageLocation || null, b.expiryDate || null, b.costPerDose ?? null, b.notes || null]
  );
  await audit(req.user, 'create', 'semen_inventory', rows[0].id);
  res.status(201).json(rows[0]);
}));

router.patch('/:id', requirePermission('cow:manage'), asyncHandler(async (req, res) => {
  const b = schema.partial().parse(req.body);
  const existing = await query('SELECT farm_id FROM semen_inventory WHERE id=$1', [req.params.id]);
  if (!existing.rows[0]) throw new HttpError(404, 'Semen inventory not found');
  if (existing.rows[0].farm_id !== resolveFarmId(req)) throw new HttpError(403, 'Access denied');
  const sets: string[] = [];
  const params: any[] = [];
  let i = 1;
  const map: Record<string, string> = { sireName: 'sire_name', breed: 'breed', batchNumber: 'batch_number', quantityDoses: 'quantity_doses', storageLocation: 'storage_location', expiryDate: 'expiry_date', costPerDose: 'cost_per_dose', notes: 'notes' };
  for (const [k, col] of Object.entries(map)) {
    if ((b as any)[k] !== undefined) { sets.push(`${col}=$${i}`); params.push((b as any)[k]); i++; }
  }
  params.push(req.params.id);
  const { rows } = await query(`UPDATE semen_inventory SET ${sets.join(', ')} WHERE id=$${i} RETURNING *`, params);
  await audit(req.user, 'update', 'semen_inventory', req.params.id, b);
  res.json(rows[0]);
}));

router.delete('/:id', requirePermission('cow:manage'), asyncHandler(async (req, res) => {
  const existing = await query('SELECT farm_id FROM semen_inventory WHERE id=$1', [req.params.id]);
  if (!existing.rows[0]) throw new HttpError(404, 'Semen inventory not found');
  if (existing.rows[0].farm_id !== resolveFarmId(req)) throw new HttpError(403, 'Access denied');
  await query('DELETE FROM semen_inventory WHERE id=$1', [req.params.id]);
  await audit(req.user, 'delete', 'semen_inventory', req.params.id);
  res.status(204).end();
}));

export default router;
