import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/index.js';
import { requireAuth, requirePermission, resolveFarmId, audit, isSuperAdmin } from '../middleware/auth.js';
import { HttpError, asyncHandler } from '../lib/errors.js';

const router = Router();
router.use(requireAuth);

// Health records
const healthSchema = z.object({
  cowId: z.string().uuid(),
  recordedOn: z.string().optional(),
  healthStatus: z.enum(['healthy', 'sick', 'under_treatment', 'critical']).default('healthy'),
  bodyConditionScore: z.number().int().min(1).max(9).optional(),
  lamenessScore: z.number().int().min(0).max(5).optional(),
  aiDetectedDisease: z.string().optional(),
  aiConfidence: z.number().min(0).max(1).optional(),
  photoUrl: z.string().optional(),
  notes: z.string().optional(),
  veterinarianName: z.string().optional(),
});

router.get('/records', asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const cowId = (req.query.cowId as string | undefined) || undefined;
  const { rows } = await query(
    `SELECT hr.*, c.cow_code, c.name AS cow_name
     FROM health_records hr
     JOIN cows c ON c.id = hr.cow_id
     WHERE hr.farm_id = $1 ${cowId ? 'AND hr.cow_id = $2' : ''}
     ORDER BY hr.recorded_on DESC LIMIT 100`,
    cowId ? [farmId, cowId] : [farmId]
  );
  res.json({ data: rows, count: rows.length });
}));

router.post('/records', requirePermission('health:manage'), asyncHandler(async (req, res) => {
  const b = healthSchema.parse(req.body);
  const farmId = resolveFarmId(req);
  const { rows } = await query(
    `INSERT INTO health_records (farm_id, cow_id, recorded_on, health_status, body_condition_score, lameness_score, ai_detected_disease, ai_confidence, photo_url, notes, veterinarian_name)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING *`,
    [farmId, b.cowId, b.recordedOn || new Date().toISOString().slice(0, 10), b.healthStatus, b.bodyConditionScore ?? null, b.lamenessScore ?? null, b.aiDetectedDisease ?? null, b.aiConfidence ?? null, b.photoUrl ?? null, b.notes ?? null, b.veterinarianName ?? null]
  );
  await audit(req.user, 'create', 'health_record', rows[0].id);
  res.status(201).json(rows[0]);
}));

router.patch('/records/:id', requirePermission('health:manage'), asyncHandler(async (req, res) => {
  const b = healthSchema.partial().parse(req.body);
  const existing = await query('SELECT farm_id FROM health_records WHERE id=$1', [req.params.id]);
  if (!existing.rows[0]) throw new HttpError(404, 'Health record not found');
  if (!isSuperAdmin(req) && existing.rows[0].farm_id !== resolveFarmId(req)) throw new HttpError(403, 'Access denied');
  const sets: string[] = [];
  const params: any[] = [];
  let i = 1;
  const map: Record<string, string> = {
    cowId: 'cow_id', recordedOn: 'recorded_on', healthStatus: 'health_status',
    bodyConditionScore: 'body_condition_score', lamenessScore: 'lameness_score',
    aiDetectedDisease: 'ai_detected_disease', aiConfidence: 'ai_confidence',
    photoUrl: 'photo_url', notes: 'notes', veterinarianName: 'veterinarian_name',
  };
  for (const [k, col] of Object.entries(map)) {
    if ((b as any)[k] !== undefined) { sets.push(`${col} = $${i}`); params.push((b as any)[k]); i++; }
  }
  params.push(req.params.id);
  const { rows } = await query(`UPDATE health_records SET ${sets.join(', ')} WHERE id=$${i} RETURNING *`, params);
  await audit(req.user, 'update', 'health_record', req.params.id);
  res.json(rows[0]);
}));

router.delete('/records/:id', requirePermission('health:manage'), asyncHandler(async (req, res) => {
  const existing = await query('SELECT farm_id FROM health_records WHERE id=$1', [req.params.id]);
  if (!existing.rows[0]) throw new HttpError(404, 'Health record not found');
  if (!isSuperAdmin(req) && existing.rows[0].farm_id !== resolveFarmId(req)) throw new HttpError(403, 'Access denied');
  await query('DELETE FROM health_records WHERE id=$1', [req.params.id]);
  await audit(req.user, 'delete', 'health_record', req.params.id);
  res.status(204).end();
}));

// Medicine inventory
const medicineSchema = z.object({
  name: z.string().min(1),
  category: z.string().min(1),
  quantityOnHand: z.number().min(0),
  unit: z.string().default('doses'),
  reorderLevel: z.number().min(0),
  expiryDate: z.string().optional(),
  batchNumber: z.string().optional(),
  supplier: z.string().optional(),
  costPerUnit: z.number().optional(),
  storageRequirements: z.string().optional(),
  notes: z.string().optional(),
});

router.get('/medicines', asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const { rows } = await query(
    `SELECT *, CASE WHEN quantity_on_hand <= reorder_level THEN true ELSE false END AS needs_reorder
     FROM medicine_inventory WHERE farm_id = $1 ORDER BY name`,
    [farmId]
  );
  res.json({ data: rows, count: rows.length });
}));

router.post('/medicines', requirePermission('health:manage'), asyncHandler(async (req, res) => {
  const b = medicineSchema.parse(req.body);
  const farmId = resolveFarmId(req);
  const { rows } = await query(
    `INSERT INTO medicine_inventory (farm_id, name, category, quantity_on_hand, unit, reorder_level, expiry_date, batch_number, supplier, cost_per_unit, storage_requirements, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING *`,
    [farmId, b.name, b.category, b.quantityOnHand, b.unit, b.reorderLevel, b.expiryDate ?? null, b.batchNumber ?? null, b.supplier ?? null, b.costPerUnit ?? null, b.storageRequirements ?? null, b.notes ?? null]
  );
  await audit(req.user, 'create', 'medicine_inventory', rows[0].id);
  res.status(201).json(rows[0]);
}));

router.patch('/medicines/:id', requirePermission('health:manage'), asyncHandler(async (req, res) => {
  const b = medicineSchema.partial().parse(req.body);
  const existing = await query('SELECT farm_id FROM medicine_inventory WHERE id=$1', [req.params.id]);
  if (!existing.rows[0]) throw new HttpError(404, 'Medicine not found');
  if (!isSuperAdmin(req) && existing.rows[0].farm_id !== resolveFarmId(req)) throw new HttpError(403, 'Access denied');
  const sets: string[] = [];
  const params: any[] = [];
  let i = 1;
  const map: Record<string, string> = {
    name: 'name', category: 'category', quantityOnHand: 'quantity_on_hand', unit: 'unit',
    reorderLevel: 'reorder_level', expiryDate: 'expiry_date', batchNumber: 'batch_number',
    supplier: 'supplier', costPerUnit: 'cost_per_unit', storageRequirements: 'storage_requirements', notes: 'notes',
  };
  for (const [k, col] of Object.entries(map)) {
    if ((b as any)[k] !== undefined) { sets.push(`${col} = $${i}`); params.push((b as any)[k]); i++; }
  }
  params.push(req.params.id);
  const { rows } = await query(`UPDATE medicine_inventory SET ${sets.join(', ')} WHERE id=$${i} RETURNING *`, params);
  await audit(req.user, 'update', 'medicine_inventory', req.params.id);
  res.json(rows[0]);
}));

router.delete('/medicines/:id', requirePermission('health:manage'), asyncHandler(async (req, res) => {
  const existing = await query('SELECT farm_id FROM medicine_inventory WHERE id=$1', [req.params.id]);
  if (!existing.rows[0]) throw new HttpError(404, 'Medicine not found');
  if (!isSuperAdmin(req) && existing.rows[0].farm_id !== resolveFarmId(req)) throw new HttpError(403, 'Access denied');
  await query('DELETE FROM medicine_inventory WHERE id=$1', [req.params.id]);
  await audit(req.user, 'delete', 'medicine_inventory', req.params.id);
  res.status(204).end();
}));

// Laboratory tests
const labTestSchema = z.object({
  cowId: z.string().uuid(),
  testType: z.string().min(1),
  sampleType: z.string().min(1),
  collectedOn: z.string().optional(),
  results: z.any().optional(),
  status: z.enum(['pending', 'completed', 'cancelled']).default('pending'),
  veterinarianName: z.string().optional(),
  labName: z.string().optional(),
  notes: z.string().optional(),
});

router.get('/lab-tests', asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const cowId = (req.query.cowId as string | undefined) || undefined;
  const { rows } = await query(
    `SELECT lt.*, c.cow_code, c.name AS cow_name
     FROM lab_tests lt
     JOIN cows c ON c.id = lt.cow_id
     WHERE lt.farm_id = $1 ${cowId ? 'AND lt.cow_id = $2' : ''}
     ORDER BY lt.collected_on DESC LIMIT 100`,
    cowId ? [farmId, cowId] : [farmId]
  );
  res.json({ data: rows, count: rows.length });
}));

router.post('/lab-tests', requirePermission('health:manage'), asyncHandler(async (req, res) => {
  const b = labTestSchema.parse(req.body);
  const farmId = resolveFarmId(req);
  const { rows } = await query(
    `INSERT INTO lab_tests (farm_id, cow_id, test_type, sample_type, collected_on, results, status, veterinarian_name, lab_name, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING *`,
    [farmId, b.cowId, b.testType, b.sampleType, b.collectedOn || new Date().toISOString().slice(0, 10), JSON.stringify(b.results || {}), b.status, b.veterinarianName ?? null, b.labName ?? null, b.notes ?? null]
  );
  await audit(req.user, 'create', 'lab_test', rows[0].id);
  res.status(201).json(rows[0]);
}));

router.patch('/lab-tests/:id', requirePermission('health:manage'), asyncHandler(async (req, res) => {
  const b = labTestSchema.partial().parse(req.body);
  const existing = await query('SELECT farm_id FROM lab_tests WHERE id=$1', [req.params.id]);
  if (!existing.rows[0]) throw new HttpError(404, 'Lab test not found');
  if (!isSuperAdmin(req) && existing.rows[0].farm_id !== resolveFarmId(req)) throw new HttpError(403, 'Access denied');
  const sets: string[] = [];
  const params: any[] = [];
  let i = 1;
  const map: Record<string, string> = {
    cowId: 'cow_id', testType: 'test_type', sampleType: 'sample_type', collectedOn: 'collected_on',
    results: 'results', status: 'status', veterinarianName: 'veterinarian_name', labName: 'lab_name', notes: 'notes',
  };
  for (const [k, col] of Object.entries(map)) {
    if ((b as any)[k] !== undefined) {
      let val = (b as any)[k];
      if (k === 'results') val = JSON.stringify(val || {});
      sets.push(`${col} = $${i}`);
      params.push(val);
      i++;
    }
  }
  params.push(req.params.id);
  const { rows } = await query(`UPDATE lab_tests SET ${sets.join(', ')} WHERE id=$${i} RETURNING *`, params);
  await audit(req.user, 'update', 'lab_test', req.params.id);
  res.json(rows[0]);
}));

router.delete('/lab-tests/:id', requirePermission('health:manage'), asyncHandler(async (req, res) => {
  const existing = await query('SELECT farm_id FROM lab_tests WHERE id=$1', [req.params.id]);
  if (!existing.rows[0]) throw new HttpError(404, 'Lab test not found');
  if (!isSuperAdmin(req) && existing.rows[0].farm_id !== resolveFarmId(req)) throw new HttpError(403, 'Access denied');
  await query('DELETE FROM lab_tests WHERE id=$1', [req.params.id]);
  await audit(req.user, 'delete', 'lab_test', req.params.id);
  res.status(204).end();
}));

// Parasite control schedules
const parasiteSchema = z.object({
  cowId: z.string().uuid().optional(),
  treatmentType: z.string().min(1),
  productName: z.string().min(1),
  scheduledOn: z.string(),
  administeredOn: z.string().optional(),
  status: z.enum(['scheduled', 'completed', 'missed']).default('scheduled'),
  dosage: z.string().optional(),
  veterinarianName: z.string().optional(),
  notes: z.string().optional(),
});

router.get('/parasite-control', asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const cowId = (req.query.cowId as string | undefined) || undefined;
  const { rows } = await query(
    `SELECT pc.*, c.cow_code, c.name AS cow_name
     FROM parasite_control_schedules pc
     LEFT JOIN cows c ON c.id = pc.cow_id
     WHERE pc.farm_id = $1 ${cowId ? 'AND pc.cow_id = $2' : ''}
     ORDER BY pc.scheduled_on DESC LIMIT 100`,
    cowId ? [farmId, cowId] : [farmId]
  );
  res.json({ data: rows, count: rows.length });
}));

router.post('/parasite-control', requirePermission('health:manage'), asyncHandler(async (req, res) => {
  const b = parasiteSchema.parse(req.body);
  const farmId = resolveFarmId(req);
  const { rows } = await query(
    `INSERT INTO parasite_control_schedules (farm_id, cow_id, treatment_type, product_name, scheduled_on, administered_on, status, dosage, veterinarian_name, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING *`,
    [farmId, b.cowId ?? null, b.treatmentType, b.productName, b.scheduledOn, b.administeredOn ?? null, b.status, b.dosage ?? null, b.veterinarianName ?? null, b.notes ?? null]
  );
  await audit(req.user, 'create', 'parasite_control', rows[0].id);
  res.status(201).json(rows[0]);
}));

router.patch('/parasite-control/:id', requirePermission('health:manage'), asyncHandler(async (req, res) => {
  const b = parasiteSchema.partial().parse(req.body);
  const existing = await query('SELECT farm_id FROM parasite_control_schedules WHERE id=$1', [req.params.id]);
  if (!existing.rows[0]) throw new HttpError(404, 'Parasite control record not found');
  if (!isSuperAdmin(req) && existing.rows[0].farm_id !== resolveFarmId(req)) throw new HttpError(403, 'Access denied');
  const sets: string[] = [];
  const params: any[] = [];
  let i = 1;
  const map: Record<string, string> = {
    cowId: 'cow_id', treatmentType: 'treatment_type', productName: 'product_name',
    scheduledOn: 'scheduled_on', administeredOn: 'administered_on', status: 'status',
    dosage: 'dosage', veterinarianName: 'veterinarian_name', notes: 'notes',
  };
  for (const [k, col] of Object.entries(map)) {
    if ((b as any)[k] !== undefined) { sets.push(`${col} = $${i}`); params.push((b as any)[k]); i++; }
  }
  params.push(req.params.id);
  const { rows } = await query(`UPDATE parasite_control_schedules SET ${sets.join(', ')} WHERE id=$${i} RETURNING *`, params);
  await audit(req.user, 'update', 'parasite_control', req.params.id);
  res.json(rows[0]);
}));

router.delete('/parasite-control/:id', requirePermission('health:manage'), asyncHandler(async (req, res) => {
  const existing = await query('SELECT farm_id FROM parasite_control_schedules WHERE id=$1', [req.params.id]);
  if (!existing.rows[0]) throw new HttpError(404, 'Parasite control record not found');
  if (!isSuperAdmin(req) && existing.rows[0].farm_id !== resolveFarmId(req)) throw new HttpError(403, 'Access denied');
  await query('DELETE FROM parasite_control_schedules WHERE id=$1', [req.params.id]);
  await audit(req.user, 'delete', 'parasite_control', req.params.id);
  res.status(204).end();
}));

// Quarantine records
const quarantineSchema = z.object({
  cowId: z.string().uuid(),
  reason: z.string().min(1),
  startDate: z.string(),
  endDate: z.string().optional(),
  location: z.string().min(1),
  status: z.enum(['active', 'completed', 'extended']).default('active'),
  testResults: z.any().optional(),
  veterinarianName: z.string().optional(),
  notes: z.string().optional(),
});

router.get('/quarantine', asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const { rows } = await query(
    `SELECT q.*, c.cow_code, c.name AS cow_name
     FROM quarantine_records q
     JOIN cows c ON c.id = q.cow_id
     WHERE q.farm_id = $1 ORDER BY q.start_date DESC LIMIT 100`,
    [farmId]
  );
  res.json({ data: rows, count: rows.length });
}));

router.post('/quarantine', requirePermission('health:manage'), asyncHandler(async (req, res) => {
  const b = quarantineSchema.parse(req.body);
  const farmId = resolveFarmId(req);
  const { rows } = await query(
    `INSERT INTO quarantine_records (farm_id, cow_id, reason, start_date, end_date, location, status, test_results, veterinarian_name, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING *`,
    [farmId, b.cowId, b.reason, b.startDate, b.endDate ?? null, b.location, b.status, JSON.stringify(b.testResults || {}), b.veterinarianName ?? null, b.notes ?? null]
  );
  await audit(req.user, 'create', 'quarantine_record', rows[0].id);
  res.status(201).json(rows[0]);
}));

router.patch('/quarantine/:id', requirePermission('health:manage'), asyncHandler(async (req, res) => {
  const b = quarantineSchema.partial().parse(req.body);
  const existing = await query('SELECT farm_id FROM quarantine_records WHERE id=$1', [req.params.id]);
  if (!existing.rows[0]) throw new HttpError(404, 'Quarantine record not found');
  if (!isSuperAdmin(req) && existing.rows[0].farm_id !== resolveFarmId(req)) throw new HttpError(403, 'Access denied');
  const sets: string[] = [];
  const params: any[] = [];
  let i = 1;
  const map: Record<string, string> = {
    cowId: 'cow_id', reason: 'reason', startDate: 'start_date', endDate: 'end_date',
    location: 'location', status: 'status', testResults: 'test_results',
    veterinarianName: 'veterinarian_name', notes: 'notes',
  };
  for (const [k, col] of Object.entries(map)) {
    if ((b as any)[k] !== undefined) {
      let val = (b as any)[k];
      if (k === 'testResults') val = JSON.stringify(val || {});
      sets.push(`${col} = $${i}`);
      params.push(val);
      i++;
    }
  }
  params.push(req.params.id);
  const { rows } = await query(`UPDATE quarantine_records SET ${sets.join(', ')} WHERE id=$${i} RETURNING *`, params);
  await audit(req.user, 'update', 'quarantine_record', req.params.id);
  res.json(rows[0]);
}));

router.delete('/quarantine/:id', requirePermission('health:manage'), asyncHandler(async (req, res) => {
  const existing = await query('SELECT farm_id FROM quarantine_records WHERE id=$1', [req.params.id]);
  if (!existing.rows[0]) throw new HttpError(404, 'Quarantine record not found');
  if (!isSuperAdmin(req) && existing.rows[0].farm_id !== resolveFarmId(req)) throw new HttpError(403, 'Access denied');
  await query('DELETE FROM quarantine_records WHERE id=$1', [req.params.id]);
  await audit(req.user, 'delete', 'quarantine_record', req.params.id);
  res.status(204).end();
}));

// Emergency health alerts
const alertSchema = z.object({
  cowId: z.string().uuid().optional(),
  alertType: z.string().min(1),
  severity: z.enum(['low', 'medium', 'high', 'critical']).default('high'),
  message: z.string().min(1),
  acknowledged: z.boolean().optional(),
  resolved: z.boolean().optional(),
});

router.get('/alerts', asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const { rows } = await query(
    `SELECT eha.*, c.cow_code, c.name AS cow_name
     FROM emergency_health_alerts eha
     LEFT JOIN cows c ON c.id = eha.cow_id
     WHERE eha.farm_id = $1
     ORDER BY eha.created_at DESC LIMIT 100`,
    [farmId]
  );
  res.json({ data: rows, count: rows.length });
}));

router.post('/alerts', requirePermission('health:manage'), asyncHandler(async (req, res) => {
  const b = alertSchema.parse(req.body);
  const farmId = resolveFarmId(req);
  const { rows } = await query(
    `INSERT INTO emergency_health_alerts (farm_id, cow_id, alert_type, severity, message)
     VALUES ($1,$2,$3,$4,$5)
     RETURNING *`,
    [farmId, b.cowId ?? null, b.alertType, b.severity, b.message]
  );
  await audit(req.user, 'create', 'emergency_health_alert', rows[0].id);
  res.status(201).json(rows[0]);
}));

router.patch('/alerts/:id', requirePermission('health:manage'), asyncHandler(async (req, res) => {
  const b = alertSchema.partial().parse(req.body);
  const existing = await query('SELECT farm_id FROM emergency_health_alerts WHERE id=$1', [req.params.id]);
  if (!existing.rows[0]) throw new HttpError(404, 'Alert not found');
  if (!isSuperAdmin(req) && existing.rows[0].farm_id !== resolveFarmId(req)) throw new HttpError(403, 'Access denied');
  const sets: string[] = [];
  const params: any[] = [];
  let i = 1;
  const map: Record<string, string> = { cowId: 'cow_id', alertType: 'alert_type', severity: 'severity', message: 'message', acknowledged: 'acknowledged', resolved: 'resolved' };
  for (const [k, col] of Object.entries(map)) {
    if ((b as any)[k] !== undefined) {
      let val = (b as any)[k];
      if (k === 'acknowledged' && val) { sets.push('acknowledged = true', 'acknowledged_by = $' + i, 'acknowledged_at = now()'); params.push(req.user!.id); i++; continue; }
      if (k === 'resolved' && val) { sets.push('resolved = true', 'resolved_at = now()'); continue; }
      sets.push(`${col} = $${i}`);
      params.push(val);
      i++;
    }
  }
  params.push(req.params.id);
  const { rows } = await query(`UPDATE emergency_health_alerts SET ${sets.join(', ')} WHERE id=$${i} RETURNING *`, params);
  await audit(req.user, 'update', 'emergency_health_alert', req.params.id);
  res.json(rows[0]);
}));

router.delete('/alerts/:id', requirePermission('health:manage'), asyncHandler(async (req, res) => {
  const existing = await query('SELECT farm_id FROM emergency_health_alerts WHERE id=$1', [req.params.id]);
  if (!existing.rows[0]) throw new HttpError(404, 'Alert not found');
  if (!isSuperAdmin(req) && existing.rows[0].farm_id !== resolveFarmId(req)) throw new HttpError(403, 'Access denied');
  await query('DELETE FROM emergency_health_alerts WHERE id=$1', [req.params.id]);
  await audit(req.user, 'delete', 'emergency_health_alert', req.params.id);
  res.status(204).end();
}));

// Treatment effectiveness reports
router.get('/treatment-effectiveness', asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const { rows } = await query(
    `SELECT t.id, t.cow_id, c.cow_code, c.name AS cow_name, t.disease_id, t.diagnosis, t.diagnosed_on, t.treatment_plan,
            0 AS follow_ups,
            t.diagnosed_on AS last_follow_up
     FROM treatments t
     JOIN cows c ON c.id = t.cow_id
     WHERE c.farm_id = $1
     ORDER BY t.diagnosed_on DESC LIMIT 100`,
    [farmId]
  );
  res.json({ data: rows, count: rows.length });
}));

export default router;
