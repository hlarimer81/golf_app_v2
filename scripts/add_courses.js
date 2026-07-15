import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const courses = [
  {
    name: 'Elmwood Country Club',
    holes: 18,
    par: [4, 4, 3, 4, 4, 3, 5, 4, 4, 4, 4, 3, 5, 4, 4, 3, 4, 4],
    stroke_index: [9, 5, 17, 13, 7, 15, 1, 3, 11, 10, 12, 18, 2, 4, 6, 16, 8, 14],
    rating: 67.9,
    slope: 122,
  },
  {
    name: 'Honey Creek Golf Club',
    holes: 18,
    par:          [5, 4, 3, 4, 5, 3, 4, 4, 4, 4, 3, 5, 4, 4, 4, 4, 3, 4],
    stroke_index: [8, 9, 16, 7, 3, 17, 11, 13, 12, 18, 14, 6, 1, 10, 2, 4, 15, 5],
    rating: 69.6,
    slope: 120,
  },
];

async function run() {
  for (const course of courses) {
    // Skip if already present (idempotent)
    const { data: existing, error: selErr } = await supabase
      .from('courses')
      .select('id, name')
      .eq('name', course.name);
    if (selErr) {
      console.error('Lookup error for', course.name, selErr.message);
      continue;
    }
    if (existing && existing.length) {
      console.log(`Skipping "${course.name}" — already exists (id ${existing[0].id})`);
      continue;
    }

    const { data, error } = await supabase
      .from('courses')
      .insert(course)
      .select();
    if (error) {
      console.error('Insert error for', course.name, error.message);
    } else {
      console.log(`Inserted "${course.name}":`, JSON.stringify(data, null, 2));
    }
  }
}
run();
