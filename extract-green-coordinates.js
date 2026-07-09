// ===========================================================================
// Extract Green Coordinates from OpenStreetMap
// ===========================================================================
// Queries OSM Overpass API for golf greens and calculates front/middle/back

async function getGreenCoordinates(courseName, location) {
  // Step 1: Build Overpass query for golf course greens
  const query = `
    [out:json][timeout:25];
    area["name"="${courseName}"]->.searchArea;
    (
      way["golf"="green"](area.searchArea);
      relation["golf"="green"](area.searchArea);
    );
    out geom;
  `;

  // Step 2: Query Overpass API
  const response = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    body: 'data=' + encodeURIComponent(query)
  });

  const data = await response.json();

  // Step 3: Process each green
  const greens = [];

  for (const element of data.elements) {
    if (element.type === 'way' && element.geometry) {
      const coords = element.geometry;
      const holeNumber = element.tags?.ref || element.tags?.name;

      // Calculate front, middle, back
      const greenData = calculateGreenPoints(coords);

      greens.push({
        hole: holeNumber,
        ...greenData
      });
    }
  }

  return greens;
}

function calculateGreenPoints(polygonCoords) {
  // Method 1: Calculate from polygon geometry

  // MIDDLE: Centroid of polygon
  const centroid = calculateCentroid(polygonCoords);

  // FRONT & BACK: Get bounding box extremes
  const bounds = getBoundingBox(polygonCoords);

  // Heuristic: Assume greens are typically longer than wide
  // Front = closest to approach, Back = farthest
  const isHorizontal = (bounds.maxLon - bounds.minLon) > (bounds.maxLat - bounds.minLat);

  let front, back;
  if (isHorizontal) {
    // Green runs east-west, use longitude extremes
    front = [bounds.minLat, bounds.minLon]; // Western edge
    back = [bounds.maxLat, bounds.maxLon];  // Eastern edge
  } else {
    // Green runs north-south, use latitude extremes
    front = [bounds.minLat, bounds.minLon]; // Southern edge
    back = [bounds.maxLat, bounds.maxLon];  // Northern edge
  }

  return {
    f: front,   // [lat, lon]
    m: centroid, // [lat, lon]
    b: back     // [lat, lon]
  };
}

function calculateCentroid(coords) {
  let sumLat = 0, sumLon = 0;
  coords.forEach(coord => {
    sumLat += coord.lat;
    sumLon += coord.lon;
  });
  return [sumLat / coords.length, sumLon / coords.length];
}

function getBoundingBox(coords) {
  const lats = coords.map(c => c.lat);
  const lons = coords.map(c => c.lon);
  return {
    minLat: Math.min(...lats),
    maxLat: Math.max(...lats),
    minLon: Math.min(...lons),
    maxLon: Math.max(...lons)
  };
}

// ===========================================================================
// BETTER APPROACH: Store the full polygon, calculate dynamically
// ===========================================================================
// Instead of static front/middle/back, calculate based on user position:

function calculateDistances(userLat, userLon, greenPolygon) {
  // Middle: Distance to centroid (easy)
  const centroid = calculateCentroid(greenPolygon);
  const middleDistance = haversineDistance(userLat, userLon, centroid[0], centroid[1]);

  // Front: Distance to closest point on polygon
  let frontDistance = Infinity;
  greenPolygon.forEach(point => {
    const dist = haversineDistance(userLat, userLon, point.lat, point.lon);
    if (dist < frontDistance) frontDistance = dist;
  });

  // Back: Distance to farthest point on polygon
  let backDistance = 0;
  greenPolygon.forEach(point => {
    const dist = haversineDistance(userLat, userLon, point.lat, point.lon);
    if (dist > backDistance) backDistance = dist;
  });

  return {
    front: frontDistance,
    middle: middleDistance,
    back: backDistance
  };
}

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth radius in meters
  const φ1 = lat1 * Math.PI/180;
  const φ2 = lat2 * Math.PI/180;
  const Δφ = (lat2-lat1) * Math.PI/180;
  const Δλ = (lon2-lon1) * Math.PI/180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
          Math.cos(φ1) * Math.cos(φ2) *
          Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c; // Distance in meters
}

// Export for use
export { getGreenCoordinates, calculateGreenPoints, calculateDistances };
