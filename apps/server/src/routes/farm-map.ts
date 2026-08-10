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
  const { geometry } = z.object({ geometry: geometrySchema }).parse(req.body);
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

// ---- Farm Location ----
router.get('/location', asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const { rows } = await query(
    `SELECT latitude, longitude, location_accuracy, default_map_center_lat, default_map_center_lng, default_map_zoom FROM farms WHERE id=$1`,
    [farmId]
  );
  const r = rows[0] || {};
  res.json({
    farmId,
    latitude: r.latitude ?? null,
    longitude: r.longitude ?? null,
    locationAccuracy: r.location_accuracy ?? null,
    defaultCenterLat: r.default_map_center_lat ?? null,
    defaultCenterLng: r.default_map_center_lng ?? null,
    defaultZoom: r.default_map_zoom ?? null,
  });
}));

router.patch('/location', requirePermission('farm:manage'), asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const body = z.object({
    latitude: z.coerce.number().min(-90).max(90).optional(),
    longitude: z.coerce.number().min(-180).max(180).optional(),
    locationAccuracy: z.coerce.number().positive().optional(),
    defaultCenterLat: z.coerce.number().min(-90).max(90).optional(),
    defaultCenterLng: z.coerce.number().min(-180).max(180).optional(),
    defaultZoom: z.coerce.number().min(1).max(20).optional(),
  }).parse(req.body);
  const { rows } = await query(
    `UPDATE farms SET
       latitude = COALESCE($1, latitude),
       longitude = COALESCE($2, longitude),
       location_accuracy = COALESCE($3, location_accuracy),
       default_map_center_lat = COALESCE($4, default_map_center_lat),
       default_map_center_lng = COALESCE($5, default_map_center_lng),
       default_map_zoom = COALESCE($6, default_map_zoom),
       updated_at = now()
     WHERE id = $7 RETURNING latitude, longitude, location_accuracy, default_map_center_lat, default_map_center_lng, default_map_zoom`,
    [body.latitude ?? null, body.longitude ?? null, body.locationAccuracy ?? null, body.defaultCenterLat ?? null, body.defaultCenterLng ?? null, body.defaultZoom ?? null, farmId]
  );
  if (!rows[0]) throw new HttpError(404, 'Farm not found');
  const r = rows[0];
  await audit(req.user, 'update', 'farm_location', farmId, body);
  res.json({
    farmId,
    latitude: r.latitude,
    longitude: r.longitude,
    locationAccuracy: r.location_accuracy,
    defaultCenterLat: r.default_map_center_lat,
    defaultCenterLng: r.default_map_center_lng,
    defaultZoom: r.default_map_zoom,
  });
}));

// ---- Boundaries ----
router.get('/boundary', asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const { id } = req.query;
  if (id) {
    const { rows } = await query(
      `SELECT id, farm_id, name, ST_AsGeoJSON(geometry)::json AS geometry, area_hectares, area_acres, perimeter_meters, created_by, updated_by, created_at, updated_at
       FROM farm_map_boundaries WHERE id=$1 AND farm_id=$2`, [String(id), farmId]
    );
    if (!rows.length) throw new HttpError(404, 'Boundary not found');
    res.json({ data: rows[0] });
    return;
  }
  const { rows } = await query(
    `SELECT id, farm_id, name, ST_AsGeoJSON(geometry)::json AS geometry, area_hectares, area_acres, perimeter_meters, created_by, updated_by, created_at, updated_at
     FROM farm_map_boundaries WHERE farm_id=$1 ORDER BY created_at DESC`, [farmId]
  );
  res.json({ data: rows });
}));

router.post('/boundary', requirePermission('farm:manage'), asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const body = z.object({
    name: z.string().min(1),
    geometry: geometrySchema,
  }).parse(req.body);
  const { rows } = await query(
    `INSERT INTO farm_map_boundaries (farm_id, name, geometry, area_hectares, area_acres, perimeter_meters, created_by, updated_by)
     VALUES ($1,$2,ST_GeomFromGeoJSON($3),
       ST_Area(ST_GeomFromGeoJSON($3)::geography) / 10000.0,
       ST_Area(ST_GeomFromGeoJSON($3)::geography) / 4046.8564224,
       ST_Perimeter(ST_GeomFromGeoJSON($3)::geography),
       $4,$4)
     RETURNING id, farm_id, name, ST_AsGeoJSON(geometry)::json AS geometry, area_hectares, area_acres, perimeter_meters, created_by, updated_by, created_at, updated_at`,
    [farmId, body.name, JSON.stringify(body.geometry), req.user!.id]
  );
  const r = rows[0] as any;
  await audit(req.user, 'create', 'farm_map_boundary', r.id, { name: body.name });
  res.status(201).json({
    id: r.id, farmId: r.farm_id, name: r.name, geometry: r.geometry,
    areaHectares: +r.area_hectares.toFixed(4), areaAcres: +r.area_acres.toFixed(4), perimeterMeters: +r.perimeter_meters.toFixed(2),
    createdBy: r.created_by, updatedBy: r.updated_by, createdAt: r.created_at, updatedAt: r.updated_at,
  });
}));

router.delete('/boundary/:id', requirePermission('farm:manage'), asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const id = req.params.id;
  const { rows } = await query('SELECT * FROM farm_map_boundaries WHERE id=$1 AND farm_id=$2', [id, farmId]);
  if (!rows.length) throw new HttpError(404, 'Boundary not found');
  await query('DELETE FROM farm_map_boundaries WHERE id=$1', [id]);
  await audit(req.user, 'delete', 'farm_map_boundary', id, { name: rows[0].name });
  res.status(204).end();
}));

// ---- Pastures ----
router.get('/pastures', asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const { rows } = await query(
    `SELECT id, farm_id, name, ST_AsGeoJSON(geometry)::json AS geometry, area_hectares, area_acres, perimeter_meters,
            current_animals, capacity, condition, grazing_status, last_grazing_on, next_recommended_grazing,
            notes, color, is_locked, created_by, updated_by, created_at, updated_at
     FROM farm_pastures WHERE farm_id=$1 ORDER BY created_at DESC`, [farmId]
  );
  res.json({ data: rows.map((r: any) => ({
    id: r.id, farmId: r.farm_id, name: r.name, geometry: r.geometry,
    areaHectares: +r.area_hectares.toFixed(4), areaAcres: +r.area_acres.toFixed(4), perimeterMeters: +r.perimeter_meters.toFixed(2),
    currentAnimals: r.current_animals, capacity: r.capacity, condition: r.condition, grazingStatus: r.grazing_status,
    lastGrazingOn: r.last_grazing_on, nextRecommendedGrazing: r.next_recommended_grazing, notes: r.notes,
    color: r.color, isLocked: r.is_locked, createdBy: r.created_by, updatedBy: r.updated_by,
    createdAt: r.created_at, updatedAt: r.updated_at,
  })) });
}));

router.post('/pastures', requirePermission('farm:manage'), asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const body = z.object({
    name: z.string().min(1),
    geometry: geometrySchema,
    currentAnimals: z.coerce.number().int().nonnegative().default(0),
    capacity: z.coerce.number().int().positive().optional(),
    condition: z.string().optional(),
    grazingStatus: z.string().optional(),
    lastGrazingOn: z.string().optional(),
    nextRecommendedGrazing: z.string().optional(),
    notes: z.string().optional(),
    color: z.string().default('#3b82f6'),
  }).parse(req.body);
  const geo = JSON.stringify(body.geometry);
  const { rows } = await query(
    `INSERT INTO farm_pastures (farm_id, name, geometry, area_hectares, area_acres, perimeter_meters,
       current_animals, capacity, condition, grazing_status, last_grazing_on, next_recommended_grazing, notes, color, created_by, updated_by)
     VALUES ($1,$2,ST_GeomFromGeoJSON($3),
       ST_Area(ST_GeomFromGeoJSON($3)::geography) / 10000.0,
       ST_Area(ST_GeomFromGeoJSON($3)::geography) / 4046.8564224,
       ST_Perimeter(ST_GeomFromGeoJSON($3)::geography),
       $4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13)
     RETURNING id, farm_id, name, ST_AsGeoJSON(geometry)::json AS geometry, area_hectares, area_acres, perimeter_meters,
              current_animals, capacity, condition, grazing_status, last_grazing_on, next_recommended_grazing,
              notes, color, is_locked, created_by, updated_by, created_at, updated_at`,
    [farmId, body.name, geo, body.currentAnimals ?? 0, body.capacity ?? null, body.condition ?? null,
     body.grazingStatus ?? null, body.lastGrazingOn ?? null, body.nextRecommendedGrazing ?? null,
     body.notes ?? null, body.color, req.user!.id]
  );
  const r = rows[0] as any;
  await audit(req.user, 'create', 'farm_pasture', r.id, { name: body.name });
  res.status(201).json({
    id: r.id, farmId: r.farm_id, name: r.name, geometry: r.geometry,
    areaHectares: +r.area_hectares.toFixed(4), areaAcres: +r.area_acres.toFixed(4), perimeterMeters: +r.perimeter_meters.toFixed(2),
    currentAnimals: r.current_animals, capacity: r.capacity, condition: r.condition, grazingStatus: r.grazing_status,
    lastGrazingOn: r.last_grazing_on, nextRecommendedGrazing: r.next_recommended_grazing, notes: r.notes,
    color: r.color, isLocked: r.is_locked, createdBy: r.created_by, updatedBy: r.updated_by,
    createdAt: r.created_at, updatedAt: r.updated_at,
  });
}));

router.patch('/pastures/:id', requirePermission('farm:manage'), asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const id = req.params.id;
  const body = z.object({
    name: z.string().min(1).optional(),
    geometry: geometrySchema.optional(),
    currentAnimals: z.coerce.number().int().nonnegative().optional(),
    capacity: z.coerce.number().int().positive().optional().nullable(),
    condition: z.string().optional().nullable(),
    grazingStatus: z.string().optional().nullable(),
    lastGrazingOn: z.string().optional().nullable(),
    nextRecommendedGrazing: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
    color: z.string().optional(),
  }).parse(req.body);
  const geo = body.geometry ? JSON.stringify(body.geometry) : null;
  const { rows } = await query(
    `UPDATE farm_pastures SET
       name = COALESCE($1, name),
       geometry = COALESCE(ST_GeomFromGeoJSON($2), geometry),
       area_hectares = CASE WHEN $2 IS NOT NULL THEN ST_Area(ST_GeomFromGeoJSON($2)::geography) / 10000.0 ELSE area_hectares END,
       area_acres = CASE WHEN $2 IS NOT NULL THEN ST_Area(ST_GeomFromGeoJSON($2)::geography) / 4046.8564224 ELSE area_acres END,
       perimeter_meters = CASE WHEN $2 IS NOT NULL THEN ST_Perimeter(ST_GeomFromGeoJSON($2)::geography) ELSE perimeter_meters END,
       current_animals = COALESCE($3, current_animals),
       capacity = COALESCE($4, capacity),
       condition = COALESCE($5, condition),
       grazing_status = COALESCE($6, grazing_status),
       last_grazing_on = COALESCE($7, last_grazing_on),
       next_recommended_grazing = COALESCE($8, next_recommended_grazing),
       notes = COALESCE($9, notes),
       color = COALESCE($10, color),
       updated_by = $11, updated_at = now()
     WHERE id=$12 AND farm_id=$13 RETURNING id, farm_id, name, ST_AsGeoJSON(geometry)::json AS geometry,
       area_hectares, area_acres, perimeter_meters, current_animals, capacity, condition, grazing_status,
       last_grazing_on, next_recommended_grazing, notes, color, is_locked, created_by, updated_by, created_at, updated_at`,
    [body.name ?? null, geo, body.currentAnimals ?? null, body.capacity ?? null, body.condition ?? null,
     body.grazingStatus ?? null, body.lastGrazingOn ?? null, body.nextRecommendedGrazing ?? null,
     body.notes ?? null, body.color ?? null, req.user!.id, id, farmId]
  );
  if (!rows.length) throw new HttpError(404, 'Pasture not found');
  const r = rows[0] as any;
  await audit(req.user, 'update', 'farm_pasture', id, body);
  res.json({
    id: r.id, farmId: r.farm_id, name: r.name, geometry: r.geometry,
    areaHectares: +r.area_hectares.toFixed(4), areaAcres: +r.area_acres.toFixed(4), perimeterMeters: +r.perimeter_meters.toFixed(2),
    currentAnimals: r.current_animals, capacity: r.capacity, condition: r.condition, grazingStatus: r.grazing_status,
    lastGrazingOn: r.last_grazing_on, nextRecommendedGrazing: r.next_recommended_grazing, notes: r.notes,
    color: r.color, isLocked: r.is_locked, createdBy: r.created_by, updatedBy: r.updated_by,
    createdAt: r.created_at, updatedAt: r.updated_at,
  });
}));

router.delete('/pastures/:id', requirePermission('farm:manage'), asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const id = req.params.id;
  const { rows } = await query('SELECT * FROM farm_pastures WHERE id=$1 AND farm_id=$2', [id, farmId]);
  if (!rows.length) throw new HttpError(404, 'Pasture not found');
  await query('DELETE FROM farm_pastures WHERE id=$1', [id]);
  await audit(req.user, 'delete', 'farm_pasture', id, { name: rows[0].name });
  res.status(204).end();
}));

// ---- Measurements ----
router.post('/measure', requirePermission('farm:manage'), asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const body = z.object({
    type: z.enum(['distance', 'area', 'perimeter']),
    geometry: geometrySchema,
    notes: z.string().optional(),
  }).parse(req.body);
  const geo = JSON.stringify(body.geometry);
  const { rows } = await query(
    `INSERT INTO map_measurements (farm_id, user_id, type, geometry, value_meters, value_hectares, notes)
     VALUES ($1,$2,$3,ST_GeomFromGeoJSON($4),
       CASE $5 WHEN 'distance' THEN ST_Length(ST_GeomFromGeoJSON($4)::geography) WHEN 'perimeter' THEN ST_Perimeter(ST_GeomFromGeoJSON($4)::geography) ELSE NULL END,
       CASE $5 WHEN 'area' THEN ST_Area(ST_GeomFromGeoJSON($4)::geography) / 10000.0 ELSE NULL END,
       $6)
     RETURNING id, farm_id, user_id, type, ST_AsGeoJSON(geometry)::json AS geometry, value_meters, value_hectares, notes, created_at`,
    [farmId, req.user!.id, body.type, geo, body.type, body.notes ?? null]
  );
  const r = rows[0] as any;
  await audit(req.user, 'create', 'map_measurement', r.id, { type: body.type, notes: body.notes });
  res.status(201).json({
    id: r.id, farmId: r.farm_id, userId: r.user_id, type: r.type, geometry: r.geometry,
    valueMeters: r.value_meters ? +r.value_meters.toFixed(2) : null,
    valueHectares: r.value_hectares ? +r.value_hectares.toFixed(4) : null,
    notes: r.notes, createdAt: r.created_at,
  });
}));

router.get('/measurements', asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const { rows } = await query(
    `SELECT id, farm_id, user_id, type, ST_AsGeoJSON(geometry)::json AS geometry, value_meters, value_hectares, notes, created_at
     FROM map_measurements WHERE farm_id=$1 ORDER BY created_at DESC`, [farmId]
  );
  res.json({ data: rows.map((r: any) => ({
    id: r.id, farmId: r.farm_id, userId: r.user_id, type: r.type, geometry: r.geometry,
    valueMeters: r.value_meters ? +r.value_meters.toFixed(2) : null,
    valueHectares: r.value_hectares ? +r.value_hectares.toFixed(4) : null,
    notes: r.notes, createdAt: r.created_at,
  })) });
}));

router.delete('/measurements/:id', requirePermission('farm:manage'), asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const id = req.params.id;
  const { rows } = await query('SELECT * FROM map_measurements WHERE id=$1 AND farm_id=$2', [id, farmId]);
  if (!rows.length) throw new HttpError(404, 'Measurement not found');
  await query('DELETE FROM map_measurements WHERE id=$1', [id]);
  await audit(req.user, 'delete', 'map_measurement', id, { type: rows[0].type });
  res.status(204).end();
}));

// ---- Layers ----
router.get('/layers', asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const { rows } = await query(
    `SELECT enabled_layers FROM map_provider_settings WHERE farm_id=$1 ORDER BY created_at DESC LIMIT 1`,
    [farmId]
  );
  const defaults = { satellite: true, boundary: true, buildings: true, pastures: true, cows: true, water: true, roads: true, fences: true, equipment: true, healthRisk: true, milkProduction: true, weather: true, aiAlerts: true };
  res.json({ layers: rows[0]?.enabled_layers ?? defaults });
}));

router.patch('/layers', requirePermission('farm:manage'), asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const body = z.object({ layers: z.record(z.boolean()) }).parse(req.body);
  const { rows } = await query(
    `INSERT INTO map_provider_settings (farm_id, enabled_layers, created_at, updated_at)
     VALUES ($1,$2,now(),now())
     ON CONFLICT (farm_id) DO UPDATE SET enabled_layers=$2, updated_at=now()
     RETURNING enabled_layers`,
    [farmId, JSON.stringify(body.layers)]
  );
  await audit(req.user, 'update', 'map_layers', farmId, body);
  res.json({ layers: rows[0].enabled_layers });
}));

// ---- Providers ----
router.get('/providers', asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const { rows } = await query(
    `SELECT provider, style, satellite_provider, enabled_layers FROM map_provider_settings WHERE farm_id=$1 ORDER BY created_at DESC LIMIT 1`,
    [farmId]
  );
  const r = rows[0] || {};
  res.json({
    provider: r.provider || 'osm',
    style: r.style || 'standard',
    satelliteProvider: r.satellite_provider || 'esri',
    enabledLayers: r.enabled_layers || {},
  });
}));

router.patch('/providers', requirePermission('farm:manage'), asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const body = z.object({
    provider: z.string().optional(),
    style: z.string().optional(),
    satelliteProvider: z.string().optional(),
    apiKeyEncrypted: z.string().optional().nullable(),
  }).parse(req.body);
  const { rows } = await query(
    `INSERT INTO map_provider_settings (farm_id, provider, style, satellite_provider, api_key_encrypted, created_at, updated_at)
     VALUES ($1, COALESCE($2, 'osm'), COALESCE($3, 'standard'), COALESCE($4, 'esri'), $5, now(), now())
     ON CONFLICT (farm_id) DO UPDATE SET
       provider = COALESCE($2, map_provider_settings.provider),
       style = COALESCE($3, map_provider_settings.style),
       satellite_provider = COALESCE($4, map_provider_settings.satellite_provider),
       api_key_encrypted = COALESCE($5, map_provider_settings.api_key_encrypted),
       updated_at = now()
     RETURNING provider, style, satellite_provider, enabled_layers`,
    [farmId, body.provider ?? 'osm', body.style ?? 'standard', body.satelliteProvider ?? 'esri', body.apiKeyEncrypted ?? null]
  );
  const r = rows[0] as any;
  await audit(req.user, 'update', 'map_provider_settings', farmId, { provider: body.provider, style: body.style });
  res.json({
    provider: r.provider,
    style: r.style,
    satelliteProvider: r.satellite_provider,
    enabledLayers: r.enabled_layers,
  });
}));

// ---- AI Map Query ----
router.post('/ai-query', asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const body = z.object({ query: z.string().min(1) }).parse(req.body);
  const q = body.query.toLowerCase();
  let text = 'I could not find a clear match for that question.';
  const highlights: { type: string; geometry: any; label?: string }[] = [];

  if (q.includes('how large') || q.includes('farm size') || q.includes('area of my farm')) {
    const { rows } = await query(
      `SELECT id, name, ST_Area(geometry::geography) / 10000.0 AS ha, ST_AsGeoJSON(geometry)::json AS geometry FROM farm_map_boundaries WHERE farm_id=$1 LIMIT 1`,
      [farmId]
    );
    if (rows[0]) {
      text = `Your farm boundary "${rows[0].name}" covers approximately ${rows[0].ha.toFixed(2)} hectares.`;
      highlights.push({ type: 'boundary', geometry: rows[0].geometry, label: rows[0].name });
    } else {
      text = 'No farm boundary has been drawn yet. Draw one using the boundary tool to measure your farm size.';
    }
  } else if (q.includes('which pasture is largest') || q.includes('largest pasture')) {
    const { rows } = await query(
      `SELECT id, name, area_hectares, ST_AsGeoJSON(geometry)::json AS geometry FROM farm_pastures WHERE farm_id=$1 ORDER BY area_hectares DESC NULLS LAST LIMIT 1`,
      [farmId]
    );
    if (rows[0]) {
      text = `The largest pasture is "${rows[0].name}" at ${rows[0].area_hectares} hectares.`;
      highlights.push({ type: 'pasture', geometry: rows[0].geometry, label: rows[0].name });
    } else {
      text = 'No pastures have been mapped yet.';
    }
  } else if (q.includes('closest') && q.includes('barn')) {
    const barnMatch = q.match(/barn\s+([a-z])/);
    const barnLetter = barnMatch ? barnMatch[1].toUpperCase() : 'A';
    const { rows: barnRows } = await query(
      `SELECT id, name, ST_AsGeoJSON(geometry)::json AS geometry FROM barns WHERE farm_id=$1 AND name ILIKE $2 LIMIT 1`,
      [farmId, `%Barn ${barnLetter}%`]
    );
    if (barnRows[0]) {
      const { rows } = await query(
        `SELECT p.id, p.name, ST_Distance(p.geometry, ST_GeomFromGeoJSON($2)) AS dist, ST_AsGeoJSON(p.geometry)::json AS geometry
         FROM farm_pastures p WHERE p.farm_id=$1 ORDER BY dist ASC LIMIT 1`,
        [farmId, JSON.stringify(barnRows[0].geometry)]
      );
      if (rows[0]) {
        text = `Pasture "${rows[0].name}" is closest to ${barnRows[0].name} (${(+rows[0].dist).toFixed(0)} m away).`;
        highlights.push({ type: 'pasture', geometry: rows[0].geometry, label: rows[0].name });
      }
    } else {
      text = 'Barn not found.';
    }
  } else if (q.includes('water point') || q.includes('all water')) {
    const { rows } = await query(
      `SELECT id, name, ST_AsGeoJSON(geometry)::json AS geometry FROM farm_map_objects WHERE farm_id=$1 AND type='water_point'`,
      [farmId]
    );
    text = `Found ${rows.length} water point(s).`;
    for (const r of rows) highlights.push({ type: 'water_point', geometry: r.geometry, label: r.name });
  } else if (q.includes('currently being grazed') || q.includes('being grazed') || q.includes('grazing')) {
    const { rows } = await query(
      `SELECT id, name, grazing_status, ST_AsGeoJSON(geometry)::json AS geometry FROM farm_pastures WHERE farm_id=$1 AND grazing_status = 'active'`,
      [farmId]
    );
    text = rows.length ? `${rows.length} pasture(s) currently being grazed.` : 'No pastures are currently being grazed.';
    for (const r of rows) highlights.push({ type: 'pasture', geometry: r.geometry, label: r.name });
  } else if (q.includes('not been used') || q.includes('not used recently') || q.includes('oldest grazing')) {
    const { rows } = await query(
      `SELECT id, name, last_grazing_on, ST_AsGeoJSON(geometry)::json AS geometry FROM farm_pastures WHERE farm_id=$1 AND last_grazing_on IS NOT NULL ORDER BY last_grazing_on ASC LIMIT 1`,
      [farmId]
    );
    if (rows[0]) {
      text = `Pasture "${rows[0].name}" was last grazed on ${rows[0].last_grazing_on} — the least recently used.`;
      highlights.push({ type: 'pasture', geometry: rows[0].geometry, label: rows[0].name });
    } else {
      text = 'No grazing records found.';
    }
  } else if (q.includes('expand') || q.includes('where should i expand')) {
    const { rows: bounds } = await query(
      `SELECT ST_AsGeoJSON(geometry)::json AS geometry FROM farm_map_boundaries WHERE farm_id=$1 LIMIT 1`, [farmId]
    );
    const { rows: pastures } = await query(
      `SELECT id, name, capacity, current_animals, ST_AsGeoJSON(geometry)::json AS geometry FROM farm_pastures WHERE farm_id=$1 AND capacity > 0 ORDER BY (current_animals::float / NULLIF(capacity, 0)) DESC`,
      [farmId]
    );
    if (pastures.length) {
      const nearCapacity = pastures.filter((p: any) => (p.current_animals / p.capacity) > 0.85);
      text = nearCapacity.length
        ? `Consider expanding near ${nearCapacity.map((p: any) => p.name).join(' and ')} — they are running near capacity.`
        : 'Pastures have room. Focus on rotational grazing optimization first.';
      for (const p of nearCapacity.slice(0, 3)) highlights.push({ type: 'pasture', geometry: p.geometry, label: p.name });
    } else {
      text = bounds[0] ? 'Draw pastures within your boundary to get expansion recommendations.' : 'Draw a farm boundary first.';
    }
  }

  res.json({ text, highlights });
}));

router.post('/ai-highlight', requirePermission('farm:manage'), asyncHandler(async (req, res) => {
  const farmId = resolveFarmId(req);
  const body = z.object({ entityType: z.string(), entityId: z.string(), action: z.string().optional() }).parse(req.body);
  await audit(req.user, 'ai_highlight', body.entityType, body.entityId, body);
  res.json({ ok: true });
}));

export default router;
