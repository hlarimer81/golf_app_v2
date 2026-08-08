-- =============================================================================================
-- RLS AND GRANTS FOR THE HANDICAP SYSTEM
--
-- This project has now been bitten twice by the same pair of mistakes, so both are handled here
-- explicitly rather than assumed:
--
--   1. A GRANT is not a POLICY. Both must pass. Tables created by a script carry no privileges
--      for anon, so a request fails 42501 even with a permissive policy.
--   2. A POLICY is not a GRANT. RLS enabled with no policy answers "200 []" while holding rows.
--
-- WRITES GO THROUGH SECURITY DEFINER FUNCTIONS, NOT TABLE GRANTS. anon can execute
-- golf_bank_round() but has no INSERT or UPDATE on round_differential at all. That is the point:
-- banking is a controlled operation with validation and exclusion logic in it, and letting a
-- client write differentials directly would let it invent its own handicap. search_path is pinned
-- on the definer functions so the elevated rights cannot be hijacked by a shadowed table name.
-- =============================================================================================

-- ---------------------------------------------------------------------------------------------
-- Banking runs with the owner's rights so the caller needs no table privileges.
-- ---------------------------------------------------------------------------------------------
ALTER FUNCTION golf_bank_round(uuid)     SECURITY DEFINER SET search_path = public, pg_temp;
ALTER FUNCTION golf_sweep_unbanked()     SECURITY DEFINER SET search_path = public, pg_temp;

-- ---------------------------------------------------------------------------------------------
-- RLS: enabled everywhere, and every table gets a policy. An unreachable table is a bug.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE round_differential     ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_alias           ENABLE ROW LEVEL SECURITY;
ALTER TABLE handicap_excluded_name ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['round_differential','player_alias','handicap_excluded_name'] LOOP
        IF NOT EXISTS (SELECT 1 FROM pg_policies
                        WHERE schemaname='public' AND tablename=t
                          AND policyname = t || ' read') THEN
            -- Read is open: handicaps are shown to everyone in a round, and the app has no
            -- authentication to scope them by. There is deliberately NO write policy - writes
            -- happen only through golf_bank_round(), which is SECURITY DEFINER.
            EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO anon, authenticated USING (true)',
                           t || ' read', t);
            RAISE NOTICE 'created policy % read', t;
        END IF;
    END LOOP;
END $$;

-- ---------------------------------------------------------------------------------------------
-- Grants. SELECT only on the tables; the write path is the function.
-- ---------------------------------------------------------------------------------------------
GRANT SELECT ON public.round_differential     TO anon, authenticated;
GRANT SELECT ON public.player_alias           TO anon, authenticated;
GRANT SELECT ON public.handicap_excluded_name TO anon, authenticated;
GRANT SELECT ON public.handicap_summary       TO anon, authenticated;

-- REVOKE FIRST, AND FROM anon EXPLICITLY - not just PUBLIC.
--
-- Supabase ships `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon,
-- authenticated, service_role`, so EVERY function created here is executable by anon the moment
-- it exists. The grant lands on the role directly (proacl shows `anon=X/postgres`), so revoking
-- from PUBLIC does nothing at all.
--
-- That makes SECURITY DEFINER functions PUBLIC BY DEFAULT on this platform, which is the
-- dangerous direction to fail in. Measured, not assumed: golf_sweep_unbanked() was callable with
-- the anon key and returned a result. It drives a rebuild across every match in the database.
REVOKE EXECUTE ON FUNCTION golf_bank_round(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION golf_sweep_unbanked() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION golf_bank_round(uuid)                              TO anon, authenticated;
GRANT EXECUTE ON FUNCTION golf_handicap_index(text)                          TO anon, authenticated;
GRANT EXECUTE ON FUNCTION golf_course_handicap(numeric, int, numeric, int)   TO anon, authenticated;
GRANT EXECUTE ON FUNCTION golf_canonical_name(text)                          TO anon, authenticated;

-- Deliberately NOT granted to anon: golf_sweep_unbanked() is the maintenance backstop and runs
-- over every match in the database. It stays available to service_role only.
GRANT EXECUTE ON FUNCTION golf_sweep_unbanked() TO service_role;

-- ---------------------------------------------------------------------------------------------
-- Verify.
-- ---------------------------------------------------------------------------------------------
SELECT tablename, policyname, cmd, roles::text
  FROM pg_policies
 WHERE schemaname='public'
   AND tablename IN ('round_differential','player_alias','handicap_excluded_name')
 ORDER BY tablename;
