import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/index.js';
import { requireAuth, requirePermission, resolveFarmId, audit } from '../middleware/auth.js';
import { HttpError, asyncHandler } from '../lib/errors.js';

const router = Router();
router.use(requireAuth);

const pointSchema = z.object({ type: z.literal('Point'), coordinates: z.tuple([z.number(), z.number()]) });
const lineStringSchema = z.object({ type: z.literal('LineString'), coordinates: z.array(z.tuple([z.number(), z.number()])) });
const polygonSchema = z.object({ type: z.literal('Polygon'), coordinates: z.array(z.array(z.tuple([z.number(), z.number()]))) });
const geometrySchema = z.discriminatedUnion('type', [pointSchema, lineStringSchema, polygonSchema]);

const objectSchema = z.object({
  type: z.enum(['building','barn','pasture','road','fence','gate','water_point','feed_store','milking_area','vet_area','equipment_area','custom']),
  name: z.string().min(1),
  properties: z.record(z.any()).default({}),
  geometry: geometrySchema,
  zIndex: z.number().int().default(0),
  isLocked: z.boolean().default(false),
});

const updateSchema = objectSchema.partial().omit({ type: true });

router.get('/objects', asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const { rows } = await query(
    `SELECT id, farm_id, type, name, properties, geometry, z_index, is_locked, created_by, updated_by, created_at, updated_at
     FROM farm_map_objects WHERE farm_id=$1 ORDER BY z_index, created_at`,
    [farmId]
  );
  const out = rows.map((r: any) => ({
    id: r.id,
    farmId: r.farm_id,
    type: r.type,
    name: r.name,
    properties: r.properties,
    geometry: r.geometry,
    zIndex: r.z_index,
    isLocked: r.is_locked,
    createdBy: r.created_by,
    updatedBy: r.updated_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
  res.json({ data: out });
}));

router.post('/objects', requirePermission('farm:manage'), asyncHandler(async (req, res) => {
  const body = objectSchema.parse(req.body);
  const farmId = resolveFarmId(req);
  const { rows } = await query(
    `INSERT INTO farm_map_objects (farm_id, type, name, properties, geometry, z_index, is_locked, created_by, updated_by)
     VALUES ($1,$2,$3,$4,ST_GeomFromGeoJSON($5),$6,$7,$8,$8)
     RETURNING id, farm_id, type, name, properties, ST_AsGeoJSON(geometry)::json AS geometry, z_index, is_locked, created_by, updated_by, created_at, updated_at`,
    [farmId, body.type, body.name, JSON.stringify(body.properties ?? {}), JSON.stringify(body.geometry), body.zIndex ?? 0, body.isLocked ?? false, req.user!.id]
  );
  const r = rows[0] as any;
  await audit(req.user, 'create', 'farm_map_object', r.id, { type: body.type, name: body.name });
  res.status(201).json({
    id: r.id, farmId: r.farm_id, type: r.type, name: r.name, properties: r.properties,
    geometry: r.geometry, zIndex: r.z_index, isLocked: r.is_locked, createdBy: r.created_by, updatedBy: r.updated_by,
    createdAt: r.created_at, updatedAt: r.updated_at,
  });
}));

router.patch('/objects/:id', requirePermission('farm:manage'), asyncHandler(async (req, res) => {
  const body = updateSchema.parse(req.body);
  const farmId = resolveFarmId(req);
  const id = req.params.id;
  const { rows } = await query(
    `UPDATE farm_map_objects SET name=COALESCE($2,name), properties=COALESCE($3,properties), geometry=COALESCE(ST_GeomFromGeoJSON($4),geometry), z_index=COALESCE($5,z_index), is_locked=COALESCE($6,is_locked), updated_by=$7, updated_at=now()
     WHERE id=$8 AND farm_id=$9 RETURNING id, farm_id, type, name, properties, ST_AsGeoJSON(geometry)::json AS geometry, z_index, is_locked, created_by, updated_by, created_at, updated_at`,
    [body.name, body.properties !== undefined ? JSON.stringify(body.properties) : null, body.geometry ? JSON.stringify(body.geometry) : null, body.zIndex, body.isLocked, req.user!.id, id, farmId]
  );
  if (!rows.length) throw new HttpError(404, 'Map object not found');
  const r = rows[0] as any;
  await audit(req.user, 'update', 'farm_map_object', id, body);
  res.json({
    id: r.id, farmId: r.farm_id, type: r.type, name: r.name, properties: r.properties,
    geometry: r.geometry, zIndex: r.z_index, isLocked: r.is_locked, createdBy: r.created_by, updatedBy: r.updated_by,
    createdAt: r.created_at, updatedAt: r.updated_at,
  });
}));

router.delete('/objects/:id', requirePermission('farm:manage'), asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const id = req.params.id;
  const { rows } = await query('SELECT * FROM farm_map_objects WHERE id=$1 AND farm_id=$2', [id, farmId]);
  if (!rows.length) throw new HttpError(404, 'Map object not found');
  const oldState = JSON.stringify(rows[0]);
  await query('DELETE FROM farm_map_objects WHERE id=$1', [id]);
  await query('INSERT INTO farm_map_undo_log (farm_id, user_id, action, entity_type, entity_id, old_state, new_state) VALUES ($1,$2,$3,$4,$5,$6,NULL)', [farmId, req.user!.id, 'delete', 'farm_map_object', id, oldState]);
  await audit(req.user, 'delete', 'farm_map_object', id, { name: rows[0].name });
  res.status(204).end();
}));

router.post('/objects/:id/move', requirePermission('farm:manage'), asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const id = req.params.id;
  const { geometry } = z.object({ geometry: z.object({ type: z.enum(['Point','LineString','Polygon']), coordinates: z.any() }) }).parse(req.body);
  const { rows } = await query(
    `UPDATE farm_map_objects SET geometry=ST_GeomFromGeoJSON($1), updated_by=$2, updated_at=now() WHERE id=$3 AND farm_id=$4 RETURNING id`,
    [JSON.stringify(geometry), req.user!.id, id, farmId]
  );
  if (!rows.length) throw new HttpError(404, 'Map object not found');
  await audit(req.user, 'move', 'farm_map_object', id, { geometry });
  res.json({ geometry });
}));

router.get('/undo', requirePermission('farm:manage'), asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const { rows } = await query(
    `SELECT id, farm_id, user_id, action, entity_type, entity_id, old_state, new_state, created_at FROM farm_map_undo_log WHERE farm_id=$1 ORDER BY created_at DESC LIMIT 50`,
    [farmId]
  );
  res.json({ data: rows.map((r: any) => ({ ...r, user_id: r.user_id, old_state: r.old_state, new_state: r.new_state })) });
}));

router.post('/undo/:id', requirePermission('farm:manage'), asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const undoId = req.params.id;
  const { rows } = await query('SELECT * FROM farm_map_undo_log WHERE id=$1 AND farm_id=$2', [undoId, farmId]);
  if (!rows.length) throw new HttpError(404, 'Undo entry not found');
  const entry = rows[0] as any;
  if (entry.action === 'create') {
    await query('DELETE FROM farm_map_objects WHERE id=$1', [entry.entity_id]);
  } else if (entry.action === 'update' || entry.action === 'move') {
    if (!entry.old_state) throw new HttpError(400, 'No previous state to restore');
    const old = JSON.parse(entry.old_state);
    await query(
      `UPDATE farm_map_objects SET type=$1, name=$2, properties=$3, geometry=ST_GeomFromGeoJSON($4), z_index=$5, is_locked=$6, updated_by=$7, updated_at=now() WHERE id=$8`,
      [old.type, old.name, JSON.stringify(old.properties), JSON.stringify(old.geometry), old.z_index, old.is_locked, req.user!.id, old.id]
    );
  } else if (entry.action === 'delete') {
    if (!entry.old_state) throw new HttpError(400, 'No previous state to restore');
    const old = JSON.parse(entry.old_state);
    await query(
      `INSERT INTO farm_map_objects (id, farm_id, type, name, properties, geometry, z_index, is_locked, created_by, updated_by, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,ST_GeomFromGeoJSON($6),$7,$8,$9,$9,now(),now())`,
      [old.id, farmId, old.type, old.name, JSON.stringify(old.properties), JSON.stringify(old.geometry), old.z_index, old.is_locked, req.user!.id]
    );
  }
  await query('DELETE FROM farm_map_undo_log WHERE id=$1', [undoId]);
  await audit(req.user, 'undo', 'farm_map_object', entry.entity_id, { action: entry.action });
  res.json({ ok: true });
}));

router.post('/redo', requirePermission('farm:manage'), asyncHandler(async (req, res) => {
  res.status(501).json({ error: 'Redo not yet implemented' });
}));

router.post('/save-draft', requirePermission('farm:manage'), asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const body = z.object({ objects: z.array(z.any()) }).parse(req.body);
  await query('DELETE FROM farm_map_undo_log WHERE farm_id=$1', [farmId]);
  await query(
    `INSERT INTO farm_map_undo_log (farm_id, user_id, action, entity_type, entity_id, old_state, new_state) VALUES ($1,$2,'publish_draft', 'farm_map_object', gen_random_uuid(), NULL, $3)`,
    [farmId, req.user!.id, JSON.stringify(body.objects)]
  );
  await audit(req.user, 'save_draft', 'farm_map_object', null, { count: body.objects.length });
  res.json({ draft: body.objects });
}));

router.get('/draft', requirePermission('farm:manage'), asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const { rows } = await query(
    `SELECT new_state FROM farm_map_undo_log WHERE farm_id=$1 AND action='publish_draft' ORDER BY created_at DESC LIMIT 1`,
    [farmId]
  );
  const draft = rows[0]?.new_state || [];
  res.json({ draft });
}));

router.post('/publish', requirePermission('farm:manage'), asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const { rows } = await query(
    `SELECT new_state FROM farm_map_undo_log WHERE farm_id=$1 AND action='publish_draft' ORDER BY created_at DESC LIMIT 1`,
    [farmId]
  );
  const draft = rows[0]?.new_state;
  if (!draft) throw new HttpError(400, 'No draft to publish');
  await query('DELETE FROM farm_map_objects WHERE farm_id=$1', [farmId]);
  const objects = JSON.parse(draft);
  for (const obj of objects) {
    await query(
      `INSERT INTO farm_map_objects (id, farm_id, type, name, properties, geometry, z_index, is_locked, created_by, updated_by, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,ST_GeomFromGeoJSON($6),$7,$8,$9,$9,now(),now())`,
      [obj.id, farmId, obj.type, obj.name, JSON.stringify(obj.properties || {}), JSON.stringify(obj.geometry), obj.zIndex ?? 0, obj.isLocked ?? false, req.user!.id]
    );
  }
  await query('DELETE FROM farm_map_undo_log WHERE farm_id=$1 AND action=$2', [farmId, 'publish_draft']);
  await audit(req.user, 'publish', 'farm_map_object', null, { count: objects.length });
  res.json({ ok: true, published: objects.length });
}));

export default router;
