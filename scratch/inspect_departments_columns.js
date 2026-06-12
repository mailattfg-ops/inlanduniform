const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config({ path: 'c:/Users/shiju/Desktop/uniform/backend/.env' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase
    .from('departments')
    .select('*')
    .limit(1);

  if (error) {
    console.error('Error fetching departments:', error);
    return;
  }
  console.log('Department Sample:', data);
}

run();
