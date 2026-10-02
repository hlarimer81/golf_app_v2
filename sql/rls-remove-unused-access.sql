-- =============================================================================================
-- REMOVE ACCESS NOTHING USES
--
-- From the policy inventory on 2026-10-01. Each policy dropped here permits something the app
-- never does, checked against every .from() call in src/ and supabase/functions/. Nothing the app
-- does today changes.
--
-- golf_courses, tee_boxes - DELETE for authenticated.
--     Sign-up is open to any email, so any stranger with an account could delete every course,
--     and tee_boxes with it (ON DELETE CASCADE). The app never deletes a course. The
--     request-course edge function does, but as service_role, which bypasses RLS. anon DELETE was
--     already withheld on purpose (fix-anon-write-policies-courses.sql); this closes the same door
--     for signed-in users. INSERT and UPDATE stay: Manual Course Entry and the green GPS wizard
--     use them.
--
-- course_requests - INSERT and SELECT for everyone.
--     The app never touches this table. Requests go through the request-course edge function,
--     which writes it as service_role. The SELECT policy is named "view their own requests" but
--     its rule is `true`: anyone could read every request, including the raw API responses.
--
-- course_issues - SELECT for everyone.
--     The app only files an issue (INSERT, kept). Nothing reads them back, and the rows carry
--     admin_notes. Read them in the SQL editor.
--
-- courses - INSERT and UPDATE for everyone.
--     The app only reads this table (the Peninsula nines). SELECT is kept.
--     scripts/add_courses.js writes it with the anon key and will stop working; it is a one-off
--     that has already been run. Add rows in the SQL editor from now on.
--
-- green_images - INSERT and UPDATE for everyone.
--     Unused by the app. SELECT is kept and the table is NOT dropped here: dropping data is a
--     separate decision (sql/drop-green-images-table.sql).
--
-- Grants are left as they are. With RLS on and no policy for a command, that command is refused
-- whatever the grants say, and the policies are the single place to look.
--
-- Safe to re-run: DROP POLICY IF EXISTS. To undo any one of these, recreate the policy.
-- =============================================================================================

DROP POLICY IF EXISTS "Authenticated users can delete courses"   ON public.golf_courses;
DROP POLICY IF EXISTS "Authenticated users can delete tee boxes" ON public.tee_boxes;

DROP POLICY IF EXISTS "Anyone can create course requests"  ON public.course_requests;
DROP POLICY IF EXISTS "Anyone can view their own requests" ON public.course_requests;

DROP POLICY IF EXISTS "Anyone can view course issues" ON public.course_issues;

DROP POLICY IF EXISTS "anon insert courses" ON public.courses;
DROP POLICY IF EXISTS "anon update courses" ON public.courses;

DROP POLICY IF EXISTS "Allow public insert on green_images" ON public.green_images;
DROP POLICY IF EXISTS "Allow public update on green_images" ON public.green_images;

-- ---------------------------------------------------------------------------------------------
-- Verify. One query.
--
-- Expect exactly these rows:
--   course_issues   | INSERT
--   courses         | SELECT
--   golf_courses    | INSERT, INSERT, SELECT, UPDATE, UPDATE
--   green_images    | SELECT
--   tee_boxes       | INSERT, INSERT, SELECT, UPDATE, UPDATE
-- and NO row for course_requests (RLS on, no policies: reachable only as service_role).
-- ---------------------------------------------------------------------------------------------
SELECT tablename, string_agg(cmd, ', ' ORDER BY cmd) AS commands
  FROM pg_policies
 WHERE schemaname = 'public'
   AND tablename IN ('golf_courses', 'tee_boxes', 'course_requests', 'course_issues', 'courses', 'green_images')
 GROUP BY tablename
 ORDER BY tablename;
