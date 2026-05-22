require('dotenv').config();
const supabase = require('../config/supabase');

async function check() {
  console.log('Checking database tables and columns for payments and orders workflow...');
  
  // 1. Check columns in quotations table
  console.log('\n--- Checking quotations table columns ---');
  try {
    const { data: quotes, error: quotesError } = await supabase
      .from('quotations')
      .select('*')
      .limit(1);
    
    if (quotesError) {
      console.log('❌ Error querying quotations table:', quotesError.message);
    } else {
      console.log('✅ Connected to quotations table.');
      if (quotes && quotes.length > 0) {
        const keys = Object.keys(quotes[0]);
        const hasPaymentStatus = keys.includes('payment_status');
        const hasPaidAmount = keys.includes('paid_amount');
        console.log(`- payment_status column exists: ${hasPaymentStatus ? '✅ YES' : '❌ NO'}`);
        console.log(`- paid_amount column exists: ${hasPaidAmount ? '✅ YES' : '❌ NO'}`);
        if (!hasPaymentStatus || !hasPaidAmount) {
          console.log('⚠️ Missing columns! Please run the migrations script.');
        }
      } else {
        console.log('ℹ️ quotations table is empty. Attempting to check structural metadata via insert simulation...');
        // Try selecting explicit columns to see if they're available
        const { error: colCheck } = await supabase
          .from('quotations')
          .select('payment_status, paid_amount')
          .limit(1);
        if (colCheck) {
          console.log('❌ Missing columns payment_status or paid_amount:', colCheck.message);
        } else {
          console.log('✅ payment_status and paid_amount columns exist!');
        }
      }
    }
  } catch (err) {
    console.error('Unexpected error checking quotations:', err.message);
  }

  // 2. Check payments table
  console.log('\n--- Checking payments table ---');
  try {
    const { data: payments, error: paymentsError } = await supabase
      .from('payments')
      .select('*')
      .limit(1);
    
    if (paymentsError) {
      console.log('❌ payments table: NOT FOUND or error:', paymentsError.message);
      console.log('⚠️ Please execute c:\\Users\\shiju\\Desktop\\uniform\\backend\\migrations\\create_payments_and_orders.sql in your Supabase SQL Editor.');
    } else {
      console.log('✅ payments table: EXISTS!');
    }
  } catch (err) {
    console.error('Unexpected error checking payments table:', err.message);
  }

  // 3. Check orders table
  console.log('\n--- Checking orders table ---');
  try {
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select('*')
      .limit(1);
    
    if (ordersError) {
      console.log('❌ orders table: NOT FOUND or error:', ordersError.message);
      console.log('⚠️ Please execute c:\\Users\\shiju\\Desktop\\uniform\\backend\\migrations\\create_payments_and_orders.sql in your Supabase SQL Editor.');
    } else {
      console.log('✅ orders table: EXISTS!');
    }
  } catch (err) {
    console.error('Unexpected error checking orders table:', err.message);
  }
}

check();
