/**
 * Test script for OpenStreetMap green polygon fetching
 * Tests the OSM integration without needing full Supabase deployment
 *
 * Usage: node test-osm-fetch.js
 */

async function fetchGreenPolygonsFromOSM(courseName, location = '') {
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

  console.log('🗺️  Querying OpenStreetMap...')
  console.log('Course:', courseName)
  console.log('Location:', location || '(not specified)')
  console.log('---')

  const response = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
      'User-Agent': 'GolfAppV2/1.0',
      'Accept': 'application/json'
    },
    body: 'data=' + encodeURIComponent(query)
  })

  if (!response.ok) {
    const responseText = await response.text()
    console.error('Response:', responseText.substring(0, 500))
    throw new Error(`OSM API error: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()

  if (!data.elements || data.elements.length === 0) {
    return []
  }

  const greens = []

  for (const element of data.elements) {
    if (element.type === 'way' && element.geometry) {
      const holeNumber = extractHoleNumber(element.tags)
      const polygon = element.geometry.map((coord) => [coord.lat, coord.lon])

      greens.push({
        hole: holeNumber,
        polygon: polygon,
        tags: element.tags,
        pointCount: polygon.length
      })
    } else if (element.type === 'relation' && element.members) {
      const outerWay = element.members.find((m) => m.role === 'outer')
      if (outerWay && outerWay.geometry) {
        const holeNumber = extractHoleNumber(element.tags)
        const polygon = outerWay.geometry.map((coord) => [coord.lat, coord.lon])

        greens.push({
          hole: holeNumber,
          polygon: polygon,
          tags: element.tags,
          pointCount: polygon.length
        })
      }
    }
  }

  greens.sort((a, b) => (a.hole || 99) - (b.hole || 99))
  return greens
}

function extractHoleNumber(tags) {
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

// Test courses - try well-known golf courses that are likely in OSM
const testCourses = [
  { name: 'Pebble Beach Golf Links', location: 'CA' },
  { name: 'St Andrews Old Course', location: 'Scotland' },
  { name: 'Augusta National Golf Club', location: 'GA' },
  { name: 'Torrey Pines', location: 'CA' },
  { name: 'Bethpage Black', location: 'NY' }
]

async function runTests() {
  console.log('🏌️  Testing OpenStreetMap Green Polygon Fetcher')
  console.log('=' .repeat(60))
  console.log()

  for (const course of testCourses) {
    console.log(`\n${'='.repeat(60)}`)
    console.log(`Testing: ${course.name}`)
    console.log('='.repeat(60))

    try {
      const greens = await fetchGreenPolygonsFromOSM(course.name, course.location)

      if (greens.length === 0) {
        console.log('❌ No greens found')
      } else {
        console.log(`✅ Found ${greens.length} greens`)

        const numbered = greens.filter(g => g.hole !== null)
        const unnumbered = greens.filter(g => g.hole === null)

        console.log(`   - Numbered: ${numbered.length}`)
        console.log(`   - Unnumbered: ${unnumbered.length}`)

        if (greens.length !== 18) {
          console.log(`   ⚠️  Expected 18 greens, found ${greens.length}`)
        }

        console.log('\nGreen details:')
        greens.forEach(g => {
          console.log(`   Hole ${g.hole || '?'}: ${g.pointCount} points, tags:`,
            JSON.stringify(g.tags, null, 0))
        })

        // Show first green's polygon sample
        if (greens[0] && greens[0].polygon.length > 0) {
          console.log('\nSample polygon (first 3 points):')
          greens[0].polygon.slice(0, 3).forEach(([lat, lon]) => {
            console.log(`   [${lat.toFixed(6)}, ${lon.toFixed(6)}]`)
          })
        }
      }
    } catch (error) {
      console.log(`❌ Error: ${error.message}`)
    }

    // Rate limit - wait between requests
    await new Promise(resolve => setTimeout(resolve, 2000))
  }

  console.log('\n' + '='.repeat(60))
  console.log('✅ Test suite complete')
  console.log('='.repeat(60))
}

// Run tests
runTests().catch(console.error)
