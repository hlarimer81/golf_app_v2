-- Remove duplicate courses (keep one of each)
DELETE FROM golf_courses a
USING golf_courses b
WHERE a.id > b.id
  AND a.name = b.name
  AND a.location = b.location
  AND a.holes = b.holes;
