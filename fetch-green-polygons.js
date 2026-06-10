/**
 * Fetch green polygons from OpenStreetMap (Overpass API) for a given golf course
 * and write them to the `green_images` table, keyed by (course_name, hole_number).
 *
 * Usage:
 *   node fetch-green-polygons.js \
 *     --course "AGCC Blues" \
 *     --osm-name "Ames Golf & Country Club" \
 *     --hole 1
 *
 *   # All holes:
 *   node fetch-green-polygons.js --course "AGCC Blues" --osm-name "Ames Golf & Country Club"
 *
 *   # Dry run (no DB write):
 *   node fetch-green-polygons.js --course "AGCC Blues" --osm-name "Ames Golf & Country Club" --dry-run
 *
 * Requires VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY (or SUPABASE_SERVICE_ROLE_KEY) env vars.
 * Run `add-green-polygon-column.sql` first to add the columns the script writes to.
 *
 * Notes:
 *  - OSM models a "hole" (golf=hole) as a way whose last node is at/near the green.
 *    We pair each hole (by `ref` tag = hole number) with the nearest `golf=green` polygon.
 *  - Polygons are stored as [[lat, lon], ...] (closed ring, matching what OSM returns).
 *  - OSM data is © OpenStreetMap contributors, licensed under ODbL.
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Minimal .env loader (avoid extra dependency on `dotenv`).
function loadDotenv(file = '.env') {
  try {
    const text = fs.readFileSync(path.resolve(file), 'utf8');
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq < 0) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch { /* ignore */ }
}
loadDotenv();

// Multiple Overpass mirrors — try each in turn if one returns 429/504/etc.
const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

function parseArgs(argv) {
  const out = { dryRun: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--course') out.course = argv[++i];
    else if (a === '--osm-name') out.osmName = argv[++i];
    else if (a === '--hole') out.hole = parseInt(argv[++i], 10);
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--radius') out.radius = parseInt(argv[++i], 10);
  }
  return out;
}

async function overpass(query) {
  let lastErr;
  for (const url of OVERPASS_MIRRORS) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'my-golf-app/1.0' },
          body: `data=${encodeURIComponent(query)}`,
        });
        if (res.status === 429 || res.status === 504 || res.status === 503) {
          lastErr = new Error(`${url} → HTTP ${res.status}`);
          await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
          continue;
        }
        if (!res.ok) {
          throw new Error(`${url} → HTTP ${res.status}`);
        }
        const text = await res.text();
        try {
          return JSON.parse(text);
        } catch {
          throw new Error(`${url} returned non-JSON:\n${text.slice(0, 200)}`);
        }
      } catch (e) {
        lastErr = e;
      }
    }
  }
  throw lastErr || new Error('All Overpass mirrors failed');
}

async function findCourseCenter(osmName) {
  const q = `
    [out:json][timeout:30];
    way["leisure"="golf_course"]["name"~"${osmName.replace(/"/g, '\\"')}"];
    out tags center;
  `;
  const data = await overpass(q);
  if (!data.elements?.length) throw new Error(`No golf_course way matched name "${osmName}"`);
  // Prefer exact name match if multiple
  const exact = data.elements.find(e => e.tags?.name === osmName);
  const pick = exact || data.elements[0];
  console.log(`Course: ${pick.tags?.name} (way ${pick.id}) @ ${pick.center.lat},${pick.center.lon}`);
  return { lat: pick.center.lat, lon: pick.center.lon };
}

async function fetchGreensAndHoles(center, radius = 1500) {
  const q = `
    [out:json][timeout:60];
    (
      way(around:${radius},${center.lat},${center.lon})["golf"="green"];
      relation(around:${radius},${center.lat},${center.lon})["golf"="green"];
      way(around:${radius},${center.lat},${center.lon})["golf"="hole"];
      node(around:${radius},${center.lat},${center.lon})["golf"="hole"];
    );
    out tags geom;
  `;
  const data = await overpass(q);
  const greens = data.elements.filter(e => e.tags?.golf === 'green');
  const holes = data.elements.filter(e => e.tags?.golf === 'hole');
  console.log(`OSM returned ${greens.length} greens and ${holes.length} hole markers`);
  return { greens, holes };
}

function centroid(geom) {
  if (!geom?.length) return null;
  const lat = geom.reduce((s, p) => s + p.lat, 0) / geom.length;
  const lon = geom.reduce((s, p) => s + p.lon, 0) / geom.length;
  return { lat, lon };
}

function distSq(a, b) {
  const dlat = a.lat - b.lat;
  const dlon = a.lon - b.lon;
  return dlat * dlat + dlon * dlon;
}

function holeEndPoint(hole) {
  // For ways, use the last node of the geometry (tee → green direction).
  // For nodes, just use the node's lat/lon.
  if (hole.type === 'way' && hole.geometry?.length) {
    return hole.geometry[hole.geometry.length - 1];
  }
  if (hole.type === 'node') return { lat: hole.lat, lon: hole.lon };
  return centroid(hole.geometry);
}

function pairHoleToGreen(hole, greens) {
  const target = holeEndPoint(hole);
  if (!target) return null;
  let best = null;
  let bestD = Infinity;
  for (const g of greens) {
    const c = centroid(g.geometry);
    if (!c) continue;
    const d = distSq(c, target);
    if (d < bestD) {
      bestD = d;
      best = g;
    }
  }
  return best;
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.course || !args.osmName) {
    console.error('Usage: node fetch-green-polygons.js --course "<DB course_name>" --osm-name "<OSM name>" [--hole N] [--radius meters] [--dry-run]');
    process.exit(1);
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY env vars');
    process.exit(1);
  }
  const supabase = createClient(supabaseUrl, supabaseKey);

  const center = await findCourseCenter(args.osmName);
  const { greens, holes } = await fetchGreensAndHoles(center, args.radius);

  // Pair each numbered hole with its green
  const pairings = [];
  for (const hole of holes) {
    const ref = hole.tags?.ref;
    if (!ref) continue;
    const holeNumber = parseInt(ref, 10);
    if (!Number.isFinite(holeNumber)) continue;
    if (args.hole && holeNumber !== args.hole) continue;

    const green = pairHoleToGreen(hole, greens);
    if (!green) {
      console.warn(`Hole ${holeNumber}: no matching green found`);
      continue;
    }
    const poly = green.geometry.map(p => [p.lat, p.lon]);
    const c = centroid(green.geometry);
    pairings.push({
      holeNumber,
      green_polygon: poly,
      green_center_lat: c.lat,
      green_center_lon: c.lon,
      osm_way_id: green.id,
    });
  }

  pairings.sort((a, b) => a.holeNumber - b.holeNumber);
  console.log(`\nPaired ${pairings.length} holes:`);
  for (const p of pairings) {
    console.log(`  Hole ${String(p.holeNumber).padStart(2)} → green way ${p.osm_way_id} (${p.green_polygon.length} pts, centroid ${p.green_center_lat.toFixed(6)}, ${p.green_center_lon.toFixed(6)})`);
  }

  if (args.dryRun) {
    console.log('\n--dry-run: skipping DB writes');
    return;
  }

  for (const p of pairings) {
    // Upsert by (course_name, hole_number). image_path is NOT NULL in the schema,
    // so fall back to a placeholder when no image row exists yet.
    const { data: existing } = await supabase
      .from('green_images')
      .select('id, image_path')
      .eq('course_name', args.course)
      .eq('hole_number', p.holeNumber)
      .maybeSingle();

    const row = {
      course_name: args.course,
      hole_number: p.holeNumber,
      image_path: existing?.image_path || 'placeholder',
      green_polygon: p.green_polygon,
      green_center_lat: p.green_center_lat,
      green_center_lon: p.green_center_lon,
      osm_way_id: p.osm_way_id,
      osm_source: 'openstreetmap',
    };

    const { error } = await supabase
      .from('green_images')
      .upsert(row, { onConflict: 'course_name,hole_number' });

    if (error) {
      console.error(`  ✗ Hole ${p.holeNumber}:`, error.message);
    } else {
      console.log(`  ✓ Hole ${p.holeNumber} saved`);
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
