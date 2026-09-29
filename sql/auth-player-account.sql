-- =============================================================================================
-- LINK AN ACCOUNT TO A PLAYER IDENTITY
--
-- The one schema change authentication needs. Everything else about auth is frontend work.
--
-- WHAT IT IS FOR: signing in does not change how a round is played. Nobody signs in to keep
-- score, and guests stay frictionless. An account exists so a person can look at THEIR rounds and
-- THEIR index as it has moved - which needs the app to know which player they are.
--
-- WHY canonical_name AND NOT A players ROW: handicap history hangs off
-- round_differential.canonical_name, a text identity that already works with no accounts at all.
-- golf_canonical_name() collapses aliases, so linking an account to a canonical name makes every
-- past AND future round follow automatically. Linking to a players row instead would re-solve a
-- problem player_alias already solved, and players rows are per-round anyway.
--
-- WHY A TABLE AND NOT A COLUMN ON players: one person can hold several accounts - a phone and an
-- iPad are two sessions, and a cleared browser is a third. A single column can only hold one, so
-- the second device would silently steal the first one's claim. Many account_ids, one canonical
-- name.
--
-- ------------------------------------------------------------------------------------------------
-- RLS IS ON, AND EACH ACCOUNT CAN WRITE ONLY ITS OWN ROW.
--
-- An earlier draft of this file left RLS off, reasoning that RLS on one table without the rest is
-- fake security. That holds for the tables the app writes as anon. It does not hold here: this
-- table is written only by signed-in users, so "your own row" (account_id = auth.uid()) is a
-- real rule that breaks no existing query. Without it, email sign-up is open to anyone who finds
-- the app, and any of them could reassign or delete every other golfer's claim.
--
-- What it still does NOT stop, stated plainly: a signed-in user can claim ANY canonical name for
-- their own account and see that person's rounds, money records included. The fix is the
-- confirmation step sketched in TODAYS-PROGRESS-AND-NEXT-STEPS.md - the round host approves, or
-- an existing account vouches - and it belongs to the claim flow, not to this table.
--
-- Safe to re-run: the table and index are IF NOT EXISTS, and each policy is dropped and recreated.
-- ------------------------------------------------------------------------------------------------
--
-- Two traps this project has already paid for, carried in here:
--   1. A GRANT is not a POLICY. A table created by a script carries no privileges for anon, so a
--      request fails 42501 even where a permissive policy exists. Grants below are explicit.
--   2. An UPDATE or DELETE refused by policy matches zero rows and does NOT raise. Every write
--      from the client must check its affected-row count. The claim flow chains .select() for
--      exactly this reason.
-- =============================================================================================

CREATE TABLE IF NOT EXISTS public.player_account (
    -- The auth.users id. A real foreign key, so deleting an account cleans up after itself rather
    -- than leaving a row pointing at nobody.
    account_id     uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,

    -- The identity that owns the rounds. Text, matching round_differential.canonical_name. No
    -- foreign key exists to point at - canonical names live in the differentials themselves and in
    -- player_alias, not in a table of their own.
    canonical_name text NOT NULL,

    created_at     timestamptz NOT NULL DEFAULT now()
);

-- The lookup the app actually makes on sign-in is by account_id, which the primary key covers.
-- This one answers the other direction - "who has claimed this name?" - which the claim screen
-- needs in order to say so before someone claims a name twice.
CREATE INDEX IF NOT EXISTS player_account_canonical_name_idx
    ON public.player_account (canonical_name);

-- ---------------------------------------------------------------------------------------------
-- Grants.
--
-- Reads are open to anon as well as authenticated: a query can fire before the session has
-- resolved, and a silent empty read is worse than an honest one. There is nothing sensitive in
-- the table - it maps an opaque uuid to a name that is already on the public player directory.
--
-- Writes are authenticated only. Claiming requires an account by construction, since the row's
-- own primary key is the account id, so this costs nothing and keeps the anon key - which ships
-- inside the client bundle - from being able to reassign anyone's history.
--
-- Note this app HAS no authenticated role today; that is precisely what this migration begins.
-- The mistake recorded in the progress log was granting to authenticated on an app that never
-- authenticates, leaving eight policies that matched nothing for weeks. Here the grant and the
-- caller arrive together.
-- ---------------------------------------------------------------------------------------------
GRANT SELECT                         ON public.player_account TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE         ON public.player_account TO authenticated;

-- ---------------------------------------------------------------------------------------------
-- Row-level security. The grants above say which roles may attempt a write; these say which rows.
--
-- (select auth.uid()) rather than bare auth.uid(): the subselect is evaluated once per statement
-- instead of once per row. Supabase's own recommendation, and free.
--
-- A refused UPDATE or DELETE matches zero rows and returns no error, so the client must chain
-- .select() and treat an empty result as a failure. A refused INSERT raises 42501.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE public.player_account ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "player_account readable by anyone" ON public.player_account;
CREATE POLICY "player_account readable by anyone"
    ON public.player_account FOR SELECT
    TO anon, authenticated
    USING (true);

DROP POLICY IF EXISTS "player_account insert own row" ON public.player_account;
CREATE POLICY "player_account insert own row"
    ON public.player_account FOR INSERT
    TO authenticated
    WITH CHECK (account_id = (select auth.uid()));

-- USING picks which rows can be touched; WITH CHECK stops an account from rewriting its row's
-- account_id to someone else's.
DROP POLICY IF EXISTS "player_account update own row" ON public.player_account;
CREATE POLICY "player_account update own row"
    ON public.player_account FOR UPDATE
    TO authenticated
    USING (account_id = (select auth.uid()))
    WITH CHECK (account_id = (select auth.uid()));

DROP POLICY IF EXISTS "player_account delete own row" ON public.player_account;
CREATE POLICY "player_account delete own row"
    ON public.player_account FOR DELETE
    TO authenticated
    USING (account_id = (select auth.uid()));

-- ---------------------------------------------------------------------------------------------
-- Verify.
-- ---------------------------------------------------------------------------------------------
SELECT tablename, rowsecurity AS rls_enabled
  FROM pg_tables
 WHERE schemaname = 'public' AND tablename = 'player_account';

SELECT grantee, string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privileges
  FROM information_schema.role_table_grants
 WHERE table_schema = 'public' AND table_name = 'player_account'
   AND grantee IN ('anon', 'authenticated')
 GROUP BY grantee
 ORDER BY grantee;

-- Expect four rows: SELECT for {anon,authenticated}, and INSERT, UPDATE, DELETE for {authenticated}.
SELECT policyname, cmd, roles
  FROM pg_policies
 WHERE schemaname = 'public' AND tablename = 'player_account'
 ORDER BY cmd;
