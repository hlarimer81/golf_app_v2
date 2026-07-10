-- Diagnostic queries for course request issues

-- 1. Check recent course requests
SELECT
  id,
  course_name,
  location,
  status,
  error_message,
  created_at,
  completed_at,
  created_course_id
FROM course_requests
ORDER BY created_at DESC
LIMIT 10;

-- 2. Check if courses were actually created
SELECT
  gc.id,
  gc.name,
  gc.location,
  gc.created_at,
  COUNT(tb.id) as tee_box_count
FROM golf_courses gc
LEFT JOIN tee_boxes tb ON tb.course_id = gc.id
GROUP BY gc.id
ORDER BY gc.created_at DESC
LIMIT 10;

-- 3. Check for reported issues
SELECT
  ci.id,
  gc.name as course_name,
  ci.issue_type,
  ci.description,
  ci.status,
  ci.created_at,
  ci.reported_by
FROM course_issues ci
LEFT JOIN golf_courses gc ON gc.id = ci.course_id
ORDER BY ci.created_at DESC
LIMIT 10;

-- 4. Check if Coldwater or Fort Dodge exist
SELECT
  gc.id,
  gc.name,
  gc.location,
  COUNT(tb.id) as tee_boxes
FROM golf_courses gc
LEFT JOIN tee_boxes tb ON tb.course_id = gc.id
WHERE gc.name ILIKE '%coldwater%'
   OR gc.name ILIKE '%fort dodge%'
GROUP BY gc.id;

-- 5. Check RLS policies on course_issues (should allow inserts)
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'course_issues';

-- 6. Check if service role can write (should have no RLS)
SELECT
  tablename,
  rowsecurity
FROM pg_tables
WHERE tablename IN ('golf_courses', 'tee_boxes', 'course_requests', 'course_issues')
  AND schemaname = 'public';
