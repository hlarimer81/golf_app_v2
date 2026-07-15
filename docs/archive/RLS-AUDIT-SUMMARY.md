# Row Level Security (RLS) Audit Summary

## Current State

### ✅ Tables WITH RLS Enabled
- **course_requests** - Has 2 policies:
  - "Anyone can create course requests" (INSERT)
  - "Anyone can view their own requests" (SELECT)
  
- **course_issues** - Has 2 policies:
  - "Anyone can report course issues" (INSERT)
  - "Anyone can view course issues" (SELECT)

### ❌ Tables WITHOUT RLS Enabled
- **golf_courses** - No RLS, no policies
- **tee_boxes** - No RLS, no policies

## Security Implications

Without RLS enabled, these tables are:
- Fully accessible to anyone with database access
- Not protected by Supabase's authentication layer
- Potentially exposing data through the Supabase REST API without restrictions

## Recommended Fix

Run the SQL script: **`enable-rls-golf-tables.sql`**

This will:
1. Enable RLS on `golf_courses` and `tee_boxes`
2. Create policies allowing:
   - **SELECT**: Anyone can view (public course data)
   - **INSERT/UPDATE/DELETE**: Authenticated users only

## Security Model Options

### Option 1: Current Approach (Authenticated Users)
```sql
-- Any authenticated user can modify courses
-- Good for: Development, small teams, trusted users
```

### Option 2: Admin-Only Modifications (More Restrictive)
```sql
-- Only users with 'admin' role can modify courses
-- Good for: Production, larger teams, untrusted users
-- Requires: Setting up custom JWT claims or roles
```

The script includes commented code for Option 2 if needed later.

## How to Apply

1. Open Supabase SQL Editor
2. Run `enable-rls-golf-tables.sql`
3. Verify with the included queries
4. Test your app to ensure:
   - Course selection still works (SELECT should work)
   - Authenticated users can add courses (if needed)

## Testing Checklist

- [ ] Run `enable-rls-golf-tables.sql` in Supabase
- [ ] Verify RLS is enabled (run verification queries)
- [ ] Test course selection in app (should work)
- [ ] Test adding new courses (should require auth)
- [ ] Test course requests (already has RLS, should still work)
- [ ] Test issue reporting (already has RLS, should still work)

## Future Enhancements

Consider restricting modifications to admin users only by:
1. Adding a custom claim to user JWT (e.g., `role: "admin"`)
2. Updating policies to check: `(auth.jwt() ->> 'role')::text = 'admin'`
3. Using the commented code in `enable-rls-golf-tables.sql`
