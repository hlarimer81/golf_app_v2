-- =============================================================================================
-- Issue #77: Skins' "Carryover Skins" choice was never saved with the round. Reloading and
-- resuming (or joining by code, or reopening from Previous Rounds) fell back to the default of
-- carryover ON and re-scored every hole that way.
--
-- Adds matches.use_carryover. Existing rows get true, which is what every round has been scored
-- as on reopen until now, so nothing already on screen changes.
--
-- Apply BEFORE the app change ships: createMatch() writes this column for Skins rounds, and
-- PostgREST rejects an insert naming a column that does not exist (PGRST204).
--
-- Safe to re-run. Existing table, so no new GRANTs are needed.
-- =============================================================================================

ALTER TABLE matches
ADD COLUMN IF NOT EXISTS use_carryover boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN matches.use_carryover IS
  'Skins only: true = a tied hole carries its skin to the next hole; false = a tie pays nothing.';

-- ---------------------------------------------------------------------------------------------
-- Verify. Expect one row:
--   use_carryover | boolean | NO | true
-- ---------------------------------------------------------------------------------------------
SELECT column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'matches' AND column_name = 'use_carryover';
