-- =============================================================================================
-- CLIENT ERROR LOG
--
-- One row each time the app gives up on a save because the database refused it (see
-- src/lib/outbox.js and src/lib/saves.js). A save that fails for lack of signal is retried and
-- never lands here; this is only for the kind retrying cannot fix - a missing policy or grant, a
-- missing column, a deleted match - which until now showed up as nothing at all.
--
-- The golfer sees "This round isn't saving". This table is how Harold finds out why.
--
-- WHAT IS IN A ROW: which match, which table, what kind of write, and the error the database
-- gave. No scores, wagers or names.
--
-- WRITE-ONLY FOR THE APP. anon and authenticated may INSERT and nothing else: the anon key ships
-- in the client bundle, so anything it could read here, anyone could. Read it in the SQL editor.
-- Because the app cannot SELECT, it inserts without .select() - a refused INSERT raises 42501,
-- unlike a refused UPDATE, so nothing is hidden by that.
--
-- match_id is text with no foreign key on purpose: matches are disposable, and a log of what went
-- wrong should outlive the round it went wrong in.
--
-- Safe to re-run: IF NOT EXISTS on the table and index, grants are reset, the policy is dropped
-- and recreated.
--
-- The app does not depend on this file. Until it is applied the report insert fails quietly and
-- saving, retrying and the on-screen warning all work the same.
-- =============================================================================================

CREATE TABLE IF NOT EXISTS public.client_error (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    created_at  timestamptz NOT NULL DEFAULT now(),
    match_id    text,
    target      text NOT NULL,     -- the table being written: 'scores' or 'matches'
    action      text NOT NULL,     -- 'upsert', 'delete', or 'update <column>'
    http_status int,
    code        text,              -- Postgres/PostgREST code, or ZERO_ROWS for a silent refusal
    message     text,
    app_version text,
    user_agent  text,

    -- The insert is open to anyone holding the anon key, so cap what one row can carry.
    CONSTRAINT client_error_sizes CHECK (
        length(coalesce(match_id, ''))    <= 64  AND
        length(target)                    <= 64  AND
        length(action)                    <= 64  AND
        length(coalesce(code, ''))        <= 32  AND
        length(coalesce(message, ''))     <= 500 AND
        length(coalesce(app_version, '')) <= 64  AND
        length(coalesce(user_agent, ''))  <= 300
    )
);

CREATE INDEX IF NOT EXISTS client_error_created_at_idx
    ON public.client_error (created_at DESC);

-- ---------------------------------------------------------------------------------------------
-- Grants. REVOKE ALL first: before 2026-10-30 Supabase's default privileges hand anon everything
-- on a new table, and this one must not be readable with the public key.
-- ---------------------------------------------------------------------------------------------
REVOKE ALL    ON public.client_error FROM PUBLIC, anon, authenticated;
GRANT  INSERT ON public.client_error TO anon, authenticated;
GRANT  ALL    ON public.client_error TO service_role;

-- ---------------------------------------------------------------------------------------------
-- Row-level security. One policy, INSERT only. With no SELECT, UPDATE or DELETE policy those are
-- refused even if a grant were added by mistake later.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE public.client_error ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "client_error insert only" ON public.client_error;
CREATE POLICY "client_error insert only"
    ON public.client_error FOR INSERT
    TO anon, authenticated
    WITH CHECK (true);

-- ---------------------------------------------------------------------------------------------
-- Verify. The SQL editor shows only the last result, so run these one at a time.
-- ---------------------------------------------------------------------------------------------

-- Expect: anon INSERT; authenticated INSERT. Nothing else for either.
SELECT grantee, string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privileges
  FROM information_schema.role_table_grants
 WHERE table_schema = 'public' AND table_name = 'client_error'
   AND grantee IN ('anon', 'authenticated')
 GROUP BY grantee
 ORDER BY grantee;

-- Expect: rls_enabled = true, and one policy, cmd INSERT, roles {anon,authenticated}.
SELECT t.rowsecurity AS rls_enabled, p.policyname, p.cmd, p.roles
  FROM pg_tables t
  LEFT JOIN pg_policies p ON p.schemaname = t.schemaname AND p.tablename = t.tablename
 WHERE t.schemaname = 'public' AND t.tablename = 'client_error';

-- ---------------------------------------------------------------------------------------------
-- Reading it (not part of the migration).
-- ---------------------------------------------------------------------------------------------
-- SELECT created_at, match_id, target, action, http_status, code, message, app_version
--   FROM public.client_error
--  ORDER BY created_at DESC
--  LIMIT 50;
