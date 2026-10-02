-- =============================================================================================
-- LET A SIGNED-IN GOLFER DO WHAT A GUEST CAN
--
-- Found from the policy inventory on 2026-10-01. Two policies are granted TO anon only:
--
--   matches  "matches_update_anon"   UPDATE  {anon}
--   scores   "scores anon delete"    DELETE  {anon}
--
-- They were written when the app never signed anyone in, so every request arrived as anon. Since
-- sign-in shipped (2026-09-29) a signed-in golfer's requests arrive as `authenticated`, and no
-- policy on either table covers that role for these commands. So for a signed-in golfer:
--
--   - the wager, Nassau presses and Wolf Vegas state do not save      (UPDATE matches)
--   - Finish Round cannot mark the round complete, so it never banks  (UPDATE matches)
--   - clearing a score cell does not clear it                         (DELETE scores)
--
-- All three are refused silently: 200, zero rows. Signing in made the app work worse than
-- staying a guest - the same mistake as enable-rls-golf-tables.sql, the other way round.
--
-- THE FIX: the same two policies, for both roles. Nothing is opened that a guest could not
-- already do; this only stops signing in from taking it away. Tightening what anyone may write is
-- a separate piece of work.
--
-- The GRANTs are stated because a policy is not a grant. These tables predate 2026-10-30 and
-- almost certainly carry them already; granting again is harmless.
--
-- Safe to re-run: each policy is dropped and recreated.
-- =============================================================================================

GRANT UPDATE ON public.matches TO anon, authenticated;
GRANT DELETE ON public.scores  TO anon, authenticated;

DROP POLICY IF EXISTS "matches_update_anon"      ON public.matches;
DROP POLICY IF EXISTS "matches update by anyone" ON public.matches;
CREATE POLICY "matches update by anyone"
    ON public.matches FOR UPDATE
    TO anon, authenticated
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "scores anon delete"      ON public.scores;
DROP POLICY IF EXISTS "scores delete by anyone" ON public.scores;
CREATE POLICY "scores delete by anyone"
    ON public.scores FOR DELETE
    TO anon, authenticated
    USING (true);

-- ---------------------------------------------------------------------------------------------
-- Verify. The SQL editor shows only the last result, so run these one at a time.
-- ---------------------------------------------------------------------------------------------

-- Expect two rows, both with roles {anon,authenticated}:
--   matches | matches update by anyone | UPDATE
--   scores  | scores delete by anyone  | DELETE
SELECT tablename, policyname, cmd, roles
  FROM pg_policies
 WHERE schemaname = 'public'
   AND ((tablename = 'matches' AND cmd = 'UPDATE') OR (tablename = 'scores' AND cmd = 'DELETE'))
 ORDER BY tablename;

-- Expect true in all four columns.
SELECT has_table_privilege('anon',          'public.matches', 'UPDATE') AS anon_update_matches,
       has_table_privilege('authenticated', 'public.matches', 'UPDATE') AS auth_update_matches,
       has_table_privilege('anon',          'public.scores',  'DELETE') AS anon_delete_scores,
       has_table_privilege('authenticated', 'public.scores',  'DELETE') AS auth_delete_scores;
