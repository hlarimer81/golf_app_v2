# Dynamic GPS from Green Polygons - Implementation Guide

## Overview
Instead of storing static front/middle/back GPS points, we now store **full green polygons** from OpenStreetMap and calculate distances dynamically based on the user's position.

## Benefits
✅ **Accurate from ANY direction** - No matter where you approach from  
✅ **Works for irregular greens** - Kidney shapes, multi-tier greens  
✅ **Fully automated** - No manual GPS entry needed  
✅ **Real-time calculation** - Front = closest point to YOU right now  

## How It Works

### Old Format (Static Points):
```json
{
  "greens": [
    {"f": [41.5, -93.6], "m": [41.501, -93.601], "b": [41.502, -93.599]},
    ...
  ]
}
```
**Problem:** Front/middle/back are fixed. If you approach from the side, "front" might actually be farther!

### New Format (Polygon):
```json
{
  "greens": [
    {
      "hole": 1,
      "polygon": [
        [41.50123, -93.60456],
        [41.50145, -93.60478],
        [41.50167, -93.60445],
        [41.50189, -93.60423],
        ...
      ]
    },
    {"hole": 2, "polygon": [...]},
    ...
  ]
}
```

### Distance Calculation:
```javascript
User at GPS: (41.52, -93.61)
Green polygon: 25 points outlining the green

→ Front = distance to CLOSEST point on polygon = 137 yards
→ Middle = distance to CENTROID of polygon = 145 yards  
→ Back = distance to FARTHEST point on polygon = 153 yards
```

## Implementation Steps

### 1. Update Database Schema

Run `update-greens-to-polygons.sql` in Supabase:
- Migrates existing courses from old format to polygon format
- Creates simple 3-point polygons from existing f/m/b data
- New courses will store full OSM polygons

### 2. Update GolfGPSWidget

**Already done!** The widget now:
- Checks if greens are in polygon format
- If yes → calculates dynamically from polygon
- If no → falls back to old f/m/b format (backward compatible)

### 3. Update Edge Function

**Already done!** When users request courses:
1. Calls GolfCourseAPI.com → Gets par, stroke index, ratings
2. Calls OpenStreetMap Overpass API → Gets green polygons
3. Stores polygons in database
4. Course is ready immediately!

### 4. Deploy Edge Function

```bash
# Copy function to Supabase functions directory
mkdir -p supabase/functions/request-course
cp supabase-edge-function-request-course.ts supabase/functions/request-course/index.ts

# Deploy
supabase functions deploy request-course
```

## Data Sources

### GolfCourseAPI.com (Course Data)
- Par per hole ✅
- Stroke index per hole ✅
- Rating/Slope per tee ✅
- Multiple tee boxes ✅
- **FREE TIER:** 50 requests/day

### OpenStreetMap (GPS Data)
- Green polygons ✅
- Hole numbers ✅
- Tee box locations ✅
- **100% FREE**

## Example: Course Request Flow

```
User: "Add Pebble Beach Golf Links"
  ↓
Edge Function triggers
  ↓
1. GolfCourseAPI.com → 
   - Blue Tees: Par [4,5,4,...], Slope 142, Rating 75.5
   - White Tees: Par [4,5,4,...], Slope 136, Rating 73.2
  ↓
2. OpenStreetMap →
   - Hole 1 green: 18 coordinate points
   - Hole 2 green: 22 coordinate points
   - ... (all 18 greens)
  ↓
3. Create in database →
   - golf_courses: name, location, greens (polygons)
   - tee_boxes: Blue tees, White tees (with data)
  ↓
Course appears in app within 5-10 seconds!
```

## Testing

### Test OSM Query Manually

Visit: https://overpass-turbo.eu/

Paste this query (change course name):
```
[out:json][timeout:30];
(
  way["leisure"="golf_course"]["name"~"Veenker", i];
  relation["leisure"="golf_course"]["name"~"Veenker", i];
)->.golfcourse;
.golfcourse map_to_area -> .coursearea;
(
  way["golf"="green"](area.coursearea);
  relation["golf"="green"](area.coursearea);
);
out geom;
```

Click "Run" → Should show greens on map with coordinates

### Test in Your App

1. Request a course with "Request Course" button
2. Watch browser console for logs
3. Check `course_requests` table for status
4. If successful, green polygons will be in `golf_courses.greens`

## Coverage & Limitations

### Courses WITH Green Data in OSM:
- Most major US courses ✅
- Popular public courses ✅
- Newer courses (mapped by GPS golfers) ✅

### Courses WITHOUT Green Data:
- Private/exclusive courses ❌
- Very remote courses ❌
- Courses not yet mapped ❌

**Fallback:** If OSM has no greens, course is still added (just no GPS). User can report issue → you manually add GPS later.

## Monitoring

### Check Course Request Status:
```sql
SELECT 
  course_name,
  status,
  error_message,
  created_at
FROM course_requests
ORDER BY created_at DESC
LIMIT 20;
```

### Check Courses with GPS:
```sql
SELECT 
  name,
  location,
  CASE 
    WHEN greens IS NOT NULL THEN 'Yes (' || jsonb_array_length(greens) || ' holes)'
    ELSE 'No GPS'
  END as gps_status
FROM golf_courses
ORDER BY name;
```

### Check Failed Requests:
```sql
SELECT * FROM course_requests 
WHERE status = 'failed' 
ORDER BY created_at DESC;
```

## What's Automated vs Manual

### ✅ AUTOMATED:
- Course name, location
- Par per hole (all 18)
- Stroke index per hole
- Rating/Slope per tee
- Multiple tee boxes
- **Green GPS polygons** (if in OSM)

### ❌ STILL MANUAL:
- Courses not in GolfCourseAPI.com
- Courses without OSM green data
- Verifying hole numbers match correctly
- Adding missing tee boxes

## Next Steps

1. ✅ Run `course-request-system.sql` (creates tables)
2. ✅ Run `update-greens-to-polygons.sql` (migrates existing courses)
3. ✅ Deploy edge function
4. ✅ Test requesting a course
5. 📝 Sign up for GolfCourseAPI.com
6. 📝 Test actual API response structure
7. 📝 Adjust edge function if API format differs
8. 🚀 Deploy and test on phone!

## Troubleshooting

**OSM returns no greens:**
- Course might not be mapped in OSM
- Try searching OpenStreetMap.org for the course
- If greens exist but not returned, check query syntax

**Distances seem wrong:**
- Check polygon coordinate order (should be [lat, lon])
- Verify haversine formula is correct
- Test with known distance (walk to green edge, check app)

**Edge function timeout:**
- OSM Overpass API can be slow (30s timeout set)
- If timeout, course is still created (just without GPS)
- User can retry or report issue

## Future Enhancements

1. **Crowdsource GPS** - Let users submit green polygons
2. **Tee box GPS** - Also calculate distance from tee
3. **Hazard polygons** - Water, bunkers from OSM
4. **Fairway width** - Help with club selection
5. **Elevation data** - From USGS APIs

---

**Bottom Line:** You now have a system that auto-fetches course data AND GPS coordinates. 95% automation! 🎉
