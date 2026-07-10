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
    // Debug: Log environment variable status
    const apiKeyExists = !!Deno.env.get('GOLF_API_KEY')
    const apiKeyLength = Deno.env.get('GOLF_API_KEY')?.length || 0
    console.log(`=== ENV CHECK ===`)
    console.log(`GOLF_API_KEY exists: ${apiKeyExists}`)
    console.log(`GOLF_API_KEY length: ${apiKeyLength}`)
    console.log(`================`)

    // Parse request
    const { courseName, location, requestedBy, selectedCourseId } = await req.json()

    if (!courseName && !selectedCourseId) {
      return new Response(
        JSON.stringify({ error: 'courseName or selectedCourseId is required' }),
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

    // Store debug info
    let debugInfo: string[] = []
    debugInfo.push(`API Key exists: ${!!GOLF_API_KEY}`)
    debugInfo.push(`API Key length: ${GOLF_API_KEY?.length || 0}`)

    try {
      // Step 1: Fetch course data from GolfCourseAPI.com
      let course = null
      let courseData = null
      let allMatches: any[] = []

      // If selectedCourseId provided, fetch that specific course
      if (selectedCourseId) {
        debugInfo.push(`Fetching selected course ID: ${selectedCourseId}`)

        const courseResponse = await fetch(
          `${GOLF_API_BASE}/v1/course/${selectedCourseId}`,
          {
            headers: {
              'Authorization': `Key ${GOLF_API_KEY}`
            }
          }
        )

        if (courseResponse.ok) {
          const courseDetail = await courseResponse.json()
          course = courseDetail.course
          debugInfo.push(`✓ Retrieved: ${course.course_name}`)
        } else {
          debugInfo.push(`✗ Failed to fetch course ID ${selectedCourseId}`)
          throw new Error('Failed to fetch selected course')
        }
      }

      try {
        if (!selectedCourseId && !GOLF_API_KEY) {
          const error = 'Golf API key not configured in environment variables'
          debugInfo.push(`ERROR: ${error}`)

          // Save debug info to request record
          await supabase
            .from('course_requests')
            .update({
              error_message: debugInfo.join(' | '),
              status: 'failed'
            })
            .eq('id', requestRecord.id)

          throw new Error(error)
        }

        // Only search if we don't already have a course from selection
        if (!course && courseName) {
          console.log(`🔍 Searching Golf API for: ${courseName}`)
          console.log(`✓ API key present, length: ${GOLF_API_KEY.length}`)

          // Try multiple search strategies
          const searchStrategies = [
            location ? `${courseName} ${location}` : courseName,  // Strategy 1: Full name + location
            courseName,  // Strategy 2: Just course name
            location ? courseName.split(' ').slice(0, 2).join(' ') + ' ' + location : null,  // Strategy 3: First 2 words + location
          ].filter(Boolean)

          for (const searchQuery of searchStrategies) {
          debugInfo.push(`Trying: "${searchQuery}"`)

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

            if (courseData.courses && courseData.courses.length > 0) {
              allMatches = courseData.courses
              debugInfo.push(`✓ Found ${allMatches.length} match(es)`)

              // If multiple matches, return them for user to choose
              if (allMatches.length > 1) {
                const choices = allMatches.map(c => ({
                  id: c.id,
                  name: c.course_name || c.club_name,
                  location: c.location?.city
                    ? `${c.location.city}${c.location.state ? ', ' + c.location.state : ''}`
                    : 'Unknown location',
                  teeCount: (c.tees?.male?.length || 0) + (c.tees?.female?.length || 0)
                }))

                debugInfo.push(`Multiple matches: ${choices.map(c => c.name).join(', ')}`)

                await supabase
                  .from('course_requests')
                  .update({
                    status: 'needs_selection',
                    error_message: debugInfo.join(' | '),
                    api_response: courseData
                  })
                  .eq('id', requestRecord.id)

                return new Response(
                  JSON.stringify({
                    success: false,
                    needsSelection: true,
                    choices: choices,
                    message: `Found ${choices.length} courses. Please select the correct one.`
                  }),
                  { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
              }

              // Single match - use it
              course = allMatches[0]
              debugInfo.push(`✓ Using: ${course.course_name}`)
              const maleTees = course.tees?.male?.length || 0
              const femaleTees = course.tees?.female?.length || 0
              debugInfo.push(`Tees: male=${maleTees}, female=${femaleTees}`)
              break  // Found a match, stop searching
            } else {
              debugInfo.push(`× No matches for this query`)
            }
          } else {
            debugInfo.push(`× API error: ${searchResponse.status}`)
          }
        }
        }

        if (!course) {
          debugInfo.push('⚠ No course found with any search strategy')
        }
      } catch (apiError: any) {
        debugInfo.push(`API Fetch Failed: ${apiError.message}`)
      }

      // Step 2: Fail if no course found
      if (!course) {
        debugInfo.push('❌ Course not found in database')

        // Update request with helpful error
        await supabase
          .from('course_requests')
          .update({
            status: 'failed',
            error_message: debugInfo.join(' | ') + ' | Try: shorter name, different spelling, or check golfcourseapi.com',
            completed_at: new Date().toISOString()
          })
          .eq('id', requestRecord.id)

        return new Response(
          JSON.stringify({
            success: false,
            message: `Course "${courseName}" not found in the golf course database. Try a shorter or different spelling, or search at golfcourseapi.com to find the exact name.`
          }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      debugInfo.push(`Using: ${course.course_name} (${course.location?.city || 'unknown location'})`)

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

      debugInfo.push(`Total tees to create: ${allTees.length}`)

      if (allTees.length > 0) {
        let successCount = 0
        let failCount = 0

        // Insert all tee boxes
        for (const tee of allTees) {
          try {
            // Extract par, stroke index, and yardage from holes array
            // Ensure we have exactly 18 holes of data
            let par: number[]
            let strokeIndex: number[]
            let yardage: number[]

            if (tee.holes && tee.holes.length >= 18) {
              par = tee.holes.slice(0, 18).map(h => Number(h.par))
              strokeIndex = tee.holes.slice(0, 18).map(h => Number(h.handicap))
              yardage = tee.holes.slice(0, 18).map(h => Number(h.yardage))
            } else {
              // Fallback to defaults if no hole data
              par = Array(18).fill(4)
              strokeIndex = Array.from({length: 18}, (_, i) => i + 1)
              yardage = Array(18).fill(0)  // Default yardage array
            }

            debugInfo.push(`Inserting: ${tee.tee_name} (par:${par.length}, SI:${strokeIndex.length}, yds:${yardage.length})`)

            const { error: teeError } = await supabase.from('tee_boxes').insert({
              course_id: newCourse.id,
              tee_name: tee.tee_name,
              tee_color: getTeeColor(tee.tee_name),
              rating: tee.course_rating || null,
              slope: tee.slope_rating || null,
              par: par,  // Array of 18 pars
              stroke_index: strokeIndex,  // Array of 18 stroke indexes
              yardage: yardage  // Array of 18 yardages (NOT total_yards!)
            })

            if (teeError) {
              failCount++
              debugInfo.push(`✗ ${tee.tee_name}: ${teeError.message}`)
            } else {
              successCount++
              debugInfo.push(`✓ ${tee.tee_name}`)
            }
          } catch (teeInsertError: any) {
            failCount++
            debugInfo.push(`✗ ${tee.tee_name} exception: ${teeInsertError.message}`)
          }
        }

        debugInfo.push(`Tees created: ${successCount}/${allTees.length}`)
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

      // Step 6: Mark request as completed with debug info
      await supabase
        .from('course_requests')
        .update({
          status: 'completed',
          created_course_id: newCourse.id,
          completed_at: new Date().toISOString(),
          api_response: courseData,
          error_message: debugInfo.join(' | ') // Store debug info even on success
        })
        .eq('id', requestRecord.id)

      return new Response(
        JSON.stringify({
          success: true,
          course: newCourse,
          message: `Added: ${newCourse.name}${newCourse.location ? ' - ' + newCourse.location : ''}. Created ${successCount || allTees.length} tee boxes. ${newCourse.name !== courseName ? '(Note: Found as "' + newCourse.name + '")' : ''}`
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
    'yellow': '#FFEB3B',
    'red': '#CC0000',
    'green': '#00AA00',
    'championship': '#0066CC',
    'tips': '#000000'
  }

  const normalized = name?.toLowerCase() || ''

  // Try exact match first
  if (colorMap[normalized]) {
    return colorMap[normalized]
  }

  // Try partial match (for names like "BLUE - PAR 4")
  for (const [color, hex] of Object.entries(colorMap)) {
    if (normalized.includes(color)) {
      return hex
    }
  }

  // Default gray
  return '#888888'
}
