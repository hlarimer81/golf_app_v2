import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

function loadEnv(file = '.env') {
  const text = fs.readFileSync(file, 'utf8');
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
}

loadEnv('.env');

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function migrateCourse(courseName, newName, location, teeBoxes) {
  console.log(`\nMigrating: ${newName}`);

  // Get the first course to extract greens data
  const { data: oldCourse, error: fetchError } = await supabase
    .from('courses')
    .select('*')
    .eq('name', courseName)
    .single();

  if (fetchError) {
    console.log(`  ✗ Error fetching ${courseName}:`, fetchError.message);
    return null;
  }

  // Create golf course
  const { data: newCourse, error: courseError } = await supabase
    .from('golf_courses')
    .insert({
      name: newName,
      location: location,
      holes: oldCourse.holes,
      greens: oldCourse.greens
    })
    .select()
    .single();

  if (courseError) {
    console.log(`  ✗ Error creating course:`, courseError.message);
    return null;
  }

  console.log(`  ✓ Created course: ${newCourse.name}`);

  // Create tee boxes
  for (const teeConfig of teeBoxes) {
    const { data: teeData, error: teeError } = await supabase
      .from('courses')
      .select('*')
      .eq('name', teeConfig.oldName)
      .single();

    if (teeError) {
      console.log(`    ✗ Error fetching ${teeConfig.oldName}:`, teeError.message);
      continue;
    }

    const { error: insertError } = await supabase
      .from('tee_boxes')
      .insert({
        course_id: newCourse.id,
        tee_name: teeConfig.teeName,
        tee_color: teeConfig.teeColor,
        rating: teeData.rating,
        slope: teeData.slope,
        par: teeData.par,
        stroke_index: teeData.stroke_index
      });

    if (insertError) {
      console.log(`    ✗ Error creating ${teeConfig.teeName} tees:`, insertError.message);
    } else {
      console.log(`    ✓ Added ${teeConfig.teeName} tees (Rating: ${teeData.rating}, Slope: ${teeData.slope})`);
    }
  }

  return newCourse.id;
}

async function run() {
  console.log('\n=== Step-by-Step Migration ===\n');

  // 1. AGCC
  await migrateCourse('AGCC Blues', 'AGCC', 'Ames, Iowa', [
    { oldName: 'AGCC Blues', teeName: 'Blue', teeColor: '#0066CC' }
  ]);

  // 2. Deer Run
  await migrateCourse('Deer Run Hamilton Illinois', 'Deer Run Golf Club', 'Hamilton, Illinois', [
    { oldName: 'Deer Run Hamilton Illinois', teeName: 'Blue', teeColor: '#0066CC' }
  ]);

  // 3. Elmwood
  await migrateCourse('Elmwood Country Club', 'Elmwood Country Club', 'Marshalltown, Iowa', [
    { oldName: 'Elmwood Country Club', teeName: 'Blue', teeColor: '#0066CC' }
  ]);

  // 4. Honey Creek
  await migrateCourse('Honey Creek Golf Club', 'Honey Creek Golf Club', 'Runnells, Iowa', [
    { oldName: 'Honey Creek Golf Club', teeName: 'Blue', teeColor: '#0066CC' }
  ]);

  // 5. Lake Creek
  await migrateCourse('Lake Creek', 'Lake Creek Golf Course', 'Denison, Iowa', [
    { oldName: 'Lake Creek', teeName: 'Blue', teeColor: '#0066CC' },
    { oldName: 'Lake Creek White', teeName: 'White', teeColor: '#FFFFFF' }
  ]);

  // 6. Tournament Club
  await migrateCourse('Tournament Club - King', 'The Tournament Club of Iowa', 'Polk City, Iowa', [
    { oldName: 'Tournament Club - King', teeName: 'King', teeColor: '#000000' },
    { oldName: 'Tournament Club - Legend', teeName: 'Legend', teeColor: '#6A1B9A' },
    { oldName: 'Tournament Club - Master', teeName: 'Master', teeColor: '#0066CC' },
    { oldName: 'Tournament Club - Palmer', teeName: 'Palmer', teeColor: '#FFD700' }
  ]);

  // 7. Veenker
  await migrateCourse('Veenker Blue', 'Veenker Golf Course', 'Ames, Iowa', [
    { oldName: 'Veenker Blue', teeName: 'Blue', teeColor: '#0066CC' },
    { oldName: 'Veenker Gold', teeName: 'Gold', teeColor: '#FFD700' },
    { oldName: 'Veenker Red', teeName: 'Red', teeColor: '#CC0000' },
    { oldName: 'Veenker White', teeName: 'White', teeColor: '#FFFFFF' }
  ]);

  // 8. Wapsipinicon
  await migrateCourse('Wapsipinicon', 'Wapsipinicon Country Club', 'Anamosa, Iowa', [
    { oldName: 'Wapsipinicon', teeName: 'Blue', teeColor: '#0066CC' }
  ]);

  console.log('\n=== Migration Complete ===\n');

  // Verify
  const { data: courses } = await supabase
    .from('golf_courses')
    .select('name')
    .order('name');

  console.log(`✓ Migrated ${courses.length} courses:`);
  courses.forEach(c => console.log(`  - ${c.name}`));
  console.log('');
}

run();
