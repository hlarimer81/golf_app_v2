-- =============================================================================================
-- Creates a throwaway course for testing the "Add Green GPS Data" wizard on site.
--
-- WHY SQL RATHER THAN THE APP: the anon role cannot INSERT into golf_courses or tee_boxes (see
-- sql/fix-anon-write-policies-courses.sql). The SQL editor runs as postgres, which bypasses RLS,
-- so this works today regardless of that.
--
-- HOW IT IS "AT YOUR LOCATION": it isn't, and it does not need to be. golf_courses has no
-- latitude/longitude columns at all -- `location` is a display label. ALL geography lives in
-- greens, which is precisely what the wizard captures. greens starts NULL here, so every hole
-- reads as unmapped and offers the "Add Green GPS Data" button. Walk anywhere, capture a green,
-- and the course becomes located wherever you were standing.
--
-- The name starts with ZZ so it sorts to the BOTTOM of the picker (App.jsx orders by name) and
-- stays out of the way during normal play.
--
-- Idempotent: re-running replaces the tee box rather than duplicating it.
-- =============================================================================================

-- golf_courses.name carries no UNIQUE constraint, so ON CONFLICT cannot protect us here -- a
-- second run would silently create a second course of the same name. Look it up explicitly.
DO $$
DECLARE
    cid  uuid;
    cname text := 'ZZ TEST - GPS Wizard (delete me)';
BEGIN
    SELECT id INTO cid FROM golf_courses WHERE name = cname LIMIT 1;

    IF cid IS NULL THEN
        INSERT INTO golf_courses (name, location, holes, greens)
        VALUES (cname, 'Test course - greens captured on site', 18, NULL)
        RETURNING id INTO cid;
        RAISE NOTICE 'created course %', cid;
    ELSE
        RAISE NOTICE 'course already exists: %', cid;
    END IF;

    INSERT INTO tee_boxes (course_id, tee_name, tee_color, rating, slope, par, stroke_index, yardage)
    VALUES (cid, 'Test', '#00AA55', 72.0, 113,
            ARRAY[4,3,5,4,4,3,4,5,4, 4,4,3,5,4,4,3,5,4],       -- par 72, front 36 / back 36
            ARRAY[7,15,3,11,1,17,9,5,13, 8,12,18,2,10,4,16,6,14],
            NULL)                                               -- yardage unused for scoring
    ON CONFLICT (course_id, tee_name) DO UPDATE
        SET par = EXCLUDED.par, stroke_index = EXCLUDED.stroke_index;
END $$;

-- Verify.
SELECT c.id, c.name, c.holes, c.greens, t.tee_name, array_length(t.par, 1) AS par_holes
FROM golf_courses c
JOIN tee_boxes t ON t.course_id = c.id
WHERE c.name = 'ZZ TEST - GPS Wizard (delete me)';


-- =============================================================================================
-- CLEANUP when finished. tee_boxes.course_id is ON DELETE CASCADE, so this removes both.
-- =============================================================================================
-- DELETE FROM golf_courses WHERE name = 'ZZ TEST - GPS Wizard (delete me)';
