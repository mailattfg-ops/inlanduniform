require('dotenv').config({ path: './.env' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function testQuery() {
  const { data, error } = await supabase
      .from('organizations')
      .select('*, industries(name)')
      .order('created_at', { ascending: false });
  console.log('Error:', error);
  if (!error) console.log('Data length:', data.length);
}
testQuery();
