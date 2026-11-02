-- =============================================================================================
-- Adds the matches.wolf JSONB column that keeps a Wolf round's partner picks, so they survive a
-- refresh, reach a second device that joins the round, and reach the Finish Round summary.
--
-- WHY (issue #46): the picks lived only in WolfGrid's React state. Every other view of the round -
-- another phone, a reopened tab, the summary - could tell who was Wolf from the hole number but
-- not who partnered whom, so it showed every player on 0 points and a false four-way tie.
--
-- Shape (src/useWolfState.js):
--   { "decisions": { "<holeNumber>": <partnerPlayerId> | "lone" } }
-- NULL means nothing decided yet. Who was Wolf is not stored; it follows from the rotation.
--
-- GRANTS / RLS: none needed. matches already has a table-level UPDATE grant to anon and
-- authenticated and its update policy (sql/rls-signed-in-writes.sql), which cover a new column the
-- same way they cover wolf_vegas. No new function, so nothing to revoke.
--
-- ORDER OF DEPLOYMENT: apply this BEFORE pushing the app change that writes the column. Until it
-- exists, saving a Wolf pick is refused (PGRST204) and logged to client_error.
--
-- Safe to re-run.
-- =============================================================================================

ALTER TABLE matches
ADD COLUMN IF NOT EXISTS wolf JSONB;

COMMENT ON COLUMN matches.wolf IS
  'Wolf live round state: per-hole partner picks, {"decisions": {"<hole>": <playerId> | "lone"}} '
  '(see src/useWolfState.js, src/lib/wolf.js and src/WolfGrid.jsx).';

-- So the Data API sees the new column now rather than on its next schema reload.
NOTIFY pgrst, 'reload schema';

-- Verify --------------------------------------------------------------------------------------

-- 1. The column exists. Expect one row: wolf | jsonb.
SELECT column_name, data_type
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'matches' AND column_name = 'wolf';

-- 2. anon and authenticated can still update matches. Expect true, true.
SELECT has_column_privilege('anon', 'public.matches', 'wolf', 'UPDATE') AS anon_can_update,
       has_column_privilege('authenticated', 'public.matches', 'wolf', 'UPDATE') AS authenticated_can_update;
