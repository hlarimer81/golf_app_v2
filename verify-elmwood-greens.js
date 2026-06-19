import { createClient } from '@supabase/supabase-js';
import fs from 'fs'; import path from 'path';
(function(){try{for(const l of fs.readFileSync('.env','utf8').split(/\r?\n/)){const s=l.trim();if(!s||s.startsWith('#'))continue;const i=s.indexOf('=');if(i<0)continue;const k=s.slice(0,i).trim();let v=s.slice(i+1).trim();if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'")))v=v.slice(1,-1);if(!(k in process.env))process.env[k]=v;}}catch{}})();
const supabase=createClient(process.env.VITE_SUPABASE_URL,process.env.VITE_SUPABASE_ANON_KEY);
const { data, error } = await supabase
  .from('green_images')
  .select('hole_number, green_center_lat, green_center_lon, osm_way_id, osm_source')
  .eq('course_name', 'Elmwood Country Club')
  .order('hole_number');
if (error) { console.error(error.message); process.exit(1); }
console.log(`Elmwood Country Club: ${data.length} rows in green_images`);
for (const r of data) {
  console.log(`  Hole ${String(r.hole_number).padStart(2)}: centroid ${Number(r.green_center_lat).toFixed(6)}, ${Number(r.green_center_lon).toFixed(6)}  (osm way ${r.osm_way_id}, src=${r.osm_source})`);
}
