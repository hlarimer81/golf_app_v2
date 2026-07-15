import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Simple .env file loader
function loadEnv(file = '.env') {
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
  } catch (err) {
    console.error('Error loading .env file:', err.message);
    process.exit(1);
  }
}

loadEnv();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing environment variables.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log('\n=== Verification: Migrated Courses ===\n');

  const { data: courses, error } = await supabase
    .from('golf_courses')
    .select(`
      id,
      name,
      location,
      holes,
      greens,
      tee_boxes (
        id,
        tee_name,
        tee_color,
        rating,
        slope,
        par,
        stroke_index
      )
    `)
    .order('name');

  if (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }

  console.log(`✓ Found ${courses.length} courses:\n`);

  courses.forEach(course => {
    const hasGPS = course.greens ? '✓ GPS' : '✗ No GPS';
    console.log(`📍 ${course.name}`);
    console.log(`   Location: ${course.location || 'Not set'}`);
    console.log(`   Holes: ${course.holes} | ${hasGPS}`);
    console.log(`   Tee Boxes (${course.tee_boxes.length}):`);
    course.tee_boxes.forEach(tee => {
      console.log(`     • ${tee.tee_name}: Rating ${tee.rating}, Slope ${tee.slope}`);
    });
    console.log('');
  });

  console.log('✅ Migration verified successfully!\n');
}

run();
