# Migration Instructions

Follow these steps to migrate from the old `courses` table to the new `golf_courses` + `tee_boxes` schema.

## Step 1: Create the New Tables in Supabase

1. Go to your Supabase Dashboard
2. Click on **SQL Editor** in the left sidebar
3. Click **New Query**
4. Copy the entire contents of `create-golf-courses-schema.sql`
5. Paste it into the SQL Editor
6. Click **Run** (or press Cmd/Ctrl + Enter)

You should see: "Success. No rows returned"

This creates two new tables:
- `golf_courses` (main courses)
- `tee_boxes` (tee boxes per course)

## Step 2: Run the Migration Script

Back in your terminal, run:

```bash
cd golf_app_v2
node run-migration-simple.js
```

This script will:
1. ✅ Inspect your current courses
2. ✅ Group them by base name (e.g., "Veenker Blue/White/Red" → "Veenker")
3. ✅ Create one course per group
4. ✅ Create tee boxes for each variant
5. ✅ Copy GPS data to the course level

## What the Migration Does

**Before:**
```
courses table:
- Veenker Blue (rating: 72.3, slope: 130)
- Veenker White (rating: 69.8, slope: 125)
- Veenker Red (rating: 67.5, slope: 120)
```

**After:**
```
golf_courses table:
- Veenker Golf Course (holes: 18, greens: [...])

tee_boxes table:
- Blue tees (rating: 72.3, slope: 130, course_id: veenker)
- White tees (rating: 69.8, slope: 125, course_id: veenker)
- Red tees (rating: 67.5, slope: 120, course_id: veenker)
```

## Troubleshooting

### "New tables do not exist yet"
- You need to run the SQL in Step 1 first

### "Data already exists in golf_courses table"
- The migration has already been run
- If you want to re-run it, delete the data from `golf_courses` and `tee_boxes` first:
  ```sql
  DELETE FROM tee_boxes;
  DELETE FROM golf_courses;
  ```

### Course names not grouping correctly
- Check the regex in `run-migration-simple.js` line 26
- It looks for patterns like "Name Blue", "Name White", etc.
- You can customize it for your course naming convention

## After Migration

1. ✅ Verify data in Supabase dashboard (Tables → golf_courses, tee_boxes)
2. ✅ Update App.jsx using `example-app-integration.jsx` as reference
3. ✅ Test course/tee selection in your app
4. ✅ The old `courses` table remains untouched for your other app

## Rollback

If you need to rollback:

```sql
DROP TABLE tee_boxes CASCADE;
DROP TABLE golf_courses CASCADE;
```

The old `courses` table is never modified, so your other app continues working.
