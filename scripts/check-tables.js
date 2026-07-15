import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

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

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  console.log('\n=== Checking Tables ===\n');

  // Check golf_courses table
  const { data: gc, error: gcError } = await supabase
    .from('golf_courses')
    .select('*')
    .limit(1);

  console.log('golf_courses table:', gcError ? `✗ ${gcError.message}` : '✓ exists');

  // Check tee_boxes table
  const { data: tb, error: tbError } = await supabase
    .from('tee_boxes')
    .select('*')
    .limit(1);

  console.log('tee_boxes table:', tbError ? `✗ ${tbError.message}` : '✓ exists');

  // Check old courses table
  const { data: old, error: oldError } = await supabase
    .from('courses')
    .select('name')
    .order('name');

  console.log('\nOld courses table:', oldError ? `✗ ${oldError.message}` : `✓ ${old.length} courses`);

  if (old && old.length > 0) {
    console.log('\nSample courses from old table:');
    old.slice(0, 5).forEach(c => console.log(`  - ${c.name}`));
  }
}

run();
