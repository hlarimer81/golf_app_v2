# What to Look For After Running RLS Script

## Quick Check: Run `verify-rls-enabled.sql`

Open Supabase SQL Editor and run the `verify-rls-enabled.sql` file.

## Expected Results

### Query 1: RLS Enabled Status
```
tablename        | rls_enabled
-----------------+-------------
course_issues    | true
course_requests  | true
golf_courses     | true        ← Should now be true!
tee_boxes        | true        ← Should now be true!
```

**✅ PASS:** All tables show `true`  
**❌ FAIL:** If `golf_courses` or `tee_boxes` show `false`, RLS didn't enable

---

### Query 2: Policy Counts
```
tablename        | policy_count
-----------------+-------------
course_issues    | 2
course_requests  | 2
golf_courses     | 4            ← Should be 4 policies
tee_boxes        | 4            ← Should be 4 policies
```

**✅ PASS:** `golf_courses` and `tee_boxes` each have 4 policies  
**❌ FAIL:** If count is less than 4, some policies didn't create

---

### Query 3: Policy Details
You should see these policies for each table:

**golf_courses:**
- ✅ "Anyone can view golf courses" (SELECT) - public access
- ✅ "Authenticated users can add courses" (INSERT) - requires auth
- ✅ "Authenticated users can update courses" (UPDATE) - requires auth
- ✅ "Authenticated users can delete courses" (DELETE) - requires auth

**tee_boxes:**
- ✅ "Anyone can view tee boxes" (SELECT) - public access
- ✅ "Authenticated users can add tee boxes" (INSERT) - requires auth
- ✅ "Authenticated users can update tee boxes" (UPDATE) - requires auth
- ✅ "Authenticated users can delete tee boxes" (DELETE) - requires auth

---

## What This Means for Your App

### ✅ What Still Works (No Auth Needed)
- Viewing golf courses
- Viewing tee boxes
- Selecting courses in your app
- Displaying course information

### 🔒 What Now Requires Authentication
- Adding new courses
- Updating course data
- Deleting courses
- Adding/updating/deleting tee boxes

### Already Protected (From Before)
- Course requests (already had RLS)
- Course issues (already had RLS)

---

## Test in Your App

1. **Test WITHOUT login:** Course selection should still work
2. **Test WITH login:** Adding courses should work (if your app does this)
3. **Test course requests:** Should still work (already protected)

---

## If Something Doesn't Look Right

Run this to see any errors:
```sql
SELECT * FROM pg_stat_activity WHERE state = 'active';
```

Or check if policies conflict:
```sql
SELECT * FROM pg_policies WHERE tablename = 'golf_courses';
```
