const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY,
  { auth: { persistSession: false } }
);

async function checkUserProfiles() {
  console.log('--- USER PROFILES INSPECTION ---');
  const { data, error } = await supabase.from('user_profiles').select('*').limit(1);
  if (data && data.length > 0) {
      console.log('Columns in user_profiles table:', Object.keys(data[0]));
  } else {
      console.log('No data or error:', error ? error.message : 'Empty');
  }
}

checkUserProfiles();
