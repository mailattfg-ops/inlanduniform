require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const supabase = require('../config/supabase');

async function run() {
  // Query pg_catalog.pg_proc or information_schema.routines
  const { data, error } = await supabase
    .from('products')
    .select('id')
    .limit(1);

  if (error) {
    console.log('Error connecting:', error);
    return;
  }

  console.log('Connected! Now listing functions from information_schema:');
  
  // PostgREST allows querying views if they are exposed. Let's see if we can query pg_proc or pg_description or similar.
  // Actually, we can't query system catalogs directly unless they are exposed in the 'public' schema or we use a view.
  // Let's check if we can query them:
  try {
    const { data: routines, error: err } = await supabase
      .from('pg_proc')
      .select('*')
      .limit(10);
    console.log('pg_proc:', routines, err);
  } catch (e) {
    console.log('pg_proc error:', e.message);
  }
}

run();
