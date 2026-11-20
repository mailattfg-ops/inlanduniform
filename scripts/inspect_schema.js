const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const supabase = require('../config/supabase');

async function run() {
  const testObj = {
    brand_name: 'Arihant',
    specification: '80 single',
    color: 'White',
    shade_no: '001',
    size: '44',
    size_uom: 'Inchs.'
  };
  
  // Try to update a trim or check error
  const { data, error } = await supabase.from('trims').select('brand_name').limit(1);
  console.log('Select brand_name from trims result:', data, error ? error.message : 'OK');
}

run().catch(console.error);
