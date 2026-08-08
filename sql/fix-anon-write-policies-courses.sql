-- =============================================================================================
-- Grants the anon role the writes the app actually performs on golf_courses and tee_boxes.
--
-- THE BUG: sql/enable-rls-golf-tables.sql granted every write policy `TO authenticated`. This app
-- has NO authentication -- supabaseClient.js creates a client from the anon key and there is not a
-- single supabase.auth.* call in src/. So every request the app has ever made arrives as `anon`,
-- and not one of those eight policies has ever matched a single call.
--
-- Two features have been broken by this the whole time, with different symptoms, because INSERT
-- and UPDATE fail differently under RLS:
--
--   Add Green GPS Data   UPDATE golf_courses   refused by USING -> 0 rows, HTTP 200, NO ERROR.
--                                              The wizard reported success and saved nothing.
--   Manual Course Entry  INSERT golf_courses   refused by WITH CHECK -> raises 42501, loudly.
--                        INSERT tee_boxes      same.
--
-- Confirmed 2026-08-08 by probing the live database with the anon key.
--
-- WHAT THIS GRANTS, and what it deliberately does not:
--   INSERT + UPDATE on both tables -- exactly what ManualCourseEntry.jsx and AddGreenData.jsx do.
--   NOT DELETE. The app never deletes a course or a tee box (the only .delete() in src/ is
--   useScores.js, on scores). Leaving DELETE to authenticated/service_role costs nothing and keeps
--   "drop the whole course catalogue" off the table for anyone holding the public anon key.
--
-- SCOPE, stated plainly: anyone with the anon key can add or edit courses. That is already true of
-- every other table this app writes, and the anon key ships in the client bundle. This does not
-- change the security model -- it makes the policies match the model that is already in force.
-- The real fix is the auth + RLS work in TODAYS-PROGRESS-AND-NEXT-STEPS.md; revisit all of these
-- policies there rather than leaving them permanently.
--
-- Idempotent. Run once against the Supabase project.
-- =============================================================================================

DO $$
DECLARE
    t   text;
    cmd text;
    pol text;
BEGIN
    FOREACH t IN ARRAY ARRAY['golf_courses', 'tee_boxes'] LOOP
        FOREACH cmd IN ARRAY ARRAY['INSERT', 'UPDATE'] LOOP
            pol := format('%s anon %s', t, lower(cmd));

            IF NOT EXISTS (SELECT 1 FROM pg_policies
                           WHERE schemaname = 'public' AND tablename = t AND policyname = pol) THEN
                IF cmd = 'INSERT' THEN
                    EXECUTE format(
                        'CREATE POLICY %I ON public.%I FOR INSERT TO anon WITH CHECK (true)', pol, t);
                ELSE
                    EXECUTE format(
                        'CREATE POLICY %I ON public.%I FOR UPDATE TO anon USING (true) WITH CHECK (true)', pol, t);
                END IF;
                RAISE NOTICE 'created policy %', pol;
            ELSE
                RAISE NOTICE 'policy % already exists', pol;
            END IF;
        END LOOP;
    END LOOP;
END $$;

-- Verify: expect SELECT + INSERT + UPDATE reachable by anon on both tables.
-- The loop generates the name "golf_courses anon update", which is exactly what
-- sql/add-golf-courses-update-policy.sql already created, so that one is detected and skipped.
-- Three policies get created here: golf_courses anon insert, tee_boxes anon insert,
-- tee_boxes anon update.
SELECT tablename, policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public' AND tablename IN ('golf_courses', 'tee_boxes')
ORDER BY tablename, cmd, policyname;
