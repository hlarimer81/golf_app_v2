-- =============================================================================================
-- GROSS ROUNDS BANK AGAINST THE PLAYER'S REAL COURSE HANDICAP
--
-- WHY: golf_adjusted_gross() caps each hole at net double bogey using players.handicap. A round
-- set up with Scoring Mode: Gross saves every player with handicap 0 (src/App.jsx, savePlayers),
-- because that field is what the games play off and nobody gets strokes in a gross game. So every
-- gross round was banked as if everyone were scratch: each hole capped at par + 2. A 20-handicap's
-- triple bogey on the hardest hole counts as a double, the adjusted score comes out low, and the
-- index with it. Found while fixing issue #23.
--
-- THE FIX: record the course handicap separately, in players.course_handicap, in every round, and
-- cap from that. players.handicap keeps meaning "what the games play off" - eleven grids read it
-- to give strokes without checking use_handicaps, so putting the real number there in a gross
-- round would quietly turn every gross game into a net one.
--
-- WHAT A ROUND IS CAPPED AGAINST, in order:
--   1. players.course_handicap - every round set up after the app change that writes it.
--   2. players.handicap, if the round was NET - it is the course handicap there (playing
--      allowance and play-off-low are applied when the round is loaded, not when it is saved).
--   3. NULL, for an older GROSS round - the course handicap was never kept. golf_adjusted_gross()
--      already treats NULL as "no established handicap" and caps at par + 5, the WHS rule for it.
--      For anyone above about scratch that is far closer to the truth than par + 2.
--
-- ORDER OF DEPLOYMENT MATTERS: apply this BEFORE the app change that writes course_handicap.
-- PostgREST rejects an insert naming a column that does not exist, so the app change on its own
-- would stop every round from being set up. This file on its own is harmless: the column stays
-- NULL and banking behaves as described in 2 and 3.
--
-- FORWARD ONLY. Banking is ON CONFLICT DO NOTHING, so nothing already in round_differential
-- changes. Re-banking the gross rounds already banked is sql/handicap-rebank-gross-rounds.sql.
--
-- SAFE TO RE-RUN: ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE with the same signature (existing
-- grants on golf_adjusted_gross are kept).
-- =============================================================================================

BEGIN;

-- numeric, like the handicap golf_strokes_on_hole() takes. Nullable: NULL means "not recorded".
-- No GRANT needed: players is an existing table, and its table-level grants cover a new column.
ALTER TABLE players ADD COLUMN IF NOT EXISTS course_handicap numeric;

COMMENT ON COLUMN players.course_handicap IS
  'Course handicap shown at setup, kept in gross and net rounds alike. Used only to cap holes at '
  'net double bogey when banking. The games play off players.handicap, which is 0 in a gross round.';

CREATE OR REPLACE FUNCTION golf_adjusted_gross(p_match_id uuid, p_player_id uuid)
RETURNS TABLE (adjusted int, raw int, holes_scored int, par_played int)
LANGUAGE sql STABLE AS $$
    WITH m AS (SELECT course_pars, hole_indices, use_handicaps FROM matches WHERE id = p_match_id),
         h AS (SELECT coalesce(p.course_handicap,
                               CASE WHEN (SELECT use_handicaps FROM m) THEN p.handicap END) AS handicap
                 FROM players p WHERE p.id = p_player_id),
         capped AS (
            SELECT s.strokes,
                   m.course_pars[s.hole_number] AS hole_par,
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
    SELECT sum(capped_strokes)::int, sum(strokes)::int, count(*)::int, sum(hole_par)::int
      FROM capped;
$$;

COMMIT;


-- =============================================================================================
-- VERIFY.
-- =============================================================================================

-- 1. The column exists, numeric and nullable.
SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'players' AND column_name = 'course_handicap';

-- 2. The function now reads course_handicap and use_handicaps. Expect true, true.
SELECT position('course_handicap' IN prosrc) > 0 AS reads_course_handicap,
       position('use_handicaps'   IN prosrc) > 0 AS reads_use_handicaps
  FROM pg_proc WHERE proname = 'golf_adjusted_gross';

-- 3. What banking would now produce for the gross rounds still on file, against what was banked.
--    Read-only. raised = rounds whose adjusted score goes up (the bug); expect raised > 0 and
--    lowered = 0. This is also the preview for sql/handicap-rebank-gross-rounds.sql.
SELECT count(*)                                              AS gross_rounds_banked,
       count(*) FILTER (WHERE now_adj.adjusted > rd.adjusted_gross) AS raised,
       count(*) FILTER (WHERE now_adj.adjusted < rd.adjusted_gross) AS lowered
  FROM round_differential rd
  JOIN matches m  ON m.id = rd.match_id AND m.use_handicaps IS NOT TRUE
  JOIN players p  ON p.match_id = m.id AND p.player_name = rd.player_name
  CROSS JOIN LATERAL golf_adjusted_gross(m.id, p.id) now_adj;
