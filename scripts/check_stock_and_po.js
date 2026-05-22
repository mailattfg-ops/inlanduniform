require('dotenv').config();
const supabase = require('../config/supabase');

async function check() {
  console.log('Checking database tables and columns for restructured stock and fabric PO workflow...');
  
  // 1. Check product_stocks table
  console.log('\n--- Checking product_stocks table ---');
  try {
    const { data: stocks, error: stocksError } = await supabase
      .from('product_stocks')
      .select('*')
      .limit(1);
    
    if (stocksError) {
      console.log('❌ product_stocks table: NOT FOUND or error:', stocksError.message);
      console.log('⚠️ Please execute c:\\Users\\shiju\\Desktop\\uniform\\backend\\migrations\\create_stock_and_po_tables.sql in your Supabase SQL Editor.');
    } else {
      console.log('✅ product_stocks table: EXISTS!');
    }
  } catch (err) {
    console.error('Unexpected error checking product_stocks:', err.message);
  }

  // 2. Check fabrics table for low_stock_threshold column
  console.log('\n--- Checking fabrics table for low_stock_threshold ---');
  try {
    const { data: fabrics, error: fabricError } = await supabase
      .from('fabrics')
      .select('id, name, quantity, low_stock_threshold')
      .limit(1);
    
    if (fabricError) {
      console.log('❌ fabrics table or low_stock_threshold column: NOT FOUND or error:', fabricError.message);
      console.log('⚠️ Make sure your fabrics table exists and has been altered with low_stock_threshold.');
    } else {
      console.log('✅ fabrics table with low_stock_threshold: EXISTS!');
      console.log('Sample record:', fabrics[0]);
    }
  } catch (err) {
    console.error('Unexpected error checking fabrics:', err.message);
  }

  // 3. Check purchase_orders table
  console.log('\n--- Checking purchase_orders table ---');
  try {
    const { data: pos, error: posError } = await supabase
      .from('purchase_orders')
      .select('*')
      .limit(1);
    
    if (posError) {
      console.log('❌ purchase_orders table: NOT FOUND or error:', posError.message);
    } else {
      console.log('✅ purchase_orders table: EXISTS!');
    }
  } catch (err) {
    console.error('Unexpected error checking purchase_orders table:', err.message);
  }

  // 4. Check purchase_order_items table
  console.log('\n--- Checking purchase_order_items table ---');
  try {
    const { data: poItems, error: poItemsError } = await supabase
      .from('purchase_order_items')
      .select('id, purchase_order_id, fabric_id, quantity, status')
      .limit(1);
    
    if (poItemsError) {
      console.log('❌ purchase_order_items table: NOT FOUND or error:', poItemsError.message);
      console.log('⚠️ Please execute c:\\Users\\shiju\\Desktop\\uniform\\backend\\migrations\\create_stock_and_po_tables.sql in your Supabase SQL Editor.');
    } else {
      console.log('✅ purchase_order_items table with fabric_id: EXISTS!');
    }
  } catch (err) {
    console.error('Unexpected error checking purchase_order_items table:', err.message);
  }
}

check();
