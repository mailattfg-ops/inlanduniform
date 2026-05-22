require('dotenv').config();
const supabase = require('../config/supabase');

async function check() {
  try {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .limit(1);
    
    if (error) {
      console.error('Error selecting from products:', error);
      return;
    }
    
    console.log('Successfully connected to products. Sample row:', data);
    
    if (data && data.length > 0) {
      console.log('Columns in products:', Object.keys(data[0]));
    } else {
      console.log('Products table is empty or has no rows.');
    }
  } catch (err) {
    console.error('Unexpected error:', err);
  }
}

check();
