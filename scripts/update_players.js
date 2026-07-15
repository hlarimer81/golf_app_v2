import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function updatePlayers() {
  const updates = [
    { old: 'Ryan', new: 'Ryan B' },
    { old: 'Harold', new: 'H Larimer' },
    { old: 'Barry', new: 'Barry C' },
    { old: 'Boeve', new: 'M Boeve' },
    { old: 'Matt', new: 'Matt H' },
    { old: 'Roger', new: 'Roger E' },
    { old: 'Karl', new: 'Karl M' },
    { old: 'Cafferty', new: 'W Cafferty' },
    { old: 'Nick', new: 'Nick G' }
  ];

  for (const p of updates) {
    const { data, error } = await supabase
      .from('players')
      .update({ player_name: p.new })
      .eq('player_name', p.old)
      .is('match_id', null)
      .select();
      
    if (error) {
      console.error(`Error updating ${p.old}:`, error.message);
    } else {
      console.log(`Updated ${p.old} to ${p.new}. Affected rows:`, data?.length);
    }
  }
}

updatePlayers();
