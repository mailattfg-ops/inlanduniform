require('dotenv').config();
const supabase = require('./config/supabase');

async function checkTables() {
  const tables = [
    'branches',
    'branch_inventory',
    'branch_transfers',
    'organizations',
    'departments',
    'registry_members',
    'measurements',
    'measurement_tokens',
    'measurement_config',
    'quotations',
    'quotation_items',
    'orders',
    'job_cards',
    'sub_job_cards',
    'fabric_consumption_logs',
    'invoices',
    'delivery_challans',
    'record_activity_logs',
    'employees',
    'user_profiles',
    'design_numbers',
    'products',
    'fabrics',
    'buttons',
    'threads'
  ];

  console.log('=== DATABASE TABLES AUDIT ===');
  for (const t of tables) {
    try {
      const { count, error } = await supabase.from(t).select('*', { count: 'exact', head: true });
      if (error) {
        console.log(`FAIL [${t}]: ${error.message}`);
      } else {
        console.log(`OK   [${t}]: ${count} rows`);
      }
    } catch (e) {
      console.log(`EXC  [${t}]: ${e.message}`);
    }
  }

  console.log('\n=== RECENT SALES ORDERS & JOB CARDS AUDIT ===');
  const { data: orders } = await supabase
    .from('orders')
    .select('id, order_no, quotation_id, status, created_at')
    .order('created_at', { ascending: false })
    .limit(5);
  console.log('Orders:', JSON.stringify(orders, null, 2));

  const { data: jobCards } = await supabase
    .from('job_cards')
    .select('id, job_card_no, order_id, item_name, quantity, status, po_handler_action, hold_reason')
    .order('created_at', { ascending: false })
    .limit(5);
  console.log('Job Cards:', JSON.stringify(jobCards, null, 2));

  const { data: challans } = await supabase
    .from('delivery_challans')
    .select('id, challan_no, order_id, status, created_at')
    .order('created_at', { ascending: false })
    .limit(5);
  console.log('Delivery Challans:', JSON.stringify(challans, null, 2));

  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, invoice_no, order_id, total_amount, payment_status, created_at')
    .order('created_at', { ascending: false })
    .limit(5);
  console.log('Invoices:', JSON.stringify(invoices, null, 2));

  const { data: logs } = await supabase
    .from('record_activity_logs')
    .select('id, entity_type, entity_id, action, created_at')
    .order('created_at', { ascending: false })
    .limit(5);
  console.log('Activity Logs:', JSON.stringify(logs, null, 2));
}

checkTables().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
