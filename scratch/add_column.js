require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const supabase = require('../config/supabase');

async function run() {
  const sql = "ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS quotation_type TEXT DEFAULT 'STANDARD';";
  console.log("Attempting to run SQL migration to add quotation_type column...");

  const rpcs = ['exec_sql', 'execute_sql', 'exec', 'run_sql'];
  let applied = false;
  
  for (const rpcName of rpcs) {
    try {
      console.log(`Trying RPC: ${rpcName}...`);
      const { data, error } = await supabase.rpc(rpcName, { sql_query: sql, sql: sql, query: sql });
      if (!error) {
        console.log(`✅ Success! Column added via RPC: ${rpcName}`);
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
    console.log("❌ Could not apply migration via RPC.");
  }
}

run();
