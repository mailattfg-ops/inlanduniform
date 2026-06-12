require('dotenv').config({ path: './.env' });
const supabase = require('../config/supabase');

async function testOrderCreation() {
  try {
    const quotation_id = 2; // ID of the partially paid quotation
    
    // Fetch quotation status and amount details
    const { data: quotation, error: quoteError } = await supabase
        .from('quotations')
        .select('id, quotation_no, final_quote_value, paid_amount, payment_status')
        .eq('id', quotation_id)
        .single();

    if (quoteError || !quotation) {
        console.error('❌ Quotation not found or error:', quoteError);
        return;
    }

    console.log('Quotation Details fetched:', quotation);

    // Verify quotation has a payment (either Partially Paid or Paid)
    if (quotation.payment_status !== 'Paid' && quotation.payment_status !== 'Partially Paid') {
        console.log(`❌ BLOCK: payment_status is ${quotation.payment_status}. Guard works as expected.`);
        return;
    }
    console.log('✅ Guard passed. payment_status is:', quotation.payment_status);

    // Check if an order already exists for this quotation
    const { data: existingOrder, error: existingOrderError } = await supabase
        .from('orders')
        .select('id')
        .eq('quotation_id', quotation_id)
        .maybeSingle();

    if (existingOrderError) {
      console.error('❌ Error checking existing order:', existingOrderError);
      return;
    }
    if (existingOrder) {
        console.log('❌ BLOCK: An order already exists with ID:', existingOrder.id);
        return;
    }
    console.log('✅ No existing order found.');

    // Generate unique order number and barcode sequence
    const cleanQuoteNo = quotation.quotation_no.replace(/[^A-Za-z0-9]/g, '');
    const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase(); // e.g. "A9BC"
    const order_no = `ORD-${cleanQuoteNo}-${randomSuffix}`;
    const barcode = `BRC-${cleanQuoteNo}-${randomSuffix}`;

    console.log(`Generated Order No: ${order_no}, Barcode: ${barcode}`);

    // Try inserting into DB (and then rollback / delete)
    const { data: newOrder, error: orderError } = await supabase
        .from('orders')
        .insert([{
            quotation_id,
            order_no,
            barcode,
            status: 'Placed',
            order_notes: 'Temporary testing order notes',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        }])
        .select()
        .single();

    if (orderError) {
      console.error('❌ Database insertion failed:', orderError);
    } else {
      console.log('✅ Order inserted successfully! Order details:', newOrder);
      
      // Delete temporary order to keep DB clean
      const { error: deleteError } = await supabase
        .from('orders')
        .delete()
        .eq('id', newOrder.id);
      if (deleteError) {
        console.error('❌ Cleanup failed:', deleteError);
      } else {
        console.log('✅ Cleaned up temporary order successfully.');
      }
    }
  } catch (err) {
    console.error('Unexpected error:', err);
  }
}

testOrderCreation();
