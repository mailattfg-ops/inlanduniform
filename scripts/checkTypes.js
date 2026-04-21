const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY,
  { auth: { persistSession: false } }
);

async function checkTypes() {
  // We can't see types directly easily with supabase-js unless we use a query that returns metadata
  // But we can check a sample value
  const { data, error } = await supabase.from('user_profiles').select('id').limit(1);
  if (error) console.error(error);
  else {
    const id = data[0]?.id;
    console.log('Sample User ID:', id, 'Type:', typeof id);
  }
}

checkTypes();
