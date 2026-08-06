ALTER TABLE farms ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE farms ADD COLUMN IF NOT EXISTS district TEXT;
ALTER TABLE farms ADD COLUMN IF NOT EXISTS farm_size_value NUMERIC(10,2);
ALTER TABLE farms ADD COLUMN IF NOT EXISTS farm_size_unit TEXT CHECK (farm_size_unit IN ('acres', 'hectares'));
ALTER TABLE farms ADD COLUMN IF NOT EXISTS expected_herd_size INTEGER;
ALTER TABLE farms ADD COLUMN IF NOT EXISTS primary_production TEXT CHECK (primary_production IN ('milk', 'beef', 'mixed'));
