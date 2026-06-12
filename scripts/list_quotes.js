require('dotenv').config({ path: './.env' });
const supabase = require('../config/supabase');

async function listQuotes() {
  try {
    const { data: quotes, error } = await supabase
      .from('quotations')
      .select('id, quotation_no, title, final_quote_value, paid_amount, payment_status, status')
      .eq('status', 'Approved');

    if (error) {
      console.error('Error fetching quotes:', error);
      return;
    }

    console.log('Approved Quotations:');
    quotes.forEach(q => {
      console.log(`- ID: ${q.id}, No: ${q.quotation_no}, Title: ${q.title}, Value: ${q.final_quote_value}, Paid: ${q.paid_amount}, Payment Status: ${q.payment_status}, Status: ${q.status}`);
    });
  } catch (err) {
    console.error('Unexpected error:', err);
  }
}

listQuotes();
