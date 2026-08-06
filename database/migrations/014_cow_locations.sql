-- Live cow location tracking. `source` records how the zone was set (manual today;
-- 'rfid'/'gps' are reserved for when real hardware feeds this table) and lat/lng stay
-- nullable until a GPS/RFID integration actually populates them.
CREATE TABLE IF NOT EXISTS cow_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  cow_id UUID NOT NULL UNIQUE REFERENCES cows(id) ON DELETE CASCADE,
  zone TEXT NOT NULL DEFAULT 'barnA',
  activity TEXT NOT NULL DEFAULT 'resting',
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'rfid', 'gps')),
  latitude NUMERIC(10,7),
  longitude NUMERIC(10,7),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cow_locations_farm_idx ON cow_locations(farm_id);
CREATE INDEX IF NOT EXISTS cow_locations_zone_idx ON cow_locations(farm_id, zone);
