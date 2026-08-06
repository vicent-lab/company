-- Continuous Learning: tracks prediction outcomes and learning events

CREATE TABLE IF NOT EXISTS ai_prediction_outcomes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    insight_id UUID NOT NULL REFERENCES ai_insights(id) ON DELETE CASCADE,
    farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
    signal_type TEXT NOT NULL,
    source TEXT NOT NULL,
    category TEXT NOT NULL,
    predicted_at TIMESTAMPTZ NOT NULL,
    check_date DATE NOT NULL,
    outcome TEXT NOT NULL CHECK (outcome IN ('success', 'failure', 'partial', 'unknown')),
    actual_value NUMERIC,
    predicted_value NUMERIC,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(insight_id, check_date)
);

CREATE TABLE IF NOT EXISTS ai_learning_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
    rule_id TEXT NOT NULL,
    signal_type TEXT NOT NULL,
    source TEXT NOT NULL,
    category TEXT NOT NULL,
    feedback TEXT NOT NULL CHECK (feedback IN ('positive', 'negative', 'neutral')),
    predicted_outcome TEXT,
    actual_outcome TEXT,
    confidence_delta NUMERIC(3,2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_prediction_outcomes_farm_check_idx ON ai_prediction_outcomes(farm_id, check_date DESC);
CREATE INDEX IF NOT EXISTS ai_prediction_outcomes_insight_idx ON ai_prediction_outcomes(insight_id);
CREATE INDEX IF NOT EXISTS ai_learning_events_farm_created_idx ON ai_learning_events(farm_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_learning_events_rule_idx ON ai_learning_events(rule_id);
