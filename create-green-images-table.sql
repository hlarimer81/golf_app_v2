-- Create green_images table to store metadata for putt break / green images
CREATE TABLE IF NOT EXISTS green_images (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  course_name TEXT NOT NULL,           -- e.g. "AGCC Blues"
  hole_number INTEGER NOT NULL,        -- 1-18
  image_path TEXT NOT NULL,            -- Storage path: "agcc-blues/hole-1.png"
  compass_direction TEXT,              -- Compass orientation e.g. "N" (north at top), image front is always at bottom
  grid_size_yards INTEGER DEFAULT 5,   -- Grid spacing in yards
  image_width_yards NUMERIC,           -- Total width of image in yards (derived from grid)
  image_height_yards NUMERIC,          -- Total height of image in yards (derived from grid)
  notes TEXT,                          -- Any additional notes about the green
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(course_name, hole_number)
);

-- Enable RLS
ALTER TABLE green_images ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read green images
CREATE POLICY "Allow public read on green_images"
  ON green_images FOR SELECT
  USING (true);

-- Allow anyone to insert (for admin scripts)
CREATE POLICY "Allow public insert on green_images"
  ON green_images FOR INSERT
  WITH CHECK (true);

-- Insert the first green image record for AGCC Blues Hole 1
INSERT INTO green_images (course_name, hole_number, image_path, compass_direction, grid_size_yards, notes)
VALUES (
  'AGCC Blues',
  1,
  'agcc-blues/hole-1.png',
  'N',
  5,
  'Putt break chart. Front of green at bottom. Compass shows North pointing up. 5-yard grid overlay.'
)
ON CONFLICT (course_name, hole_number) DO UPDATE
SET image_path = EXCLUDED.image_path,
    compass_direction = EXCLUDED.compass_direction,
    grid_size_yards = EXCLUDED.grid_size_yards,
    notes = EXCLUDED.notes;
