-- =============================================================================================
-- EXCLUDE LAKE CREEK, PENDING A COURSE RECORD
--
-- Lake Creek is not in golf_courses, so it has no par array, no rating and no slope. Every round
-- played there is therefore scored against the DEFAULT par - 36 for a nine - which nothing
-- verifies. The result does not survive contact with the rest of the data:
--
--   mean differential per 18, Lake Creek      7.7   (n=13)
--   mean differential per 18, everywhere else 18.7  (n=175)
--
-- Eleven strokes is not a course being easy, it is a par that is wrong. The control is Nick G,
-- who has 26 rounds elsewhere: 11.2 elsewhere, 8.0 at Lake Creek. And the rest of the Lake Creek
-- roster is visibly not golf rounds - a player named 'PAR' shooting exactly 36, two team entries
-- ('Loew Chet Brett', 'Arick Lance Scramble'), and two "18-hole" rounds of 62 and 64 that are
-- almost certainly a nine recorded twice.
--
-- WHAT THIS COSTS: Arick L drops from a nonsense index of 1 to 7, which is what his two real
-- AGCC rounds say (9.89 and 13 over par). No other player's index moves at all.
--
-- WHY EXCLUDE RATHER THAN DELETE: round_differential keeps excluded rows on purpose - see the
-- header of sql/handicap-system.sql. The evidence stays, the judgement stays visible in
-- exclusion_reason, and the day someone enters Lake Creek's real par this is one UPDATE to undo:
--
--   UPDATE round_differential SET excluded = false, exclusion_reason = NULL
--    WHERE exclusion_reason = 'no course record - par assumed, differentials not trustworthy';
--
-- ...followed by re-running sql/handicap-rebank-real-course-data.sql with a Lake Creek rule added.
--
-- SAFE TO RE-RUN.
-- =============================================================================================

BEGIN;

-- ---------------------------------------------------------------------------------------------
-- 1. THE THREE NAMES THAT ARE NOT PEOPLE.
--
-- These belong in handicap_excluded_name rather than in the one-off update below, so that any
-- future round recorded under them is excluded at banking time without anyone having to notice.
-- 'PAR' is a placeholder row, the other two are teams. A team records ONE score for several
-- players, so banking it as an individual invents a golfer.
--
-- Deliberately NOT added: Chet, Jeff, Wilken, Loew, Avry Loew, Lance B. Those may well be real
-- people; they each have a single round and no index, so they cost nothing by staying.
-- ---------------------------------------------------------------------------------------------
INSERT INTO handicap_excluded_name (name, reason) VALUES
    ('PAR',                  'placeholder row, not a player'),
    ('Arick Lance Scramble', 'scramble team, not an individual'),
    ('Loew Chet Brett',      'three players on one card, not an individual')
ON CONFLICT (name) DO NOTHING;

-- Apply them to rounds already banked. Banking only consults this table at INSERT time, so rows
-- written before now are unaffected by the insert above.
UPDATE round_differential d
   SET excluded = true,
       exclusion_reason = e.reason
  FROM handicap_excluded_name e
 WHERE lower(d.player_name) = lower(e.name)
   AND NOT d.excluded;


-- ---------------------------------------------------------------------------------------------
-- 2. EVERY LAKE CREEK ROUND.
--
-- Matches both spellings in the data, 'Lake Creek' and 'Lake Creek White'. Rows already excluded
-- for another reason keep the reason they have - an implausible differential is a more specific
-- finding than this one and should not be overwritten.
-- ---------------------------------------------------------------------------------------------
UPDATE round_differential
   SET excluded = true,
       exclusion_reason = 'no course record - par assumed, differentials not trustworthy'
 WHERE course_name ILIKE '%lake creek%'
   AND NOT excluded;

COMMIT;


-- =============================================================================================
-- VERIFY. Expected (simulated against production data on 2026-08-20):
--
--   Arick L      1 (n=5)  ->  7 (n=3)
--   every other player unchanged
--   excluded rows 11 -> 24;  total rows unchanged at 199
-- =============================================================================================
SELECT canonical_name, handicap_index, rounds_used, rounds_available, estimated_count, method
  FROM handicap_summary
 WHERE handicap_index IS NOT NULL
 ORDER BY handicap_index DESC;

SELECT count(*) FILTER (WHERE excluded) AS excluded,
       count(*)                         AS total
  FROM round_differential;

-- What was excluded, and why.
SELECT exclusion_reason, count(*)
  FROM round_differential
 WHERE excluded
 GROUP BY exclusion_reason
 ORDER BY count(*) DESC;
