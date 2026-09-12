-- =============================================================================================
-- FAKE DATA FOR THE STAGING PROJECT (4play_staging)
--
-- Wipes every table in public and reloads a small, deterministic data set: two courses, a roster
-- of 12 fictional golfers, 20 completed rounds spread over the last 100 days (banked into real
-- handicaps), and one round in progress that testers can join with code LIVE01.
--
-- Run through scripts/staging-setup.sh, never by hand. The guard below refuses to run on any
-- database that lacks the staging_meta.marker table, which only the setup script creates.
-- Production never has it, so this file cannot truncate production even if pointed at it.
-- =============================================================================================

DO $$
BEGIN
    IF to_regclass('staging_meta.marker') IS NULL THEN
        RAISE EXCEPTION 'Refusing to seed: staging_meta.marker not found. This is not the staging database.';
    END IF;
END $$;

SET search_path = public;

TRUNCATE round_differential, scores, players, teams, matches, course_issues, course_requests,
         tee_boxes, golf_courses, player_alias, handicap_excluded_name, green_images, courses;

-- --- Courses ---------------------------------------------------------------------------------
-- Staging Pines has rated tees, so its rounds bank as method 'whs'. Staging Meadows has no rating
-- or slope, which is the normal case in production (~90% of rounds) and banks as 'estimated'.

INSERT INTO golf_courses (id, name, location, holes) VALUES
    ('00000000-0000-4000-a000-000000000001', 'Staging Pines',   'Ames, IA',   18),
    ('00000000-0000-4000-a000-000000000002', 'Staging Meadows', 'Ankeny, IA', 18);

INSERT INTO tee_boxes (id, course_id, tee_name, tee_color, rating, slope, par, stroke_index) VALUES
    ('00000000-0000-4000-a100-000000000001', '00000000-0000-4000-a000-000000000001', 'Blue',  'blue',  72.8, 131,
        '{4,5,3,4,4,5,3,4,4,4,4,3,5,4,4,3,5,4}', '{7,3,15,1,11,5,17,9,13,8,12,16,2,10,6,18,4,14}'),
    ('00000000-0000-4000-a100-000000000002', '00000000-0000-4000-a000-000000000001', 'White', 'white', 70.4, 124,
        '{4,5,3,4,4,5,3,4,4,4,4,3,5,4,4,3,5,4}', '{7,3,15,1,11,5,17,9,13,8,12,16,2,10,6,18,4,14}'),
    ('00000000-0000-4000-a100-000000000003', '00000000-0000-4000-a000-000000000001', 'Red',   'red',   68.1, 116,
        '{4,5,3,4,4,5,3,4,4,4,4,3,5,4,4,3,5,4}', '{7,3,15,1,11,5,17,9,13,8,12,16,2,10,6,18,4,14}'),
    ('00000000-0000-4000-a100-000000000004', '00000000-0000-4000-a000-000000000002', 'White', 'white', NULL, NULL,
        '{4,4,3,4,5,4,3,4,4,4,3,4,4,5,3,4,4,4}', '{5,9,17,1,3,13,15,7,11,6,18,2,10,4,16,12,8,14}');

-- --- Roster ----------------------------------------------------------------------------------
-- Rows with match_id NULL are the roster the setup screen's player picker reads. Nate Newbie plays
-- one round (below the 3-round minimum, so setup falls back to his roster number) and Gary Guest
-- plays none.

CREATE TEMP TABLE seed_roster (n int, name text, hcp numeric) ON COMMIT DROP;
INSERT INTO seed_roster VALUES
    (1, 'Sam Scratch', 1),  (2, 'Lou Lowman', 5),     (3, 'Ricky Rake', 8),  (4, 'Fran Fairway', 9),
    (5, 'Mia Middleton', 11), (6, 'Dot Divot', 14),   (7, 'Ben Bunker', 17), (8, 'Hank Hozel', 20),
    (9, 'Carl Chunk', 23),  (10, 'Wanda Wedge', 26),  (11, 'Nate Newbie', 18), (12, 'Gary Guest', 28);

INSERT INTO players (player_name, handicap) SELECT name, hcp FROM seed_roster;

-- --- Completed rounds ------------------------------------------------------------------------
-- Twenty foursomes rotating through the ten regulars, so each plays exactly eight rounds. Eight is
-- deliberate: WHS averages a player's best two differentials at that count, which is stable enough
-- to land near their real ability. At four rounds it takes the single best one, and one lucky round
-- drags the index absurdly low. Odd rounds at Staging Pines (White), even at Staging Meadows, one
-- every five days going back 100 days — rounds 1-6 fall inside the 30-day "Previous Rounds" window.

CREATE TEMP TABLE seed_match ON COMMIT DROP AS
SELECT m,
       format('00000000-0000-4000-b000-%s', lpad(m::text, 12, '0'))::uuid AS id,
       'STG' || lpad(m::text, 3, '0') AS code,
       (ARRAY['stableford', 'skins', 'singles'])[1 + (m - 1) % 3] AS game_type,
       CASE WHEN m % 2 = 1 THEN '00000000-0000-4000-a100-000000000002'::uuid
                           ELSE '00000000-0000-4000-a100-000000000004'::uuid END AS tee_box_id,
       now() - make_interval(days => m * 5) AS created_at
  FROM generate_series(1, 20) AS m;

INSERT INTO matches (id, created_at, match_name, match_code, status, game_type, play_mode,
                     use_handicaps, holes, start_hole, course_id, tee_box_id, course_name,
                     course_pars, hole_indices)
SELECT sm.id, sm.created_at, 'Staging round ' || sm.m, sm.code, 'completed', sm.game_type, 'singles',
       true, 18, 1, t.course_id, t.id, c.name, t.par, t.stroke_index
  FROM seed_match sm
  JOIN tee_boxes t ON t.id = sm.tee_box_id
  JOIN golf_courses c ON c.id = t.course_id;

INSERT INTO players (match_id, player_name, handicap)
SELECT sm.id, r.name, r.hcp
  FROM seed_match sm
 CROSS JOIN generate_series(0, 3) AS k
  JOIN seed_roster r ON r.n = ((sm.m - 1) * 4 + k) % 10 + 1
UNION ALL
SELECT sm.id, r.name, r.hcp
  FROM seed_match sm JOIN seed_roster r ON r.name = 'Nate Newbie'
 WHERE sm.m = 1;

-- --- Round in progress -----------------------------------------------------------------------
-- Status 'setup' is what an unfinished round looks like. Nine holes scored, so the nightly sweep
-- leaves it unbanked until someone finishes it.

INSERT INTO matches (id, created_at, match_name, match_code, status, game_type, play_mode,
                     use_handicaps, holes, start_hole, course_id, tee_box_id, course_name,
                     course_pars, hole_indices)
SELECT '00000000-0000-4000-b000-000000000099', now() - interval '1 hour', 'Staging live round',
       'LIVE01', 'setup', 'stableford', 'singles', true, 18, 1, t.course_id, t.id, c.name,
       t.par, t.stroke_index
  FROM tee_boxes t JOIN golf_courses c ON c.id = t.course_id
 WHERE t.id = '00000000-0000-4000-a100-000000000001';

INSERT INTO players (match_id, player_name, handicap)
SELECT '00000000-0000-4000-b000-000000000099', name, hcp
  FROM seed_roster
 WHERE name IN ('Mia Middleton', 'Dot Divot', 'Ben Bunker', 'Hank Hozel');

-- --- Scores ----------------------------------------------------------------------------------
-- Par, plus the strokes the player's handicap gives on that hole, plus deterministic noise from a
-- hash (not random(), so every reseed produces identical scores), never better than a birdie.
--
-- Two noise terms, sized so the computed index lands near the roster handicap:
--   -1..+1 per hole, about a 3.5-stroke spread per round, close to a real golfer's round-to-round
--     variation. Wider than this and WHS's best-of-N picks an implausibly low round.
--   +1 on roughly a fifth of holes, so players average ~3.5 strokes above their handicap, which is
--     what real scoring looks like. WHS then subtracts roughly that much by taking the best rounds.

INSERT INTO scores (match_id, player_id, hole_number, strokes)
SELECT p.match_id, p.id, h,
       greatest(m.course_pars[h] - 1,
                m.course_pars[h] + golf_strokes_on_hole(p.handicap, m.hole_indices[h])
                  + mod(abs(hashtext(p.match_id::text || p.player_name || h)::bigint), 3)::int - 1
                  + CASE WHEN mod(abs(hashtext(p.player_name || h || p.match_id::text)::bigint), 5) = 0
                         THEN 1 ELSE 0 END)
  FROM players p
  JOIN matches m ON m.id = p.match_id
 CROSS JOIN generate_series(1, 18) AS h
 WHERE m.match_code LIKE 'STG%'
    OR (m.match_code = 'LIVE01' AND h <= 9);

-- --- Bank the completed rounds into handicaps -------------------------------------------------

SELECT * FROM golf_sweep_unbanked();

SELECT canonical_name, handicap_index, rounds_used, method
  FROM handicap_summary
 ORDER BY handicap_index;
