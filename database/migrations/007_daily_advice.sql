-- Daily Advice: structured morning farm report
CREATE TABLE ai_daily_advice (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
    advice_date DATE NOT NULL,
    farm_score INTEGER CHECK (farm_score BETWEEN 0 AND 100),
    priority_tasks JSONB DEFAULT '[]'::jsonb,
    urgent_alerts JSONB DEFAULT '[]'::jsonb,
    health_warnings JSONB DEFAULT '[]'::jsonb,
    milk_production_analysis JSONB DEFAULT '{}'::jsonb,
    feed_recommendations JSONB DEFAULT '[]'::jsonb,
    breeding_recommendations JSONB DEFAULT '[]'::jsonb,
    financial_summary JSONB DEFAULT '{}'::jsonb,
    inventory_warnings JSONB DEFAULT '[]'::jsonb,
    weather_advice JSONB DEFAULT '{}'::jsonb,
    employee_tasks JSONB DEFAULT '[]'::jsonb,
    suggested_improvements JSONB DEFAULT '[]'::jsonb,
    end_of_day_checklist JSONB DEFAULT '[]'::jsonb,
    estimated_profit_ugx NUMERIC(12,2),
    generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(farm_id, advice_date)
);

CREATE INDEX ai_daily_advice_farm_date_idx ON ai_daily_advice(farm_id, advice_date DESC);
