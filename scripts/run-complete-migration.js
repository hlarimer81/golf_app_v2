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
  console.error('Missing environment variables. Check your .env file.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log('\n=== Running Complete Migration ===\n');

  // Read the SQL file
  const sql = fs.readFileSync('COMPLETE-MIGRATION.sql', 'utf8');

  // Execute the SQL
  const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });

  if (error) {
    // RPC might not exist, try alternative approach: execute via REST API
    console.log('Executing migration SQL...\n');

    // Split by semicolons and execute each statement (this is a simplified approach)
    // For complex DO blocks, we'll need to send the whole file
    try {
      const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`
        },
        body: JSON.stringify({ query: sql })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      console.log('✓ Migration executed successfully via REST API\n');
    } catch (restError) {
      console.error('\n⚠️  Cannot execute SQL directly via API.');
      console.error('Please run the migration manually:\n');
      console.error('1. Go to Supabase Dashboard → SQL Editor');
      console.error('2. Copy the contents of COMPLETE-MIGRATION.sql');
      console.error('3. Paste and click "Run"\n');
      console.error('Alternatively, use psql or another PostgreSQL client.\n');
      process.exit(1);
    }
  }

  // Verify the migration worked
  console.log('=== Verification ===\n');

  const { data: courses, error: coursesError } = await supabase
    .from('golf_courses')
    .select(`
      name,
      location,
      holes,
      greens,
      tee_boxes (
        tee_name,
        tee_color,
        rating,
        slope
      )
    `)
    .order('name');

  if (coursesError) {
    console.error('Error fetching migrated data:', coursesError.message);
    process.exit(1);
  }

  console.log(`✓ Migrated ${courses.length} courses:\n`);

  courses.forEach(course => {
    const hasGPS = course.greens ? 'GPS ✓' : 'No GPS';
    console.log(`📍 ${course.name} (${course.holes} holes, ${hasGPS})`);
    if (course.location) console.log(`   ${course.location}`);
    course.tee_boxes.forEach(tee => {
      console.log(`   • ${tee.tee_name}: Rating ${tee.rating}, Slope ${tee.slope}`);
    });
    console.log('');
  });

  console.log('\n✅ Migration Complete!\n');
  console.log('Next steps:');
  console.log('1. Update App.jsx to use golf_courses + tee_boxes tables');
  console.log('2. Add course/tee selection UI (see example-app-integration.jsx)');
  console.log('3. Test the app\n');
}

run().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
