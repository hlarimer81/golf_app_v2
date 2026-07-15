# Paid Golf GPS API Research

## Objective
Find a reliable paid API that provides front/middle/back green GPS coordinates for golf courses worldwide.

## Leading Candidates

### 1. **18Birdies** ⭐ TOP CHOICE
**Website:** https://18birdies.com / https://18birdies.com/enterprise

**What They Offer:**
- GPS yardages for 40,000+ golf courses worldwide
- Front/middle/back green distances
- Hazard locations
- Mobile app with 4M+ users (proven accuracy)
- Enterprise API available

**How to Contact:**
- Enterprise sales: enterprise@18birdies.com
- General contact: support@18birdies.com
- LinkedIn: https://www.linkedin.com/company/18birdies

**Expected Pricing:**
- Likely $500-$2,000/month for API access
- May offer per-course pricing
- Could negotiate startup rate

**Next Steps:**
1. Email enterprise@18birdies.com with:
   - Brief app description
   - Estimated usage (courses/month)
   - Ask for API documentation & pricing
2. Request trial access to evaluate data quality

---

### 2. **GolfNow / NBC Sports Next**
**Website:** https://www.golfnow.com

**What They Offer:**
- Tee time booking platform
- Course database (18,000+ courses)
- May have GPS data through GolfNow Compete platform

**How to Contact:**
- Business inquiries: https://business.golfnow.com
- May require partnership vs API

**Expected Pricing:**
- Unknown - likely high (enterprise only)

**Status:**
- Lower priority (focused on tee times, not GPS data APIs)

---

### 3. **SwingU**
**Website:** https://swinggolf.com

**What They Offer:**
- GPS rangefinder app
- Course maps for 40,000+ courses
- Front/middle/back distances
- Enterprise/B2B solutions mentioned

**How to Contact:**
- Contact form: https://swinggolf.com/contact
- LinkedIn: https://www.linkedin.com/company/swingu

**Expected Pricing:**
- $1,000-$3,000/month (estimate)
- May require revenue share

**Next Steps:**
- Fill out contact form asking about API access

---

### 4. **GolfLogix**
**Website:** https://golflogix.com

**What They Offer:**
- GPS rangefinder (one of the oldest)
- 35,000+ courses mapped
- Detailed hole-by-hole data

**How to Contact:**
- Support: support@golflogix.com
- No public API info - likely B2B partnerships only

**Expected Pricing:**
- Unknown - may not offer API

**Status:**
- Lower priority - seems more focused on consumer app

---

### 5. **Arccos Golf**
**Website:** https://www.arccosgolf.com

**What They Offer:**
- Smart club tracking system
- GPS data for 40,000+ courses
- AI-powered yardages

**How to Contact:**
- Contact: https://www.arccosgolf.com/pages/contact-us
- May have B2B opportunities

**Expected Pricing:**
- Unknown - focused on hardware + subscription

**Status:**
- Lower priority (hardware-first company)

---

### 6. **Google Maps Platform**
**Website:** https://mapsplatform.google.com

**What They Offer:**
- Place details (course location)
- Satellite imagery
- Could derive green centers from imagery

**Pricing:**
- ~$0.017 per Place Details call
- ~$0.002 per Geocoding call
- Could be cost-effective at low volume

**Limitation:**
- NO hole-level data
- Would only get course-level coordinates
- **Not suitable for our needs**

---

## Comparison Matrix

| Provider | Courses | Front/Mid/Back | API Available | Est. Cost/Month | Quality |
|----------|---------|----------------|---------------|-----------------|---------|
| 18Birdies | 40,000+ | ✅ Yes | ✅ Yes | $500-$2,000 | ⭐⭐⭐⭐⭐ |
| SwingU | 40,000+ | ✅ Yes | ❓ Maybe | $1,000-$3,000 | ⭐⭐⭐⭐ |
| GolfLogix | 35,000+ | ✅ Yes | ❓ Maybe | Unknown | ⭐⭐⭐⭐ |
| Arccos | 40,000+ | ✅ Yes | ❓ Maybe | Unknown | ⭐⭐⭐⭐ |
| GolfNow | 18,000+ | ❓ Unknown | ❌ No | N/A | ❓ |
| Google Maps | N/A | ❌ No | ✅ Yes | $0.02/course | ⚠️ Course-level only |

---

## Recommendation

**Start with 18Birdies:**

1. **Why:**
   - Largest course database
   - Proven accuracy (4M+ users)
   - Explicitly offers enterprise API
   - Most likely to have hole-level GPS data

2. **Backup Options:**
   - SwingU (similar offering)
   - GolfLogix (if 18Birdies declines)

3. **Fallback:**
   - Continue with OSM + crowdsourcing
   - Build manual entry feature (already implemented)

---

## Outreach Email Template

**Subject:** API Partnership Inquiry - Golf GPS App

```
Hi [Company] Team,

I'm building a golf scoring app called 4Play Golf that currently serves
hundreds of golfers tracking rounds across different courses.

We're looking to integrate GPS yardage data (front/middle/back green
coordinates) to enhance our players' experience, and [Company] is our
top choice given your proven data quality and course coverage.

**What we're looking for:**
- API access to green GPS coordinates (front/middle/back)
- Coverage for US courses (expanding internationally later)
- Estimated usage: ~500 courses/month to start

**Questions:**
1. Do you offer API access for B2B partners?
2. What pricing models are available (per course, monthly, annual)?
3. Can you provide sample data or trial access for evaluation?

Happy to schedule a call to discuss further.

Best regards,
[Your Name]
[Your Contact]
```

---

## Next Actions

### Immediate (This Week)
- [x] Research potential providers
- [ ] Email 18Birdies enterprise team
- [ ] Fill out SwingU contact form
- [ ] Reach out to GolfLogix support

### Follow-up (Next 2 Weeks)
- [ ] Evaluate responses and pricing
- [ ] Request trial data from top candidate
- [ ] Test integration with sample data
- [ ] Make build vs buy decision

### Decision Criteria
- Cost < $2,000/month for 10,000 courses
- Data quality: 95%+ accuracy
- Coverage: 5,000+ US courses minimum
- API reliability: 99%+ uptime

---

## Alternative: DIY ML Solution

If APIs are too expensive or unavailable:

**Satellite Imagery + Machine Learning**
- Use Google Earth Engine or Mapbox satellite imagery
- Train ML model to detect greens (distinctive green color + shape)
- Calculate center point of each detected green
- Manual verification for top 100-500 courses

**Cost:**
- Development: $10k-$20k (one-time)
- Imagery API: ~$1-5 per course (one-time)
- Ongoing: $0

**Timeline:**
- 3-6 months to build and validate

**Risk:**
- Technical complexity
- Accuracy concerns
- Can't match hole numbers automatically

---

## Budget Scenarios

### Scenario 1: Early Stage (100 users, 50 courses)
- **Best option:** OSM + Manual Entry + Crowdsourcing
- **Cost:** $0/month
- **Quality:** Low initially, improves over time

### Scenario 2: Growth Stage (1,000 users, 500 courses)
- **Best option:** Paid API (18Birdies or SwingU)
- **Cost:** $500-$1,000/month
- **Quality:** High immediately

### Scenario 3: Scale (10,000+ users, 5,000 courses)
- **Best option:** Paid API with volume pricing
- **Cost:** $1,500-$3,000/month (negotiated rate)
- **Quality:** High + comprehensive

### Scenario 4: Post-Funding (100,000+ users)
- **Best option:** License data + DIY ML for uncovered courses
- **Cost:** $5,000+/month + one-time ML investment
- **Quality:** Maximum coverage

---

## Questions to Ask Vendors

1. **Data Coverage:**
   - How many courses in US? Worldwide?
   - How often is data updated?
   - What's your data collection methodology?

2. **API Details:**
   - RESTful? GraphQL? Other?
   - Rate limits?
   - Uptime SLA?
   - Documentation quality?

3. **Pricing:**
   - Per-course? Per-request? Flat monthly?
   - Startup/volume discounts?
   - Free tier or trial?

4. **Data Format:**
   - Lat/long for front/middle/back?
   - Hazard locations included?
   - Elevation data?

5. **Legal:**
   - License terms?
   - Can we cache data?
   - Resale restrictions?

---

## Status: In Progress

**Last Updated:** 2026-07-13
**Owner:** Development Team
**Next Review:** After vendor responses received
