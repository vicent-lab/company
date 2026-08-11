-- Align breeding data model with the target schema:
-- Cow: mother_id, father_id (already exist)
-- BreedingRecord: cow_id, sire_id, breeding_date, method, technician
-- Pregnancy: cow_id, breeding_id, confirmation_date, status, expected_calving_date
-- Calving: cow_id, pregnancy_id, calving_date
-- Offspring: animal_id, mother_id, father_id

-- Extend breeding_records
ALTER TABLE breeding_records
  ADD COLUMN IF NOT EXISTS sire_id UUID REFERENCES cows(id),
  ADD COLUMN IF NOT EXISTS technician TEXT,
  ADD COLUMN IF NOT EXISTS breeding_date DATE;

UPDATE breeding_records
SET breeding_date = serviced_on
WHERE breeding_date IS NULL AND serviced_on IS NOT NULL;

ALTER TABLE breeding_records
  ALTER COLUMN breeding_date SET NOT NULL,
  DROP COLUMN IF EXISTS serviced_on;

-- Pregnancy table
CREATE TABLE IF NOT EXISTS pregnancies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  cow_id UUID NOT NULL REFERENCES cows(id) ON DELETE CASCADE,
  breeding_id UUID NOT NULL REFERENCES breeding_records(id) ON DELETE CASCADE,
  confirmation_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmed',
  expected_calving_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pregnancies_farm_cow_idx ON pregnancies(farm_id, cow_id);
CREATE INDEX IF NOT EXISTS pregnancies_breeding_idx ON pregnancies(breeding_id);

-- Update calving_records to link to pregnancy
ALTER TABLE calving_records
  ADD COLUMN IF NOT EXISTS pregnancy_id UUID REFERENCES pregnancies(id);

-- Offspring table
CREATE TABLE IF NOT EXISTS offspring (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  animal_id UUID NOT NULL REFERENCES cows(id) ON DELETE CASCADE,
  mother_id UUID NOT NULL REFERENCES cows(id) ON DELETE CASCADE,
  father_id UUID NOT NULL REFERENCES cows(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS offspring_mother_idx ON offspring(mother_id);
CREATE INDEX IF NOT EXISTS offspring_father_idx ON offspring(father_id);
CREATE INDEX IF NOT EXISTS offspring_animal_idx ON offspring(animal_id);

-- Drop legacy pregnancy_checks if it was only used as a temporary pregnancy model
DROP TABLE IF EXISTS pregnancy_checks CASCADE;
