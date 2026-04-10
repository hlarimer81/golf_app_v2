import { createClient } from '@supabase/supabase-js'

// Replace the text inside the single quotes with your actual keys
const supabaseUrl = 'https://lvwdffsibhqzgbqixfdi.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx2d2RmZnNpYmhxemdicWl4ZmRpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzMTUwMjMsImV4cCI6MjA5MDg5MTAyM30.ETPaFp-DLuNMnx4DvXVBr8H6XkRgH3OAFtiGzwEwQmc'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)