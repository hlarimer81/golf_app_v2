import { createClient } from '@supabase/supabase-js';

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
    process.exit(1);
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

  console.log('\n=== Grouped Courses ===\n');
  Object.entries(grouped).forEach(([baseName, tees]) => {
    console.log(`${baseName}:`);
    tees.forEach(t => {
      console.log(`  - ${t.teeName} tees`);
    });
  });

  console.log('\n=== STEP 2: Checking if new tables exist ===\n');

  // Try to query the new tables
  const { error: golfCoursesCheck } = await supabase
    .from('golf_courses')
    .select('count')
    .limit(1);

  const { error: teeBoxesCheck } = await supabase
    .from('tee_boxes')
    .select('count')
    .limit(1);

  if (golfCoursesCheck || teeBoxesCheck) {
    console.log('\n⚠️  New tables do not exist yet!');
    console.log('\nPlease run this SQL in your Supabase SQL Editor first:');
    console.log('  1. Go to Supabase Dashboard → SQL Editor');
    console.log('  2. Copy and paste the contents of create-golf-courses-schema.sql');
    console.log('  3. Click "Run"');
    console.log('  4. Then run this script again\n');
    process.exit(1);
  }

  console.log('✓ New tables exist\n');

  console.log('=== STEP 3: Migrating Data ===\n');

  // Check if data already migrated
  const { data: existingCourses } = await supabase
    .from('golf_courses')
    .select('id')
    .limit(1);

  if (existingCourses && existingCourses.length > 0) {
    console.log('⚠️  Data already exists in golf_courses table.');
    console.log('Do you want to clear it and re-migrate? (You need to manually delete first)\n');
    process.exit(0);
  }

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

    console.log(`  ✓ Created course: ${newCourse.name} (ID: ${newCourse.id.substring(0, 8)}...)`);

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

  // Show summary
  const { data: finalCourses } = await supabase
    .from('golf_courses')
    .select(`
      *,
      tee_boxes (
        tee_name,
        rating,
        slope
      )
    `);

  console.log('Migrated courses:');
  finalCourses?.forEach(course => {
    console.log(`\n  ${course.name} (${course.holes} holes)`);
    course.tee_boxes.forEach(tee => {
      console.log(`    - ${tee.tee_name}: Rating ${tee.rating}, Slope ${tee.slope}`);
    });
  });

  console.log('\n✅ Next steps:');
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

main().catch(err => {
  console.error('\n❌ Error:', err.message);
  process.exit(1);
});
