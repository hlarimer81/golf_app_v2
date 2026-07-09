-- New golf course schema with proper tee box support
-- This keeps the old 'courses' table intact for the other application

-- Main golf courses table (one entry per physical course)
CREATE TABLE IF NOT EXISTS golf_courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,                    -- e.g., "Veenker Golf Course"
  location TEXT,                         -- e.g., "Ames, Iowa"
  holes INTEGER NOT NULL DEFAULT 18,     -- 9 or 18

  -- GPS coordinates for greens (same for all tee boxes)
  greens JSONB,                          -- Array of {f:[lat,lon], m:[lat,lon], b:[lat,lon]} per hole

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tee boxes for each course (multiple per course)
CREATE TABLE IF NOT EXISTS tee_boxes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES golf_courses(id) ON DELETE CASCADE,
  tee_name TEXT NOT NULL,                -- e.g., "Blue", "White", "Red", "Gold"
  tee_color TEXT,                        -- Hex color for UI display, e.g., "#0066CC"

  -- Course difficulty ratings (used for handicap calculation)
  rating DECIMAL(4,1),                   -- Course rating (e.g., 72.3)
  slope INTEGER,                         -- Slope rating (e.g., 130)

  -- Hole-by-hole data (arrays, 9 or 18 elements)
  par INTEGER[] NOT NULL,                -- Par for each hole [4,4,3,5,...]
  stroke_index INTEGER[] NOT NULL,       -- Handicap stroke allocation [1,2,3,...]
  yardage INTEGER[],                     -- Yardage for each hole [425,380,165,...]

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure unique tee names per course
  UNIQUE(course_id, tee_name)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_tee_boxes_course_id ON tee_boxes(course_id);
CREATE INDEX IF NOT EXISTS idx_golf_courses_name ON golf_courses(name);

-- Add comments for documentation
COMMENT ON TABLE golf_courses IS 'Physical golf courses (one per location)';
COMMENT ON TABLE tee_boxes IS 'Tee boxes for each course with ratings, par, and yardages';
COMMENT ON COLUMN golf_courses.greens IS 'GPS coordinates for green positions (front/middle/back) - same for all tee boxes';
COMMENT ON COLUMN tee_boxes.rating IS 'USGA course rating - used in handicap calculation';
COMMENT ON COLUMN tee_boxes.slope IS 'USGA slope rating (55-155) - used in handicap calculation';
COMMENT ON COLUMN tee_boxes.stroke_index IS 'Handicap stroke allocation per hole (1-18)';
