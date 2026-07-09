-- Migrate existing courses data to new schema
-- This extracts course name and tee color from existing entries like "Veenker Blue"

-- First, let's see what we're working with (run this separately first to review)
-- SELECT name, holes, rating, slope FROM courses ORDER BY name;

-- Example migration for courses with tee boxes in their names
-- You'll need to customize this based on your actual data

-- Example: Veenker Golf Course
DO $$
DECLARE
  veenker_course_id UUID;
BEGIN
  -- Create the main course (GPS data stored here, not in tee boxes)
  INSERT INTO golf_courses (name, location, holes, greens)
  SELECT
    'Veenker Golf Course',
    'Ames, Iowa',
    18,
    greens  -- Copy GPS data from one of the tee box entries (they're all the same)
  FROM courses
  WHERE name LIKE 'Veenker%'
  LIMIT 1
  RETURNING id INTO veenker_course_id;

  -- Add Blue tees (if exists in old courses table)
  -- Note: No greens column here - it's in golf_courses now
  INSERT INTO tee_boxes (course_id, tee_name, tee_color, rating, slope, par, stroke_index, yardage)
  SELECT
    veenker_course_id,
    'Blue',
    '#0066CC',
    rating,
    slope,
    par,
    stroke_index,
    NULL  -- Add yardage array if you have it
  FROM courses
  WHERE name = 'Veenker Blue'
  LIMIT 1;

  -- Add White tees (if exists in old courses table)
  INSERT INTO tee_boxes (course_id, tee_name, tee_color, rating, slope, par, stroke_index, yardage)
  SELECT
    veenker_course_id,
    'White',
    '#FFFFFF',
    rating,
    slope,
    par,
    stroke_index,
    NULL
  FROM courses
  WHERE name = 'Veenker White'
  LIMIT 1;

  -- Add Red tees (if exists in old courses table)
  INSERT INTO tee_boxes (course_id, tee_name, tee_color, rating, slope, par, stroke_index, yardage)
  SELECT
    veenker_course_id,
    'Red',
    '#CC0000',
    rating,
    slope,
    par,
    stroke_index,
    NULL
  FROM courses
  WHERE name = 'Veenker Red'
  LIMIT 1;
END $$;

-- Repeat for other courses...
-- Example: Elmwood Country Club (might be a single tee box)
DO $$
DECLARE
  elmwood_course_id UUID;
BEGIN
  INSERT INTO golf_courses (name, location, holes, greens)
  SELECT
    'Elmwood Country Club',
    'Marshalltown, Iowa',
    18,
    greens  -- GPS data goes in golf_courses
  FROM courses
  WHERE name = 'Elmwood Country Club'
  LIMIT 1
  RETURNING id INTO elmwood_course_id;

  INSERT INTO tee_boxes (course_id, tee_name, tee_color, rating, slope, par, stroke_index)
  SELECT
    elmwood_course_id,
    'Championship',  -- Or 'Blue', 'White', etc. depending on what you want to call it
    '#0066CC',
    rating,
    slope,
    par,
    stroke_index
    -- No greens here - it's in golf_courses
  FROM courses
  WHERE name = 'Elmwood Country Club'
  LIMIT 1;
END $$;

-- Continue for all courses in your database...
-- NOTE: Review your existing courses table first to see all entries
