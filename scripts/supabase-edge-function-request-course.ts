// ===========================================================================
// Supabase Edge Function: request-course
// ===========================================================================
// Auto-fetches course data from GolfCourseAPI.com and creates course
// Deploy this to Supabase: supabase functions deploy request-course
//
// Endpoint: https://[your-project].supabase.co/functions/v1/request-course
// ===========================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const GOLF_API_KEY = Deno.env.get('GOLF_API_KEY') || '' // Free tier doesn't need key
const GOLF_API_BASE = 'https://api.golfcourseapi.com' // Adjust based on actual endpoint

// ===========================================================================
// OpenStreetMap Green Fetcher
// ===========================================================================

async function fetchGreenPolygonsFromOSM(courseName: string, location: string = '') {
  const escapedName = courseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  const query = `
    [out:json][timeout:30];
    (
      way["leisure"="golf_course"]["name"~"${escapedName}", i];
      relation["leisure"="golf_course"]["name"~"${escapedName}", i];
    )->.golfcourse;
    .golfcourse map_to_area -> .coursearea;
    (
      way["golf"="green"](area.coursearea);
      relation["golf"="green"](area.coursearea);
    );
    out geom;
  `

  const response = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'data=' + encodeURIComponent(query)
  })

  if (!response.ok) {
    throw new Error(`OSM API error: ${response.status}`)
  }

  const data = await response.json()

  if (!data.elements || data.elements.length === 0) {
    return []
  }

  const greens: any[] = []

  for (const element of data.elements) {
    if (element.type === 'way' && element.geometry) {
      const holeNumber = extractHoleNumber(element.tags)
      const polygon = element.geometry.map((coord: any) => [coord.lat, coord.lon])

      greens.push({
        hole: holeNumber,
        polygon: polygon,
        tags: element.tags
      })
    } else if (element.type === 'relation' && element.members) {
      const outerWay = element.members.find((m: any) => m.role === 'outer')
      if (outerWay && outerWay.geometry) {
        const holeNumber = extractHoleNumber(element.tags)
        const polygon = outerWay.geometry.map((coord: any) => [coord.lat, coord.lon])

        greens.push({
          hole: holeNumber,
          polygon: polygon,
          tags: element.tags
        })
      }
    }
  }

  greens.sort((a, b) => (a.hole || 99) - (b.hole || 99))
  return greens
}

function extractHoleNumber(tags: any): number | null {
  if (!tags) return null

  if (tags.ref) {
    const num = parseInt(tags.ref)
    if (!isNaN(num)) return num
  }

  if (tags.name) {
    const match = tags.name.match(/\d+/)
    if (match) return parseInt(match[0])
  }

  if (tags['ref:hole']) {
    const num = parseInt(tags['ref:hole'])
    if (!isNaN(num)) return num
  }

  return null
}

serve(async (req) => {
  try {
    // Parse request
    const { courseName, location, requestedBy } = await req.json()

    if (!courseName) {
      return new Response(
        JSON.stringify({ error: 'courseName is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Create course request record
    const { data: requestRecord, error: requestError } = await supabase
      .from('course_requests')
      .insert({
        course_name: courseName,
        location: location,
        requested_by: requestedBy,
        status: 'processing'
      })
      .select()
      .single()

    if (requestError) throw requestError

    try {
      // Step 1: Search for course on Golf API
      // NOTE: Actual API endpoint may differ - this is placeholder
      const searchResponse = await fetch(
        `${GOLF_API_BASE}/courses/search?name=${encodeURIComponent(courseName)}&location=${encodeURIComponent(location || '')}`,
        {
          headers: GOLF_API_KEY ? { 'X-API-Key': GOLF_API_KEY } : {}
        }
      )

      if (!searchResponse.ok) {
        throw new Error(`Golf API error: ${searchResponse.status}`)
      }

      const courseData = await searchResponse.json()

      // Step 2: Parse API response
      // NOTE: Structure depends on actual API - adjust as needed
      const course = courseData.courses?.[0] || courseData

      if (!course) {
        throw new Error('Course not found in Golf API')
      }

      // Step 3: Fetch green polygons from OpenStreetMap
      let greens = null
      try {
        greens = await fetchGreenPolygonsFromOSM(courseName, location)
        console.log(`Fetched ${greens?.length || 0} greens from OSM`)
      } catch (osmError: any) {
        console.warn('OSM fetch failed, continuing without greens:', osmError.message)
        // Don't fail the whole request if OSM is down
      }

      // Step 4: Create golf_courses entry
      const { data: newCourse, error: courseError } = await supabase
        .from('golf_courses')
        .insert({
          name: course.name || courseName,
          location: course.location || course.city || location,
          holes: 18, // Assume 18 unless API specifies
          greens: greens && greens.length > 0 ? greens.map(g => ({
            hole: g.hole,
            polygon: g.polygon
          })) : null
        })
        .select()
        .single()

      if (courseError) throw courseError

      // Step 5: Create tee boxes
      // API response structure varies - adjust based on actual data
      const tees = course.tees || course.teeBoxes || []

      for (const tee of tees) {
        await supabase.from('tee_boxes').insert({
          course_id: newCourse.id,
          tee_name: tee.name || tee.teeName || tee.color,
          tee_color: getTeeColor(tee.color || tee.name),
          rating: parseFloat(tee.rating) || null,
          slope: parseInt(tee.slope) || null,
          par: tee.par || Array(18).fill(4), // Default if missing
          stroke_index: tee.strokeIndex || tee.handicap || Array(18).fill(10),
          yardage: tee.yardage || tee.distance || null
        })
      }

      // Step 6: Mark request as completed
      await supabase
        .from('course_requests')
        .update({
          status: 'completed',
          created_course_id: newCourse.id,
          completed_at: new Date().toISOString(),
          api_response: courseData
        })
        .eq('id', requestRecord.id)

      return new Response(
        JSON.stringify({
          success: true,
          course: newCourse,
          message: 'Course added successfully!'
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )

    } catch (apiError) {
      // Mark request as failed
      await supabase
        .from('course_requests')
        .update({
          status: 'failed',
          error_message: apiError.message,
          completed_at: new Date().toISOString()
        })
        .eq('id', requestRecord.id)

      return new Response(
        JSON.stringify({
          success: false,
          error: apiError.message,
          message: 'Failed to fetch course data. Admin has been notified.'
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})

// Helper function to map tee names to colors
function getTeeColor(name: string): string {
  const colorMap: Record<string, string> = {
    'black': '#000000',
    'blue': '#0066CC',
    'white': '#FFFFFF',
    'gold': '#FFD700',
    'red': '#CC0000',
    'green': '#00AA00',
    'championship': '#0066CC'
  }

  const normalized = name?.toLowerCase() || ''
  return colorMap[normalized] || '#888888'
}
