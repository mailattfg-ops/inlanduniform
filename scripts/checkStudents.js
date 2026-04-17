const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY,
  { auth: { persistSession: false } }
);

async function checkStudents() {
  console.log('--- STUDENTS TABLE INSPECTION ---');
  const { data, error } = await supabase.from('students').select('*').limit(1);
  if (data && data.length > 0) {
      console.log('Columns in students table:', Object.keys(data[0]));
  } else {
      console.log('No data in students table or table missing.');
      // Try to get column names via an empty select if rpc or other method not available
      // Usually select('*') on empty table works if table exists
      if (error) console.error('Error:', error.message);
      else console.log('Table exists but is empty.');
  }
}

checkStudents();
