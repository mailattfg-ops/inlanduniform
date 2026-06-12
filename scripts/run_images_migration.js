require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const supabase = require('../config/supabase');
const fs = require('fs');
const path = require('path');

async function run() {
  const sqlPath = path.join(__dirname, '..', 'migrations', 'add_images_to_products.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  console.log('Running migration: add_images_to_products.sql');

  const rpcs = ['exec_sql', 'execute_sql', 'exec', 'run_sql'];
  let applied = false;
  
  for (const rpcName of rpcs) {
    try {
      const { data, error } = await supabase.rpc(rpcName, { sql_query: sql, sql: sql, query: sql });
      if (!error) {
        console.log(`✅ Applied successfully via RPC: ${rpcName}`);
        applied = true;
        break;
      }
    } catch (err) {
      // ignore
    }
  }

  if (!applied) {
    console.log('Could not automatically run migration via RPC. Please copy this SQL into your Supabase SQL editor:');
    console.log(sql);
  }
}

run();
