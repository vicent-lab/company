-- Keep every existing user and their role/memberships intact while retiring the four
-- deprecated signup choices. account_type is only onboarding self-identification, so
-- normalizing it does not change permissions or farm access.
UPDATE users
SET account_type = CASE account_type
  WHEN 'dairy_cooperative' THEN 'farm_owner'
  WHEN 'research_institution' THEN 'farm_owner'
  WHEN 'student_demo' THEN 'farm_owner'
  WHEN 'accountant' THEN 'farm_worker'
  ELSE account_type
END
WHERE account_type IN ('dairy_cooperative', 'research_institution', 'student_demo', 'accountant');

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_account_type_check;
ALTER TABLE users ADD CONSTRAINT users_account_type_check CHECK (account_type IN (
  'farm_owner', 'farm_manager', 'veterinarian', 'farm_worker'
));
