-- ===========================================================================
-- COURSE REQUEST & ISSUE REPORTING SYSTEM
-- ===========================================================================
-- Allows users to request courses (auto-added) and report issues

-- 1. Course Requests Table
-- ===========================================================================
CREATE TABLE IF NOT EXISTS course_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_name TEXT NOT NULL,
  location TEXT,
  requested_by TEXT, -- User identifier (email, user_id, etc.)
  status TEXT DEFAULT 'processing', -- processing, completed, failed
  error_message TEXT,
  created_course_id UUID REFERENCES golf_courses(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  api_response JSONB -- Store raw API response for debugging
);

CREATE INDEX IF NOT EXISTS idx_course_requests_status ON course_requests(status);
CREATE INDEX IF NOT EXISTS idx_course_requests_created_at ON course_requests(created_at DESC);


-- 2. Course Issues Table
-- ===========================================================================
CREATE TABLE IF NOT EXISTS course_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES golf_courses(id) ON DELETE CASCADE,
  tee_box_id UUID REFERENCES tee_boxes(id) ON DELETE CASCADE,
  issue_type TEXT NOT NULL, -- 'incorrect_data', 'missing_tees', 'wrong_gps', 'other'
  description TEXT NOT NULL,
  reported_by TEXT,
  status TEXT DEFAULT 'open', -- open, acknowledged, resolved
  admin_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_course_issues_course_id ON course_issues(course_id);
CREATE INDEX IF NOT EXISTS idx_course_issues_status ON course_issues(status);
CREATE INDEX IF NOT EXISTS idx_course_issues_created_at ON course_issues(created_at DESC);


-- 3. RLS Policies (allow authenticated users to create requests/issues)
-- ===========================================================================

-- Allow anyone to request courses
ALTER TABLE course_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can create course requests"
  ON course_requests FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can view their own requests"
  ON course_requests FOR SELECT
  USING (true);

-- Allow anyone to report issues
ALTER TABLE course_issues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can report course issues"
  ON course_issues FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can view course issues"
  ON course_issues FOR SELECT
  USING (true);


-- 4. Notification function for new issues (optional - sends email to admin)
-- ===========================================================================
CREATE OR REPLACE FUNCTION notify_admin_new_issue()
RETURNS TRIGGER AS $$
BEGIN
  -- You can integrate with email service here
  -- For now, just log it
  RAISE NOTICE 'New course issue reported: % for course_id %', NEW.issue_type, NEW.course_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_notify_admin_new_issue
  AFTER INSERT ON course_issues
  FOR EACH ROW
  EXECUTE FUNCTION notify_admin_new_issue();


-- ===========================================================================
-- DONE!
-- ===========================================================================
-- Next steps:
-- 1. Create Supabase Edge Function to handle course requests
-- 2. Add UI for course request form
-- 3. Add "Report Issue" button in course selection
-- ===========================================================================
