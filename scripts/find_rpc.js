require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const supabase = require('../config/supabase');

async function run() {
  const { data, error } = await supabase.from('products').select('id').limit(1);
  if (error) {
    console.log('Error:', error);
    return;
  }
  
  // Try querying pg_proc via a RPC or see if we can find any custom RPCs
  console.log('Successfully fetched products. Let us check some common RPCs:');
  const rpcs = ['exec_sql', 'execute_sql', 'exec', 'run_sql', 'sql', 'query', 'run_query'];
  for (const rpc of rpcs) {
    try {
      const { data: res, error: rpcErr } = await supabase.rpc(rpc, { sql: 'SELECT 1;' });
      if (!rpcErr) {
        console.log(`Found active RPC: ${rpc}`);
      } else {
        console.log(`RPC ${rpc} error:`, rpcErr.message);
      }
    } catch (e) {
      console.log(`RPC ${rpc} exception:`, e.message);
    }
  }
}

run();
