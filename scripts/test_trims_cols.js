require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function testCols() {
  const { data, error } = await supabase.from('trims').select('id, brand_name, specification, color, shade_no, size').limit(1);
  if (error) {
    console.log('Columns do not exist directly:', error.message);
  } else {
    console.log('Columns already exist!', data);
  }
}

testCols().then(() => process.exit(0));
