/**
 * Simple OSM test - just find golf courses in a region
 */

async function findGolfCoursesInRegion(minLat, minLon, maxLat, maxLon) {
  const query = `
    [out:json][timeout:30];
    (
      way["leisure"="golf_course"](${minLat},${minLon},${maxLat},${maxLon});
      relation["leisure"="golf_course"](${minLat},${minLon},${maxLat},${maxLon});
    );
    out tags center;
  `

  console.log(`Searching for golf courses in region: [${minLat}, ${minLon}] to [${maxLat}, ${maxLon}]`)

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
    throw new Error(`OSM API error: ${response.status}`)
  }

  const data = await response.json()
  return data.elements || []
}

async function findGreensForCourse(courseName) {
  // Search a wide area for this course first
  const query = `
    [out:json][timeout:30];
    (
      way["leisure"="golf_course"]["name"~"${courseName}", i];
      relation["leisure"="golf_course"]["name"~"${courseName}", i];
    );
    out center tags;
  `

  console.log(`\n🔍 Searching for: "${courseName}"`)

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
    throw new Error(`OSM API error: ${response.status}`)
  }

  const data = await response.json()

  if (!data.elements || data.elements.length === 0) {
    console.log(`❌ Course "${courseName}" not found in OSM`)
    return null
  }

  console.log(`✅ Found ${data.elements.length} matching course(s)`)
  data.elements.forEach((el, i) => {
    console.log(`   ${i + 1}. ${el.tags.name || 'Unnamed'} (type: ${el.type}, id: ${el.id})`)
    if (el.tags.operator) console.log(`      Operator: ${el.tags.operator}`)
    if (el.tags['addr:city']) console.log(`      City: ${el.tags['addr:city']}`)
  })

  return data.elements[0]
}

// Test with some different courses
const tests = [
  'Torrey Pines',
  'Pebble Beach',
  'Bethpage',
  'TPC Sawgrass',
  'Pinehurst',
  // Try a more generic/common name
  'Oakmont Country Club',
  'Merion Golf Club'
]

async function run() {
  for (const courseName of tests) {
    try {
      await findGreensForCourse(courseName)
      await new Promise(resolve => setTimeout(resolve, 2000))
    } catch (err) {
      console.log(`Error: ${err.message}`)
    }
  }

  // Also try finding any golf courses in a region (e.g., San Francisco Bay Area)
  console.log('\n\n--- Bonus: Golf courses in SF Bay Area ---')
  try {
    const courses = await findGolfCoursesInRegion(37.0, -122.5, 37.8, -121.8)
    console.log(`Found ${courses.length} golf courses`)
    courses.slice(0, 10).forEach(c => {
      console.log(`  - ${c.tags.name || 'Unnamed'} (${c.tags.operator || 'unknown operator'})`)
    })
  } catch (err) {
    console.log(`Error: ${err.message}`)
  }
}

run().catch(console.error)
