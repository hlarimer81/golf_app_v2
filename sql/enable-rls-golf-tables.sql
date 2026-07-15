-- ===========================================================================
-- ROW LEVEL SECURITY FOR GOLF APP TABLES
-- ===========================================================================
-- This enables RLS and creates policies for golf_courses and tee_boxes tables
--
-- Security model:
--   - Anyone can read golf courses and tee boxes (public data)
--   - Only authenticated users can create/update (could restrict to admin later)
--   - course_requests and course_issues already have RLS enabled
-- ===========================================================================

-- 1. GOLF COURSES TABLE
-- ===========================================================================
ALTER TABLE golf_courses ENABLE ROW LEVEL SECURITY;

-- Allow anyone to view golf courses (public data)
CREATE POLICY "Anyone can view golf courses"
  ON golf_courses FOR SELECT
  USING (true);

-- Allow authenticated users to insert courses
-- (You may want to restrict this to admin users later)
CREATE POLICY "Authenticated users can add courses"
  ON golf_courses FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Allow authenticated users to update courses
-- (You may want to restrict this to admin users later)
CREATE POLICY "Authenticated users can update courses"
  ON golf_courses FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Allow authenticated users to delete courses
-- (You may want to restrict this to admin users later)
CREATE POLICY "Authenticated users can delete courses"
  ON golf_courses FOR DELETE
  TO authenticated
  USING (true);


-- 2. TEE BOXES TABLE
-- ===========================================================================
ALTER TABLE tee_boxes ENABLE ROW LEVEL SECURITY;

-- Allow anyone to view tee boxes (public data)
CREATE POLICY "Anyone can view tee boxes"
  ON tee_boxes FOR SELECT
  USING (true);

-- Allow authenticated users to insert tee boxes
-- (You may want to restrict this to admin users later)
CREATE POLICY "Authenticated users can add tee boxes"
  ON tee_boxes FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Allow authenticated users to update tee boxes
-- (You may want to restrict this to admin users later)
CREATE POLICY "Authenticated users can update tee boxes"
  ON tee_boxes FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Allow authenticated users to delete tee boxes
-- (You may want to restrict this to admin users later)
CREATE POLICY "Authenticated users can delete tee boxes"
  ON tee_boxes FOR DELETE
  TO authenticated
  USING (true);


-- ===========================================================================
-- VERIFICATION QUERIES
-- ===========================================================================
-- Run these to verify RLS is enabled and policies are created

-- Check RLS status
SELECT
  schemaname,
  tablename,
  rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('golf_courses', 'tee_boxes', 'course_requests', 'course_issues')
ORDER BY tablename;

-- Show all policies
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('golf_courses', 'tee_boxes', 'course_requests', 'course_issues')
ORDER BY tablename, policyname;


-- ===========================================================================
-- OPTIONAL: ADMIN-ONLY MODIFICATION (Commented out)
-- ===========================================================================
-- If you want to restrict INSERT/UPDATE/DELETE to admin users only:
--
-- 1. First, create an admin role or use a custom claim in JWT:
--    - Option A: Create a separate admin role in Supabase
--    - Option B: Use a custom claim like (auth.jwt() ->> 'role')::text = 'admin'
--
-- 2. Then replace the policies above with these:
/*
-- Admin-only insert (example using custom claim)
DROP POLICY IF EXISTS "Authenticated users can add courses" ON golf_courses;
CREATE POLICY "Admin users can add courses"
  ON golf_courses FOR INSERT
  TO authenticated
  WITH CHECK ((auth.jwt() ->> 'role')::text = 'admin');

DROP POLICY IF EXISTS "Authenticated users can update courses" ON golf_courses;
CREATE POLICY "Admin users can update courses"
  ON golf_courses FOR UPDATE
  TO authenticated
  USING ((auth.jwt() ->> 'role')::text = 'admin')
  WITH CHECK ((auth.jwt() ->> 'role')::text = 'admin');

DROP POLICY IF EXISTS "Authenticated users can delete courses" ON golf_courses;
CREATE POLICY "Admin users can delete courses"
  ON golf_courses FOR DELETE
  TO authenticated
  USING ((auth.jwt() ->> 'role')::text = 'admin');

-- Same for tee_boxes...
*/


-- ===========================================================================
-- NEXT STEPS
-- ===========================================================================
-- 1. Run this script in Supabase SQL Editor
-- 2. Verify RLS is enabled using the queries above
-- 3. Test that:
--    - Anonymous users can SELECT courses and tee boxes
--    - Authenticated users can INSERT/UPDATE/DELETE
--    - course_requests and course_issues already work with existing policies
-- 4. If needed, restrict modification to admin users using the optional section
-- ===========================================================================
