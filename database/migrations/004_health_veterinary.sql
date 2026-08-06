-- Health & Veterinary module

-- General health records (AI disease detection, body condition, lameness)
CREATE TABLE health_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  cow_id UUID NOT NULL REFERENCES cows(id) ON DELETE CASCADE,
  recorded_on DATE NOT NULL DEFAULT CURRENT_DATE,
  health_status TEXT NOT NULL DEFAULT 'healthy',
  body_condition_score INTEGER CHECK (body_condition_score >= 1 AND body_condition_score <= 9),
  lameness_score INTEGER CHECK (lameness_score >= 0 AND lameness_score <= 5),
  ai_detected_disease TEXT,
  ai_confidence NUMERIC(3,2),
  photo_url TEXT,
  notes TEXT,
  veterinarian_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Medicine inventory management
CREATE TABLE medicine_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  quantity_on_hand NUMERIC(12,2) NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'doses',
  reorder_level NUMERIC(12,2) NOT NULL DEFAULT 0,
  expiry_date DATE,
  batch_number TEXT,
  supplier TEXT,
  cost_per_unit NUMERIC(10,2),
  storage_requirements TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Laboratory test records
CREATE TABLE lab_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  cow_id UUID NOT NULL REFERENCES cows(id) ON DELETE CASCADE,
  test_type TEXT NOT NULL,
  sample_type TEXT NOT NULL,
  collected_on DATE NOT NULL DEFAULT CURRENT_DATE,
  results JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending',
  veterinarian_name TEXT,
  lab_name TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Parasite control schedules
CREATE TABLE parasite_control_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  cow_id UUID REFERENCES cows(id) ON DELETE CASCADE,
  treatment_type TEXT NOT NULL,
  product_name TEXT NOT NULL,
  scheduled_on DATE NOT NULL,
  administered_on DATE,
  status TEXT NOT NULL DEFAULT 'scheduled',
  dosage TEXT,
  veterinarian_name TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Quarantine management
CREATE TABLE quarantine_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  cow_id UUID NOT NULL REFERENCES cows(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE,
  location TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  test_results JSONB NOT NULL DEFAULT '{}',
  veterinarian_name TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Emergency health alerts
CREATE TABLE emergency_health_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  cow_id UUID REFERENCES cows(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'high',
  message TEXT NOT NULL,
  acknowledged BOOLEAN NOT NULL DEFAULT false,
  acknowledged_by UUID REFERENCES users(id),
  acknowledged_at TIMESTAMPTZ,
  resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX health_records_farm_cow_idx ON health_records(farm_id, cow_id);
CREATE INDEX health_records_recorded_on_idx ON health_records(recorded_on DESC);
CREATE INDEX medicine_inventory_farm_idx ON medicine_inventory(farm_id);
CREATE INDEX lab_tests_farm_cow_idx ON lab_tests(farm_id, cow_id);
CREATE INDEX parasite_control_farm_cow_idx ON parasite_control_schedules(farm_id, cow_id);
CREATE INDEX quarantine_records_farm_cow_idx ON quarantine_records(farm_id, cow_id);
CREATE INDEX emergency_alerts_farm_idx ON emergency_health_alerts(farm_id);
