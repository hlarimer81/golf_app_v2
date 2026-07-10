# Request Course Edge Function

This Supabase Edge Function automatically fetches golf course data from GolfCourseAPI.com when users request a new course.

## Environment Variables

This function requires the following environment variable:

### `GOLF_API_KEY`

The API key for GolfCourseAPI.com.

**To set in production (Supabase):**
```bash
npx supabase secrets set GOLF_API_KEY=your_api_key_here
```

**For local development:**

Create a `.env` file in the project root:
```bash
GOLF_API_KEY=your_api_key_here
```

**Note:** The `.env` file is already in `.gitignore` and will NOT be committed to Git.

## Getting an API Key

1. Go to https://golfcourseapi.com
2. Sign up with your email (free tier)
3. Activate your account via the email link
4. Copy your API key from the activation email

## Deployment

```bash
# Deploy the function
npx supabase functions deploy request-course

# Set the API key (if not already set)
npx supabase secrets set GOLF_API_KEY=your_key_here
```

## Testing

```bash
# Test from the frontend
const { data, error } = await supabase.functions.invoke('request-course', {
  body: {
    courseName: 'Pebble Beach Golf Links',
    location: 'Pebble Beach, CA',
    requestedBy: 'user@app'
  }
});
```

## Security

- ✅ API key stored as Supabase secret (encrypted)
- ✅ Not committed to Git
- ✅ Only accessible to edge functions
- ✅ Local `.env` file gitignored

## What It Does

1. Searches GolfCourseAPI.com for the requested course
2. Parses course data (name, location, tee boxes)
3. Attempts to fetch GPS data from OpenStreetMap
4. Creates course in `golf_courses` table
5. Creates all tee boxes in `tee_boxes` table
6. Logs the request in `course_requests` table

## API Response

Returns:
```json
{
  "success": true,
  "course": {
    "id": 123,
    "name": "Pebble Beach Golf Links",
    "location": "Pebble Beach, CA",
    "holes": 18
  },
  "message": "Course added successfully!"
}
```
