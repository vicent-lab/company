-- Expands account_type from the two-flow (owner/team_member) shorthand to the actual
-- self-identification list shown at signup. The *flow* (does this person create a farm,
-- wait to be invited, or get an auto-provisioned demo farm?) is derived from this value in
-- application code (see apps/server/src/lib/account-types.ts) — the column itself is just
-- what the person said they are, kept for display (e.g. the "waiting for invite" hint).
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_account_type_check;

-- Old rows used the pre-expansion values; map them onto their closest equivalent before
-- the new (narrower-named) constraint goes on, so existing accounts don't fail validation.
UPDATE users SET account_type = 'farm_owner' WHERE account_type = 'owner';
UPDATE users SET account_type = 'farm_worker' WHERE account_type = 'team_member';

ALTER TABLE users ADD CONSTRAINT users_account_type_check CHECK (account_type IN (
  'farm_owner', 'dairy_cooperative', 'research_institution',
  'farm_manager', 'veterinarian', 'farm_worker', 'accountant',
  'student_demo'
));
