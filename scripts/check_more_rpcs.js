require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const supabase = require('../config/supabase');

async function checkMore() {
  const names = ['execute_query', 'exec_query', 'run_command', 'run_statement', 'db_query', 'postgres_query'];
  for (const name of names) {
    try {
      const { data, error } = await supabase.rpc(name, { query: 'SELECT 1;', sql: 'SELECT 1;' });
      if (!error) {
        console.log(`Found active RPC: ${name}`);
      } else {
        console.log(`RPC ${name} error: ${error.message}`);
      }
    } catch (e) {
      console.log(`RPC ${name} exception: ${e.message}`);
    }
  }
}

checkMore();
