-- =============================================================================================
-- HANDICAP SYSTEM
--
-- WHS-style handicap indexes computed from played rounds, designed around one hard constraint:
-- delete_old_matches() destroys scores, players, teams and matches older than 30 days.
--
-- THE CENTRAL DECISION: a handicap is NOT computed on read from round history. It is computed
-- from round_differential rows banked at completion, one per player per round. That table is the
-- durable record; the round it came from is not. Computing on read would mean every index in the
-- app silently shifted as rounds aged out, with no error and no trace of what changed.
--
-- round_differential therefore carries NO FOREIGN KEY to matches. That is deliberate, not an
-- oversight: a FK with ON DELETE CASCADE would destroy the history, and ON DELETE SET NULL would
-- erase the provenance while breaking the unique key that prevents double-banking. match_id is a
-- plain uuid column, kept for traceability, and it is expected to point at nothing eventually.
--
-- SCOPE OF v1: 18-hole rounds only. 251 of 282 matches are 18-hole and 164 player-rounds are
-- fully scored, which is ample. WHS handles 9-hole rounds by pairing two of them into one
-- 18-hole differential; that is real work and is deliberately deferred rather than approximated,
-- because a wrong 9-hole differential is indistinguishable from a right one once banked.
-- =============================================================================================


-- ---------------------------------------------------------------------------------------------
-- 1. IDENTITY
--
-- Players are identified by free text player_name, and the same person appears under several
-- (Ryan B / Ryan, H Larimer / Harold, Jordan B / Jordan Burgie). Without this, one person's
-- rounds split across two indexes -- and the roster already disagrees with itself by 8 strokes
-- on Jordan. Aliases resolve to a canonical name at banking time AND are re-resolvable later,
-- because canonical_name is stored on the differential row.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS player_alias (
    alias_name      text PRIMARY KEY,
    canonical_name  text NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT alias_differs CHECK (lower(alias_name) <> lower(canonical_name))
);

COMMENT ON TABLE player_alias IS
    'Maps a name as typed onto a round to the canonical person. Populated by hand and reviewed; '
    'see sql/handicap-aliases-proposed.sql for the detected candidates.';

CREATE OR REPLACE FUNCTION golf_canonical_name(p_name text)
RETURNS text LANGUAGE sql STABLE AS $$
    SELECT coalesce(
        (SELECT a.canonical_name FROM player_alias a
          WHERE lower(a.alias_name) = lower(btrim(p_name)) LIMIT 1),
        btrim(p_name));
$$;


-- ---------------------------------------------------------------------------------------------
-- 2. THE DURABLE RECORD
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS round_differential (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Plain column, NOT a foreign key. See the header. Expected to dangle once the round ages out.
    match_id        uuid NOT NULL,

    player_name     text NOT NULL,          -- as typed on the round, kept for provenance
    canonical_name  text NOT NULL,          -- resolved through player_alias at banking time

    played_on       date NOT NULL,
    course_name     text,
    holes           smallint NOT NULL,

    adjusted_gross  smallint NOT NULL,      -- after net-double-bogey capping
    gross           smallint NOT NULL,      -- raw, for display and sanity checking
    course_rating   numeric(4,1),           -- null when unknown
    slope           smallint,               -- null when unknown
    par_total       smallint NOT NULL,

    differential    numeric(5,2) NOT NULL,

    -- 'whs'       real course rating and slope were used
    -- 'estimated' neither was known, so slope 113 / rating = par, i.e. strokes over par.
    --             ~90% of historical rounds land here; the flag is what keeps an index honest.
    method          text NOT NULL CHECK (method IN ('whs', 'estimated')),

    created_at      timestamptz NOT NULL DEFAULT now(),

    UNIQUE (match_id, player_name)          -- banking twice is a no-op, not a duplicate
);

-- Excluded rows are BANKED, not discarded. A round refused at banking time leaves no trace of
-- why, and the judgement that refused it cannot be revisited. Marking instead keeps the evidence
-- and makes every exclusion reversible with an UPDATE.
ALTER TABLE round_differential ADD COLUMN IF NOT EXISTS excluded boolean NOT NULL DEFAULT false;
ALTER TABLE round_differential ADD COLUMN IF NOT EXISTS exclusion_reason text;

CREATE INDEX IF NOT EXISTS round_differential_canonical_idx
    ON round_differential (canonical_name, played_on DESC) WHERE NOT excluded;

-- Names that are not people: scramble teams, guests, test entries. A scramble records ONE score
-- for a whole team, so banking it as an individual round produces a differential for a golfer who
-- does not exist - "BVRMC Scramble" arrived in this data with a -8.
CREATE TABLE IF NOT EXISTS handicap_excluded_name (
    name    text PRIMARY KEY,
    reason  text NOT NULL DEFAULT 'not an individual player'
);

INSERT INTO handicap_excluded_name (name, reason) VALUES
    ('BVRMC Scramble', 'scramble team, not an individual'),
    ('Guest 1',        'placeholder name reused across rounds')
ON CONFLICT (name) DO NOTHING;

-- A differential below this is not a good round, it is bad data. Scratch is 0; the best rounds in
-- this corpus outside the suspect ones sit at +2. Anything under -2 has meant a duplicated nine,
-- a wrong par array, or a team score.
CREATE OR REPLACE FUNCTION golf_min_plausible_differential() RETURNS numeric
LANGUAGE sql IMMUTABLE AS $$ SELECT -2.0::numeric $$;


-- ---------------------------------------------------------------------------------------------
-- 3. THE MATH
-- ---------------------------------------------------------------------------------------------

-- Strokes a player receives on one hole, given their handicap and the hole's stroke index.
CREATE OR REPLACE FUNCTION golf_strokes_on_hole(p_handicap numeric, p_stroke_index int)
RETURNS int LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE
        WHEN p_handicap IS NULL OR p_stroke_index IS NULL THEN 0
        ELSE floor(p_handicap / 18.0)::int
             + CASE WHEN p_stroke_index <= (round(p_handicap)::int % 18) THEN 1 ELSE 0 END
    END;
$$;

-- Adjusted Gross Score: each hole capped at net double bogey (par + 2 + strokes received).
--
-- The handicap used is the one the player actually played off that day (players.handicap), NOT
-- their current index. That sidesteps the chicken-and-egg where computing an index needs an
-- adjusted score which needs a course handicap which needs an index. Where no handicap was
-- recorded, WHS's rule for an unestablished handicap applies: cap at par + 5.
CREATE OR REPLACE FUNCTION golf_adjusted_gross(p_match_id uuid, p_player_id uuid)
RETURNS TABLE (adjusted int, raw int, holes_scored int)
LANGUAGE sql STABLE AS $$
    -- course_pars and hole_indices are Postgres integer[], 1-indexed, so hole_number indexes
    -- them directly. A hole_number beyond the array yields NULL, which coalesce turns into an
    -- uncapped stroke count rather than dropping the hole silently.
    WITH m AS (SELECT course_pars, hole_indices FROM matches WHERE id = p_match_id),
         h AS (SELECT handicap FROM players WHERE id = p_player_id),
         capped AS (
            SELECT s.strokes,
                   LEAST(s.strokes,
                         coalesce(
                           CASE WHEN (SELECT handicap FROM h) IS NULL
                                THEN m.course_pars[s.hole_number] + 5
                                ELSE m.course_pars[s.hole_number] + 2
                                     + golf_strokes_on_hole((SELECT handicap FROM h),
                                                            m.hole_indices[s.hole_number])
                           END, s.strokes)) AS capped_strokes
              FROM scores s CROSS JOIN m
             WHERE s.match_id = p_match_id AND s.player_id = p_player_id AND s.strokes > 0)
    SELECT sum(capped_strokes)::int, sum(strokes)::int, count(*)::int FROM capped;
$$;

-- Score Differential = (113 / slope) * (adjusted gross - course rating)
-- With no rating or slope, slope defaults to 113 and rating to par, so it reduces to
-- (adjusted gross - par): strokes over par. Crude, but honest and comparable across courses of
-- similar difficulty, which is what the 'estimated' flag exists to disclose.
CREATE OR REPLACE FUNCTION golf_differential(
    p_adjusted int, p_rating numeric, p_slope int, p_par int)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
    SELECT round(
        (113.0 / coalesce(nullif(p_slope, 0), 113)) * (p_adjusted - coalesce(p_rating, p_par)),
        2);
$$;

-- Course Handicap = Index * (Slope / 113) + (Course Rating - Par), rounded.
-- With neither rating nor slope this degrades to the index itself, which is the right neutral.
CREATE OR REPLACE FUNCTION golf_course_handicap(
    p_index numeric, p_slope int, p_rating numeric, p_par int)
RETURNS int LANGUAGE sql IMMUTABLE AS $$
    SELECT round(
        p_index * (coalesce(nullif(p_slope, 0), 113) / 113.0)
        + coalesce(p_rating - p_par, 0))::int;
$$;


-- ---------------------------------------------------------------------------------------------
-- 4. BANKING A ROUND
--
-- Idempotent: ON CONFLICT DO NOTHING, so re-running never double-counts. Returns how many
-- differentials it wrote, because a function that reports success having banked nothing is the
-- silent-failure pattern this project has already been bitten by twice.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION golf_bank_round(p_match_id uuid)
RETURNS int LANGUAGE plpgsql AS $$
DECLARE
    banked   int := 0;
    inserted int;
    m        record;
    pl       record;
    ag       record;
    v_par    int;
    v_rating numeric;
    v_slope  int;
BEGIN
    SELECT id, holes, course_name, course_pars, tee_box_id, created_at
      INTO m FROM matches WHERE id = p_match_id;
    IF NOT FOUND OR m.holes <> 18 THEN
        RETURN 0;                                   -- v1 banks 18-hole rounds only
    END IF;

    SELECT sum(p) INTO v_par FROM unnest(m.course_pars) AS p;

    SELECT t.rating, t.slope INTO v_rating, v_slope
      FROM tee_boxes t WHERE t.id = m.tee_box_id;

    FOR pl IN SELECT id, player_name FROM players WHERE match_id = p_match_id LOOP
        SELECT * INTO ag FROM golf_adjusted_gross(p_match_id, pl.id);

        CONTINUE WHEN ag.holes_scored IS NULL OR ag.holes_scored < 18;

        INSERT INTO round_differential (
            match_id, player_name, canonical_name, played_on, course_name, holes,
            adjusted_gross, gross, course_rating, slope, par_total, differential, method,
            excluded, exclusion_reason)
        VALUES (
            p_match_id, pl.player_name, golf_canonical_name(pl.player_name),
            m.created_at::date, m.course_name, m.holes,
            ag.adjusted, ag.raw, v_rating, v_slope, v_par,
            golf_differential(ag.adjusted, v_rating, v_slope, v_par),
            CASE WHEN v_rating IS NOT NULL AND v_slope IS NOT NULL THEN 'whs' ELSE 'estimated' END,
            -- Excluded, not refused: the row is kept with its reason so the call can be reviewed.
            (EXISTS (SELECT 1 FROM handicap_excluded_name e
                      WHERE lower(e.name) = lower(pl.player_name))
             OR golf_differential(ag.adjusted, v_rating, v_slope, v_par)
                < golf_min_plausible_differential()),
            CASE
              WHEN EXISTS (SELECT 1 FROM handicap_excluded_name e
                            WHERE lower(e.name) = lower(pl.player_name))
                THEN (SELECT e.reason FROM handicap_excluded_name e
                       WHERE lower(e.name) = lower(pl.player_name))
              WHEN golf_differential(ag.adjusted, v_rating, v_slope, v_par)
                   < golf_min_plausible_differential()
                THEN 'implausible differential - suspect par array or team score'
            END)
        ON CONFLICT (match_id, player_name) DO NOTHING;

        -- ROW_COUNT, not FOUND: ON CONFLICT DO NOTHING still reports FOUND on a suppressed
        -- insert, so counting off FOUND would report rows banked that were actually skipped.
        GET DIAGNOSTICS inserted = ROW_COUNT;
        banked := banked + inserted;
    END LOOP;

    RETURN banked;
END $$;


-- ---------------------------------------------------------------------------------------------
-- 5. THE INDEX
--
-- WHS 2020: average of the lowest 8 differentials from the most recent 20 rounds, with a table
-- of reductions for fewer than 20. Minimum 3 rounds; below that there is no index at all, which
-- is a real answer and must not be faked with a zero.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION golf_handicap_index(p_canonical text)
RETURNS TABLE (
    handicap_index   numeric,
    rounds_used      int,
    rounds_available int,
    estimated_count  int,
    method           text)
LANGUAGE plpgsql STABLE AS $$
DECLARE
    n int; take int; adjust numeric := 0;
BEGIN
    SELECT count(*) INTO n FROM (
        SELECT 1 FROM round_differential
         WHERE canonical_name = p_canonical AND NOT excluded
         ORDER BY played_on DESC LIMIT 20) x;

    IF n < 3 THEN
        RETURN QUERY SELECT NULL::numeric, 0, n, 0, 'insufficient'::text;
        RETURN;
    END IF;

    -- WHS table of (rounds considered -> lowest N, adjustment)
    SELECT t.take, t.adj INTO take, adjust FROM (VALUES
        (3,1,-2.0),(4,1,-1.0),(5,1,0.0),(6,2,-1.0),(7,2,0.0),(8,2,0.0),
        (9,3,0.0),(10,3,0.0),(11,3,0.0),(12,4,0.0),(13,4,0.0),(14,4,0.0),
        (15,5,0.0),(16,5,0.0),(17,6,0.0),(18,6,0.0),(19,7,0.0),(20,8,0.0)
    ) AS t(rounds, take, adj) WHERE t.rounds = n;

    RETURN QUERY
    WITH recent AS (
        SELECT d.differential, d.method AS m
          FROM round_differential d
         WHERE d.canonical_name = p_canonical AND NOT d.excluded
         ORDER BY d.played_on DESC LIMIT 20),
    lowest AS (
        SELECT differential FROM recent ORDER BY differential ASC LIMIT take)
    SELECT round(avg(l.differential) + adjust, 1),
           take,
           n,
           (SELECT count(*)::int FROM recent WHERE m = 'estimated'),
           CASE WHEN (SELECT count(*) FROM recent WHERE m = 'estimated') = 0
                THEN 'whs' ELSE 'mixed' END
      FROM lowest l;
END $$;

-- Every player who has any banked round, with their current index.
CREATE OR REPLACE VIEW handicap_summary AS
SELECT c.canonical_name, h.*
  FROM (SELECT DISTINCT canonical_name FROM round_differential WHERE NOT excluded) c
 CROSS JOIN LATERAL golf_handicap_index(c.canonical_name) h;


-- ---------------------------------------------------------------------------------------------
-- 6. BACKFILL AND BACKSTOP
--
-- golf_sweep_unbanked() is the backstop for the two ways the on-completion path fails: a round
-- nobody pressed Finish on, and a score corrected after the fact. Safe to run as often as you
-- like -- banking is idempotent.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION golf_sweep_unbanked()
RETURNS TABLE (matches_processed int, differentials_banked int)
LANGUAGE plpgsql AS $$
DECLARE r record; total int := 0; touched int := 0; got int;
BEGIN
    FOR r IN
        SELECT m.id FROM matches m
         WHERE m.holes = 18
           AND EXISTS (SELECT 1 FROM scores s WHERE s.match_id = m.id)
    LOOP
        got := golf_bank_round(r.id);
        IF got > 0 THEN touched := touched + 1; total := total + got; END IF;
    END LOOP;
    RETURN QUERY SELECT touched, total;
END $$;
