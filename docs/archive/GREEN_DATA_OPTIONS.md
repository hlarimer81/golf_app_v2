# Green Location Data - Research & Options

## Current Situation

**GolfCourseAPI.com**: Does NOT provide green location data
- Only has: par, yardage, handicap per hole
- Has course-level lat/long but nothing at hole/green level
- See test output in test-golf-api.js

**OpenStreetMap**: Technically possible but extremely sparse
- Tested 5 major courses: 0 had green data
- Requires manual mapping by OSM contributors
- Not reliable for production use

## Alternative Data Sources

### 1. Google Maps Platform (Best Option)
**Google Places API + Maps JavaScript API**

**Pros:**
- Most comprehensive coverage
- Can search for "golf course" + get place ID
- Can use Place Details to get coordinates
- Could potentially use satellite imagery to calculate green centers

**Cons:**
- $$$ Commercial pricing
- ~$0.017 per Place Details request
- ~$0.002 per Geocoding request
- Requires Google Cloud account

**Implementation:**
```javascript
// 1. Search for course
const searchResponse = await fetch(
  `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${courseName}&key=${API_KEY}`
)

// 2. Get place details with geometry
const detailsResponse = await fetch(
  `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&key=${API_KEY}`
)

// 3. Would still need to manually identify green positions
//    Google doesn't have hole-level data either
```

**Verdict:** Has course coordinates but NOT hole/green-level data

---

### 2. Golf GPS Device Data APIs

**18Birdies API** - https://18birdies.com
- GPS yardages for 40,000+ courses
- May have green depth data
- Requires partnership/license

**GolfLogix** - https://golflogix.com
- GPS data provider
- Not public API (B2B only)

**SwingU** - https://swinggolf.com
- GPS yardages
- Enterprise API available

**Verdict:** These likely have front/middle/back green data but require partnerships

---

### 3. USGA/R&A Course Databases

**USGA Course Rating Database**
- Has detailed course measurements
- Not publicly accessible API
- Data used for course/slope ratings

**Verdict:** Data exists but not accessible

---

### 4. Satellite Imagery + ML (DIY Solution)

**Google Earth Engine or Mapbox**
- Get satellite imagery of course
- Use ML to detect greens (they're distinctive in aerial photos)
- Calculate center point of each green polygon

**Pros:**
- Could work automatically for any course
- One-time processing per course

**Cons:**
- Complex to implement
- Requires ML expertise
- Would need to match greens to hole numbers
- Satellite imagery costs

---

### 5. Manual Data Entry + Crowdsourcing

**Let Users Contribute**
- Users tap green center on map when playing
- Aggregate multiple user submissions
- Quality improves over time

**Pros:**
- Free
- Data gets better as more users play
- Users engaged in contribution

**Cons:**
- Starts with no data
- Requires user adoption
- Need validation/moderation

**Implementation:**
```javascript
// User interface:
// "Tap the green center on the map"
// "How far from the front edge?" (front/middle/back calculation)

// Store in database:
{
  course_id: 123,
  hole: 1,
  green_center: {lat: 36.xxx, lon: -121.xxx},
  green_front_distance: 25, // yards from center
  green_back_distance: 30,
  submitted_by: user_id,
  verified: false
}
```

---

### 6. Public Course Management APIs

Some courses use **NotchGolf**, **ForeUp**, or **Lightspeed Golf** for tee time management. These systems sometimes have course layout data, but:
- Individual per course, not aggregated
- Would need to scrape 1000s of courses individually
- Often private data

---

## Recommendation

### Short Term: **Hybrid Approach**

1. **Keep OSM Integration** (Already built)
   - Works when data exists
   - Free
   - Will improve over time

2. **Add Manual Entry Feature**
   - Admin can add front/middle/back distances for each green
   - Store as yards from tee? Or lat/long?
   - Database schema:

```sql
ALTER TABLE golf_courses
ADD COLUMN green_distances JSONB;

-- Format:
{
  "1": {"front": 150, "middle": 165, "back": 180},
  "2": {"front": 320, "middle": 340, "back": 355},
  ...
}
```

3. **Consider GPS API Partnership** (Long term)
   - Reach out to 18Birdies, SwingU, or GolfLogix
   - License their GPS data
   - Typically $X per course or flat monthly fee

### Medium Term: **Crowdsourcing**

- Let users mark green centers on a map
- Aggregate submissions (median of 5+ submissions = verified)
- Gamify it: "Help map your home course!"

### Long Term: **ML + Satellite**

- If app scales to 10k+ users, consider automated green detection
- Process satellite imagery for top 100-500 courses
- One-time investment pays off with comprehensive data

---

## Immediate Action: What Should We Build?

### Option A: Front/Middle/Back Distances (Simpler)
**Schema:**
```json
{
  "hole": 1,
  "green": {
    "front": 150,  // yards from tee
    "middle": 165,
    "back": 180,
    "depth": 30    // front to back in yards
  }
}
```

**Pros:**
- Simpler to input manually
- Easy to display in UI
- Matches how golfers think

**Cons:**
- Not geospatial (can't show on map)
- Tee-box dependent

### Option B: Lat/Long Points (Better for mapping)
**Schema:**
```json
{
  "hole": 1,
  "green": {
    "front": {"lat": 36.xxx, "lon": -121.xxx},
    "center": {"lat": 36.xxx, "lon": -121.xxx},
    "back": {"lat": 36.xxx, "lon": -121.xxx}
  }
}
```

**Pros:**
- Can show on map
- Tee-box independent
- Can calculate distances dynamically

**Cons:**
- Harder to input manually
- Requires map interface

### **Recommended: Option B (Lat/Long)**
- Future-proof
- Enables map visualization
- Can always derive distances

---

## Cost Analysis

| Solution | Setup Cost | Per-Course Cost | Annual Cost |
|----------|------------|-----------------|-------------|
| OSM (current) | $0 | $0 | $0 |
| Manual Entry | Dev time | Admin time | $0 |
| Google Maps | $0 | ~$0.02 | ~$0 (low usage) |
| GPS API License | $0-$5k | $0.50-$2 | $5k-$20k |
| ML + Satellite | $10k-$50k | $1-$5 | $2k-$10k |
| Crowdsourcing | Dev time | $0 | $0 |

For a startup/MVP: **OSM + Manual Entry + Crowdsourcing** = $0
For scale: **GPS API License** = Reliable data for most courses

---

## Next Steps

1. ✅ Keep OSM integration (done)
2. **Decision needed:** Build manual green entry UI?
3. **Decision needed:** Add crowdsourcing feature?
4. Research GPS API partnerships (18Birdies, SwingU)
