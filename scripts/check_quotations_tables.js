require('dotenv').config();
const supabase = require('../config/supabase');

async function check() {
  console.log('Checking for quotations table...');
  const { data: quotesData, error: quotesError } = await supabase
    .from('quotations')
    .select('id')
    .limit(1);

  if (quotesError) {
    console.log('quotations table: NOT FOUND or error:', quotesError.message);
    console.log('⚠️ Please execute c:\\Users\\shiju\\Desktop\\uniform\\backend\\migrations\\create_quotations_tables.sql in your Supabase SQL Editor dashboard to create the tables!');
  } else {
    console.log('✅ quotations table: EXISTS! Row count:', quotesData.length);
  }

  console.log('Checking for quotation_items table...');
  const { data: itemsData, error: itemsError } = await supabase
    .from('quotation_items')
    .select('id')
    .limit(1);

  if (itemsError) {
    console.log('quotation_items table: NOT FOUND or error:', itemsError.message);
  } else {
    console.log('✅ quotation_items table: EXISTS!');
  }
}

check();
