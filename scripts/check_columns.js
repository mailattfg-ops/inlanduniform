require('dotenv').config();
const supabase = require('../config/supabase');

async function check() {
  try {
    const { data, error } = await supabase
      .from('quotation_items')
      .select('*')
      .limit(1);
    
    if (error) {
      console.error('Error selecting from quotation_items:', error);
      return;
    }
    
    console.log('Successfully connected to quotation_items. Sample row:', data);
    
    if (data && data.length > 0) {
      const keys = Object.keys(data[0]);
      console.log('Columns in quotation_items:', keys);
      console.log('Has fabric_id:', keys.includes('fabric_id'));
      console.log('Has sam_value:', keys.includes('sam_value'));
      console.log('Has design_number:', keys.includes('design_number'));
    } else {
      console.log('Table is empty. Cannot determine columns directly this way, but we will try to insert a test record.');
    }
  } catch (err) {
    console.error('Unexpected error:', err);
  }
}

check();
