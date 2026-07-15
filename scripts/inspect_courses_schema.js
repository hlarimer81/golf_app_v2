import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase.from('courses').select('*').limit(1);
  if (error) {
    console.error(error.message);
    return;
  }
  if (data && data.length) {
    console.log('Columns:', Object.keys(data[0]));
    console.log('Sample row:', JSON.stringify(data[0], null, 2));
  } else {
    console.log('No rows found');
  }
}
run();
