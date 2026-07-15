# GolfCourseAPI.com Integration Reference

Quick reference for the Golf Course API integration.

---

## 🔑 Authentication

**API Key:** `YOUR_API_KEY_HERE`

**Header Format:**
```
Authorization: Key YOUR_API_KEY_HERE
```

**Account:** Activated and ready to use  
**Tier:** Free (50 requests/day)

---

## 📡 Endpoints

### Search for Courses
```
GET https://api.golfcourseapi.com/v1/search?search_query={query}
```

**Example:**
```bash
curl -H "Authorization: Key YOUR_API_KEY_HERE" \
  "https://api.golfcourseapi.com/v1/search?search_query=Pebble%20Beach"
```

**Query Tips:**
- Search by course name: `search_query=Pebble Beach`
- Include location: `search_query=Pebble Beach CA`
- Partial names work: `search_query=Veenker`

### Get Specific Course
```
GET https://api.golfcourseapi.com/v1/courses/{id}
```

**Example:**
```bash
curl -H "Authorization: Key YOUR_API_KEY_HERE" \
  "https://api.golfcourseapi.com/v1/courses/24636"
```

---

## 📦 Response Structure

### Search Response
```json
{
  "courses": [
    {
      "id": 24636,
      "club_name": "Pebble Beach Gl",
      "course_name": "Pebble Beach Gl",
      "location": {
        "address": "1700 17-Mile Drive, Pebble Beach, CA 93953, United States",
        "city": "Pebble Beach",
        "state": "CA",
        "country": "United States",
        "latitude": 36.568806,
        "longitude": -121.95062
      },
      "tees": {
        "male": [...],
        "female": [...]
      }
    }
  ]
}
```

### Tee Box Structure
```json
{
  "tee_name": "Blue",
  "course_rating": 74.9,
  "slope_rating": 144,
  "bogey_rating": 101.7,
  "total_yards": 6823,
  "total_meters": 6239,
  "number_of_holes": 18,
  "par_total": 72,
  "front_course_rating": 37.1,
  "front_slope_rating": 141,
  "front_bogey_rating": 50.2,
  "back_course_rating": 37.8,
  "back_slope_rating": 147,
  "back_bogey_rating": 51.5,
  "holes": [
    {
      "par": 4,
      "yardage": 378,
      "handicap": 6
    },
    // ... 18 holes total
  ]
}
```

---

## 🗺️ Data Mapping

How we map API response to our database schema:

### golf_courses Table
| Our Field | API Field | Notes |
|-----------|-----------|-------|
| name | course_name OR club_name | Prefer course_name |
| location | location.city + location.state | Format: "City, ST" |
| holes | tees.male[0].number_of_holes | Default to 18 |
| greens | (from OpenStreetMap) | Separate API call |

### tee_boxes Table
| Our Field | API Field | Notes |
|-----------|-----------|-------|
| tee_name | tee_name | "Blue", "White", etc. |
| tee_color | (derived from name) | Map Blue → #0066CC |
| rating | course_rating | Course rating for handicap |
| slope | slope_rating | Slope rating for handicap |
| par | holes[].par | Array of 18 pars |
| stroke_index | holes[].handicap | Array of 18 stroke indexes |
| yardage | total_yards | Total yardage for the tee |

---

## 🎨 Tee Color Mapping

```javascript
const colorMap = {
  'black': '#000000',
  'blue': '#0066CC',
  'white': '#FFFFFF',
  'gold': '#FFD700',
  'red': '#CC0000',
  'green': '#00AA00',
  'championship': '#0066CC',
  'default': '#888888'
}
```

---

## 🧪 Test Commands

### Search for a Course
```bash
curl -s -H "Authorization: Key YOUR_API_KEY_HERE" \
  "https://api.golfcourseapi.com/v1/search?search_query=Augusta%20National" \
  | jq '.courses[0] | {name: .course_name, city: .location.city, tees: (.tees.male | length)}'
```

### Get Course Details
```bash
curl -s -H "Authorization: Key YOUR_API_KEY_HERE" \
  "https://api.golfcourseapi.com/v1/courses/24636" \
  | jq '{name: .course_name, location: .location.city, tees: [.tees.male[].tee_name]}'
```

### Test Edge Function (from frontend)
```javascript
const { data, error } = await supabase.functions.invoke('request-course', {
  body: {
    courseName: 'Pebble Beach Golf Links',
    location: 'Pebble Beach, CA',
    requestedBy: 'user@app'
  }
});
```

---

## 📊 Coverage & Limitations

**Covered:**
- ~30,000 golf courses worldwide
- Primarily US courses (most complete data)
- International courses (varying completeness)
- Public, semi-private, and private courses

**Not Covered:**
- Very small local courses (9-hole par 3 tracks)
- Brand new courses (< 1 year old)
- Courses that closed recently
- Driving ranges, practice facilities

**Data Quality:**
- Course names: Excellent
- Tee box data: Excellent for US courses
- Par/Slope/Rating: Excellent
- GPS coordinates: Good
- Hole-by-hole yardages: Excellent

---

## ⚠️ API Limits & Best Practices

### Free Tier Limits
- **50 requests/day**
- Resets at midnight UTC
- No rate limiting within the 50/day quota

### Best Practices
1. **Cache results** - Store API response in `course_requests.api_response`
2. **Search before create** - Check if course already exists in DB
3. **Handle failures gracefully** - Fall back to default data if API is down
4. **Log everything** - Keep API responses for debugging
5. **Don't retry failed searches** - One search per course request

### Usage Estimate
- Average use: 3-5 course requests/day
- Heavy use: 10-15 course requests/day
- Free tier is sufficient for most users

---

## 🔄 Update Workflow

If the API key changes or needs rotation:

1. **Get new key** from https://golfcourseapi.com
2. **Update edge function:**
   ```typescript
   const GOLF_API_KEY = Deno.env.get('GOLF_API_KEY') || 'NEW_KEY_HERE'
   ```
3. **Or set as environment variable** in Supabase dashboard:
   - Go to Edge Functions settings
   - Add `GOLF_API_KEY` = `YOUR_NEW_KEY`
   - Redeploy function

4. **Deploy:**
   ```bash
   npx supabase functions deploy request-course
   ```

---

## 🐛 Error Handling

### Common Errors

**"you must be authenticated to access this resource"**
- Missing or incorrect Authorization header
- Check: `Authorization: Key YOUR_API_KEY` (not Bearer)

**"API Key is missing or invalid"**
- Key is wrong or expired
- Get new key from https://golfcourseapi.com

**Empty courses array**
- Course name not in database
- Try different spelling or partial name
- Check if course exists at https://golfcourseapi.com

**Rate limit exceeded**
- Hit 50 requests/day limit
- Wait until midnight UTC for reset
- Consider caching results

---

## 📚 Additional API Features (Not Yet Used)

### Available but Not Implemented
- **User Registration/Activation** - We have a pre-activated key
- **Individual Course GET** - We only use search
- **Healthcheck endpoint** - For monitoring

### Future Enhancement Ideas
- Use course ID to fetch updated data
- Implement course update/refresh functionality
- Add healthcheck to monitor API availability

---

## 📞 Support

**Documentation:** https://api.golfcourseapi.com/docs/api/  
**Website:** https://golfcourseapi.com  
**Issue:** Check documentation or re-authenticate

---

**Last Updated:** July 9, 2026  
**Status:** Active and Working ✅
