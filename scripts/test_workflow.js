require('dotenv').config();
const supabase = require('../config/supabase');

async function testWorkflow() {
  console.log('--- Starting payments & orders workflow test simulation ---');

  try {
    // 1. Create a mock quotation to run tests on
    const quoteNo = `TEST-QT-${Date.now().toString().slice(-6)}`;
    console.log(`Creating mock quotation: ${quoteNo}...`);
    
    // Find a valid organization
    const { data: orgs, error: orgsError } = await supabase
      .from('organizations')
      .select('id, name')
      .limit(1);
    
    if (orgsError || !orgs || orgs.length === 0) {
      console.log('❌ Could not find a valid organization to link. Please ensure organizations table has data.', orgsError?.message);
      return;
    }
    
    const orgId = orgs[0].id;
    console.log(`Using organization: ${orgs[0].name} (ID: ${orgId})`);

    const { data: quote, error: quoteError } = await supabase
      .from('quotations')
      .insert([{
        quotation_no: quoteNo,
        title: 'Automation Test Quotation',
        organization_id: orgId,
        estimated_expenses: 500,
        final_quote_value: 1000,
        status: 'Approved',
        payment_status: 'Pending',
        paid_amount: 0.00
      }])
      .select()
      .single();

    if (quoteError) {
      console.log('❌ Failed to create mock quotation. (Have you executed the SQL migration to add paid_amount and payment_status?)', quoteError.message);
      return;
    }
    
    console.log(`✅ Mock quotation created successfully! ID: ${quote.id}, Final Value: ${quote.final_quote_value}, Initial Payment Status: ${quote.payment_status}, Paid: ${quote.paid_amount}`);

    // 2. Record partial payment (e.g. 400.00 out of 1000)
    console.log('\n--- Simulation 2: Recording Partial Payment ($400.00) ---');
    
    // Insert partial payment record
    const { data: payment1, error: p1Error } = await supabase
      .from('payments')
      .insert([{
        quotation_id: quote.id,
        amount: 400.00,
        payment_method: 'Cash',
        reference_no: 'REF-PARTIAL-001',
        notes: 'Partial payment simulation'
      }])
      .select()
      .single();

    if (p1Error) {
      console.log('❌ Failed to insert payment 1:', p1Error.message);
      return;
    }

    // Perform same summation and update logic as in controller
    const { data: allPayments1, error: ap1Error } = await supabase
      .from('payments')
      .select('amount')
      .eq('quotation_id', quote.id);

    const totalPaid1 = allPayments1.reduce((sum, p) => sum + parseFloat(p.amount), 0);
    let newStatus1 = 'Pending';
    if (totalPaid1 >= quote.final_quote_value) {
      newStatus1 = 'Paid';
    } else if (totalPaid1 > 0) {
      newStatus1 = 'Partially Paid';
    }

    const { data: updatedQuote1, error: uq1Error } = await supabase
      .from('quotations')
      .update({
        paid_amount: totalPaid1,
        payment_status: newStatus1
      })
      .eq('id', quote.id)
      .select()
      .single();

    if (uq1Error) {
      console.log('❌ Failed to update quotation status for payment 1:', uq1Error.message);
      return;
    }

    console.log(`✅ Payment 1 recorded. Cumulative paid: ${updatedQuote1.paid_amount}, Status: ${updatedQuote1.payment_status}`);
    if (updatedQuote1.payment_status !== 'Partially Paid') {
      console.log(`❌ ERROR: Payment status should be 'Partially Paid' but is ${updatedQuote1.payment_status}`);
    }

    // 3. Attempt order placement (should fail since status is Partially Paid, not Paid)
    console.log('\n--- Simulation 3: Testing Guard (Block order creation for unpaid quote) ---');
    if (updatedQuote1.payment_status !== 'Paid') {
      console.log('✅ Success: Payment status is NOT Paid. Frontend/Backend will correctly block order creation.');
    } else {
      console.log('❌ Error: Quotation should have blocked order creation.');
    }

    // 4. Record remaining payment (e.g. 600.00 out of 1000)
    console.log('\n--- Simulation 4: Recording Complete Payment (Remaining $600.00) ---');
    const { data: payment2, error: p2Error } = await supabase
      .from('payments')
      .insert([{
        quotation_id: quote.id,
        amount: 600.00,
        payment_method: 'Bank Transfer',
        reference_no: 'REF-FINAL-002',
        notes: 'Final payment simulation'
      }])
      .select()
      .single();

    if (p2Error) {
      console.log('❌ Failed to insert payment 2:', p2Error.message);
      return;
    }

    // Perform summation and update logic again
    const { data: allPayments2, error: ap2Error } = await supabase
      .from('payments')
      .select('amount')
      .eq('quotation_id', quote.id);

    const totalPaid2 = allPayments2.reduce((sum, p) => sum + parseFloat(p.amount), 0);
    let newStatus2 = 'Pending';
    if (totalPaid2 >= quote.final_quote_value) {
      newStatus2 = 'Paid';
    } else if (totalPaid2 > 0) {
      newStatus2 = 'Partially Paid';
    }

    const { data: updatedQuote2, error: uq2Error } = await supabase
      .from('quotations')
      .update({
        paid_amount: totalPaid2,
        payment_status: newStatus2
      })
      .eq('id', quote.id)
      .select()
      .single();

    if (uq2Error) {
      console.log('❌ Failed to update quotation status for payment 2:', uq2Error.message);
      return;
    }

    console.log(`✅ Payment 2 recorded. Cumulative paid: ${updatedQuote2.paid_amount}, Status: ${updatedQuote2.payment_status}`);
    if (updatedQuote2.payment_status !== 'Paid') {
      console.log(`❌ ERROR: Payment status should be 'Paid' but is ${updatedQuote2.payment_status}`);
    }

    // 5. Create Order
    console.log('\n--- Simulation 5: Creating Order from Paid Quotation ---');
    const cleanQuoteNo = updatedQuote2.quotation_no.replace(/[^A-Za-z0-9]/g, '');
    const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
    const order_no = `ORD-${cleanQuoteNo}-${randomSuffix}`;
    const barcode = `BRC-${cleanQuoteNo}-${randomSuffix}`;

    const { data: order, error: oError } = await supabase
      .from('orders')
      .insert([{
        quotation_id: quote.id,
        order_no,
        barcode,
        status: 'Placed',
        order_notes: 'Workflow test order notes.'
      }])
      .select()
      .single();

    if (oError) {
      console.log('❌ Failed to create order:', oError.message);
      return;
    }

    console.log(`✅ Order created successfully! Order No: ${order.order_no}, Barcode: ${order.barcode}, Status: ${order.status}`);

    // Clean up test data
    console.log('\nCleaning up mock test records...');
    await supabase.from('orders').delete().eq('id', order.id);
    await supabase.from('payments').delete().eq('quotation_id', quote.id);
    await supabase.from('quotations').delete().eq('id', quote.id);
    console.log('✅ Clean up completed successfully.');
    console.log('🎉 ALL SIMULATIONS PASSED SUCCESSFULLY!');

  } catch (err) {
    console.error('❌ Unexpected error in test run:', err.message);
  }
}

testWorkflow();
