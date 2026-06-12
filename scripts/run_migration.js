require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const supabase = require('../config/supabase');
const fs = require('fs');
const path = require('path');

async function applyFile(fileName) {
  const sqlPath = path.join(__dirname, '..', 'migrations', fileName);
  const sql = fs.readFileSync(sqlPath, 'utf8');
  console.log(`\nReading migration SQL from ${fileName}...`);

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
    console.log(`❌ Could not automatically execute migration ${fileName} via RPC.`);
    console.log('👉 Please execute the following SQL in your Supabase SQL Editor:');
    console.log('--------------------------------------------------');
    console.log(sql);
    console.log('--------------------------------------------------');
  }
}

async function run() {
  await applyFile('change_fabric_columns_to_meters.sql');
  await applyFile('add_base_size_and_fit_to_products.sql');
  await applyFile('add_fields_to_art_numbers.sql');
}

run();

