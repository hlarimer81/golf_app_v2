# Troubleshooting Guide - Course Requests Not Working

## Issue: Courses Not Being Added

When you request "Coldwater Golf Course" or "Fort Dodge Country Club", the courses don't appear.

### Step 1: Check Course Requests Table

Run this in Supabase SQL Editor:

```sql
-- See what happened to your recent requests
SELECT
  id,
  course_name,
  location,
  status,
  error_message,
  created_at,
  created_course_id
FROM course_requests
WHERE course_name ILIKE '%coldwater%'
   OR course_name ILIKE '%fort dodge%'
ORDER BY created_at DESC;
```

**What to look for:**
- `status = 'processing'` → Function is stuck or failed silently
- `status = 'failed'` → Check `error_message` column
- `status = 'completed'` but no course → Check `created_course_id`

### Step 2: Check If Courses Were Created

```sql
-- Check if courses exist in database
SELECT
  gc.id,
  gc.name,
  gc.location,
  gc.created_at,
  COUNT(tb.id) as tee_box_count
FROM golf_courses gc
LEFT JOIN tee_boxes tb ON tb.course_id = gc.id
WHERE gc.name ILIKE '%coldwater%'
   OR gc.name ILIKE '%fort dodge%'
GROUP BY gc.id
ORDER BY gc.created_at DESC;
```

**What to look for:**
- If courses exist but have 0 tee boxes → API parsing failed
- If courses don't exist → Edge function failed before creating them

### Step 3: Check Recent Course Requests (All)

```sql
-- See ALL recent requests to understand the pattern
SELECT
  id,
  course_name,
  status,
  error_message,
  created_at
FROM course_requests
ORDER BY created_at DESC
LIMIT 20;
```

### Step 4: Check Reported Issues

```sql
-- See if your issue reports are being saved
SELECT
  ci.id,
  gc.name as course_name,
  ci.issue_type,
  ci.description,
  ci.status,
  ci.created_at
FROM course_issues ci
LEFT JOIN golf_courses gc ON gc.id = ci.course_id
ORDER BY ci.created_at DESC
LIMIT 10;
```

**Where issue reports go:**
- Saved to `course_issues` table in Supabase
- Status starts as 'open'
- Currently no admin interface to view them (that's a TODO!)

---

## Common Problems & Solutions

### Problem 1: Environment Variable Not Set

**Symptom:** Edge function returns "API Key is missing or invalid"

**Check:**
```bash
npx supabase secrets list | grep GOLF_API_KEY
```

**Fix:**
```bash
npx supabase secrets set GOLF_API_KEY=KUCPURI3LUEFEGZSHH2PZ2L7ZQ
npx supabase functions deploy request-course
```

### Problem 2: Course Name Not Found in Golf API

**Symptom:** Request completes but creates course with default data

**Test manually:**
```bash
curl -H "Authorization: Key KUCPURI3LUEFEGZSHH2PZ2L7ZQ" \
  "https://api.golfcourseapi.com/v1/search?search_query=Coldwater%20Golf%20Course"
```

**Solution:**
- Try different course name variations
- Add city/state: "Coldwater Golf Course Coldwater MI"
- Search at https://golfcourseapi.com to find exact name

### Problem 3: CORS or Permission Errors

**Symptom:** Frontend shows "Failed to fetch" or CORS error

**Check browser console:**
- Press F12 → Console tab
- Look for red errors

**Possible causes:**
- Row Level Security (RLS) blocking writes
- Edge function not deployed
- CORS headers missing

**Fix RLS (if needed):**
```sql
-- Check if RLS is blocking service role
SELECT tablename, rowsecurity
FROM pg_tables
WHERE tablename IN ('golf_courses', 'tee_boxes', 'course_requests')
  AND schemaname = 'public';

-- Service role should bypass RLS, but if there's an issue:
ALTER TABLE golf_courses DISABLE ROW LEVEL SECURITY;
ALTER TABLE tee_boxes DISABLE ROW LEVEL SECURITY;
ALTER TABLE course_requests DISABLE ROW LEVEL SECURITY;
```

### Problem 4: Course Exists But Not Showing in Dropdown

**Symptom:** Database has the course but dropdown doesn't show it

**Check frontend:**
```sql
-- Verify course has tee boxes
SELECT
  gc.name,
  COUNT(tb.id) as tee_boxes
FROM golf_courses gc
LEFT JOIN tee_boxes tb ON tb.course_id = gc.id
GROUP BY gc.id
HAVING COUNT(tb.id) = 0;
```

**Fix:** If a course has 0 tee boxes, the frontend might filter it out.

---

## Debugging Steps

### Step 1: Enable Detailed Logging

Add this to the edge function temporarily (after line 147):

```typescript
console.log('=== DEBUG INFO ===')
console.log('Course name:', courseName)
console.log('Location:', location)
console.log('API Key exists:', !!GOLF_API_KEY)
console.log('API Key prefix:', GOLF_API_KEY?.substring(0, 10))
```

### Step 2: Test Golf API Directly

```bash
# Test if Golf API is working
curl -H "Authorization: Key KUCPURI3LUEFEGZSHH2PZ2L7ZQ" \
  "https://api.golfcourseapi.com/v1/search?search_query=Coldwater%20Golf%20Course" \
  | jq '.courses[0] | {name, city: .location.city, tees: (.tees.male | length)}'
```

Expected output:
```json
{
  "name": "Coldwater Golf Course",
  "city": "Coldwater",
  "tees": 4
}
```

### Step 3: Check Edge Function Deployment

```bash
# Verify function is deployed
npx supabase functions list

# Redeploy if needed
npx supabase functions deploy request-course
```

### Step 4: Check Browser Network Tab

1. Open browser dev tools (F12)
2. Go to Network tab
3. Click "Request Course"
4. Look for `request-course` network request
5. Check:
   - Status code (should be 200)
   - Response body (shows error details)
   - Request payload (what you sent)

---

## Quick Fixes to Try

### Fix 1: Redeploy Everything

```bash
# Redeploy edge function
npx supabase functions deploy request-course

# Verify secret is set
npx supabase secrets list | grep GOLF_API_KEY
```

### Fix 2: Try a Well-Known Course

Test with a course that definitely exists:

- "Pebble Beach Golf Links" - Pebble Beach, CA
- "TPC Sawgrass" - Ponte Vedra Beach, FL
- "Torrey Pines" - La Jolla, CA

If these work but Coldwater doesn't, it's a course name issue.

### Fix 3: Check Frontend Console

Open browser console and look for errors when you click "Request Course".

### Fix 4: Verify Database Connection

```sql
-- Simple test that database is working
SELECT COUNT(*) FROM golf_courses;
SELECT COUNT(*) FROM course_requests;
```

---

## What to Share for Help

If still not working, please share:

1. **Course Request Status:**
   ```sql
   SELECT status, error_message, created_at
   FROM course_requests
   WHERE course_name ILIKE '%coldwater%'
   ORDER BY created_at DESC LIMIT 3;
   ```

2. **Browser Console Errors:**
   - F12 → Console tab → copy any red errors

3. **Network Tab Response:**
   - F12 → Network tab → Click request-course → Response tab

4. **What You Entered:**
   - Course name: "Coldwater Golf Course"
   - Location: "Coldwater, MI" (or whatever you entered)

---

## Issue Reports Location

**Where they're stored:**
- Database table: `course_issues`
- Status: 'open' by default

**How to view them:**
```sql
SELECT
  ci.*,
  gc.name as course_name
FROM course_issues ci
LEFT JOIN golf_courses gc ON gc.id = ci.course_id
ORDER BY ci.created_at DESC;
```

**Next step:** Build an admin dashboard to review these!

---

## Next Steps

1. Run the SQL queries above
2. Share the results
3. Check browser console for errors
4. Try with "Pebble Beach Golf Links" as a test

I'll help debug based on what you find!
