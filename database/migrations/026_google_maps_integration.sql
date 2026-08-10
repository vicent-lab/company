CREATE EXTENSION IF NOT EXISTS postgis;

-- Farms: add address fields for Google Maps geocoding / location
ALTER TABLE farms ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE farms ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE farms ADD COLUMN IF NOT EXISTS district TEXT;
ALTER TABLE farms ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE farms ADD COLUMN IF NOT EXISTS plus_code TEXT;

-- Ensure location columns exist (may already exist from 025_farm_satellite_map.sql)
ALTER TABLE farms ADD COLUMN IF NOT EXISTS latitude NUMERIC(10,7);
ALTER TABLE farms ADD COLUMN IF NOT EXISTS longitude NUMERIC(10,7);
ALTER TABLE farms ADD COLUMN IF NOT EXISTS location_accuracy NUMERIC(10,2);
ALTER TABLE farms ADD COLUMN IF NOT EXISTS default_map_center_lat NUMERIC(10,7);
ALTER TABLE farms ADD COLUMN IF NOT EXISTS default_map_center_lng NUMERIC(10,7);
ALTER TABLE farms ADD COLUMN IF NOT EXISTS default_map_zoom NUMERIC(4,2);

-- Indexes for map tables (ensure farm_id columns are indexed)
CREATE INDEX IF NOT EXISTS farm_map_objects_farm_id_idx ON farm_map_objects(farm_id);
CREATE INDEX IF NOT EXISTS farm_map_boundaries_farm_id_idx ON farm_map_boundaries(farm_id);
CREATE INDEX IF NOT EXISTS farm_pastures_farm_id_idx ON farm_pastures(farm_id);
CREATE INDEX IF NOT EXISTS map_measurements_farm_id_idx ON map_measurements(farm_id);
CREATE INDEX IF NOT EXISTS map_provider_settings_farm_id_idx ON map_provider_settings(farm_id);

-- PostGIS geometry indexes (ensure they exist)
CREATE INDEX IF NOT EXISTS farm_map_objects_geometry_idx ON farm_map_objects USING GIST (geometry);
CREATE INDEX IF NOT EXISTS farm_map_boundaries_geometry_idx ON farm_map_boundaries USING GIST (geometry);
CREATE INDEX IF NOT EXISTS farm_pastures_geometry_idx ON farm_pastures USING GIST (geometry);
CREATE INDEX IF NOT EXISTS map_measurements_geometry_idx ON map_measurements USING GIST (geometry);

-- Unique constraint on map_provider_settings per farm
CREATE UNIQUE INDEX IF NOT EXISTS map_provider_settings_farm_unique ON map_provider_settings(farm_id);
