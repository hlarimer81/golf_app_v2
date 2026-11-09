-- =============================================================================================
-- Adds the matches.vegas JSONB column: per-round options for a regular Vegas game, so a choice
-- made on one phone survives a refresh and shows on every phone in the round. Wolf Vegas keeps
-- its own state in matches.wolf_vegas.
--
-- Schema shape (all optional):
--   {
--     "grossBirdies": bool   -- true (default) = only a natural birdie flips the other side's
--                            -- number; false = a net birdie (a stroke making par a birdie) does too
--   }
--
-- A null value means a round that has changed nothing: gross birdies.
--
-- matches is an existing table, so its grants and RLS policies already cover a new column;
-- no GRANT or policy is needed. No new function, so nothing to revoke.
--
-- Safe to re-run. Apply directly on production (there is no staging step).
-- =============================================================================================

ALTER TABLE matches
ADD COLUMN IF NOT EXISTS vegas JSONB;

COMMENT ON COLUMN matches.vegas IS
  'Vegas round options: the gross/net birdie-flip choice (see src/useVegasState.js and src/VegasGrid.jsx).';

-- Verify: expect one row, data_type jsonb, is_nullable YES.
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'matches' AND column_name = 'vegas';

-- Verify: the Data API roles can read and write it (expect true, true, true, true).
SELECT has_column_privilege('anon', 'public.matches', 'vegas', 'SELECT')          AS anon_select,
       has_column_privilege('anon', 'public.matches', 'vegas', 'UPDATE')          AS anon_update,
       has_column_privilege('authenticated', 'public.matches', 'vegas', 'SELECT') AS auth_select,
       has_column_privilege('authenticated', 'public.matches', 'vegas', 'UPDATE') AS auth_update;
