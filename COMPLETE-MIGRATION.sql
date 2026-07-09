-- ===========================================================================
-- COMPLETE GOLF COURSE MIGRATION
-- ===========================================================================
-- This file contains EVERYTHING needed to migrate to the new schema:
--   1. Create new tables (golf_courses + tee_boxes)
--   2. Migrate only the courses you actively use
--   3. Old 'courses' table remains untouched for your other app
--
-- SKIPPED: Craft Farms, Peninsula (Marsh/Lakes/Cypress), Kiva Dunes
--
-- Run this entire file in Supabase SQL Editor
-- ===========================================================================

-- STEP 1: Create new tables
-- ===========================================================================

CREATE TABLE IF NOT EXISTS golf_courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  location TEXT,
  holes INTEGER NOT NULL DEFAULT 18,
  greens JSONB,  -- GPS coordinates stored here (same for all tee boxes)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tee_boxes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES golf_courses(id) ON DELETE CASCADE,
  tee_name TEXT NOT NULL,
  tee_color TEXT,
  rating DECIMAL(4,1),
  slope INTEGER,
  par INTEGER[] NOT NULL,
  stroke_index INTEGER[] NOT NULL,
  yardage INTEGER[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(course_id, tee_name)
);

CREATE INDEX IF NOT EXISTS idx_tee_boxes_course_id ON tee_boxes(course_id);
CREATE INDEX IF NOT EXISTS idx_golf_courses_name ON golf_courses(name);


-- STEP 2: Migrate your courses
-- ===========================================================================
-- NOTE: Schema supports both 18-hole and 9-hole courses
--       For 9-hole courses (e.g., Peninsula), store each 9 separately with holes=9
--       and 9-element arrays. App combines two 9s at runtime for 18-hole rounds.
--
-- Example (not migrated, just showing the pattern):
-- DO $$
-- DECLARE course_id UUID;
-- BEGIN
--   -- Peninsula Marsh (9 holes)
--   INSERT INTO golf_courses (name, location, holes, greens)
--   SELECT 'Peninsula Club - Marsh', 'Gulf Shores, Alabama', 9, greens
--   FROM courses WHERE name = 'Peninsula Marsh' LIMIT 1
--   RETURNING id INTO course_id;
--
--   INSERT INTO tee_boxes (course_id, tee_name, rating, slope, par, stroke_index)
--   SELECT course_id, 'Blue', rating, slope, par, stroke_index
--   FROM courses WHERE name = 'Peninsula Marsh' LIMIT 1;
--   -- Repeat for Lakes and Cypress as separate courses
--   -- App lets users pick "Marsh + Lakes", "Lakes + Cypress", etc.
-- END $$;

-- 1. AGCC (currently only has Blues, you can add White/Gold/Red later)
DO $$
DECLARE course_id UUID;
BEGIN
  INSERT INTO golf_courses (name, location, holes, greens)
  SELECT 'AGCC', 'Ames, Iowa', 18, greens
  FROM courses WHERE name = 'AGCC Blues' LIMIT 1
  RETURNING id INTO course_id;

  -- Blue tees (what you have now)
  INSERT INTO tee_boxes (course_id, tee_name, tee_color, rating, slope, par, stroke_index)
  SELECT course_id, 'Blue', '#0066CC', rating, slope, par, stroke_index
  FROM courses WHERE name = 'AGCC Blues' LIMIT 1;

  -- To add more tees later, use this pattern:
  -- INSERT INTO tee_boxes (course_id, tee_name, tee_color, rating, slope, par, stroke_index)
  -- VALUES (course_id, 'White', '#FFFFFF', 68.2, 118, ARRAY[...], ARRAY[...]);
END $$;

-- 2. Deer Run Golf Club
DO $$
DECLARE course_id UUID;
BEGIN
  INSERT INTO golf_courses (name, location, holes, greens)
  VALUES ('Deer Run Golf Club', 'Hamilton, Illinois', 18, NULL)
  RETURNING id INTO course_id;

  INSERT INTO tee_boxes (course_id, tee_name, tee_color, rating, slope, par, stroke_index)
  SELECT course_id, 'Blue', '#0066CC', rating, slope, par, stroke_index
  FROM courses WHERE name = 'Deer Run Hamilton Illinois' LIMIT 1;
END $$;

-- 3. Elmwood Country Club
DO $$
DECLARE course_id UUID;
BEGIN
  INSERT INTO golf_courses (name, location, holes, greens)
  VALUES ('Elmwood Country Club', 'Marshalltown, Iowa', 18, NULL)
  RETURNING id INTO course_id;

  INSERT INTO tee_boxes (course_id, tee_name, tee_color, rating, slope, par, stroke_index)
  SELECT course_id, 'Blue', '#0066CC', rating, slope, par, stroke_index
  FROM courses WHERE name = 'Elmwood Country Club' LIMIT 1;
END $$;

-- 4. Honey Creek Golf Club
DO $$
DECLARE course_id UUID;
BEGIN
  INSERT INTO golf_courses (name, location, holes, greens)
  VALUES ('Honey Creek Golf Club', 'Runnells, Iowa', 18, NULL)
  RETURNING id INTO course_id;

  INSERT INTO tee_boxes (course_id, tee_name, tee_color, rating, slope, par, stroke_index)
  SELECT course_id, 'Blue', '#0066CC', rating, slope, par, stroke_index
  FROM courses WHERE name = 'Honey Creek Golf Club' LIMIT 1;
END $$;

-- 5. Lake Creek (has 2 tee boxes: Blue and White)
DO $$
DECLARE course_id UUID;
BEGIN
  INSERT INTO golf_courses (name, location, holes, greens)
  SELECT 'Lake Creek Golf Course', 'Denison, Iowa', 18, greens
  FROM courses WHERE name = 'Lake Creek' LIMIT 1
  RETURNING id INTO course_id;

  -- Blue tees (the one with GPS data)
  INSERT INTO tee_boxes (course_id, tee_name, tee_color, rating, slope, par, stroke_index)
  SELECT course_id, 'Blue', '#0066CC', rating, slope, par, stroke_index
  FROM courses WHERE name = 'Lake Creek' LIMIT 1;

  -- White tees
  INSERT INTO tee_boxes (course_id, tee_name, tee_color, rating, slope, par, stroke_index)
  SELECT course_id, 'White', '#FFFFFF', rating, slope, par, stroke_index
  FROM courses WHERE name = 'Lake Creek White' LIMIT 1;
END $$;

-- 6. The Tournament Club of Iowa (4 tee boxes: King, Legend, Master, Palmer)
DO $$
DECLARE course_id UUID;
BEGIN
  INSERT INTO golf_courses (name, location, holes, greens)
  SELECT 'The Tournament Club of Iowa', 'Polk City, Iowa', 18, greens
  FROM courses WHERE name = 'Tournament Club - King' LIMIT 1
  RETURNING id INTO course_id;

  -- King tees (Black)
  INSERT INTO tee_boxes (course_id, tee_name, tee_color, rating, slope, par, stroke_index)
  SELECT course_id, 'King', '#000000', rating, slope, par, stroke_index
  FROM courses WHERE name = 'Tournament Club - King' LIMIT 1;

  -- Legend tees (Purple/Senior)
  INSERT INTO tee_boxes (course_id, tee_name, tee_color, rating, slope, par, stroke_index)
  SELECT course_id, 'Legend', '#6A1B9A', rating, slope, par, stroke_index
  FROM courses WHERE name = 'Tournament Club - Legend' LIMIT 1;

  -- Master tees (Blue)
  INSERT INTO tee_boxes (course_id, tee_name, tee_color, rating, slope, par, stroke_index)
  SELECT course_id, 'Master', '#0066CC', rating, slope, par, stroke_index
  FROM courses WHERE name = 'Tournament Club - Master' LIMIT 1;

  -- Palmer tees (Gold)
  INSERT INTO tee_boxes (course_id, tee_name, tee_color, rating, slope, par, stroke_index)
  SELECT course_id, 'Palmer', '#FFD700', rating, slope, par, stroke_index
  FROM courses WHERE name = 'Tournament Club - Palmer' LIMIT 1;
END $$;

-- 7. Veenker Golf Course (4 tee boxes: Blue, Gold, Red, White)
DO $$
DECLARE course_id UUID;
BEGIN
  INSERT INTO golf_courses (name, location, holes, greens)
  SELECT 'Veenker Golf Course', 'Ames, Iowa', 18, greens
  FROM courses WHERE name = 'Veenker Blue' LIMIT 1
  RETURNING id INTO course_id;

  -- Blue tees (Men's/Championship)
  INSERT INTO tee_boxes (course_id, tee_name, tee_color, rating, slope, par, stroke_index)
  SELECT course_id, 'Blue', '#0066CC', rating, slope, par, stroke_index
  FROM courses WHERE name = 'Veenker Blue' LIMIT 1;

  -- Gold tees (Senior)
  INSERT INTO tee_boxes (course_id, tee_name, tee_color, rating, slope, par, stroke_index)
  SELECT course_id, 'Gold', '#FFD700', rating, slope, par, stroke_index
  FROM courses WHERE name = 'Veenker Gold' LIMIT 1;

  -- Red tees (Women's)
  INSERT INTO tee_boxes (course_id, tee_name, tee_color, rating, slope, par, stroke_index)
  SELECT course_id, 'Red', '#CC0000', rating, slope, par, stroke_index
  FROM courses WHERE name = 'Veenker Red' LIMIT 1;

  -- White tees
  INSERT INTO tee_boxes (course_id, tee_name, tee_color, rating, slope, par, stroke_index)
  SELECT course_id, 'White', '#FFFFFF', rating, slope, par, stroke_index
  FROM courses WHERE name = 'Veenker White' LIMIT 1;
END $$;

-- 8. Wapsipinicon Country Club
DO $$
DECLARE course_id UUID;
BEGIN
  INSERT INTO golf_courses (name, location, holes, greens)
  SELECT 'Wapsipinicon Country Club', 'Anamosa, Iowa', 18, greens
  FROM courses WHERE name = 'Wapsipinicon' LIMIT 1
  RETURNING id INTO course_id;

  INSERT INTO tee_boxes (course_id, tee_name, tee_color, rating, slope, par, stroke_index)
  SELECT course_id, 'Blue', '#0066CC', rating, slope, par, stroke_index
  FROM courses WHERE name = 'Wapsipinicon' LIMIT 1;
END $$;


-- STEP 3: Verification Query
-- ===========================================================================
-- Run this to see what was migrated

SELECT
  gc.name AS course_name,
  gc.location,
  gc.holes,
  tb.tee_name,
  tb.tee_color,
  tb.rating,
  tb.slope,
  CASE WHEN gc.greens IS NOT NULL THEN 'Yes' ELSE 'No' END AS has_gps
FROM golf_courses gc
LEFT JOIN tee_boxes tb ON tb.course_id = gc.id
ORDER BY gc.name, tb.rating DESC NULLS LAST;


-- ===========================================================================
-- MIGRATION COMPLETE!
-- ===========================================================================
-- What was migrated:
--   - 8 courses total
--   - Courses with multiple tee boxes: Veenker (4), Tournament Club (4), Lake Creek (2)
--   - GPS data preserved for: AGCC, Lake Creek, Tournament Club, Veenker, Wapsipinicon
--   - Skipped: Craft Farms, Peninsula courses, Kiva Dunes
--
-- Adding more tee boxes later (example for AGCC White tees):
--   1. Get course_id: SELECT id FROM golf_courses WHERE name = 'AGCC';
--   2. Insert tee box:
--      INSERT INTO tee_boxes (course_id, tee_name, tee_color, rating, slope, par, stroke_index)
--      VALUES ('<course_id>', 'White', '#FFFFFF', 68.2, 118,
--              ARRAY[4,4,3,5,4,3,4,4,3,4,4,3,5,4,4,3,4,4],
--              ARRAY[3,7,13,15,11,1,9,5,17,6,12,16,2,18,8,14,10,4]);
--
-- Next steps:
--   1. Review the verification query output above
--   2. Update your App.jsx to use new tables (see example-app-integration.jsx)
--   3. Test the new course/tee selection UI
--   4. Add more tee boxes as needed using the pattern above
--   5. Old 'courses' table remains untouched for your other app
-- ===========================================================================
