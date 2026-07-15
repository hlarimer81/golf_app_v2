-- ===========================================================================
-- UPDATE GREENS SCHEMA TO STORE POLYGONS
-- ===========================================================================
-- Changes greens field from {f:[lat,lon], m:[lat,lon], b:[lat,lon]} format
-- to storing full polygon coordinates for dynamic distance calculation
--
-- Old format: greens: [{f:[41.5,-93.6], m:[41.5,-93.6], b:[41.5,-93.6]}, ...]
-- New format: greens: [{hole:1, polygon:[[lat,lon],[lat,lon],...]}, ...]
-- ===========================================================================

-- The column type is already JSONB, so no ALTER needed!
-- We just need to update existing data format

-- Example of new format:
-- UPDATE golf_courses
-- SET greens = '[
--   {"hole": 1, "polygon": [[41.5, -93.6], [41.501, -93.601], [41.502, -93.599]]},
--   {"hole": 2, "polygon": [[41.51, -93.62], [41.511, -93.621], [41.512, -93.619]]}
-- ]'::jsonb
-- WHERE name = 'Some Course';

-- For courses with old format (f/m/b), we can migrate them:
-- This creates a simple 3-point "polygon" from existing front/middle/back data

DO $$
DECLARE
  course_record RECORD;
  old_greens JSONB;
  new_greens JSONB;
  hole_data JSONB;
  polygon_array JSONB;
BEGIN
  FOR course_record IN
    SELECT id, name, greens
    FROM golf_courses
    WHERE greens IS NOT NULL
  LOOP
    old_greens := course_record.greens;
    new_greens := '[]'::jsonb;

    -- Check if this is old format (has 'f', 'm', 'b' keys)
    IF jsonb_typeof(old_greens) = 'array' AND jsonb_array_length(old_greens) > 0 THEN
      -- Check first element for old format
      hole_data := old_greens->0;

      IF hole_data ? 'f' AND hole_data ? 'm' AND hole_data ? 'b' THEN
        -- Old format detected, convert to polygon format
        FOR i IN 0..(jsonb_array_length(old_greens) - 1) LOOP
          hole_data := old_greens->i;

          -- Create a triangle polygon from f, m, b points
          polygon_array := jsonb_build_array(
            hole_data->'f',
            hole_data->'m',
            hole_data->'b'
          );

          new_greens := new_greens || jsonb_build_array(
            jsonb_build_object(
              'hole', i + 1,
              'polygon', polygon_array
            )
          );
        END LOOP;

        -- Update the course with new format
        UPDATE golf_courses
        SET greens = new_greens
        WHERE id = course_record.id;

        RAISE NOTICE 'Converted % from old format to polygon format', course_record.name;
      ELSE
        RAISE NOTICE 'Course % already in polygon format or unknown format', course_record.name;
      END IF;
    END IF;
  END LOOP;
END $$;

-- ===========================================================================
-- VERIFICATION
-- ===========================================================================
-- Check the new format:

SELECT
  name,
  jsonb_array_length(greens) as hole_count,
  greens->0 as first_hole_example
FROM golf_courses
WHERE greens IS NOT NULL
LIMIT 5;

-- ===========================================================================
-- NOTES
-- ===========================================================================
-- When fetching from OpenStreetMap, store like this:
-- greens: [
--   {
--     "hole": 1,
--     "polygon": [
--       [41.50123, -93.60456],
--       [41.50145, -93.60478],
--       [41.50167, -93.60445],
--       ... (10-30 points typically)
--     ]
--   },
--   { "hole": 2, "polygon": [...] },
--   ...
-- ]
-- ===========================================================================
