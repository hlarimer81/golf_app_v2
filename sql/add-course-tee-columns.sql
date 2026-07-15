-- Add course_id and tee_box_id columns to matches table
-- This allows matches to reference the new golf_courses/tee_boxes schema

ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS course_id UUID REFERENCES golf_courses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tee_box_id UUID REFERENCES tee_boxes(id) ON DELETE SET NULL;

-- Add indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_matches_course_id ON matches(course_id);
CREATE INDEX IF NOT EXISTS idx_matches_tee_box_id ON matches(tee_box_id);
