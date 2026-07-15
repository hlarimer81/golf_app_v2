-- Disable RLS on new tables (course data is public)
ALTER TABLE golf_courses DISABLE ROW LEVEL SECURITY;
ALTER TABLE tee_boxes DISABLE ROW LEVEL SECURITY;
