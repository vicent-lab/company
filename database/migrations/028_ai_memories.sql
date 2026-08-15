-- AI memory store for long-term farm context
CREATE TABLE IF NOT EXISTS ai_memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  kind text NOT NULL,
  key text NOT NULL,
  value text NOT NULL,
  confidence numeric(3,2) DEFAULT 1.0,
  source text DEFAULT 'system',
  expires_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ai_memories_farm_kind_key_idx ON ai_memories (farm_id, kind, key);
CREATE INDEX IF NOT EXISTS ai_memories_farm_expires_idx ON ai_memories (farm_id, expires_at);
