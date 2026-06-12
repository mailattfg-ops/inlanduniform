require('dotenv').config();
const supabase = require('../config/supabase');

async function check() {
  try {
    const { data, error } = await supabase
      .from('fabrics')
      .select('*')
      .limit(1);
    
    if (error) {
      console.error('Error selecting from fabrics:', error);
      return;
    }
    
    console.log('Successfully connected to fabrics. Sample row:', data);
    
    if (data && data.length > 0) {
      const keys = Object.keys(data[0]);
      console.log('Columns in fabrics:', keys);
    } else {
      console.log('Table is empty. Let us check if we can query schema cache or insert/read properties.');
    }
  } catch (err) {
    console.error('Unexpected error:', err);
  }
}

check();
