const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY,
  { auth: { persistSession: false } }
);

async function checkColumns() {
  console.log('--- COLUMN INSPECTION ---');
  
  // Directly query the first row and look at keys
  const { data, error } = await supabase.from('schools').select('*').limit(1);
  if (data && data.length > 0) {
      console.log('Columns in schools table:', Object.keys(data[0]));
  } else {
      console.log('No data to inspect columns.');
  }
}

checkColumns();
