import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function uploadGreenImage() {
  const filePath = path.resolve('src/assets/agcc-blue-hole1-green.png');
  const fileBuffer = fs.readFileSync(filePath);
  
  // Upload to Supabase Storage: green-images/agcc-blues/hole-1.png
  const storagePath = 'agcc-blues/hole-1.png';
  
  const { data, error } = await supabase.storage
    .from('green-images')
    .upload(storagePath, fileBuffer, {
      contentType: 'image/png',
      upsert: true
    });

  if (error) {
    console.error('Upload error:', error);
    return;
  }
  
  console.log('Upload success:', data);

  // Get the public URL
  const { data: urlData } = supabase.storage
    .from('green-images')
    .getPublicUrl(storagePath);
  
  console.log('Public URL:', urlData.publicUrl);
}

uploadGreenImage();
