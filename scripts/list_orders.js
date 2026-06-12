require('dotenv').config({ path: './.env' });
const supabase = require('../config/supabase');

async function listOrders() {
  try {
    const { data: orders, error } = await supabase
      .from('orders')
      .select('id, quotation_id, order_no, status');

    if (error) {
      console.error('Error fetching orders:', error);
      return;
    }

    console.log('Orders in DB:');
    orders.forEach(o => {
      console.log(`- ID: ${o.id}, Quotation ID: ${o.quotation_id}, Order No: ${o.order_no}, Status: ${o.status}`);
    });
  } catch (err) {
    console.error('Unexpected error:', err);
  }
}

listOrders();
