// ===========================================================================
// OpenStreetMap Green Polygon Fetcher
// ===========================================================================
// Queries OSM Overpass API to get golf green polygons for a course
// Use this in your Supabase Edge Function
// ===========================================================================

/**
 * Fetch green polygons from OpenStreetMap for a golf course
 * @param {string} courseName - Name of the golf course
 * @param {string} location - City/state (optional, helps narrow search)
 * @returns {Array} Array of greens with hole numbers and polygon coordinates
 */
async function fetchGreenPolygonsFromOSM(courseName, location = '') {
  try {
    // Build Overpass QL query
    // This searches for golf greens within golf courses matching the name
    const query = `
      [out:json][timeout:30];
      (
        // Find golf courses by name
        way["leisure"="golf_course"]["name"~"${escapeName(courseName)}", i];
        relation["leisure"="golf_course"]["name"~"${escapeName(courseName)}", i];
      )->.golfcourse;

      // Convert to area for spatial search
      .golfcourse map_to_area -> .coursearea;

      // Find all greens within the golf course area
      (
        way["golf"="green"](area.coursearea);
        relation["golf"="green"](area.coursearea);
      );
      out geom;
    `;

    console.log('Querying OSM for:', courseName);

    // Query Overpass API
    const response = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'data=' + encodeURIComponent(query)
    });

    if (!response.ok) {
      throw new Error(`OSM API error: ${response.status}`);
    }

    const data = await response.json();

    if (!data.elements || data.elements.length === 0) {
      console.warn('No greens found in OSM for:', courseName);
      return [];
    }

    // Process greens
    const greens = [];

    for (const element of data.elements) {
      if (element.type === 'way' && element.geometry) {
        // Extract hole number from tags
        const holeNumber = extractHoleNumber(element.tags);

        // Convert geometry to simple [lat, lon] array
        const polygon = element.geometry.map(coord => [coord.lat, coord.lon]);

        greens.push({
          hole: holeNumber,
          polygon: polygon,
          tags: element.tags // Keep for debugging
        });
      } else if (element.type === 'relation' && element.members) {
        // Handle multipolygon greens (less common)
        const outerWay = element.members.find(m => m.role === 'outer');
        if (outerWay && outerWay.geometry) {
          const holeNumber = extractHoleNumber(element.tags);
          const polygon = outerWay.geometry.map(coord => [coord.lat, coord.lon]);

          greens.push({
            hole: holeNumber,
            polygon: polygon,
            tags: element.tags
          });
        }
      }
    }

    // Sort by hole number
    greens.sort((a, b) => (a.hole || 99) - (b.hole || 99));

    console.log(`Found ${greens.length} greens for ${courseName}`);

    return greens;

  } catch (error) {
    console.error('Error fetching greens from OSM:', error);
    return [];
  }
}

/**
 * Extract hole number from OSM tags
 */
function extractHoleNumber(tags) {
  if (!tags) return null;

  // Try different tag keys
  if (tags.ref) {
    const num = parseInt(tags.ref);
    if (!isNaN(num)) return num;
  }

  if (tags.name) {
    // Look for patterns like "Hole 5", "Green 5", "5"
    const match = tags.name.match(/\d+/);
    if (match) return parseInt(match[0]);
  }

  if (tags['ref:hole']) {
    const num = parseInt(tags['ref:hole']);
    if (!isNaN(num)) return num;
  }

  return null; // Hole number unknown
}

/**
 * Escape special regex characters in course name
 */
function escapeName(name) {
  return name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Calculate centroid of a polygon
 */
function calculateCentroid(polygon) {
  let sumLat = 0, sumLon = 0;
  polygon.forEach(coord => {
    sumLat += coord[0];
    sumLon += coord[1];
  });
  return [sumLat / polygon.length, sumLon / polygon.length];
}

// ===========================================================================
// EXPORT FOR USE IN EDGE FUNCTION
// ===========================================================================

export { fetchGreenPolygonsFromOSM, calculateCentroid };

// ===========================================================================
// USAGE EXAMPLE
// ===========================================================================
/*
const greens = await fetchGreenPolygonsFromOSM('Veenker Golf Course', 'Ames, Iowa');

// Result format:
[
  {
    hole: 1,
    polygon: [
      [41.50123, -93.60456],
      [41.50145, -93.60478],
      [41.50167, -93.60445],
      ...
    ],
    tags: { name: 'Green 1', ref: '1', ... }
  },
  { hole: 2, polygon: [...], tags: {...} },
  ...
]

// Store in database:
await supabase.from('golf_courses').insert({
  name: 'Veenker Golf Course',
  greens: greens.map(g => ({ hole: g.hole, polygon: g.polygon }))
});
*/
