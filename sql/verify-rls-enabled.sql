-- ===========================================================================
-- VERIFY RLS IS ENABLED - Run this and check the output
-- ===========================================================================

-- QUERY 1: Check if RLS is enabled (should show 'true' for all tables)
-- ===========================================================================
SELECT
  tablename,
  rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('golf_courses', 'tee_boxes', 'course_requests', 'course_issues')
ORDER BY tablename;

-- ✅ WHAT TO LOOK FOR:
-- All 4 tables should show rls_enabled = true
-- golf_courses     | true
-- tee_boxes        | true
-- course_requests  | true
-- course_issues    | true


-- QUERY 2: Count policies per table (should show how many policies each has)
-- ===========================================================================
SELECT
  tablename,
  COUNT(*) as policy_count
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('golf_courses', 'tee_boxes', 'course_requests', 'course_issues')
GROUP BY tablename
ORDER BY tablename;

-- ✅ WHAT TO LOOK FOR:
-- golf_courses     | 4 (SELECT, INSERT, UPDATE, DELETE)
-- tee_boxes        | 4 (SELECT, INSERT, UPDATE, DELETE)
-- course_requests  | 2 (SELECT, INSERT)
-- course_issues    | 2 (SELECT, INSERT)


-- QUERY 3: See all policy details
-- ===========================================================================
SELECT
  tablename,
  policyname,
  cmd AS operation,
  CASE
    WHEN roles = '{public}' THEN 'public'
    WHEN roles = '{authenticated}' THEN 'authenticated'
    ELSE roles::text
  END AS who_can_access
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('golf_courses', 'tee_boxes', 'course_requests', 'course_issues')
ORDER BY tablename, cmd;

-- ✅ WHAT TO LOOK FOR:
-- You should see policies like:
-- golf_courses | Anyone can view golf courses        | SELECT | public
-- golf_courses | Authenticated users can add courses | INSERT | authenticated
-- golf_courses | Authenticated users can update...   | UPDATE | authenticated
-- golf_courses | Authenticated users can delete...   | DELETE | authenticated
-- (same pattern for tee_boxes)
