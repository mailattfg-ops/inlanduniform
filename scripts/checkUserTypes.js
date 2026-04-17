const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY,
  { auth: { persistSession: false } }
);

async function checkUserTypes() {
  console.log('--- USER TYPES INSPECTION ---');
  const { data, error } = await supabase.from('user_types').select('*');
  if (error) console.error('Error:', error.message);
  else console.log('User Types:', data);
}

checkUserTypes();
