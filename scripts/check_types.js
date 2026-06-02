require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const supabase = require('../config/supabase');

async function run() {
  const { data, error } = await supabase.from('product_types').select('*');
  console.log('Product Types:', data);
  console.log('Error:', error);
}

run();
