-- Treatments need a status (Active/Recovering/Resolved) so the herd UI can show
-- which treatments are still ongoing; the initial schema only tracked diagnosis data.
ALTER TABLE treatments ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'Active';
