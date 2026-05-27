require('dotenv').config();
const supabase = require('./config/supabase');

async function check() {
  const { data: items } = await supabase
    .from('quotation_items')
    .select('*')
    .eq('id', 15);
  console.log(JSON.stringify(items, null, 2));
}

check();
