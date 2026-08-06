ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;

-- Backfill from the existing full-name column so pre-existing accounts still have
-- something sensible in first_name/last_name. `name` stays as the maintained
-- full-name column afterward (dozens of other routes join and display users.name),
-- kept in sync going forward as first_name || ' ' || last_name at write time.
UPDATE users
SET first_name = split_part(name, ' ', 1),
    last_name = NULLIF(substring(name FROM position(' ' IN name) + 1), '')
WHERE first_name IS NULL;
