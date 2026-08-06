-- Multi-farm accounts: a user can belong to several farms, each with its own role there
-- (a vet might be an administrator on their own farm and a read-only consultant on a
-- client's). users.farm_id/role_id stay as-is and now mean "the farm currently active in
-- this session" — every existing route that reads req.user.farmId keeps working unchanged;
-- switching farms just re-issues a token pointed at a different membership row below.
CREATE TABLE IF NOT EXISTS user_farms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id),
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, farm_id)
);
CREATE INDEX IF NOT EXISTS user_farms_user_idx ON user_farms(user_id);

-- Backfill every existing user's current farm/role as their first (default) membership.
INSERT INTO user_farms (user_id, farm_id, role_id, is_default)
SELECT id, farm_id, role_id, true FROM users WHERE farm_id IS NOT NULL
ON CONFLICT (user_id, farm_id) DO NOTHING;

-- `sessions` already existed (user_id, token_hash, expires_at) but nothing wrote to it —
-- login just handed out a long-lived JWT with no way to revoke it. Extending it into a
-- real refresh-token store: access tokens become short-lived, refresh tokens are opaque
-- random strings hashed here, rotated on every use, and revocable (logout, password reset).
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS replaced_by UUID REFERENCES sessions(id);
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS farm_id UUID REFERENCES farms(id);
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS user_agent TEXT;
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id, revoked_at);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS password_reset_tokens_user_idx ON password_reset_tokens(user_id);

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS email_verification_tokens_user_idx ON email_verification_tokens(user_id);
