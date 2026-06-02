const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config({ path: 'c:/Users/shiju/Desktop/uniform/backend/.env' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: fabrics, error } = await supabase
      .from('fabrics')
      .select('id, name, code, brand_name, quantity, description');
  
  if (error) console.error(error);
  else console.log('Fabrics in Supabase:', JSON.stringify(fabrics, null, 2));
}

run();
