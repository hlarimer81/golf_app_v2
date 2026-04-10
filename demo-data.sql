-- Demo Data: 4-Ball Net Demo Match
-- Run this in your Supabase SQL Editor

-- 1. Create the match
INSERT INTO matches (match_name, use_handicaps, match_code, game_type, course_name, use_quota)
VALUES ('4ball Net Demo', true, 'DEMO4B', 'fourball', 'Ames Golf & CC', false)
RETURNING id;

-- NOTE: Replace {MATCH_ID} below with the ID returned from the above query
-- Or run this as a single transaction:

DO $$
DECLARE
  match_id UUID;
  team_a_id UUID;
  team_b_id UUID;
  team_c_id UUID;
  team_d_id UUID;
  ryan_id UUID;
  harold_id UUID;
  matt_id UUID;
  boeve_id UUID;
  cafferty_id UUID;
  barry_id UUID;
  roger_id UUID;
  karl_id UUID;
BEGIN
  -- Create match
  INSERT INTO matches (match_name, use_handicaps, match_code, game_type, course_name, use_quota)
  VALUES ('4ball Net Demo', true, 'DEMO4B', 'fourball', 'Ames Golf & CC', false)
  RETURNING id INTO match_id;

  -- Create teams
  INSERT INTO teams (match_id, team_name) VALUES (match_id, 'Team A') RETURNING id INTO team_a_id;
  INSERT INTO teams (match_id, team_name) VALUES (match_id, 'Team B') RETURNING id INTO team_b_id;
  INSERT INTO teams (match_id, team_name) VALUES (match_id, 'Team C') RETURNING id INTO team_c_id;
  INSERT INTO teams (match_id, team_name) VALUES (match_id, 'Team D') RETURNING id INTO team_d_id;

  -- Create players (Team A)
  INSERT INTO players (match_id, player_name, team_id, physical_group, handicap)
  VALUES (match_id, 'Ryan', team_a_id, 'Group 1', 10) RETURNING id INTO ryan_id;
  
  INSERT INTO players (match_id, player_name, team_id, physical_group, handicap)
  VALUES (match_id, 'Harold', team_a_id, 'Group 1', 20) RETURNING id INTO harold_id;

  -- Create players (Team B)
  INSERT INTO players (match_id, player_name, team_id, physical_group, handicap)
  VALUES (match_id, 'Matt', team_b_id, 'Group 1', 10) RETURNING id INTO matt_id;
  
  INSERT INTO players (match_id, player_name, team_id, physical_group, handicap)
  VALUES (match_id, 'Boeve', team_b_id, 'Group 1', 22) RETURNING id INTO boeve_id;

  -- Create players (Team C)
  INSERT INTO players (match_id, player_name, team_id, physical_group, handicap)
  VALUES (match_id, 'Cafferty', team_c_id, 'Group 2', 10) RETURNING id INTO cafferty_id;
  
  INSERT INTO players (match_id, player_name, team_id, physical_group, handicap)
  VALUES (match_id, 'Barry', team_c_id, 'Group 2', 19) RETURNING id INTO barry_id;

  -- Create players (Team D)
  INSERT INTO players (match_id, player_name, team_id, physical_group, handicap)
  VALUES (match_id, 'Roger', team_d_id, 'Group 2', 15) RETURNING id INTO roger_id;
  
  INSERT INTO players (match_id, player_name, team_id, physical_group, handicap)
  VALUES (match_id, 'Karl', team_d_id, 'Group 2', 18) RETURNING id INTO karl_id;

  -- Insert scores for all 8 players across 18 holes
  -- Ames Golf & CC pars: [5, 4, 4, 3, 4, 4, 4, 4, 3, 4, 4, 3, 5, 3, 5, 4, 4, 4]
  
  -- Ryan (10 HCP) - Good player, shoots around 82
  INSERT INTO scores (match_id, player_id, hole_number, strokes) VALUES
    (match_id, ryan_id, 1, 5),   -- Par 5: par
    (match_id, ryan_id, 2, 4),   -- Par 4: par
    (match_id, ryan_id, 3, 5),   -- Par 4: bogey
    (match_id, ryan_id, 4, 3),   -- Par 3: par
    (match_id, ryan_id, 5, 5),   -- Par 4: bogey
    (match_id, ryan_id, 6, 4),   -- Par 4: par
    (match_id, ryan_id, 7, 5),   -- Par 4: bogey
    (match_id, ryan_id, 8, 4),   -- Par 4: par
    (match_id, ryan_id, 9, 4),   -- Par 3: bogey
    (match_id, ryan_id, 10, 4),  -- Par 4: par
    (match_id, ryan_id, 11, 5),  -- Par 4: bogey
    (match_id, ryan_id, 12, 3),  -- Par 3: par
    (match_id, ryan_id, 13, 6),  -- Par 5: bogey
    (match_id, ryan_id, 14, 4),  -- Par 3: bogey
    (match_id, ryan_id, 15, 5),  -- Par 5: par
    (match_id, ryan_id, 16, 5),  -- Par 4: bogey
    (match_id, ryan_id, 17, 3),  -- Par 4: birdie!
    (match_id, ryan_id, 18, 4);  -- Par 4: par

  -- Harold (20 HCP) - Higher handicap, shoots around 92
  INSERT INTO scores (match_id, player_id, hole_number, strokes) VALUES
    (match_id, harold_id, 1, 6),   -- Par 5: bogey
    (match_id, harold_id, 2, 5),   -- Par 4: bogey
    (match_id, harold_id, 3, 6),   -- Par 4: double
    (match_id, harold_id, 4, 4),   -- Par 3: bogey
    (match_id, harold_id, 5, 5),   -- Par 4: bogey
    (match_id, harold_id, 6, 6),   -- Par 4: double
    (match_id, harold_id, 7, 5),   -- Par 4: bogey
    (match_id, harold_id, 8, 5),   -- Par 4: bogey
    (match_id, harold_id, 9, 4),   -- Par 3: bogey
    (match_id, harold_id, 10, 5),  -- Par 4: bogey
    (match_id, harold_id, 11, 6),  -- Par 4: double
    (match_id, harold_id, 12, 4),  -- Par 3: bogey
    (match_id, harold_id, 13, 5),  -- Par 5: par
    (match_id, harold_id, 14, 4),  -- Par 3: bogey
    (match_id, harold_id, 15, 6),  -- Par 5: bogey
    (match_id, harold_id, 16, 5),  -- Par 4: bogey
    (match_id, harold_id, 17, 5),  -- Par 4: bogey
    (match_id, harold_id, 18, 6);  -- Par 4: double

  -- Matt (10 HCP) - Good player, shoots around 80
  INSERT INTO scores (match_id, player_id, hole_number, strokes) VALUES
    (match_id, matt_id, 1, 4),   -- Par 5: birdie!
    (match_id, matt_id, 2, 4),   -- Par 4: par
    (match_id, matt_id, 3, 4),   -- Par 4: par
    (match_id, matt_id, 4, 3),   -- Par 3: par
    (match_id, matt_id, 5, 5),   -- Par 4: bogey
    (match_id, matt_id, 6, 4),   -- Par 4: par
    (match_id, matt_id, 7, 4),   -- Par 4: par
    (match_id, matt_id, 8, 5),   -- Par 4: bogey
    (match_id, matt_id, 9, 3),   -- Par 3: par
    (match_id, matt_id, 10, 5),  -- Par 4: bogey
    (match_id, matt_id, 11, 4),  -- Par 4: par
    (match_id, matt_id, 12, 2),  -- Par 3: birdie!
    (match_id, matt_id, 13, 5),  -- Par 5: par
    (match_id, matt_id, 14, 3),  -- Par 3: par
    (match_id, matt_id, 15, 6),  -- Par 5: bogey
    (match_id, matt_id, 16, 5),  -- Par 4: bogey
    (match_id, matt_id, 17, 4),  -- Par 4: par
    (match_id, matt_id, 18, 5);  -- Par 4: bogey

  -- Boeve (22 HCP) - Higher handicap, shoots around 94
  INSERT INTO scores (match_id, player_id, hole_number, strokes) VALUES
    (match_id, boeve_id, 1, 7),   -- Par 5: double
    (match_id, boeve_id, 2, 5),   -- Par 4: bogey
    (match_id, boeve_id, 3, 6),   -- Par 4: double
    (match_id, boeve_id, 4, 5),   -- Par 3: double
    (match_id, boeve_id, 5, 5),   -- Par 4: bogey
    (match_id, boeve_id, 6, 5),   -- Par 4: bogey
    (match_id, boeve_id, 7, 6),   -- Par 4: double
    (match_id, boeve_id, 8, 5),   -- Par 4: bogey
    (match_id, boeve_id, 9, 4),   -- Par 3: bogey
    (match_id, boeve_id, 10, 5),  -- Par 4: bogey
    (match_id, boeve_id, 11, 5),  -- Par 4: bogey
    (match_id, boeve_id, 12, 4),  -- Par 3: bogey
    (match_id, boeve_id, 13, 6),  -- Par 5: bogey
    (match_id, boeve_id, 14, 5),  -- Par 3: double
    (match_id, boeve_id, 15, 5),  -- Par 5: par
    (match_id, boeve_id, 16, 6),  -- Par 4: double
    (match_id, boeve_id, 17, 5),  -- Par 4: bogey
    (match_id, boeve_id, 18, 5);  -- Par 4: bogey

  -- Cafferty (10 HCP) - Good player, shoots around 81
  INSERT INTO scores (match_id, player_id, hole_number, strokes) VALUES
    (match_id, cafferty_id, 1, 5),   -- Par 5: par
    (match_id, cafferty_id, 2, 5),   -- Par 4: bogey
    (match_id, cafferty_id, 3, 4),   -- Par 4: par
    (match_id, cafferty_id, 4, 2),   -- Par 3: birdie!
    (match_id, cafferty_id, 5, 4),   -- Par 4: par
    (match_id, cafferty_id, 6, 5),   -- Par 4: bogey
    (match_id, cafferty_id, 7, 4),   -- Par 4: par
    (match_id, cafferty_id, 8, 5),   -- Par 4: bogey
    (match_id, cafferty_id, 9, 3),   -- Par 3: par
    (match_id, cafferty_id, 10, 4),  -- Par 4: par
    (match_id, cafferty_id, 11, 5),  -- Par 4: bogey
    (match_id, cafferty_id, 12, 3),  -- Par 3: par
    (match_id, cafferty_id, 13, 5),  -- Par 5: par
    (match_id, cafferty_id, 14, 4),  -- Par 3: bogey
    (match_id, cafferty_id, 15, 5),  -- Par 5: par
    (match_id, cafferty_id, 16, 4),  -- Par 4: par
    (match_id, cafferty_id, 17, 5),  -- Par 4: bogey
    (match_id, cafferty_id, 18, 5);  -- Par 4: bogey

  -- Barry (19 HCP) - Mid-high handicap, shoots around 91
  INSERT INTO scores (match_id, player_id, hole_number, strokes) VALUES
    (match_id, barry_id, 1, 6),   -- Par 5: bogey
    (match_id, barry_id, 2, 5),   -- Par 4: bogey
    (match_id, barry_id, 3, 5),   -- Par 4: bogey
    (match_id, barry_id, 4, 4),   -- Par 3: bogey
    (match_id, barry_id, 5, 6),   -- Par 4: double
    (match_id, barry_id, 6, 5),   -- Par 4: bogey
    (match_id, barry_id, 7, 5),   -- Par 4: bogey
    (match_id, barry_id, 8, 4),   -- Par 4: par
    (match_id, barry_id, 9, 4),   -- Par 3: bogey
    (match_id, barry_id, 10, 5),  -- Par 4: bogey
    (match_id, barry_id, 11, 5),  -- Par 4: bogey
    (match_id, barry_id, 12, 3),  -- Par 3: par
    (match_id, barry_id, 13, 6),  -- Par 5: bogey
    (match_id, barry_id, 14, 4),  -- Par 3: bogey
    (match_id, barry_id, 15, 7),  -- Par 5: double
    (match_id, barry_id, 16, 5),  -- Par 4: bogey
    (match_id, barry_id, 17, 4),  -- Par 4: par
    (match_id, barry_id, 18, 5);  -- Par 4: bogey

  -- Roger (15 HCP) - Mid handicap, shoots around 87
  INSERT INTO scores (match_id, player_id, hole_number, strokes) VALUES
    (match_id, roger_id, 1, 6),   -- Par 5: bogey
    (match_id, roger_id, 2, 4),   -- Par 4: par
    (match_id, roger_id, 3, 5),   -- Par 4: bogey
    (match_id, roger_id, 4, 3),   -- Par 3: par
    (match_id, roger_id, 5, 5),   -- Par 4: bogey
    (match_id, roger_id, 6, 4),   -- Par 4: par
    (match_id, roger_id, 7, 6),   -- Par 4: double
    (match_id, roger_id, 8, 5),   -- Par 4: bogey
    (match_id, roger_id, 9, 3),   -- Par 3: par
    (match_id, roger_id, 10, 5),  -- Par 4: bogey
    (match_id, roger_id, 11, 4),  -- Par 4: par
    (match_id, roger_id, 12, 4),  -- Par 3: bogey
    (match_id, roger_id, 13, 5),  -- Par 5: par
    (match_id, roger_id, 14, 3),  -- Par 3: par
    (match_id, roger_id, 15, 6),  -- Par 5: bogey
    (match_id, roger_id, 16, 5),  -- Par 4: bogey
    (match_id, roger_id, 17, 5),  -- Par 4: bogey
    (match_id, roger_id, 18, 5);  -- Par 4: bogey

  -- Karl (18 HCP) - Mid-high handicap, shoots around 90
  INSERT INTO scores (match_id, player_id, hole_number, strokes) VALUES
    (match_id, karl_id, 1, 5),   -- Par 5: par
    (match_id, karl_id, 2, 6),   -- Par 4: double
    (match_id, karl_id, 3, 5),   -- Par 4: bogey
    (match_id, karl_id, 4, 4),   -- Par 3: bogey
    (match_id, karl_id, 5, 5),   -- Par 4: bogey
    (match_id, karl_id, 6, 5),   -- Par 4: bogey
    (match_id, karl_id, 7, 5),   -- Par 4: bogey
    (match_id, karl_id, 8, 4),   -- Par 4: par
    (match_id, karl_id, 9, 4),   -- Par 3: bogey
    (match_id, karl_id, 10, 4),  -- Par 4: par
    (match_id, karl_id, 11, 6),  -- Par 4: double
    (match_id, karl_id, 12, 3),  -- Par 3: par
    (match_id, karl_id, 13, 6),  -- Par 5: bogey
    (match_id, karl_id, 14, 4),  -- Par 3: bogey
    (match_id, karl_id, 15, 5),  -- Par 5: par
    (match_id, karl_id, 16, 5),  -- Par 4: bogey
    (match_id, karl_id, 17, 6),  -- Par 4: double
    (match_id, karl_id, 18, 4);  -- Par 4: par

  RAISE NOTICE 'Demo match created with code: DEMO4B';
END $$;
