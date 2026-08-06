-- Autopilot execution log
CREATE TABLE IF NOT EXISTS ai_autopilot_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
    insight_id UUID NOT NULL REFERENCES ai_insights(id) ON DELETE CASCADE,
    rule_id TEXT NOT NULL,
    executed BOOLEAN NOT NULL DEFAULT false,
    requires_approval BOOLEAN NOT NULL DEFAULT false,
    executed_by TEXT NOT NULL DEFAULT 'system',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_autopilot_log_farm_idx ON ai_autopilot_log(farm_id, created_at DESC);
