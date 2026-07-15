SELECT 
  course_name,
  status,
  error_message,
  created_at
FROM course_requests 
ORDER BY created_at DESC 
LIMIT 5;
