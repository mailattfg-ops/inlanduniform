require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const supabase = require('../config/supabase');
const fs = require('fs');
const path = require('path');

async function run() {
  const sqlPath = path.join(__dirname, '..', 'migrations', 'add_design_number_catalog_fields.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  console.log('Attempting to apply design_number name/description catalog migration...');

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
}

run();
