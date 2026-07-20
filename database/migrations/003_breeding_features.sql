-- Breeding management features

-- Heat detection using wearable sensors
CREATE TABLE heat_detections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  cow_id UUID NOT NULL REFERENCES cows(id) ON DELETE CASCADE,
  detected_on TIMESTAMPTZ NOT NULL DEFAULT now(),
  confidence NUMERIC(3,2) NOT NULL DEFAULT 0.0,
  sensor_type TEXT DEFAULT 'wearable',
  activity_level NUMERIC(5,2),
  temperature_c NUMERIC(4,1),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- AI breeding recommendations
CREATE TABLE breeding_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  cow_id UUID NOT NULL REFERENCES cows(id) ON DELETE CASCADE,
  recommended_date DATE NOT NULL,
  recommended_sire TEXT,
  reason TEXT NOT NULL,
  confidence NUMERIC(3,2) NOT NULL DEFAULT 0.0,
  status TEXT NOT NULL DEFAULT 'pending',
  acted_on BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Genetic compatibility analysis
CREATE TABLE genetic_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  cow_id UUID NOT NULL REFERENCES cows(id) ON DELETE CASCADE,
  sire_id TEXT NOT NULL,
  compatibility_score NUMERIC(3,2) NOT NULL DEFAULT 0.0,
  inbreeding_coefficient NUMERIC(3,2),
  traits_analysis JSONB NOT NULL DEFAULT '{}',
  recommendation TEXT,
  analyzed_on TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Semen inventory management
CREATE TABLE semen_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  sire_name TEXT NOT NULL,
  breed TEXT NOT NULL,
  batch_number TEXT NOT NULL,
  quantity_doses INTEGER NOT NULL DEFAULT 0,
  storage_location TEXT,
  expiry_date DATE,
  cost_per_dose NUMERIC(10,2),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fertility statistics
CREATE TABLE fertility_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  conception_rate NUMERIC(5,2) DEFAULT 0.0,
  calving_rate NUMERIC(5,2) DEFAULT 0.0,
  abortion_rate NUMERIC(5,2) DEFAULT 0.0,
  avg_services_per_conception NUMERIC(3,2) DEFAULT 0.0,
  cows_serviced INTEGER DEFAULT 0,
  cows_pregnant INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Calving difficulty records
CREATE TABLE calving_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  cow_id UUID NOT NULL REFERENCES cows(id) ON DELETE CASCADE,
  calving_date DATE NOT NULL,
  difficulty_score INTEGER CHECK (difficulty_score >= 1 AND difficulty_score <= 5),
  assistance_required BOOLEAN NOT NULL DEFAULT false,
  assistance_type TEXT,
  veterinarian_name TEXT,
  calf_id UUID REFERENCES calves(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Twin birth tracking
CREATE TABLE twin_births (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  cow_id UUID NOT NULL REFERENCES cows(id) ON DELETE CASCADE,
  calving_id UUID NOT NULL REFERENCES calving_records(id) ON DELETE CASCADE,
  calf_1_id UUID NOT NULL REFERENCES calves(id),
  calf_2_id UUID NOT NULL REFERENCES calves(id),
  birth_type TEXT NOT NULL DEFAULT 'fraternal',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX heat_detections_farm_cow_idx ON heat_detections(farm_id, cow_id);
CREATE INDEX heat_detections_detected_on_idx ON heat_detections(detected_on DESC);
CREATE INDEX breeding_recommendations_farm_cow_idx ON breeding_recommendations(farm_id, cow_id);
CREATE INDEX genetic_analysis_farm_cow_idx ON genetic_analysis(farm_id, cow_id);
CREATE INDEX semen_inventory_farm_idx ON semen_inventory(farm_id);
CREATE INDEX fertility_stats_farm_period_idx ON fertility_stats(farm_id, period_start, period_end);
CREATE INDEX calving_records_farm_cow_idx ON calving_records(farm_id, cow_id);
CREATE INDEX twin_births_farm_cow_idx ON twin_births(farm_id, cow_id);
