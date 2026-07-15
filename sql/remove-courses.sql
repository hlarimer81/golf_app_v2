-- Remove specific courses from the golf_courses database
-- This will cascade delete associated tee_boxes due to ON DELETE CASCADE

-- Courses to remove:
-- - AGCC
-- - Deer Run
-- - Homewood
-- - Lake Creek Golf Course
-- - The Tournament Club of Iowa (both entries)
-- - Wapsipinicon Country Club

DELETE FROM golf_courses
WHERE name IN (
  'AGCC',
  'Deer Run',
  'Homewood',
  'Lake Creek Golf Course',
  'The Tournament Club of Iowa',
  'Wapsipinicon Country Club'
);

-- Show how many courses were deleted
-- (Run this separately to verify)
-- SELECT COUNT(*) as deleted_count
-- FROM golf_courses
-- WHERE name IN (
--   'AGCC',
--   'Deer Run',
--   'Homewood',
--   'Lake Creek Golf Course',
--   'The Tournament Club of Iowa',
--   'Wapsipinicon Country Club'
-- );
