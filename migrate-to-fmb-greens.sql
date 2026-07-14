-- ===========================================================================
-- MIGRATE GREENS TO FRONT/MIDDLE/BACK FORMAT
-- ===========================================================================
-- Changes greens field to store 3 GPS points per hole instead of full polygons
-- This is simpler to collect, easier to input manually, and sufficient for most use cases
--
-- Old format: greens: [{hole:1, polygon:[[lat,lon],[lat,lon],...]}, ...]
-- New format: greens: [{hole:1, front:{lat,lon}, center:{lat,lon}, back:{lat,lon}}, ...]
-- ===========================================================================

-- The column type is already JSONB, so no ALTER needed!
-- We just need to update the data format

-- Example of new format:
-- greens: [
--   {
--     "hole": 1,
--     "front": {"lat": 41.5, "lon": -93.6},
--     "center": {"lat": 41.501, "lon": -93.601},
--     "back": {"lat": 41.502, "lon": -93.602}
--   },
--   {
--     "hole": 2,
--     "front": {"lat": 41.51, "lon": -93.62},
--     "center": {"lat": 41.511, "lon": -93.621},
--     "back": {"lat": 41.512, "lon": -93.622}
--   }
-- ]

-- Migration function: Convert polygon format to front/middle/back
-- If polygon exists, calculate:
--   - front: first point
--   - center: geometric center of all points
--   - back: last point
-- (This is a rough approximation, but better than nothing)

DO $$
DECLARE
  course_record RECORD;
  old_greens JSONB;
  new_greens JSONB;
  hole_data JSONB;
  polygon JSONB;
  polygon_length INTEGER;
  center_lat NUMERIC;
  center_lon NUMERIC;
  point JSONB;
BEGIN
  FOR course_record IN
    SELECT id, name, greens
    FROM golf_courses
    WHERE greens IS NOT NULL
  LOOP
    old_greens := course_record.greens;
    new_greens := '[]'::jsonb;

    -- Check if this is polygon format (has 'hole' and 'polygon' keys)
    IF jsonb_typeof(old_greens) = 'array' AND jsonb_array_length(old_greens) > 0 THEN
      hole_data := old_greens->0;

      IF hole_data ? 'polygon' THEN
        -- Polygon format detected, convert to front/center/back
        FOR i IN 0..(jsonb_array_length(old_greens) - 1) LOOP
          hole_data := old_greens->i;
          polygon := hole_data->'polygon';
          polygon_length := jsonb_array_length(polygon);

          IF polygon_length >= 3 THEN
            -- Calculate center as average of all points
            center_lat := 0;
            center_lon := 0;

            FOR j IN 0..(polygon_length - 1) LOOP
              point := polygon->j;
              center_lat := center_lat + (point->0)::numeric;
              center_lon := center_lon + (point->1)::numeric;
            END LOOP;

            center_lat := center_lat / polygon_length;
            center_lon := center_lon / polygon_length;

            -- Create new format: front (first point), center (calculated), back (last point)
            new_greens := new_greens || jsonb_build_array(
              jsonb_build_object(
                'hole', COALESCE((hole_data->>'hole')::integer, i + 1),
                'front', jsonb_build_object(
                  'lat', polygon->0->0,
                  'lon', polygon->0->1
                ),
                'center', jsonb_build_object(
                  'lat', center_lat,
                  'lon', center_lon
                ),
                'back', jsonb_build_object(
                  'lat', polygon->(polygon_length-1)->0,
                  'lon', polygon->(polygon_length-1)->1
                )
              )
            );
          END IF;
        END LOOP;

        -- Update the course with new format
        UPDATE golf_courses
        SET greens = new_greens,
            updated_at = NOW()
        WHERE id = course_record.id;

        RAISE NOTICE 'Converted % from polygon format to front/center/back format (% holes)',
          course_record.name, jsonb_array_length(new_greens);
      ELSE
        RAISE NOTICE 'Course % already in front/center/back format or unknown format', course_record.name;
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
-- UPDATE SCHEMA COMMENT
-- ===========================================================================
COMMENT ON COLUMN golf_courses.greens IS 'GPS coordinates for green positions per hole - Array of {hole, front:{lat,lon}, center:{lat,lon}, back:{lat,lon}}';

-- ===========================================================================
-- NOTES FOR DEVELOPERS
-- ===========================================================================
-- When storing green data, use this format:
-- greens: [
--   {
--     "hole": 1,
--     "front": {"lat": 36.568, "lon": -121.950},
--     "center": {"lat": 36.569, "lon": -121.951},
--     "back": {"lat": 36.570, "lon": -121.952}
--   }
-- ]
--
-- When fetching from OpenStreetMap (if polygon data exists):
--   1. Get the polygon
--   2. Calculate front (first point), center (average), back (last point)
--   3. Store in this simplified format
--
-- When users manually add data:
--   1. Let them tap 3 points on a map (front, center, back)
--   2. Store directly in this format
-- ===========================================================================
