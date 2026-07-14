/**
 * Test what data GolfCourseAPI.com provides
 * Check if they have green coordinates
 */

const GOLF_API_KEY = process.env.GOLF_API_KEY
const GOLF_API_BASE = 'https://api.golfcourseapi.com'

async function searchCourse(name) {
  if (!GOLF_API_KEY) {
    console.error('GOLF_API_KEY environment variable not set')
    console.log('Set it with: export GOLF_API_KEY="your-key"')
    return null
  }

  console.log(`\n🔍 Searching Golf API for: "${name}"`)

  const response = await fetch(
    `${GOLF_API_BASE}/v1/search?search_query=${encodeURIComponent(name)}`,
    {
      headers: {
        'Authorization': `Key ${GOLF_API_KEY}`
      }
    }
  )

  if (!response.ok) {
    console.error(`API Error: ${response.status}`)
    return null
  }

  const data = await response.json()

  if (!data.courses || data.courses.length === 0) {
    console.log('❌ No courses found')
    return null
  }

  console.log(`✅ Found ${data.courses.length} course(s)`)
  return data.courses[0]
}

async function getCourseDetail(courseId) {
  console.log(`\n📋 Fetching detailed data for course ID: ${courseId}`)

  const response = await fetch(
    `${GOLF_API_BASE}/v1/course/${courseId}`,
    {
      headers: {
        'Authorization': `Key ${GOLF_API_KEY}`
      }
    }
  )

  if (!response.ok) {
    console.error(`API Error: ${response.status}`)
    return null
  }

  const data = await response.json()
  return data.course
}

async function analyzeGreenData(courseName) {
  const course = await searchCourse(courseName)
  if (!course) return

  console.log(`\nCourse: ${course.course_name || course.club_name}`)
  console.log(`Location: ${course.location?.city}, ${course.location?.state}`)
  console.log(`ID: ${course.id}`)

  // First check the search result itself
  console.log('\n' + '='.repeat(60))
  console.log('SEARCH RESULT STRUCTURE')
  console.log('='.repeat(60))
  console.log(JSON.stringify(course, null, 2))

  // Get full details
  const details = await getCourseDetail(course.id)
  if (!details) {
    console.log('\n⚠️ Could not fetch full details, analyzing search result only')
    return
  }

  console.log('\n' + '='.repeat(60))
  console.log('CHECKING FOR GREEN LOCATION DATA')
  console.log('='.repeat(60))

  // Check tee data structure
  const tees = [...(details.tees?.male || []), ...(details.tees?.female || [])]
  if (tees.length > 0) {
    const firstTee = tees[0]
    console.log(`\nFirst tee: ${firstTee.tee_name}`)
    console.log(`Tee has ${firstTee.holes?.length || 0} holes`)

    if (firstTee.holes && firstTee.holes.length > 0) {
      const firstHole = firstTee.holes[0]
      console.log('\nFirst hole data structure:')
      console.log(JSON.stringify(firstHole, null, 2))

      // Check for location data
      const hasGreenData = firstHole.green_lat || firstHole.green_lon ||
                           firstHole.green_front || firstHole.green_center ||
                           firstHole.green_back || firstHole.green

      if (hasGreenData) {
        console.log('\n✅ FOUND GREEN LOCATION DATA!')
      } else {
        console.log('\n❌ No green location data found in hole object')
      }

      // Show all available keys
      console.log('\nAvailable hole data fields:')
      Object.keys(firstHole).forEach(key => {
        console.log(`  - ${key}: ${typeof firstHole[key]} = ${JSON.stringify(firstHole[key]).substring(0, 50)}`)
      })
    }
  }

  // Check top-level course object for any GPS/location data
  console.log('\n' + '='.repeat(60))
  console.log('TOP-LEVEL COURSE DATA')
  console.log('='.repeat(60))
  console.log('Available top-level fields:')
  Object.keys(details).forEach(key => {
    if (key !== 'tees' && key !== 'holes') {
      const val = details[key]
      const preview = typeof val === 'object' ? JSON.stringify(val).substring(0, 80) : val
      console.log(`  - ${key}: ${preview}`)
    }
  })

  // Check for coordinates
  if (details.coordinates || details.lat || details.lon || details.latitude || details.longitude) {
    console.log('\n✅ Course has coordinate data!')
    console.log(`Coordinates: ${JSON.stringify(details.coordinates || { lat: details.lat, lon: details.lon })}`)
  }
}

// Test with a well-known course
const testCourse = process.argv[2] || 'Torrey Pines'
analyzeGreenData(testCourse).catch(console.error)
