import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectCourses() {
  const { data, error } = await supabase
    .from('courses')
    .select('*')
    .order('name');

  if (error) {
    console.error('Error:', error.message);
    return;
  }

  console.log('\n=== Current Courses in Database ===\n');

  data.forEach(course => {
    console.log(`Name: ${course.name}`);
    console.log(`  Holes: ${course.holes}`);
    console.log(`  Rating: ${course.rating || 'N/A'}`);
    console.log(`  Slope: ${course.slope || 'N/A'}`);
    console.log(`  Par: ${course.par ? course.par.join(',') : 'N/A'}`);
    console.log('');
  });

  console.log('\n=== Migration Suggestions ===\n');

  // Group courses by potential base name
  const grouped = {};
  data.forEach(course => {
    // Try to extract base course name (before color/tee name)
    const match = course.name.match(/^(.+?)\s+(Blue|White|Red|Gold|Black|Green|Championship)$/i);
    if (match) {
      const baseName = match[1].trim();
      const teeName = match[2];
      if (!grouped[baseName]) grouped[baseName] = [];
      grouped[baseName].push({ ...course, teeName });
    } else {
      // Single tee box course
      if (!grouped[course.name]) grouped[course.name] = [];
      grouped[course.name].push({ ...course, teeName: 'Championship' });
    }
  });

  Object.keys(grouped).sort().forEach(baseName => {
    console.log(`${baseName}:`);
    grouped[baseName].forEach(tee => {
      console.log(`  - ${tee.teeName} (Rating: ${tee.rating}, Slope: ${tee.slope})`);
    });
    console.log('');
  });
}

inspectCourses();
