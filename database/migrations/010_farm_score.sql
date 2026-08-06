-- AI Farm Score: daily snapshots of 9 category scores + overall farm health

CREATE TABLE ai_farm_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
    score_date DATE NOT NULL,
    health_score INTEGER NOT NULL CHECK (health_score BETWEEN 0 AND 100),
    nutrition_score INTEGER NOT NULL CHECK (nutrition_score BETWEEN 0 AND 100),
    breeding_score INTEGER NOT NULL CHECK (breeding_score BETWEEN 0 AND 100),
    finance_score INTEGER NOT NULL CHECK (finance_score BETWEEN 0 AND 100),
    milk_production_score INTEGER NOT NULL CHECK (milk_production_score BETWEEN 0 AND 100),
    inventory_score INTEGER NOT NULL CHECK (inventory_score BETWEEN 0 AND 100),
    biosecurity_score INTEGER NOT NULL CHECK (biosecurity_score BETWEEN 0 AND 100),
    worker_performance_score INTEGER NOT NULL CHECK (worker_performance_score BETWEEN 0 AND 100),
    animal_welfare_score INTEGER NOT NULL CHECK (animal_welfare_score BETWEEN 0 AND 100),
    overall_score INTEGER NOT NULL CHECK (overall_score BETWEEN 0 AND 100),
    breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(farm_id, score_date)
);

CREATE INDEX ai_farm_scores_farm_date_idx ON ai_farm_scores(farm_id, score_date DESC);
