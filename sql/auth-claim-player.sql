-- =============================================================================================
-- CLAIM A PLAYER: link a signed-in account to a canonical name, with a confirmation gate
--
-- Builds on auth-player-account.sql, which must already be applied.
--
-- THE RULE: the first account to claim a name is confirmed at once. Any later claim on a name that
-- already has a confirmed claimant is left PENDING until an admin approves it by hand (queries at
-- the bottom). While almost nobody has an account this costs nothing, and it means nobody can
-- quietly take over a name someone already holds.
--
-- What it does NOT stop, stated plainly: a stranger who signs up first can claim anyone's name
-- and be confirmed. The real owner's claim then goes pending, which is how it comes to light, and
-- the fix is the approve/reject queries below. Stronger rules (the round host approves, an existing
-- account vouches) can replace the "first claim wins" branch in the function without a schema
-- change.
--
-- WHY A FUNCTION AND NOT A TABLE GRANT: the same reason golf_bank_round() exists. If the client
-- could INSERT or UPDATE player_account directly, it could write status = 'confirmed' for itself
-- and the gate would be decoration. So INSERT and UPDATE are revoked from authenticated, and the
-- only way to write a claim is golf_claim_player(), which decides the status on the server.
-- Unlinking stays a direct DELETE of your own row: removing your own claim needs no gate.
--
-- Safe to re-run. Existing rows (if any) get status 'pending', the safe default.
-- =============================================================================================

ALTER TABLE public.player_account
    ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending'
        CHECK (status IN ('confirmed', 'pending'));

-- ---------------------------------------------------------------------------------------------
-- Writes go through the function. Reset the table's grants to exactly what the app uses.
--
-- REVOKE ALL first: until 2026-10-30 Supabase's default privileges hand anon and authenticated
-- ALL on every new table, so player_account almost certainly carries more than the GRANTs in
-- auth-player-account.sql listed. Revoking only INSERT and UPDATE would leave the rest in place.
-- ---------------------------------------------------------------------------------------------
REVOKE ALL ON public.player_account FROM anon, authenticated;
GRANT SELECT ON public.player_account TO anon, authenticated;
GRANT DELETE ON public.player_account TO authenticated;

DROP POLICY IF EXISTS "player_account insert own row" ON public.player_account;
DROP POLICY IF EXISTS "player_account update own row" ON public.player_account;
-- Kept from auth-player-account.sql: SELECT for anon + authenticated, DELETE of your own row.

-- ---------------------------------------------------------------------------------------------
-- golf_claim_player(name) -> 'confirmed' | 'pending'
--
-- One claim per account (account_id is the primary key), so claiming a different name replaces
-- the old claim, and goes through the same gate.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.golf_claim_player(p_name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_account uuid := auth.uid();
    v_name    text := golf_canonical_name(p_name);
    v_status  text;
BEGIN
    IF v_account IS NULL THEN
        RAISE EXCEPTION 'Sign in to claim a player' USING ERRCODE = '42501';
    END IF;

    -- Only names with rounds to inherit. Same test as handicap_summary, which feeds the list.
    IF NOT EXISTS (SELECT 1 FROM round_differential
                    WHERE canonical_name = v_name AND NOT excluded) THEN
        RAISE EXCEPTION 'No rounds found for %', v_name USING ERRCODE = 'P0002';
    END IF;

    -- Claiming the name you already hold changes nothing: it must not promote a pending claim,
    -- and must not demote a confirmed one.
    SELECT status INTO v_status
      FROM player_account
     WHERE account_id = v_account AND canonical_name = v_name;
    IF FOUND THEN
        RETURN v_status;
    END IF;

    -- Two first claims on one name arriving together must not both be confirmed. Serialise on
    -- the name for the rest of this transaction.
    PERFORM pg_advisory_xact_lock(hashtext('golf_claim_player:' || lower(v_name)));

    v_status := CASE
        WHEN EXISTS (SELECT 1 FROM player_account
                      WHERE canonical_name = v_name
                        AND status = 'confirmed'
                        AND account_id <> v_account)
        THEN 'pending'
        ELSE 'confirmed'
    END;

    INSERT INTO player_account (account_id, canonical_name, status)
    VALUES (v_account, v_name, v_status)
    ON CONFLICT (account_id) DO UPDATE
        SET canonical_name = EXCLUDED.canonical_name,
            status         = EXCLUDED.status,
            created_at     = now();

    RETURN v_status;
END $$;

-- Supabase grants EXECUTE on every new function to anon directly, so REVOKE FROM PUBLIC alone
-- is a no-op. Revoke by name, then grant back only to signed-in users.
REVOKE EXECUTE ON FUNCTION public.golf_claim_player(text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.golf_claim_player(text) TO authenticated;

-- ---------------------------------------------------------------------------------------------
-- Verify. The SQL editor shows only the last result, so run these one at a time.
-- ---------------------------------------------------------------------------------------------

-- Expect: anon SELECT; authenticated DELETE, SELECT. No INSERT or UPDATE for either.
SELECT grantee, string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privileges
  FROM information_schema.role_table_grants
 WHERE table_schema = 'public' AND table_name = 'player_account'
   AND grantee IN ('anon', 'authenticated')
 GROUP BY grantee
 ORDER BY grantee;

-- Expect two policies: SELECT for {anon,authenticated}, DELETE for {authenticated}.
SELECT policyname, cmd, roles
  FROM pg_policies
 WHERE schemaname = 'public' AND tablename = 'player_account'
 ORDER BY cmd;

-- Expect anon = false, authenticated = true.
SELECT has_function_privilege('anon',          'public.golf_claim_player(text)', 'EXECUTE') AS anon_can_claim,
       has_function_privilege('authenticated', 'public.golf_claim_player(text)', 'EXECUTE') AS authenticated_can_claim;

-- =============================================================================================
-- ADMIN: reviewing pending claims. Not part of the migration - run by hand when needed.
-- =============================================================================================
--
-- Who is waiting, and which email is behind each claim:
--
--   SELECT pa.account_id, pa.canonical_name, u.email, pa.created_at,
--          (SELECT string_agg(u2.email, ', ') FROM player_account c
--             JOIN auth.users u2 ON u2.id = c.account_id
--            WHERE c.canonical_name = pa.canonical_name AND c.status = 'confirmed') AS confirmed_holders
--     FROM player_account pa
--     JOIN auth.users u ON u.id = pa.account_id
--    WHERE pa.status = 'pending'
--    ORDER BY pa.created_at;
--
-- Approve (both accounts then hold the name - e.g. one person with two emails):
--
--   UPDATE player_account SET status = 'confirmed' WHERE account_id = '<account_id>';
--
-- Reject:
--
--   DELETE FROM player_account WHERE account_id = '<account_id>';
