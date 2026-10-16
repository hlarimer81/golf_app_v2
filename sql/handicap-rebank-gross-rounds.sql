-- =============================================================================================
-- RE-SCORE GROSS ROUNDS ALREADY BANKED AS IF EVERYONE WERE SCRATCH
--
-- REQUIRES sql/handicap-gross-course-handicap.sql to have been applied first: this recomputes
-- adjusted gross with the golf_adjusted_gross() defined there.
--
-- WHY: every round set up with Scoring Mode: Gross saved each player's handicap as 0, and banking
-- capped holes at net double bogey from that number - par + 2 on every hole, for everyone. Those
-- adjusted scores, and the indexes built on them, are too low. See the header of the file above.
--
-- WHAT IT CAN FIX: only gross rounds whose match is still on file. The course handicap was never
-- recorded for any of them, so they are re-capped at par + 5, the WHS rule for a player with no
-- established handicap. That is not exact, but it is the cap with no invented number in it, and for
-- anyone above about scratch it is far nearer the truth than par + 2. Rounds whose scores have
-- already been deleted by delete_old_matches() cannot be recomputed and are left as they are.
--
-- IN PLACE, NOT DELETE-AND-REBANK. Rows carry judgements that banking does not re-derive: the
-- Lake Creek exclusion (sql/handicap-exclude-lake-creek.sql) is by course name, and course_name was
-- rewritten to canonical names (sql/handicap-canonical-course-names.sql). Updating only
-- adjusted_gross and differential keeps every one of them.
--
-- A round only ever goes UP here: par + 5 is a looser cap than par + 2. So no row can newly fall
-- under golf_min_plausible_differential(). A row already excluded as implausible stays excluded
-- even if it no longer would be - it is left for a person to look at, not reversed silently.
--
-- GUARDED: a row is touched only if the raw gross recomputed from scores still equals the gross
-- that was banked. If the scores were edited after banking, the round is left alone rather than
-- re-scored against different strokes.
--
-- SAFE TO RE-RUN: the second run finds adjusted_gross already equal and changes nothing.
--
-- PREVIEW FIRST: query 3 at the bottom of sql/handicap-gross-course-handicap.sql counts the rows
-- this will change. Run it, then this.
--
-- NO TEMP TABLES, NO BEGIN/COMMIT. The Supabase SQL editor does not hold a script in one
-- transaction, so a temp table made ON COMMIT DROP vanishes the moment it is created (the first
-- version of this file failed with 42P01 "relation regross does not exist", changing nothing).
-- Instead: a guard that raises before anything is written, then ONE statement that updates and
-- returns what it changed - one statement is atomic on its own, and its result is the one the
-- editor shows.
-- =============================================================================================

-- 1. GUARD. Nothing should go down; if anything would, the assumptions above are wrong. Raising
--    here stops the script before step 2 runs.
DO $$
DECLARE lowered int;
BEGIN
    SELECT count(*) INTO lowered
      FROM round_differential rd
      JOIN matches m ON m.id = rd.match_id AND m.use_handicaps IS NOT TRUE
      JOIN players p ON p.match_id = m.id AND p.player_name = rd.player_name
      CROSS JOIN LATERAL golf_adjusted_gross(m.id, p.id) ag
     WHERE p.course_handicap IS NULL
       AND ag.raw = rd.gross
       AND ag.adjusted < rd.adjusted_gross;
    IF lowered > 0 THEN
        RAISE EXCEPTION '% round(s) would get a LOWER adjusted score - not expected, nothing changed', lowered;
    END IF;
END $$;

-- 2. RE-SCORE, and show per player what changed. An empty result means there was nothing to do
--    (or it has already been run).
WITH regross AS (
    SELECT rd.id,
           ag.adjusted AS new_adjusted,
           golf_differential(ag.adjusted, rd.course_rating, rd.slope, rd.par_total) AS new_differential
      FROM round_differential rd
      JOIN matches m ON m.id = rd.match_id AND m.use_handicaps IS NOT TRUE
      JOIN players p ON p.match_id = m.id AND p.player_name = rd.player_name
      CROSS JOIN LATERAL golf_adjusted_gross(m.id, p.id) ag
     WHERE p.course_handicap IS NULL               -- recorded after the fix: already banked right
       AND ag.raw = rd.gross                       -- the scores are the ones that were banked
       AND ag.adjusted IS DISTINCT FROM rd.adjusted_gross
),
old AS (
    SELECT rd.id, rd.canonical_name, rd.adjusted_gross, rd.differential
      FROM round_differential rd JOIN regross r ON r.id = rd.id
),
updated AS (
    UPDATE round_differential rd
       SET adjusted_gross = r.new_adjusted,
           differential   = r.new_differential
      FROM regross r
     WHERE rd.id = r.id
    RETURNING rd.id, rd.adjusted_gross, rd.differential
)
SELECT o.canonical_name,
       count(*)                                         AS rounds_rescored,
       sum(u.adjusted_gross - o.adjusted_gross)         AS strokes_added,
       round(avg(u.differential - o.differential), 2)   AS avg_differential_change
  FROM updated u JOIN old o ON o.id = u.id
 GROUP BY o.canonical_name
 ORDER BY o.canonical_name;


-- =============================================================================================
-- VERIFY, run separately afterwards.
-- =============================================================================================

-- A re-run finds nothing left to change. Expect 0.
SELECT count(*) AS still_to_rescore
  FROM round_differential rd
  JOIN matches m ON m.id = rd.match_id AND m.use_handicaps IS NOT TRUE
  JOIN players p ON p.match_id = m.id AND p.player_name = rd.player_name
  CROSS JOIN LATERAL golf_adjusted_gross(m.id, p.id) ag
 WHERE p.course_handicap IS NULL
   AND ag.raw = rd.gross
   AND ag.adjusted IS DISTINCT FROM rd.adjusted_gross;

-- Current indexes. Compare with Players & Handicaps before you ran this: anything that moved
-- should have moved UP - differentials only rise, and an index averages the lowest of them.
SELECT canonical_name, handicap_index, rounds_used, rounds_available, method
  FROM handicap_summary
 WHERE handicap_index IS NOT NULL
 ORDER BY canonical_name;
