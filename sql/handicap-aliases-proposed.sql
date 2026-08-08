-- =============================================================================================
-- PROPOSED PLAYER ALIASES - REVIEW BEFORE RUNNING
--
-- Nothing here is applied automatically. Delete any line you disagree with, then run the file.
--
-- THE EVIDENCE: banked rounds split cleanly by date. Every short name appears between
-- 2026-04-10 and 2026-05-02; every long name starts 2026-05-08 or later. The ranges do not
-- overlap at all, which is what a change of naming convention looks like - the roster moved from
-- first name to first name + last initial in early May. Two people alternating between two
-- spellings would interleave; these do not.
--
-- Applying these merges each pair's rounds into one index. Ryan goes from 27 + 5 split across two
-- identities to 32 in one, which is the difference between a solid index and a solid index plus a
-- misleading second one.
--
-- Re-run golf_resync_canonical_names() afterwards (bottom of this file) so already-banked rows
-- pick up the new mapping. Banking stores canonical_name at write time, so existing rows do NOT
-- update themselves.
-- =============================================================================================


-- ---------------------------------------------------------------------------------------------
-- CONFIDENT: non-overlapping date ranges, and the long form exists in the roster.
-- ---------------------------------------------------------------------------------------------
INSERT INTO player_alias (alias_name, canonical_name) VALUES
    ('Ryan',     'Ryan B'),        -- Apr10-May02 (5)  ->  May08-Jul29 (27)
    ('Nick',     'Nick G'),        -- May02 (1)        ->  May08-Jul29 (23)
    ('Harold',   'H Larimer'),     -- Apr10-May02 (5)  ->  May10-Jul18 (17)
    ('Roger',    'Roger E'),       -- Apr10-May02 (5)  ->  May16-Jul17 (13)
    ('Boeve',    'M Boeve'),       -- Apr10-May02 (4)  ->  May10-Jul18 (10)
    ('Barry',    'Barry C'),       -- Apr10-Apr18 (3)  ->  Jun20-Jul18 (4)
    ('Karl',     'Karl M'),        -- Apr10-Apr18 (3)  ->  Jul18 (1)
    ('Cafferty', 'W Cafferty'),    -- Apr10-Apr18 (3)  ->  roster only, no banked rounds
    ('Rhonda',   'Rhonda B')       -- May10-May11 (2)  ->  roster only, no banked rounds
ON CONFLICT (alias_name) DO NOTHING;


-- ---------------------------------------------------------------------------------------------
-- ROSTER DUPLICATES: both spellings are roster rows, and their hand-entered handicaps DISAGREE.
-- Pick the canonical one; the hand-entered numbers are shown so you can see which looks right.
-- ---------------------------------------------------------------------------------------------
-- INSERT INTO player_alias (alias_name, canonical_name) VALUES
--     ('Jordan B',       'Jordan Burgie'),   -- hcp 15 vs 7   <-- 8 strokes apart, which is right?
--     ('Hampton',        'Justin Hampton'),  -- hcp  7 vs 8
--     ('Iiams',          'Chris Iiams'),     -- hcp 11 vs 11  (agree)
--     ('Hunzy',          'Andy Hunziker'),   -- hcp  9 vs 9   (agree)
--     ('Pyle',           'Ben Pyle')         -- hcp 12 vs 13
-- ON CONFLICT (alias_name) DO NOTHING;


-- ---------------------------------------------------------------------------------------------
-- AMBIGUOUS - DELIBERATELY NOT PROPOSED. There are at least two Matts.
--
--   Matt        Apr10-May02  5 rounds
--   Matt H      May16-Jul18  10 rounds   (roster, hcp 10)
--   Matt F      May08         1 round
--   Matt Flum   Jun05         1 round
--   Matt Adams  roster only, hcp 0
--
-- "Matt F" and "Matt Flum" are very likely one person. Which of them "Matt" is cannot be told
-- from the data - the dates do not separate them the way the others do. Guessing here would
-- silently merge two people's scores into one index, so it is left for you.
-- ---------------------------------------------------------------------------------------------
-- INSERT INTO player_alias (alias_name, canonical_name) VALUES
--     ('Matt F', 'Matt Flum'),
--     ('Matt',   '???')
-- ON CONFLICT (alias_name) DO NOTHING;


-- ---------------------------------------------------------------------------------------------
-- Re-resolve canonical_name on rows banked before an alias existed.
--
-- Needed because banking stores canonical_name at write time rather than joining through
-- player_alias on every read. That is the right trade - an index read stays a single-table scan,
-- and a round keeps the identity it was banked under if an alias is later removed - but it does
-- mean new aliases are not retroactive on their own.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION golf_resync_canonical_names()
RETURNS int LANGUAGE plpgsql AS $$
DECLARE n int;
BEGIN
    UPDATE round_differential d
       SET canonical_name = golf_canonical_name(d.player_name)
     WHERE d.canonical_name IS DISTINCT FROM golf_canonical_name(d.player_name);
    GET DIAGNOSTICS n = ROW_COUNT;
    RETURN n;
END $$;

SELECT golf_resync_canonical_names() AS rows_reassigned;

SELECT canonical_name, handicap_index, rounds_used, rounds_available, estimated_count
  FROM handicap_summary WHERE handicap_index IS NOT NULL
 ORDER BY rounds_available DESC;
