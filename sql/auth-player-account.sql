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
-- RLS IS DELIBERATELY NOT ENABLED HERE. That is a decision, not an oversight.
--
-- Every other table in this schema has RLS on, so a future reader would reasonably assume this
-- one was missed. It was not. The whole app runs on the anon key with no row-level rules;
-- introducing RLS on one table without the rest is fake security, and introducing it everywhere
-- breaks every existing anon query. That work is scoped separately and is the largest remaining
-- piece of the auth story.
--
-- The consequence, stated plainly: any signed-in user can claim any canonical name and inherit
-- that person's rounds, money records included. For a single-user app that is irrelevant. The day
-- a second person signs in it is not, and the fix is the confirmation step already sketched in
-- TODAYS-PROGRESS-AND-NEXT-STEPS.md - the round host approves, or an existing account vouches.
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
