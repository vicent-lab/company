-- One reading per farm per day. Populated lazily (upserted) by whichever consumer touches
-- it first — the /weather route or the AI reasoning engine's daily cycle — so both read the
-- same numbers instead of the engine silently falling back to a hardcoded default.
CREATE TABLE IF NOT EXISTS weather_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  observed_date DATE NOT NULL DEFAULT CURRENT_DATE,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  temperature_c NUMERIC(4,1) NOT NULL,
  humidity_pct NUMERIC(5,1) NOT NULL,
  wind_kph NUMERIC(5,1),
  rain_mm NUMERIC(6,1),
  condition TEXT,
  UNIQUE (farm_id, observed_date)
);

CREATE INDEX IF NOT EXISTS weather_observations_farm_idx ON weather_observations(farm_id, observed_at DESC);
