require('dotenv').config();
const supabase = require('./config/supabase');
const { logAction } = require('./utils/logger');

async function testVerification() {
  console.log('--- AUDITING ACTIVITY LOGS SYSTEM ---');
  
  // Test logAction write to record_activity_logs
  await logAction(1, 'AUDIT_VERIFICATION_TEST', 'system', 999999, {
    test: true,
    timestamp: new Date().toISOString()
  });

  const { data: testLogs, error: logError } = await supabase
    .from('record_activity_logs')
    .select('*')
    .eq('entity_id', 999999);

  if (logError || !testLogs || testLogs.length === 0) {
    console.log('❌ Activity log test failed:', logError);
  } else {
    console.log('✅ Activity log successfully recorded:', testLogs[0].action);
    // Cleanup test log
    await supabase.from('record_activity_logs').delete().eq('entity_id', 999999);
  }

  console.log('\n--- AUDITING ALL RECENT ACTIVITY LOGS ---');
  const { data: recentLogs } = await supabase
    .from('record_activity_logs')
    .select('id, entity_type, entity_id, action, created_at')
    .order('created_at', { ascending: false })
    .limit(10);
  console.log('Recent Activity Logs:', JSON.stringify(recentLogs, null, 2));

  console.log('\n--- AUDITING SALES ORDERS STATUSES ---');
  const { data: orders } = await supabase
    .from('orders')
    .select('id, order_no, status, corporate_action, created_at');
  console.log('Orders:', JSON.stringify(orders, null, 2));

  console.log('\n--- AUDITING JOB CARDS READINESS ---');
  const { data: jobCards } = await supabase
    .from('job_cards')
    .select('id, job_card_no, order_id, status, po_handler_action, hold_reason');
  console.log('Job Cards:', JSON.stringify(jobCards, null, 2));

  console.log('\n--- AUDITING DELIVERY CHALLANS ---');
  const { data: dcs } = await supabase
    .from('delivery_challans')
    .select('id, dc_no, order_id, dispatch_date');
  console.log('Delivery Challans:', JSON.stringify(dcs, null, 2));

  console.log('\n--- AUDITING BRANCH INVENTORY ---');
  const { data: inventory } = await supabase
    .from('branch_inventory')
    .select('id, branch_id, item_type, item_name, quantity');
  console.log('Branch Inventory:', JSON.stringify(inventory, null, 2));
}

testVerification().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
