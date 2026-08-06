-- AI Farm Advisor reasoning engine extensions
-- Adds feedback, evidence tracking, and calibration tables

CREATE TABLE ai_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
    insight_id UUID NOT NULL REFERENCES ai_insights(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id),
    helpful BOOLEAN,
    accurate BOOLEAN,
    urgent BOOLEAN,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ai_evidence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
    insight_id UUID REFERENCES ai_insights(id) ON DELETE CASCADE,
    rule_id TEXT NOT NULL,
    rule_version INT NOT NULL DEFAULT 1,
    signal TEXT NOT NULL,
    category TEXT NOT NULL,
    severity_hint TEXT NOT NULL,
    priority_hint INT NOT NULL DEFAULT 2,
    cow_id UUID REFERENCES cows(id) ON DELETE SET NULL,
    metrics JSONB DEFAULT '{}'::jsonb,
    supporting_rows JSONB DEFAULT '[]'::jsonb,
    base_confidence NUMERIC(3,2),
    final_confidence NUMERIC(3,2),
    used_in_insight BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ai_calibration (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
    rule_id TEXT NOT NULL,
    rule_version INT NOT NULL DEFAULT 1,
    total_feedback INT NOT NULL DEFAULT 0,
    positive_feedback INT NOT NULL DEFAULT 0,
    neutral_feedback INT NOT NULL DEFAULT 0,
    negative_feedback INT NOT NULL DEFAULT 0,
    accuracy NUMERIC(5,2),
    suppressed_until TIMESTAMPTZ,
    weight_override NUMERIC(3,2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(farm_id, rule_id, rule_version)
);

CREATE INDEX ai_feedback_farm_insight_idx ON ai_feedback(farm_id, insight_id);
CREATE INDEX ai_feedback_user_idx ON ai_feedback(user_id);
CREATE INDEX ai_evidence_farm_insight_idx ON ai_evidence(farm_id, insight_id);
CREATE INDEX ai_evidence_rule_idx ON ai_evidence(rule_id);
CREATE INDEX ai_calibration_farm_rule_idx ON ai_calibration(farm_id, rule_id);
