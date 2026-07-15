# Course Request Tips - How to Get Better Results

## 🎯 The Problem We Just Discovered

The Golf Course API is **very picky** about search queries. Adding location information often makes it return **0 results** even when the course exists!

## ✅ What Works Best

### DO: Use Just the Course Name
```
✓ "Coldwater"
✓ "Woodland Hills"
✓ "Fort Dodge Country Club"
✓ "Pebble Beach"
```

### DON'T: Add Location Details
```
✗ "Coldwater Golf Course, Coldwater, MI"
✗ "Woodland Hills Golf Course - Ames, IA"
✗ "Fort Dodge Country Club Fort Dodge Iowa"
```

**Why?** The API's search algorithm gets confused when you include location details. It works much better with just the course name.

## 📝 How to Request a Course

### Option 1: Leave Location Blank (Best Results)
1. Click the **+** button
2. Course Name: `Coldwater`
3. Location: *(leave empty)*
4. Submit

The API will find "Coldwater Golf Course" automatically.

### Option 2: Very Short Course Name
1. Click the **+** button
2. Course Name: `Woodland` (just first word)
3. Location: *(leave empty)*
4. Submit

## 🔧 What We Fixed

The edge function now tries **3 different search strategies**:

1. **First try:** Course name + location (your input)
2. **Second try:** Just course name (no location)
3. **Third try:** First 2 words of course name + location

It stops as soon as it finds a match!

## 🧪 Testing Course Names

Before requesting, you can test if a course exists by searching at:
https://golfcourseapi.com

Or test the API directly:
```bash
curl -H "Authorization: Key YOUR_API_KEY_HERE" \
  "https://api.golfcourseapi.com/v1/search?search_query=Coldwater"
```

## 📊 Check What Happened

After requesting a course, run this query to see what the search tried:

```sql
SELECT
  course_name,
  error_message,
  created_at
FROM course_requests
ORDER BY created_at DESC
LIMIT 1;
```

The `error_message` field shows:
- What search queries were tried
- Which one worked (✓) or failed (×)
- How many tees were found

## 🎯 Examples That Work

| Course You Want | What to Enter | Will Find |
|----------------|---------------|-----------|
| Coldwater Golf Course, MI | `Coldwater` | Coldwater Golf Club |
| Woodland Hills, Ames | `Woodland Hills` | Woodland Hills Golf Club |
| Fort Dodge CC | `Fort Dodge Country Club` | Fort Dodge Country Club |
| Pebble Beach | `Pebble Beach` | Pebble Beach Golf Links |
| Veenker Memorial | `Veenker` | Veenker Memorial Golf Course |

## 🐛 If a Course Still Doesn't Work

1. **Try shorter names**
   - Instead of "Ames Golf and Country Club"
   - Try just "Ames Golf"

2. **Try different variations**
   - "TPC Sawgrass" vs "Sawgrass"
   - "Bethpage Black" vs "Bethpage"

3. **Check the exact name** at https://golfcourseapi.com
   - The API might have it listed differently
   - e.g., "GC" instead of "Golf Course"

4. **Check the debug info**
   ```sql
   SELECT error_message
   FROM course_requests
   WHERE course_name = 'Your Course Name'
   ORDER BY created_at DESC
   LIMIT 1;
   ```

## 💡 Pro Tip

The multi-strategy search means you can still enter location if you want - the function will try with it, and if that fails, automatically retry without it!

**Just enter the course name and let the function figure it out.** 🎉

---

**Last Updated:** July 10, 2026  
**Status:** Multi-strategy search deployed ✅
