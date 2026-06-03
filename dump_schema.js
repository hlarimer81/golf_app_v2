import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSchema() {
  const tables = ['matches', 'holes'];
  for (const t of tables) {
    const { data, error } = await supabase.from(t).select('*').limit(1);
    if (error) console.error(`Error fetching ${t}:`, error.message);
    else {
      console.log(`Table ${t} columns:`, data.length ? Object.keys(data[0]) : 'empty table');
    }
  }
}
checkSchema();
