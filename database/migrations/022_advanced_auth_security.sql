-- Core role/permission reference data used to live only in the demo seed, which meant a
-- non-demo database would boot with zero roles. Moving it here (idempotent, ON CONFLICT
-- DO NOTHING) so it's always present, and extending it with the roles/permissions this
-- migration introduces.
INSERT INTO roles (name, description) VALUES
  ('administrator', 'Full access'),
  ('farm_manager', 'Operations'),
  ('veterinarian', 'Health care'),
  ('worker', 'Daily records'),
  ('accountant', 'Finance'),
  ('milk_collector', 'Milk records only'),
  ('viewer', 'Read-only access')
ON CONFLICT (name) DO NOTHING;

INSERT INTO permissions (code) VALUES
  ('farm:manage'), ('cow:manage'), ('milk:write'), ('health:manage'), ('finance:manage'), ('task:write')
ON CONFLICT (code) DO NOTHING;

-- administrator gets every permission that exists, automatically, including ones added above.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p WHERE r.name = 'administrator'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'farm_manager' AND p.code IN ('cow:manage', 'milk:write', 'health:manage', 'task:write')
ON CONFLICT DO NOTHING;

-- Veterinarian used to also hold cow:manage (general cow-profile editing), which is broader
-- than "health records only". Narrowed to health:manage alone.
DELETE FROM role_permissions
WHERE role_id = (SELECT id FROM roles WHERE name = 'veterinarian')
  AND permission_id = (SELECT id FROM permissions WHERE code = 'cow:manage');
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'veterinarian' AND p.code = 'health:manage'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'worker' AND p.code IN ('milk:write', 'task:write')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'accountant' AND p.code = 'finance:manage'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'milk_collector' AND p.code = 'milk:write'
ON CONFLICT DO NOTHING;
-- viewer intentionally gets no permission rows: read-only under the existing model, since
-- every write route is gated by requirePermission and reads never are.

-- Super Admin is a platform-wide flag, not a farm-scoped role — every existing role is
-- joined through user_farms (one farm at a time), but platform management spans all farms,
-- so it can't be modeled as a row in `roles` without breaking that join everywhere it's used.
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_pending_secret TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS users_phone_unique ON users(phone) WHERE phone IS NOT NULL;

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS ip_address TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS device_label TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS login_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  success BOOLEAN NOT NULL,
  reason TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS login_history_user_idx ON login_history(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS phone_otp_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS phone_otp_tokens_user_idx ON phone_otp_tokens(user_id);

-- Scaffolding for Google/Microsoft/Apple sign-in — populated once real OAuth credentials
-- are configured and the callback route links a provider account to a user.
CREATE TABLE IF NOT EXISTS oauth_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('google', 'microsoft', 'apple')),
  provider_account_id TEXT NOT NULL,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_account_id)
);

-- Self-hosted stand-in for reCAPTCHA/hCaptcha until real keys are configured — a simple
-- arithmetic challenge, answer hashed at rest same as every other token in this app.
CREATE TABLE IF NOT EXISTS captcha_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash TEXT NOT NULL,
  answer_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
