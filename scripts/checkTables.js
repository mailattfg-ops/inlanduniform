const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY,
  { auth: { persistSession: false } }
);

async function checkTables() {
  console.log('--- TABLE INSPECTION ---');
  
  // Try to query schools
  const { data: sData, error: sError } = await supabase.from('schools').select('*').limit(1);
  if (sError) console.error('Schools Table Error:', sError.message);
  else console.log('Schools Table exists. Sample:', sData);

  // Try to query school (singular)
  const { data: sData2, error: sError2 } = await supabase.from('school').select('*').limit(1);
  if (sError2) console.error('School (singular) Table Error:', sError2.message);
  else console.log('School (singular) Table exists. Sample:', sData2);
}

checkTables();
