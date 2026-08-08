-- =============================================================================================
-- MERGE THE ROSTER DUPLICATES - Harold's call, 2026-08-08
--
-- Five people each hold two roster rows, so the player picker offers both and their rounds split
-- across two identities. This does two separate things, because they fix two separate problems:
--
--   1. player_alias        fixes ATTRIBUTION - which person a round's scores belong to.
--   2. deleting the row    fixes the PICKER  - App.jsx reads globalPlayers straight from
--                                              `players where match_id is null`, so an alias alone
--                                              leaves both names on screen at setup.
--
-- Only Jordan B has a banked round (1). The other four are roster-only, so for them this is purely
-- picker cleanup and no handicap changes.
--
-- WHICH HANDICAP SURVIVES:
--   Jordan Burgie   7 -> 15   set explicitly by Harold. The two rows disagreed by 8 strokes, so
--                             one was always wrong; 15 is the number he plays off.
--   Justin Hampton  8         canonical row kept (dup Hampton was 7)
--   Chris Iiams    11         canonical row kept (dup Iiams was 11 - agreed)
--   Andy Hunziker   9         canonical row kept (dup Hunzy was 9 - agreed)
--   Ben Pyle       13         canonical row kept (dup Pyle was 12)
--
-- The deletions remove ROSTER rows only (match_id IS NULL). Rows recording someone's seat in an
-- actual round carry a match_id and are untouched, so no historical scorecard changes. A guard
-- below refuses to run if that assumption is wrong.
-- =============================================================================================

BEGIN;

-- ---------------------------------------------------------------------------------------------
-- GUARD: refuse to delete a roster row that any score points at. If this raises, stop and look -
-- it means roster rows and in-round rows are not as cleanly separated as this script assumes.
-- ---------------------------------------------------------------------------------------------
DO $$
DECLARE bad int;
BEGIN
    SELECT count(*) INTO bad
      FROM scores s
      JOIN players p ON p.id = s.player_id
     WHERE p.match_id IS NULL
       AND p.player_name IN ('Jordan B','Hampton','Iiams','Hunzy','Pyle');
    IF bad > 0 THEN
        RAISE EXCEPTION 'ABORT: % score rows reference a roster row marked for deletion', bad;
    END IF;
END $$;

-- ---------------------------------------------------------------------------------------------
-- 1. Attribution.
-- ---------------------------------------------------------------------------------------------
INSERT INTO player_alias (alias_name, canonical_name) VALUES
    ('Jordan B', 'Jordan Burgie'),
    ('Hampton',  'Justin Hampton'),
    ('Iiams',    'Chris Iiams'),
    ('Hunzy',    'Andy Hunziker'),
    ('Pyle',     'Ben Pyle')
ON CONFLICT (alias_name) DO NOTHING;

SELECT golf_resync_canonical_names() AS rows_reassigned;

-- ---------------------------------------------------------------------------------------------
-- 2. The surviving handicap.
-- ---------------------------------------------------------------------------------------------
UPDATE players SET handicap = 15
 WHERE match_id IS NULL AND player_name = 'Jordan Burgie';

-- ---------------------------------------------------------------------------------------------
-- 3. The picker.
-- ---------------------------------------------------------------------------------------------
DELETE FROM players
 WHERE match_id IS NULL
   AND player_name IN ('Jordan B','Hampton','Iiams','Hunzy','Pyle');

COMMIT;

-- ---------------------------------------------------------------------------------------------
-- Verify: five names should remain, each once, with the handicaps above.
-- ---------------------------------------------------------------------------------------------
SELECT player_name, handicap FROM players
 WHERE match_id IS NULL
   AND player_name IN ('Jordan B','Jordan Burgie','Hampton','Justin Hampton','Iiams',
                       'Chris Iiams','Hunzy','Andy Hunziker','Pyle','Ben Pyle')
 ORDER BY player_name;

SELECT player_name, canonical_name, count(*) AS rounds
  FROM round_differential
 WHERE canonical_name IN ('Jordan Burgie','Justin Hampton','Chris Iiams','Andy Hunziker','Ben Pyle')
 GROUP BY 1,2 ORDER BY 2;
