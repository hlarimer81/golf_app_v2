-- =============================================================================================
-- ONE COURSE, ONE NAME
--
-- course_name is free text, recorded before the course picker existed, so a single course appears
-- under several names. Ames Golf And Country Club is the worst case - 125 of 199 banked rounds,
-- spread across four spellings:
--
--   AGCC Blues                 59 rows      Ames Golf & CC              12 rows
--   AGCC                       51 rows      Ames Golf And Country Club   3 rows
--
-- Any "courses played" view built on that text shows one course four times. This is the same
-- problem player_alias solved for people, and it is solved the same way: resolve to the canonical
-- name and store it.
--
-- WHERE THE CANONICAL NAME COMES FROM: matches.course_id, which was set and verified by
-- sql/handicap-rebank-real-course-data.sql. No new mapping rules and no new guesses - if that
-- migration was right about which course a round was played at, this is right too.
--
-- WHY THIS IS A ONE-TIME FIX, NOT A CHORE: createMatch() writes course_name from
-- golf_courses.name (via selectedCourseName), so every round created through the current app
-- already carries the canonical name. Only the pre-picker history needs repairing.
--
-- SAFE TO RE-RUN. Rows already canonical are left alone by the WHERE clause.
-- =============================================================================================

BEGIN;

-- ---------------------------------------------------------------------------------------------
-- 1. THE MATCHES.
--
-- Done first and on purpose. golf_bank_round() copies matches.course_name onto the differential,
-- so fixing only round_differential would let the old spellings come back the next time anything
-- re-banks. Fix the source, then the copies.
-- ---------------------------------------------------------------------------------------------
UPDATE matches m
   SET course_name = c.name
  FROM golf_courses c
 WHERE m.course_id = c.id
   AND m.course_name IS DISTINCT FROM c.name;

-- ---------------------------------------------------------------------------------------------
-- 2. THE BANKED ROUNDS.
--
-- Joined through matches rather than by name, so this inherits the rebank's course resolution
-- rather than re-deriving it from the very text it is trying to repair.
--
-- The 40 rows whose match has no course_id keep the name they have: Kiva Dunes, Peninsula Golf
-- Club, Lake Creek, Lake Creek White, Wapsipinicon, Deer Run Hamilton Illinois. None of those is
-- in golf_courses, so there is no canonical name to resolve to. They are free text and honest
-- about it.
-- ---------------------------------------------------------------------------------------------
UPDATE round_differential d
   SET course_name = c.name
  FROM matches m
  JOIN golf_courses c ON c.id = m.course_id
 WHERE d.match_id = m.id
   AND d.course_name IS DISTINCT FROM c.name;

COMMIT;


-- =============================================================================================
-- VERIFY. Expected (simulated against production on 2026-08-23):
--
--   131 differential rows renamed:
--      AGCC Blues     -> Ames Golf And Country Club   59
--      AGCC           -> Ames Golf And Country Club   51
--      Ames Golf & CC -> Ames Golf And Country Club   12
--      TCI            -> Tournament Club Of Iowa       4
--      Veenker Gold   -> Veenker Golf Course           3
--      Veenker Blue   -> Veenker Golf Course           2
--
--   40 rows keep free-text names (no course record)
--   H Larimer's course count drops from 12 to 9, with Ames as one row of 16 rounds
--   NO index changes - this touches names only, never a differential
-- =============================================================================================
SELECT course_name, count(*) AS rounds, count(DISTINCT canonical_name) AS players,
       min(played_on) AS first_played, max(played_on) AS last_played
  FROM round_differential
 GROUP BY course_name
 ORDER BY rounds DESC;

-- Confirm nothing about the handicaps moved.
SELECT canonical_name, handicap_index, rounds_available
  FROM handicap_summary
 WHERE handicap_index IS NOT NULL
 ORDER BY handicap_index DESC;
