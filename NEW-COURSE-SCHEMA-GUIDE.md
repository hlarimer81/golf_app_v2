# Golf Courses Schema Migration Guide

## Overview

This guide explains the new database schema for golf courses that properly handles multiple tee boxes per course.

## Current Problem

Right now, each tee box is stored as a separate course:
- `Veenker Blue` (one database row)
- `Veenker White` (another database row)
- `Veenker Red` (yet another database row)

This creates issues:
- Can't select "Veenker" and then choose tees
- Duplicate course data across tee boxes
- Confusing course selection UI

## New Schema Solution

### Two Tables

**`golf_courses`** - One row per physical course
```sql
- id (UUID primary key)
- name (e.g., "Veenker Golf Course")
- location (e.g., "Ames, Iowa")
- holes (9 or 18)
- greens (JSONB, GPS coordinates - same for all tee boxes)
```

**`tee_boxes`** - Multiple rows per course
```sql
- id (UUID primary key)
- course_id (foreign key to golf_courses)
- tee_name (e.g., "Blue", "White", "Red")
- tee_color (hex color for UI, e.g., "#0066CC")
- rating (course rating, e.g., 72.3)
- slope (slope rating, e.g., 130)
- par (integer array, e.g., [4,4,3,5,...])
- stroke_index (integer array, handicap allocation)
- yardage (integer array, optional)
```

**Note:** GPS data (`greens`) is stored in `golf_courses`, not `tee_boxes`, since green locations don't change based on which tees you play from.

## Migration Steps

### 1. Inspect Current Data

First, see what you have:
```bash
node inspect-current-courses.js
```

This will show all courses and suggest how to group them.

### 2. Create New Tables

Run in Supabase SQL Editor:
```bash
cat create-golf-courses-schema.sql
```

### 3. Migrate Data

Edit `migrate-existing-courses.sql` based on your inspection results, then run it.

Example for a course with multiple tees:
```sql
-- Create course
INSERT INTO golf_courses (name, location, holes)
VALUES ('Veenker Golf Course', 'Ames, Iowa', 18)
RETURNING id;

-- Add each tee box
INSERT INTO tee_boxes (course_id, tee_name, tee_color, rating, slope, par, stroke_index)
SELECT <course_id>, 'Blue', '#0066CC', rating, slope, par, stroke_index
FROM courses WHERE name = 'Veenker Blue';
```

### 4. Update Application Code

The app needs to:
1. Fetch courses from `golf_courses` (not `courses`)
2. When course selected, fetch available tee boxes
3. User selects tee box
4. Use tee box rating/slope for handicap calculations

See `example-app-integration.jsx` for code examples.

## Benefits

✅ One course = one database entry
✅ Tee selection in UI instead of course name parsing
✅ Accurate handicap calculations per tee box
✅ Cleaner data model
✅ Old `courses` table stays intact for other app

## Handicap Calculation

With this schema, proper WHS handicap calculation becomes:

```javascript
const courseHandicap = (handicapIndex, slope, rating, par) => {
  return Math.round((handicapIndex * slope / 113) + (rating - par));
};
```

Each tee box has its own rating/slope, so different tees produce different course handicaps!

## Example Data Structure

```javascript
// golf_courses table
{
  id: "uuid-1",
  name: "Veenker Golf Course",
  location: "Ames, Iowa",
  holes: 18,
  greens: [
    {f: [42.0225, -92.9365], m: [42.0226, -92.9366], b: [42.0227, -92.9367]},
    {f: [42.0235, -92.9375], m: [42.0236, -92.9376], b: [42.0237, -92.9377]}
    // ... all 18 holes
  ]
}

// tee_boxes table
[
  {
    id: "uuid-2",
    course_id: "uuid-1",
    tee_name: "Blue",
    tee_color: "#0066CC",
    rating: 72.3,
    slope: 130,
    par: [4,4,3,5,4,3,4,4,4,4,4,3,5,4,4,3,4,4]
  },
  {
    id: "uuid-3",
    course_id: "uuid-1",
    tee_name: "White",
    tee_color: "#FFFFFF",
    rating: 69.8,
    slope: 125,
    par: [4,4,3,5,4,3,4,4,4,4,4,3,5,4,4,3,4,4]
  }
]
```

## Common Tee Colors

Standard golf tee box colors for UI:
- Black: `#000000` (Championship)
- Blue: `#0066CC` (Men's)
- White: `#FFFFFF` (Senior/Men's)
- Gold: `#FFD700` (Senior)
- Red: `#CC0000` (Women's)
- Green: `#00AA00` (Junior/Forward)
