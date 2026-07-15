import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('\n=== STEP 1: Inspecting Current Courses ===\n');

  const { data: currentCourses, error: fetchError } = await supabase
    .from('courses')
    .select('*')
    .order('name');

  if (fetchError) {
    console.error('Error fetching courses:', fetchError.message);
    return;
  }

  console.log(`Found ${currentCourses.length} courses in database:\n`);
  currentCourses.forEach(c => {
    console.log(`  - ${c.name} (${c.holes} holes, Rating: ${c.rating}, Slope: ${c.slope})`);
  });

  // Group courses by base name
  const grouped = {};
  currentCourses.forEach(course => {
    const match = course.name.match(/^(.+?)\s+(Blue|White|Red|Gold|Black|Green|Championship|Marsh|Lakes|Dunes)$/i);
    if (match) {
      const baseName = match[1].trim();
      const teeName = match[2];
      if (!grouped[baseName]) grouped[baseName] = [];
      grouped[baseName].push({ ...course, teeName });
    } else {
      if (!grouped[course.name]) grouped[course.name] = [];
      grouped[course.name].push({ ...course, teeName: 'Championship' });
    }
  });

  console.log('\n=== STEP 2: Creating New Tables ===\n');

  // Read and execute the schema SQL
  const schemaSql = fs.readFileSync('./create-golf-courses-schema.sql', 'utf8');

  // Split by semicolons and execute each statement
  const statements = schemaSql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  for (const statement of statements) {
    if (statement.startsWith('COMMENT ON')) {
      // Skip comments for now, supabase-js doesn't support them via RPC
      continue;
    }
    const { error } = await supabase.rpc('exec_sql', { sql: statement });
    if (error && !error.message.includes('already exists')) {
      console.log('Statement:', statement.substring(0, 100) + '...');
      console.log('Error:', error.message);
    }
  }

  console.log('✓ Tables created (or already exist)\n');

  console.log('=== STEP 3: Migrating Data ===\n');

  // Migrate each course group
  for (const [baseName, teeBoxes] of Object.entries(grouped)) {
    console.log(`\nMigrating: ${baseName}`);

    // Create the golf course
    const firstTee = teeBoxes[0];
    const { data: newCourse, error: courseError } = await supabase
      .from('golf_courses')
      .insert({
        name: baseName,
        location: null, // You can update this manually later
        holes: firstTee.holes,
        greens: firstTee.greens || null
      })
      .select()
      .single();

    if (courseError) {
      console.log(`  ✗ Error creating course: ${courseError.message}`);
      continue;
    }

    console.log(`  ✓ Created course: ${newCourse.name} (ID: ${newCourse.id})`);

    // Create tee boxes
    for (const tee of teeBoxes) {
      const teeColor = getTeeColor(tee.teeName);

      const { error: teeError } = await supabase
        .from('tee_boxes')
        .insert({
          course_id: newCourse.id,
          tee_name: tee.teeName,
          tee_color: teeColor,
          rating: tee.rating,
          slope: tee.slope,
          par: tee.par,
          stroke_index: tee.stroke_index,
          yardage: null // Add if you have this data
        });

      if (teeError) {
        console.log(`    ✗ Error creating ${tee.teeName} tees: ${teeError.message}`);
      } else {
        console.log(`    ✓ Added ${tee.teeName} tees (Rating: ${tee.rating}, Slope: ${tee.slope})`);
      }
    }
  }

  console.log('\n=== Migration Complete! ===\n');
  console.log('Next steps:');
  console.log('1. Review the data in Supabase dashboard');
  console.log('2. Update App.jsx to use new tables (see example-app-integration.jsx)');
  console.log('3. Test the new course/tee selection UI\n');
}

function getTeeColor(teeName) {
  const colors = {
    'Blue': '#0066CC',
    'White': '#FFFFFF',
    'Red': '#CC0000',
    'Gold': '#FFD700',
    'Black': '#000000',
    'Green': '#00AA00',
    'Championship': '#0066CC',
    'Marsh': '#2E7D32',
    'Lakes': '#1976D2',
    'Dunes': '#F57C00'
  };
  return colors[teeName] || '#888888';
}

main().catch(console.error);
