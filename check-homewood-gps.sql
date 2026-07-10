-- Check if Homewood has GPS data
SELECT 
  name,
  location,
  greens,
  jsonb_array_length(greens) as green_count
FROM golf_courses 
WHERE name ILIKE '%homewood%';
