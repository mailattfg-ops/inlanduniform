const supabase = require('../config/supabase');

// 1. List all payments
exports.listPayments = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('payments')
            .select('*, quotations(quotation_no, title, final_quote_value)')
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 2. Get payments for a specific quotation
exports.getQuotationPayments = async (req, res) => {
    try {
        const { quotationId } = req.params;
        const { data, error } = await supabase
            .from('payments')
            .select('*')
            .eq('quotation_id', quotationId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 3. Record a new payment
exports.recordPayment = async (req, res) => {
    try {
        const { 
            quotation_id, 
            amount, 
            payment_method, 
            paymentMethod,
            reference_no, 
            referenceNo, 
            notes, 
            paid_at,
            paidAt 
        } = req.body;

        const effectivePaymentMethod = payment_method || paymentMethod;
        const effectiveReferenceNo = reference_no || referenceNo || '';
        const effectivePaidAt = paid_at || paidAt || new Date().toISOString();

        if (!quotation_id) {
            return res.status(400).json({ error: 'Quotation ID is required.' });
        }
        if (!amount || parseFloat(amount) <= 0) {
            return res.status(400).json({ error: 'Payment amount must be greater than zero.' });
        }
        if (!effectivePaymentMethod) {
            return res.status(400).json({ error: 'Payment method is required.' });
        }

        // Fetch quotation details
        const parsedQuoteId = parseInt(quotation_id, 10);
        if (isNaN(parsedQuoteId)) {
            return res.status(400).json({ error: `Invalid Quotation ID format: "${quotation_id}"` });
        }

        const { data: quotation, error: quoteError } = await supabase
            .from('quotations')
            .select('id, quotation_no, final_quote_value, paid_amount, payment_status')
            .eq('id', parsedQuoteId)
            .maybeSingle();

        if (quoteError) {
            console.error('[paymentController:recordPayment] Database error querying quotation:', quoteError);
            return res.status(500).json({ 
                error: `Database error querying quotation: ${quoteError.message}. Check if 'payment_status' and 'paid_amount' columns exist in 'quotations' table.` 
            });
        }

        if (!quotation) {
            return res.status(404).json({ error: `Quotation with ID #${parsedQuoteId} not found.` });
        }

        // Insert new payment line
        const { data: newPayment, error: paymentError } = await supabase
            .from('payments')
            .insert([{
                quotation_id: parsedQuoteId,
                amount: parseFloat(amount),
                payment_method: effectivePaymentMethod,
                reference_no: effectiveReferenceNo,
                notes: notes || '',
                paid_at: effectivePaidAt
            }])
            .select()
            .single();

        if (paymentError) {
            console.error('[paymentController:recordPayment] Database error inserting payment:', paymentError);
            return res.status(500).json({
                error: `Database error inserting payment: ${paymentError.message}. Ensure the 'payments' table exists in database.`
            });
        }

        // Fetch all payments for this quotation to calculate cumulative sum
        const { data: allPayments, error: allPaymentsError } = await supabase
            .from('payments')
            .select('amount')
            .eq('quotation_id', parsedQuoteId);

        if (allPaymentsError) {
            console.error('[paymentController:recordPayment] Database error fetching payments sum:', allPaymentsError);
            return res.status(500).json({ error: allPaymentsError.message });
        }

        const totalPaid = allPayments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
        const finalValue = parseFloat(quotation.final_quote_value || 0);

        let newStatus = 'Pending';
        if (totalPaid >= finalValue) {
            newStatus = 'Paid';
        } else if (totalPaid > 0) {
            newStatus = 'Partially Paid';
        }

        // Update quotation payment status and paid amount
        const { error: updateError } = await supabase
            .from('quotations')
            .update({
                paid_amount: totalPaid,
                payment_status: newStatus
            })
            .eq('id', parsedQuoteId);

        if (updateError) {
            console.error('[paymentController:recordPayment] Database error updating quotation payment status:', updateError);
            return res.status(500).json({ error: updateError.message });
        }

        // Log action if available
        try {
            const { logAction } = require('../utils/logger');
            await logAction(req.user?.id, 'RECORD_PAYMENT', 'payment', newPayment.id, {
                quotation_id: parsedQuoteId,
                quotation_no: quotation.quotation_no,
                amount: newPayment.amount,
                total_paid: totalPaid,
                payment_status: newStatus
            });
        } catch (logErr) {
            console.error('Logging failed:', logErr.message);
        }

        res.json({
            payment: newPayment,
            quotation: {
                id: parsedQuoteId,
                quotation_no: quotation.quotation_no,
                paid_amount: totalPaid,
                payment_status: newStatus
            }
        });
    } catch (err) {
        console.error('[paymentController:recordPayment] Unexpected exception:', err);
        res.status(500).json({ error: err.message });
    }
};

// 4. Cancel/Delete a payment
exports.cancelPayment = async (req, res) => {
    try {
        const { id } = req.params;

        // Fetch payment details
        const { data: payment, error: fetchError } = await supabase
            .from('payments')
            .select('*')
            .eq('id', id)
            .maybeSingle();

        if (fetchError) {
            console.error('[paymentController:cancelPayment] Error fetching payment:', fetchError);
            return res.status(500).json({ error: fetchError.message });
        }

        if (!payment) {
            return res.status(404).json({ error: `Payment #${id} not found.` });
        }

        const quotation_id = payment.quotation_id;

        // Fetch quotation details
        const { data: quotation, error: quoteError } = await supabase
            .from('quotations')
            .select('id, quotation_no, final_quote_value, paid_amount, payment_status')
            .eq('id', quotation_id)
            .maybeSingle();

        if (quoteError) {
            console.error('[paymentController:cancelPayment] Error fetching associated quotation:', quoteError);
            return res.status(500).json({ error: quoteError.message });
        }

        if (!quotation) {
            return res.status(404).json({ error: `Associated quotation #${quotation_id} not found.` });
        }

        // Delete the payment line
        const { error: deleteError } = await supabase
            .from('payments')
            .delete()
            .eq('id', id);

        if (deleteError) throw deleteError;

        // Fetch all remaining payments for this quotation to calculate cumulative sum
        const { data: allPayments, error: allPaymentsError } = await supabase
            .from('payments')
            .select('amount')
            .eq('quotation_id', quotation_id);

        if (allPaymentsError) throw allPaymentsError;

        const totalPaid = allPayments ? allPayments.reduce((sum, p) => sum + parseFloat(p.amount), 0) : 0;
        const finalValue = parseFloat(quotation.final_quote_value || 0);

        let newStatus = 'Pending';
        if (totalPaid >= finalValue && finalValue > 0) {
            newStatus = 'Paid';
        } else if (totalPaid > 0) {
            newStatus = 'Partially Paid';
        }

        // Update quotation payment status and paid amount
        const { error: updateError } = await supabase
            .from('quotations')
            .update({
                paid_amount: totalPaid,
                payment_status: newStatus
            })
            .eq('id', quotation_id);

        if (updateError) throw updateError;

        // Log action if available
        try {
            const { logAction } = require('../utils/logger');
            await logAction(req.user?.id, 'CANCEL_PAYMENT', 'payment', id, {
                quotation_id,
                quotation_no: quotation.quotation_no,
                amount: payment.amount,
                total_paid: totalPaid,
                payment_status: newStatus
            });
        } catch (logErr) {
            console.error('Logging failed:', logErr.message);
        }

        res.json({
            success: true,
            quotation: {
                id: quotation_id,
                quotation_no: quotation.quotation_no,
                paid_amount: totalPaid,
                payment_status: newStatus
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
