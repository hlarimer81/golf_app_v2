/**
 * One-off: pull Elmwood Country Club (Marshalltown, IA) green polygons from OSM
 * and write them to `green_images` (one row per hole, course_name = "Elmwood Country Club").
 *
 * The generic fetch-green-polygons.js script picks up both the real Elmwood course
 * and a nearby mis-tagged one, so this script:
 *   - Anchors the Overpass search on a known-good center point near the real course
 *     (south cluster, ~42.022, -92.937).
 *   - Uses a tight 600m radius so only the real greens/holes are returned.
 *   - Pairs each numbered hole way (ref tag) to its nearest green polygon.
 *   - Upserts one row per hole into `green_images` with the polygon + centroid.
 *
 * The GolfGPSWidget reads green_polygon + green_center_lat/lon from green_images and
 * derives front / middle / back distances on the fly from the polygon vertices.
 *
 * Usage:
 *   node fetch-greens-elmwood.js            # write to DB
 *   node fetch-greens-elmwood.js --dry-run  # preview only
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

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

const COURSE_NAME = 'Elmwood Country Club';
const CENTER = { lat: 42.0225, lon: -92.9365 }; // south cluster ≈ real Elmwood CC
const RADIUS_M = 600;

// Holes where OSM data is unreliable for this course (missing markers or
// multiple holes pointing at the same green). Skip writes for these so we
// don't store wrong distances; they can be filled in manually later.
const SKIP_HOLES = new Set([12, 14, 15, 16]);

const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

const dryRun = process.argv.includes('--dry-run');

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
        if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
        const text = await res.text();
        try { return JSON.parse(text); }
        catch { throw new Error(`${url} returned non-JSON:\n${text.slice(0, 200)}`); }
      } catch (e) { lastErr = e; }
    }
  }
  throw lastErr || new Error('All Overpass mirrors failed');
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
    if (d < bestD) { bestD = d; best = g; }
  }
  return best;
}

async function main() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY env vars');
    process.exit(1);
  }
  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log(`Querying OSM around ${CENTER.lat},${CENTER.lon} (r=${RADIUS_M}m)…`);
  const q = `
    [out:json][timeout:60];
    (
      way(around:${RADIUS_M},${CENTER.lat},${CENTER.lon})["golf"="green"];
      relation(around:${RADIUS_M},${CENTER.lat},${CENTER.lon})["golf"="green"];
      way(around:${RADIUS_M},${CENTER.lat},${CENTER.lon})["golf"="hole"];
      node(around:${RADIUS_M},${CENTER.lat},${CENTER.lon})["golf"="hole"];
    );
    out tags geom;
  `;
  const data = await overpass(q);
  const greens = data.elements.filter(e => e.tags?.golf === 'green');
  const holes = data.elements.filter(e => e.tags?.golf === 'hole');
  console.log(`OSM returned ${greens.length} greens and ${holes.length} hole markers`);

  const pairings = [];
  const seenHoles = new Set();
  for (const hole of holes) {
    const ref = hole.tags?.ref;
    if (!ref) continue;
    const holeNumber = parseInt(ref, 10);
    if (!Number.isFinite(holeNumber)) continue;
    if (seenHoles.has(holeNumber)) continue; // first match per hole number
    if (SKIP_HOLES.has(holeNumber)) {
      seenHoles.add(holeNumber);
      console.log(`Skipping hole ${holeNumber} (OSM data unreliable)`);
      continue;
    }
    const green = pairHoleToGreen(hole, greens);
    if (!green) {
      console.warn(`Hole ${holeNumber}: no matching green found`);
      continue;
    }
    seenHoles.add(holeNumber);
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
  console.log(`\nPaired ${pairings.length} unique holes:`);
  for (const p of pairings) {
    console.log(`  Hole ${String(p.holeNumber).padStart(2)} → green way ${p.osm_way_id} (${p.green_polygon.length} pts, centroid ${p.green_center_lat.toFixed(6)}, ${p.green_center_lon.toFixed(6)})`);
  }

  if (dryRun) {
    console.log('\n--dry-run: skipping DB writes');
    return;
  }

  for (const p of pairings) {
    const { data: existing } = await supabase
      .from('green_images')
      .select('id, image_path')
      .eq('course_name', COURSE_NAME)
      .eq('hole_number', p.holeNumber)
      .maybeSingle();

    const row = {
      course_name: COURSE_NAME,
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
    if (error) console.error(`  ✗ Hole ${p.holeNumber}:`, error.message);
    else console.log(`  ✓ Hole ${p.holeNumber} saved`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
