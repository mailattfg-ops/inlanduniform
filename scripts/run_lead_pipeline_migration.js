const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const fs = require('fs');
const supabase = require('../config/supabase');

async function checkAndApply() {
  console.log('Testing connection to Supabase...');
  const { data: testData, error: testErr } = await supabase.from('leads').select('id').limit(1);
  if (testErr) {
    console.error('Error connecting to leads table:', testErr.message);
    return;
  }
  console.log('Successfully connected to leads table.');

  const sqlPath = path.join(__dirname, '../migrations/add_11_stages_lead_pipeline.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  // Try common RPC names for Supabase SQL execution
  const rpcNames = ['exec_sql', 'execute_sql', 'exec', 'run_sql', 'sql', 'query'];
  let applied = false;

  for (const rpc of rpcNames) {
    try {
      const { data, error } = await supabase.rpc(rpc, { sql_query: sql, sql: sql, query: sql });
      if (!error) {
        console.log(`✅ Applied migration via RPC ${rpc}`);
        applied = true;
        break;
      }
    } catch (e) {
      // Ignore
    }
  }

  // Check if tables already exist or if columns exist
  const { data: actData, error: actErr } = await supabase.from('lead_activities').select('id').limit(1);
  if (!actErr) {
    console.log('✅ public.lead_activities table is active and accessible!');
  } else {
    console.log('ℹ️ public.lead_activities status:', actErr.message);
  }

  const { data: histData, error: histErr } = await supabase.from('lead_stage_history').select('id').limit(1);
  if (!histErr) {
    console.log('✅ public.lead_stage_history table is active and accessible!');
  } else {
    console.log('ℹ️ public.lead_stage_history status:', histErr.message);
  }
}

checkAndApply();
