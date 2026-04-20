const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY,
  { auth: { persistSession: false } }
);

async function checkClasses() {
  console.log('--- CLASSES TABLE INSPECTION ---');
  const { data, error } = await supabase.from('classes').select('*').limit(1);
  if (error) {
      console.error('Error fetching classes:', error.message);
  } else if (data && data.length > 0) {
      console.log('Columns in classes table:', Object.keys(data[0]));
  } else {
      console.log('No data in classes table or table empty.');
      // Try to get column names via select on non-existent row
      const { data: cols, error: colError } = await supabase.from('classes').select('*').limit(0);
      if (colError) console.error('Error:', colError.message);
      else console.log('Table exists.');
  }
}

checkClasses();
