require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function run() {
  const { data: t } = await supabase.from('trims').select('*').limit(1);
  console.log('TRIMS COLS:', t && t[0] ? Object.keys(t[0]) : []);
  console.log('TRIMS SAMPLE:', t ? t[0] : null);

  const { data: p } = await supabase.from('products').select('*').limit(1);
  console.log('PRODS COLS:', p && p[0] ? Object.keys(p[0]) : []);
  console.log('PRODS SAMPLE:', p ? p[0] : null);

  const { data: tc } = await supabase.from('trim_categories').select('*');
  console.log('TRIM CATS:', tc);
}

run().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
