-- =============================================================================================
-- DROP THE "(tablet)" POLICIES
--
-- Found from the policy inventory on 2026-10-01:
--
--   courses  "courses update (tablet)"   UPDATE  {anon,authenticated}
--   players  "players update (tablet)"   UPDATE  {anon,authenticated}
--
-- Nothing in this repo creates them. They date from when the tablet app (score_play) shared this
-- database. It no longer does: score_play forked with its own schema, and no tablet writes here
-- (confirmed by Harold, 2026-10-01; "nothing else reads players" was established 2026-08-08).
--
-- WHAT CHANGES:
--   players - this was the ONLY UPDATE policy, so after this nobody can update a players row
--             through the API. The app never does: it inserts players and reads them. Functions
--             that rewrite names run as service_role and are not affected by RLS.
--   courses - no change in what is allowed. "anon update courses" still permits UPDATE; this
--             removes the duplicate. Whether courses should be writable at all is a separate
--             question - the app only reads it.
--
-- The firmware storage bucket is untouched. That is storage, not these tables.
--
-- Safe to re-run: DROP POLICY IF EXISTS.
-- =============================================================================================

DROP POLICY IF EXISTS "courses update (tablet)" ON public.courses;
DROP POLICY IF EXISTS "players update (tablet)" ON public.players;

-- ---------------------------------------------------------------------------------------------
-- Verify. The SQL editor shows only the last result, so run these one at a time.
-- ---------------------------------------------------------------------------------------------

-- Expect no rows.
SELECT tablename, policyname
  FROM pg_policies
 WHERE schemaname = 'public' AND policyname ILIKE '%tablet%';

-- Expect: courses has INSERT, SELECT, UPDATE (three policies); players has INSERT, SELECT (two).
SELECT tablename, string_agg(cmd, ', ' ORDER BY cmd) AS commands, count(*) AS policies
  FROM pg_policies
 WHERE schemaname = 'public' AND tablename IN ('courses', 'players')
 GROUP BY tablename
 ORDER BY tablename;
