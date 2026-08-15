-- Prepare oauth_accounts for multi-provider identity linking
-- Preserves all existing users, passwords, phone accounts, farms, roles, permissions, sessions

-- 1. Add name and updated_at to oauth_accounts
ALTER TABLE oauth_accounts
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- 2. Prevent the same provider from being linked twice to one user
--    (provider, provider_account_id) is already unique across all users
--    This adds the per-user uniqueness guard.
DROP INDEX IF EXISTS oauth_accounts_user_id_provider_key;
CREATE UNIQUE INDEX IF NOT EXISTS oauth_accounts_user_id_provider_key
  ON oauth_accounts (user_id, provider);

-- 3. Auto-update updated_at on row changes
CREATE OR REPLACE FUNCTION update_oauth_accounts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS oauth_accounts_updated_at ON oauth_accounts;
CREATE TRIGGER oauth_accounts_updated_at
  BEFORE UPDATE ON oauth_accounts
  FOR EACH ROW EXECUTE FUNCTION update_oauth_accounts_updated_at();
