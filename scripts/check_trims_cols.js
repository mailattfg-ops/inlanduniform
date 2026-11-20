const supabase = require('../config/supabase');

async function check() {
  const { data: trims, error: errTrims } = await supabase.from('trims').select('*').limit(1);
  if (errTrims) console.log('trims error:', errTrims);
  else console.log('trims columns:', trims[0] ? Object.keys(trims[0]) : 'empty table');

  const { data: prods, error: errProds } = await supabase.from('products').select('*').limit(1);
  if (errProds) console.log('products error:', errProds);
  else console.log('products columns:', prods[0] ? Object.keys(prods[0]) : 'empty table');
}

check().then(() => process.exit(0));
