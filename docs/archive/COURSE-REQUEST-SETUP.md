# Course Request System - Setup Guide

## Overview
Users can request courses and they're added automatically within seconds. Users can also report issues with course data.

## Setup Steps

### 1. Create Database Tables

Run `course-request-system.sql` in Supabase SQL Editor:
- Creates `course_requests` table
- Creates `course_issues` table  
- Sets up RLS policies
- Adds notification trigger

### 2. Deploy Supabase Edge Function

**Install Supabase CLI** (if not already):
```bash
npm install -g supabase
```

**Login to Supabase:**
```bash
supabase login
```

**Link your project:**
```bash
supabase link --project-ref YOUR_PROJECT_ID
```

**Create the function directory:**
```bash
mkdir -p supabase/functions/request-course
```

**Copy the function code:**
```bash
cp supabase-edge-function-request-course.ts supabase/functions/request-course/index.ts
```

**Deploy the function:**
```bash
supabase functions deploy request-course
```

**Set environment variables:**
```bash
# GOLF_API_KEY is optional for free tier
supabase secrets set GOLF_API_KEY=your_api_key_if_needed
```

### 3. Test the System

**Test API endpoint** (replace with your project URL):
```bash
curl -X POST 'https://YOUR_PROJECT.supabase.co/functions/v1/request-course' \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"courseName": "Pebble Beach Golf Links", "location": "Pebble Beach, CA"}'
```

### 4. UI Integration

The UI components are already integrated in `App.jsx`:

**Request Course:**
- Click the **+** button next to course selector
- Enter course name and location
- Course is added automatically (if found in API)

**Report Issue:**
- Select a course
- Click **"Report Issue with This Course"** button
- Choose issue type and describe the problem
- Admin is notified

### 5. Monitor Requests & Issues

**View course requests:**
```sql
SELECT * FROM course_requests ORDER BY created_at DESC;
```

**View reported issues:**
```sql
SELECT 
  ci.*,
  gc.name as course_name
FROM course_issues ci
JOIN golf_courses gc ON gc.id = ci.course_id
WHERE status = 'open'
ORDER BY created_at DESC;
```

## API Integration Notes

### GolfCourseAPI.com Integration

The edge function is set up for **GolfCourseAPI.com** (free tier):
- **Free**: 50 requests/day (no API key needed)
- **Pro**: $9.99/mo for 10,000 req/day
- **Sign up**: https://golfcourseapi.com

**IMPORTANT:** Update the API endpoint in the edge function once you test the actual API:
```typescript
const GOLF_API_BASE = 'https://api.golfcourseapi.com' // Adjust based on docs
```

### Alternative: GolfAPI.io

If you need more complete data (GPS coordinates, stroke index guaranteed):
- Contact https://www.golfapi.io/ for pricing
- Update the edge function with their endpoint structure

## What Gets Auto-Added

When a user requests a course, the system automatically:
1. ✅ Searches GolfCourseAPI.com
2. ✅ Creates `golf_courses` entry (name, location)
3. ✅ Creates `tee_boxes` entries (all tees with rating/slope/par/stroke index)
4. ❌ **GPS data NOT included** (APIs don't provide green coordinates)

## Handling GPS Data

GPS coordinates for greens are **NOT** available from public APIs. Options:

**Option 1: Manual Entry (Current)**
- Admin adds GPS manually using existing tools
- Most accurate

**Option 2: Crowdsourced**
- Let users submit GPS data when playing
- Verify before publishing

**Option 3: OpenStreetMap (Future)**
- Calculate from green polygons
- Requires additional development

## Admin Dashboard (Future Enhancement)

You can build an admin page to:
- View pending course requests
- Review/edit courses before publishing
- Respond to reported issues
- Add missing GPS data

For now, use SQL queries to monitor:
```sql
-- Failed requests (need manual intervention)
SELECT * FROM course_requests WHERE status = 'failed';

-- Open issues
SELECT * FROM course_issues WHERE status = 'open';
```

## Troubleshooting

**Course not found:**
- API might not have that course
- Try adjusting search terms
- Check `course_requests` table for error message

**Function fails:**
- Check Supabase function logs: Dashboard → Edge Functions → request-course → Logs
- Verify GOLF_API_BASE URL matches actual API
- Check API response structure

**No API key for free tier:**
- GolfCourseAPI.com free tier doesn't require API key
- Leave `GOLF_API_KEY` empty or don't set it

## Next Steps

1. ✅ Run `course-request-system.sql`
2. ✅ Deploy edge function
3. ✅ Test with a real course request
4. ✅ Monitor `course_requests` table
5. 📝 Sign up for GolfCourseAPI.com and test actual endpoints
6. 📝 Update edge function with real API structure
7. 📝 Build admin dashboard (optional)
