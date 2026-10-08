const supabase = require('./config/supabase');

async function check() {
  const { data: cats, error: err1 } = await supabase.from('trim_categories').select('*');
  console.log('Categories:', cats);
  const { data: trims, error: err2 } = await supabase.from('trims').select('id, name, code, category_id, uom, trim_categories(name)');
  console.log('Sample trims count:', trims?.length);
  if (trims && trims.length > 0) {
    console.log('Sample trims:', trims.slice(0, 10));
  }
}
check();
