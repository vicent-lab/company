CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS farm_map_objects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('building','barn','pasture','road','fence','gate','water_point','feed_store','milking_area','vet_area','equipment_area','custom')),
  name TEXT NOT NULL,
  properties JSONB NOT NULL DEFAULT '{}',
  geometry GEOMETRY(GEOMETRY, 4326) NOT NULL,
  z_index INTEGER NOT NULL DEFAULT 0,
  is_locked BOOLEAN NOT NULL DEFAULT false,
  created_by UUID NOT NULL REFERENCES users(id),
  updated_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS farm_map_objects_farm_type_idx ON farm_map_objects(farm_id, type);
CREATE INDEX IF NOT EXISTS farm_map_objects_geometry_idx ON farm_map_objects USING GIST (geometry);

CREATE TABLE IF NOT EXISTS farm_map_undo_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  action TEXT NOT NULL CHECK (action IN ('create','update','delete','move')),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  old_state JSONB,
  new_state JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS farm_map_undo_log_farm_created_idx ON farm_map_undo_log(farm_id, created_at DESC);

ALTER TABLE barns ADD COLUMN IF NOT EXISTS geometry GEOMETRY(GEOMETRY, 4326);

CREATE OR REPLACE VIEW farm_map_objects_view AS
SELECT id, farm_id, type, name, properties, geometry, z_index, is_locked, created_by, updated_by, created_at, updated_at, 'farm_map_object' AS source
FROM farm_map_objects
UNION ALL
SELECT id, farm_id, 'barn' AS type, name, '{}'::jsonb AS properties, geometry, 0 AS z_index, false AS is_locked, created_by, updated_by, created_at, updated_at, 'barn' AS source
FROM barns
WHERE geometry IS NOT NULL;
