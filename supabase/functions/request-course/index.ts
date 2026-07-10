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

const GOLF_API_KEY = Deno.env.get('GOLF_API_KEY')
const GOLF_API_BASE = 'https://api.golfcourseapi.com'

if (!GOLF_API_KEY) {
  console.error('GOLF_API_KEY environment variable is not set')
}

// CORS headers for all responses
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Parse request
    const { courseName, location, requestedBy } = await req.json()

    if (!courseName) {
      return new Response(
        JSON.stringify({ error: 'courseName is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
      // Step 1: Fetch course data from GolfCourseAPI.com
      let course = null
      let courseData = null

      try {
        console.log(`Searching Golf API for: ${courseName}`)
        const searchQuery = location ? `${courseName} ${location}` : courseName
        const searchResponse = await fetch(
          `${GOLF_API_BASE}/v1/search?search_query=${encodeURIComponent(searchQuery)}`,
          {
            headers: {
              'Authorization': `Key ${GOLF_API_KEY}`
            }
          }
        )

        if (searchResponse.ok) {
          courseData = await searchResponse.json()
          console.log(`API returned ${courseData.courses?.length || 0} courses`)

          // Get the first match (most relevant)
          course = courseData.courses?.[0]

          if (course) {
            console.log(`Found course: ${course.course_name} at ${course.location?.city}`)
          }
        } else {
          console.warn(`Golf API returned ${searchResponse.status}`)
        }
      } catch (apiError: any) {
        console.warn('Golf API fetch failed:', apiError.message)
      }

      // Step 2: Use default data if API not available
      if (!course) {
        console.log('Using default course data (API search returned no results)')
        course = {
          course_name: courseName,
          club_name: courseName,
          location: {
            city: location,
            state: '',
            country: ''
          },
          tees: { male: [], female: [] }
        }
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
      const locationStr = course.location?.city
        ? `${course.location.city}${course.location.state ? ', ' + course.location.state : ''}`
        : location

      const { data: newCourse, error: courseError } = await supabase
        .from('golf_courses')
        .insert({
          name: course.course_name || course.club_name || courseName,
          location: locationStr,
          holes: 18, // Assume 18 holes
          greens: greens && greens.length > 0 ? greens.map(g => ({
            hole: g.hole,
            polygon: g.polygon
          })) : null
        })
        .select()
        .single()

      if (courseError) throw courseError

      // Step 5: Create tee boxes from API data
      const allTees = [...(course.tees?.male || []), ...(course.tees?.female || [])]

      if (allTees.length > 0) {
        console.log(`Creating ${allTees.length} tee boxes`)

        for (const tee of allTees) {
          // Extract par and stroke index from holes array
          const par = tee.holes?.map(h => h.par) || Array(18).fill(4)
          const strokeIndex = tee.holes?.map(h => h.handicap) || Array.from({length: 18}, (_, i) => i + 1)

          await supabase.from('tee_boxes').insert({
            course_id: newCourse.id,
            tee_name: tee.tee_name,
            tee_color: getTeeColor(tee.tee_name),
            rating: tee.course_rating || null,
            slope: tee.slope_rating || null,
            par: par,
            stroke_index: strokeIndex,
            yardage: tee.total_yards || null
          })
        }
      } else {
        // Create default Blue tees if no API data
        console.log('No API tee data, creating default Blue tees')
        await supabase.from('tee_boxes').insert({
          course_id: newCourse.id,
          tee_name: 'Blue',
          tee_color: '#0066CC',
          rating: null,
          slope: null,
          par: Array(18).fill(4), // Default par 4s
          stroke_index: Array.from({length: 18}, (_, i) => i + 1), // 1-18
          yardage: null
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
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
