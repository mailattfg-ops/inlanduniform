require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const supabase = require('../config/supabase');

const sql = `ALTER TABLE public.products ADD COLUMN IF NOT EXISTS design_number TEXT UNIQUE DEFAULT NULL;`;

async function run() {
  console.log('Attempting to add design_number column to products table...');
  
  const rpcs = ['exec_sql', 'execute_sql', 'exec', 'run_sql'];
  let applied = false;
  
  for (const rpcName of rpcs) {
    try {
      console.log(`Trying RPC: ${rpcName}...`);
      const { data, error } = await supabase.rpc(rpcName, { sql_query: sql, sql: sql, query: sql });
      if (!error) {
        console.log(`✅ Migration successfully applied via RPC: ${rpcName}`);
        applied = true;
        break;
      } else {
        console.log(`  RPC ${rpcName} returned error:`, error.message);
      }
    } catch (err) {
      console.log(`  RPC ${rpcName} exception:`, err.message);
    }
  }

  if (!applied) {
    console.log('\n❌ Could not auto-apply migration via RPC.');
    console.log('👉 Please run this SQL in your Supabase SQL Editor:');
    console.log('--------------------------------------------------');
    console.log(sql);
    console.log('--------------------------------------------------');
  }
  
  // Verify if the column already exists
  const { data, error } = await supabase.from('products').select('design_number').limit(1);
  if (!error) {
    console.log('\n✅ design_number column already exists or was just created!');
  } else {
    console.log('\n⚠️  Column still missing. Error:', error.message);
    console.log('Please run the SQL manually in Supabase SQL Editor.');
  }
}

run();
