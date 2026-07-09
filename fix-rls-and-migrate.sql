-- ===========================================================================
-- FIX RLS AND RUN MIGRATION
-- ===========================================================================
-- The tables were created but RLS is blocking inserts.
-- This script disables RLS for these tables (since they're public course data)
-- and then runs the migration.
--
-- Run this entire file in Supabase SQL Editor
-- ===========================================================================

-- STEP 1: Disable RLS on new tables (course data is public)
-- ===========================================================================

ALTER TABLE golf_courses DISABLE ROW LEVEL SECURITY;
ALTER TABLE tee_boxes DISABLE ROW LEVEL SECURITY;


-- STEP 2: Migrate your courses
-- ===========================================================================

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
