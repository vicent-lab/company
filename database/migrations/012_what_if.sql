-- What-if scenario simulation log
CREATE TABLE IF NOT EXISTS ai_whatif_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
    scenario TEXT NOT NULL,
    parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
    result JSONB NOT NULL DEFAULT '{}'::jsonb,
    user_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_whatif_logs_farm_idx ON ai_whatif_logs(farm_id, created_at DESC);
