require('dotenv').config();
const supabase = require('../config/supabase');

async function check() {
  console.log('Auditing products table schema for design_id relation...');
  try {
    const { data, error } = await supabase
      .from('products')
      .select('design_id')
      .limit(1);
    
    if (error) {
      console.log('❌ design_id column does NOT exist or could not be selected.');
      console.log('Message:', error.message);
      console.log('👉 Please execute the following SQL in your Supabase SQL Editor:');
      console.log('\nALTER TABLE products ADD COLUMN IF NOT EXISTS design_id UUID REFERENCES designs(id) ON DELETE SET NULL;\n');
    } else {
      console.log('✅ design_id column exists in products table!');
    }
  } catch (err) {
    console.error('Unexpected error checking products schema:', err.message);
  }
}

check();
