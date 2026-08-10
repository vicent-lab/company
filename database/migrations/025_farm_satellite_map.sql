CREATE EXTENSION IF NOT EXISTS postgis;

-- Farms: location and map defaults
ALTER TABLE farms ADD COLUMN IF NOT EXISTS latitude NUMERIC(10,7);
ALTER TABLE farms ADD COLUMN IF NOT EXISTS longitude NUMERIC(10,7);
ALTER TABLE farms ADD COLUMN IF NOT EXISTS location_accuracy NUMERIC(10,2);
ALTER TABLE farms ADD COLUMN IF NOT EXISTS default_map_center_lat NUMERIC(10,7);
ALTER TABLE farms ADD COLUMN IF NOT EXISTS default_map_center_lng NUMERIC(10,7);
ALTER TABLE farms ADD COLUMN IF NOT EXISTS default_map_zoom NUMERIC(4,2);

-- Farm boundaries
CREATE TABLE IF NOT EXISTS farm_map_boundaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  geometry GEOMETRY(Polygon, 4326) NOT NULL,
  area_hectares NUMERIC(12,4),
  area_acres NUMERIC(12,4),
  perimeter_meters NUMERIC(12,2),
  created_by UUID NOT NULL REFERENCES users(id),
  updated_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Farm pastures
CREATE TABLE IF NOT EXISTS farm_pastures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  geometry GEOMETRY(Polygon, 4326) NOT NULL,
  area_hectares NUMERIC(12,4),
  area_acres NUMERIC(12,4),
  perimeter_meters NUMERIC(12,2),
  current_animals INTEGER NOT NULL DEFAULT 0,
  capacity INTEGER,
  condition TEXT,
  grazing_status TEXT,
  last_grazing_on DATE,
  next_recommended_grazing DATE,
  notes TEXT,
  color TEXT DEFAULT '#3b82f6',
  is_locked BOOLEAN NOT NULL DEFAULT false,
  created_by UUID NOT NULL REFERENCES users(id),
  updated_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Map measurements
CREATE TABLE IF NOT EXISTS map_measurements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  type TEXT NOT NULL CHECK (type IN ('distance','area','perimeter')),
  geometry GEOMETRY(GEOMETRY, 4326) NOT NULL,
  value_meters NUMERIC(12,2),
  value_hectares NUMERIC(12,4),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Map provider settings
CREATE TABLE IF NOT EXISTS map_provider_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'osm',
  style TEXT NOT NULL DEFAULT 'standard',
  satellite_provider TEXT NOT NULL DEFAULT 'esri',
  api_key_encrypted TEXT,
  enabled_layers JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS farm_map_boundaries_farm_idx ON farm_map_boundaries(farm_id);
CREATE INDEX IF NOT EXISTS farm_pastures_farm_idx ON farm_pastures(farm_id);
CREATE INDEX IF NOT EXISTS map_measurements_farm_idx ON map_measurements(farm_id, created_at DESC);
CREATE INDEX IF NOT EXISTS map_provider_settings_farm_idx ON map_provider_settings(farm_id);
CREATE INDEX IF NOT EXISTS farm_map_boundaries_geometry_idx ON farm_map_boundaries USING GIST (geometry);
CREATE INDEX IF NOT EXISTS farm_pastures_geometry_idx ON farm_pastures USING GIST (geometry);
CREATE INDEX IF NOT EXISTS map_measurements_geometry_idx ON map_measurements USING GIST (geometry);

-- Unified view for frontend map
CREATE OR REPLACE VIEW farm_map_full_view AS
SELECT id, farm_id, type, name, properties, geometry, z_index, is_locked, created_by, updated_by, created_at, updated_at, 'farm_map_object' AS source
FROM farm_map_objects
UNION ALL
SELECT id, farm_id, 'barn' AS type, name, '{}'::jsonb AS properties, geometry, 0 AS z_index, false AS is_locked, created_by, updated_by, created_at, updated_at, 'barn' AS source
FROM barns
WHERE geometry IS NOT NULL
UNION ALL
SELECT id, farm_id, 'boundary' AS type, name,
  jsonb_build_object(
    'area_hectares', area_hectares, 'area_acres', area_acres, 'perimeter_meters', perimeter_meters
  ) AS properties,
  geometry, 0 AS z_index, false AS is_locked, created_by, updated_by, created_at, updated_at, 'boundary' AS source
FROM farm_map_boundaries
UNION ALL
SELECT id, farm_id, 'pasture' AS type, name,
  jsonb_build_object(
    'area_hectares', area_hectares, 'area_acres', area_acres, 'perimeter_meters', perimeter_meters,
    'current_animals', current_animals, 'capacity', capacity, 'condition', condition,
    'grazing_status', grazing_status, 'last_grazing_on', last_grazing_on,
    'next_recommended_grazing', next_recommended_grazing, 'notes', notes,
    'color', color, 'is_locked', is_locked
  ) AS properties,
  geometry, 0 AS z_index, is_locked, created_by, updated_by, created_at, updated_at, 'pasture' AS source
FROM farm_pastures;
