-- =============================================================================================
-- RE-BANK HISTORY AGAINST REAL COURSE DATA
--
-- WHY: createMatch() never wrote course_pars or hole_indices, so all 58 banked matches carried
-- the column defaults - a par array summing to 72 whatever the course really was, and a stroke
-- index of 1,2,3...18. golf_bank_round() reads the MATCH, not the tee, so every differential in
-- round_differential was scored against par 72 and capped at net double bogey using hole NUMBER
-- as hole difficulty. Both errors push adjusted scores down, so every index is too low.
--
-- The app-side fix (src/App.jsx, createMatch) stops this for new rounds. This file repairs the
-- history that was already banked.
--
-- WHAT IT DOES NOT DO: invent data. 40 of 199 banked differentials are at courses that are not
-- in golf_courses at all (Lake Creek, Kiva Dunes, Wapsipinicon, Peninsula, Deer Run Hamilton
-- Illinois). Those are left exactly as they are. A wrong par is better than a guessed one.
--
-- REQUIRES sql/handicap-nine-hole.sql to have been applied: the golf_bank_round() below calls
-- golf_adjusted_gross() expecting its par_played output column, which that file added.
--
-- SAFE TO RE-RUN. Every step is idempotent - re-resolving finds the same matches, re-writing the
-- same arrays is a no-op, and the delete-then-bank pair rebuilds exactly what it removed.
-- =============================================================================================

BEGIN;

-- ---------------------------------------------------------------------------------------------
-- 0. A NINE IS RATED ON NINE HOLES.
--
-- This is a live bug, independent of the backfill, and it must be fixed FIRST or the backfill
-- will bank garbage. golf_bank_round() takes rating and slope straight from tee_boxes with no
-- holes check, while par_played is correctly derived from the holes actually scored. So a 9-hole
-- round at a rated course subtracts an EIGHTEEN-hole course rating (~70) from a NINE-hole
-- adjusted score (~38) and banks a differential around -32.
--
-- It has not corrupted anything yet only because no 9-hole match has ever had a tee_box_id, and
-- because golf_min_plausible_differential() would catch the result and exclude it - which means
-- the round would be silently DISCARDED rather than counted. The next nine played at a course
-- with tee data would hit this.
--
-- tee_boxes stores only the 18-hole rating, so halve it. Slope is a ratio and carries over.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION golf_bank_round(p_match_id uuid)
RETURNS int LANGUAGE plpgsql AS $$
DECLARE
    banked   int := 0;
    inserted int;
    m        record;
    pl       record;
    ag       record;
    v_rating numeric;
    v_slope  int;
    v_diff   numeric;
    required int;
    v_excl   text;
BEGIN
    SELECT id, holes, course_name, tee_box_id, created_at INTO m
      FROM matches WHERE id = p_match_id;
    IF NOT FOUND OR m.holes NOT IN (9, 18) THEN
        RETURN 0;
    END IF;
    required := m.holes;

    SELECT t.rating, t.slope INTO v_rating, v_slope
      FROM tee_boxes t WHERE t.id = m.tee_box_id;

    -- The fix. A 9-hole round is measured against a 9-hole rating.
    IF m.holes = 9 AND v_rating IS NOT NULL THEN
        v_rating := v_rating / 2.0;
    END IF;

    FOR pl IN SELECT id, player_name FROM players WHERE match_id = p_match_id LOOP
        SELECT * INTO ag FROM golf_adjusted_gross(p_match_id, pl.id);

        CONTINUE WHEN ag.holes_scored IS NULL OR ag.holes_scored < required
                   OR ag.par_played IS NULL OR ag.par_played = 0;

        -- Computed once instead of five times; the old body recomputed it inside every branch.
        v_diff := golf_differential(ag.adjusted, v_rating, v_slope, ag.par_played);

        SELECT e.reason INTO v_excl FROM handicap_excluded_name e
         WHERE lower(e.name) = lower(pl.player_name);

        INSERT INTO round_differential (
            match_id, player_name, canonical_name, played_on, course_name, holes,
            adjusted_gross, gross, course_rating, slope, par_total, differential, method,
            excluded, exclusion_reason)
        VALUES (
            p_match_id, pl.player_name, golf_canonical_name(pl.player_name),
            m.created_at::date, m.course_name, m.holes,
            ag.adjusted, ag.raw, v_rating, v_slope, ag.par_played, v_diff,
            CASE WHEN v_rating IS NOT NULL AND v_slope IS NOT NULL THEN 'whs' ELSE 'estimated' END,
            (v_excl IS NOT NULL OR v_diff < golf_min_plausible_differential()),
            CASE WHEN v_excl IS NOT NULL THEN v_excl
                 WHEN v_diff < golf_min_plausible_differential()
                   THEN 'implausible differential - suspect par array or team score' END)
        ON CONFLICT (match_id, player_name) DO NOTHING;

        GET DIAGNOSTICS inserted = ROW_COUNT;
        banked := banked + inserted;
    END LOOP;

    RETURN banked;
END $$;

ALTER FUNCTION golf_bank_round(uuid) SECURITY DEFINER SET search_path = public, pg_temp;
REVOKE EXECUTE ON FUNCTION golf_bank_round(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION golf_bank_round(uuid) TO anon, authenticated, service_role;


-- ---------------------------------------------------------------------------------------------
-- 1. RESOLVE EVERY MATCH WE CAN, INTO ONE TABLE.
--
-- Three disjoint sources, in descending order of certainty. Building the set first - rather than
-- running three UPDATEs and hoping - means step 3 re-banks exactly what step 2 changed, with no
-- chance of repairing a match and then failing to re-bank it, or the reverse.
--
--   A  the match already names a tee. These STILL carry the default par array, because
--      createMatch() wrote tee_box_id but never course_pars. Easy to miss.
--   B  course_name names the course AND the tee. Gains a real rating and slope, so it re-banks
--      as method 'whs'.
--   C  course_name names only the course. Par and stroke index are properties of the LAYOUT and
--      are identical across every legitimate tee at these courses, so they are safe to fix.
--      Rating and slope are tee-specific and stay unknown: tee_box_id is deliberately left NULL
--      and the round stays 'estimated', but measured against the right par instead of 72.
--
-- 'AGCC' and 'Ames Golf & CC' identify the course but not the tee, and Ames tees differ by up to
-- 7.6 strokes of rating. Guessing one would be inventing a differential.
--
-- The representative tee in C supplies the ARRAYS ONLY. At Ames seven tees share one stroke
-- index and two - the uppercase GOLD and RED - disagree; those two are corrupt duplicate imports
-- (GOLD is rated 73.1/121, harder than Black at 72.6/122, impossible for a forward tee), so the
-- seven-tee layout is the real one.
-- ---------------------------------------------------------------------------------------------
CREATE TEMP TABLE resolved ON COMMIT DROP AS
WITH tee_rule(match_name, course, tee) AS (VALUES
        ('AGCC Blues',            'Ames Golf And Country Club', 'Blue'),
        ('Veenker Gold',          'Veenker Golf Course',        'Gold'),
        ('Veenker Blue',          'Veenker Golf Course',        'Blue'),
        ('Honey Creek Golf Club', 'Honey Creek Golf Club',      'Blue')   -- its only tee
     ),
     course_rule(match_name, course, layout_tee) AS (VALUES
        ('AGCC',           'Ames Golf And Country Club', 'Blue'),
        ('Ames Golf & CC', 'Ames Golf And Country Club', 'Blue'),
        ('TCI',            'Tournament Club Of Iowa',    'Palmer')
     )
-- A: already has a tee
SELECT m.id, t.id AS tee_id, t.course_id, t.par, t.stroke_index, 'A'::text AS tier
  FROM matches m
  JOIN tee_boxes t ON t.id = m.tee_box_id
UNION ALL
-- B: name gives course and tee
SELECT m.id, t.id, c.id, t.par, t.stroke_index, 'B'
  FROM matches m
  JOIN tee_rule     r ON lower(m.course_name) = lower(r.match_name)
  JOIN golf_courses c ON lower(c.name)        = lower(r.course)
  JOIN tee_boxes    t ON t.course_id = c.id AND t.tee_name = r.tee
 WHERE m.tee_box_id IS NULL
UNION ALL
-- C: name gives course only; layout is still recoverable
SELECT m.id, NULL::uuid, c.id, t.par, t.stroke_index, 'C'
  FROM matches m
  JOIN course_rule  r ON lower(m.course_name) = lower(r.match_name)
  JOIN golf_courses c ON lower(c.name)        = lower(r.course)
  JOIN tee_boxes    t ON t.course_id = c.id AND t.tee_name = r.layout_tee
 WHERE m.tee_box_id IS NULL;

-- The three sources are disjoint by construction (A requires tee_box_id, B and C require it to
-- be NULL, and the two name lists do not overlap). Assert it rather than trust it - a match
-- resolved twice would be re-banked against whichever layout won, silently.
DO $$
DECLARE dupes int;
BEGIN
    SELECT count(*) INTO dupes FROM (SELECT id FROM resolved GROUP BY id HAVING count(*) > 1) x;
    IF dupes > 0 THEN
        RAISE EXCEPTION 'resolved contains % match(es) matched by more than one rule', dupes;
    END IF;
END $$;


-- ---------------------------------------------------------------------------------------------
-- 2. WRITE THE REAL LAYOUT ONTO THE MATCHES.
--
-- tee_box_id and course_id are only ever set, never cleared: a C row leaves a NULL tee alone.
-- ---------------------------------------------------------------------------------------------
UPDATE matches m
   SET course_pars  = r.par,
       hole_indices = r.stroke_index,
       course_id    = coalesce(r.course_id, m.course_id),
       tee_box_id   = coalesce(r.tee_id,    m.tee_box_id)
  FROM resolved r
 WHERE m.id = r.id;


-- ---------------------------------------------------------------------------------------------
-- 3. RE-BANK.
--
-- Deleting is required: banking is ON CONFLICT DO NOTHING, so an already-banked row would never
-- be updated in place. Nothing is lost by it - all 11 current exclusions are re-derived, six
-- from handicap_excluded_name (Matt, BVRMC Scramble, Guest 1) and five from the implausible
-- differential rule. No hand-made judgement lives only on these rows.
--
-- Only matches that now have real layout data are touched. The 40 differentials at unmapped
-- courses are not deleted and not re-banked.
-- ---------------------------------------------------------------------------------------------
DELETE FROM round_differential
 WHERE match_id IN (SELECT id FROM resolved);

SELECT coalesce(sum(golf_bank_round(id)), 0) AS differentials_rebanked FROM resolved;

COMMIT;


-- =============================================================================================
-- VERIFY. Expected after this runs (from the dry run against production data on 2026-08-20):
--
--   H Larimer 22.6 -> 23.8     Ryan B    9.3 -> 10.3     Karl M     13 -> 14
--   M Boeve   20.5 -> 21.5     Matt H    8.3 ->  9.5     Austin R   10 -> 11
--   Roger E   16.2 -> 16.9     Nick G    7.3 ->  8.9     W Cafferty  3 ->  4
--   Barry C   17.9 -> 18.4     Mindy B    21 -> 21.1     Arick L     1 ->  1 (Lake Creek unmapped)
--
--   estimated rows 175 -> 107;  excluded rows 11 -> 11;  total rows 199 -> 199
-- =============================================================================================
SELECT canonical_name, handicap_index, rounds_used, rounds_available, estimated_count, method
  FROM handicap_summary
 WHERE handicap_index IS NOT NULL
 ORDER BY handicap_index DESC;

SELECT count(*) FILTER (WHERE method = 'estimated') AS estimated,
       count(*) FILTER (WHERE excluded)             AS excluded,
       count(*)                                     AS total
  FROM round_differential;
