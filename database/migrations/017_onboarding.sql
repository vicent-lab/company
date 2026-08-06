-- A newly registered account may not belong to any farm yet (owner hasn't created one,
-- or team-member hasn't been invited yet) — users.role_id has to become optional to allow
-- that, matching farm_id which was already nullable for exactly this reason.
ALTER TABLE users ALTER COLUMN role_id DROP NOT NULL;

-- Recorded at signup purely to route first-login onboarding to the right screen (owner ->
-- create a farm; team member -> wait to be invited). Not a permission boundary — anyone
-- can create additional farms later regardless of what they picked here.
ALTER TABLE users ADD COLUMN IF NOT EXISTS account_type TEXT CHECK (account_type IN ('owner', 'team_member'));

-- Invitations for people who don't have a DairyOS account yet. Accepting one (via the
-- signup form's invite token) creates their account and their user_farms membership in
-- the same transaction — see /auth/register's inviteToken handling.
CREATE TABLE IF NOT EXISTS farm_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role_id UUID NOT NULL REFERENCES roles(id),
  invited_by UUID REFERENCES users(id),
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS farm_invitations_email_idx ON farm_invitations(email);
CREATE INDEX IF NOT EXISTS farm_invitations_farm_idx ON farm_invitations(farm_id);
