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
        const { quotation_id, amount, payment_method, reference_no, notes, paid_at } = req.body;

        if (!quotation_id) {
            return res.status(400).json({ error: 'Quotation ID is required.' });
        }
        if (!amount || parseFloat(amount) <= 0) {
            return res.status(400).json({ error: 'Payment amount must be greater than zero.' });
        }
        if (!payment_method) {
            return res.status(400).json({ error: 'Payment method is required.' });
        }

        // Fetch quotation details
        const { data: quotation, error: quoteError } = await supabase
            .from('quotations')
            .select('id, quotation_no, final_quote_value, paid_amount, payment_status')
            .eq('id', quotation_id)
            .single();

        if (quoteError || !quotation) {
            return res.status(404).json({ error: 'Quotation not found.' });
        }

        // Insert new payment line
        const { data: newPayment, error: paymentError } = await supabase
            .from('payments')
            .insert([{
                quotation_id,
                amount: parseFloat(amount),
                payment_method,
                reference_no: reference_no || '',
                notes: notes || '',
                paid_at: paid_at || new Date().toISOString()
            }])
            .select()
            .single();

        if (paymentError) throw paymentError;

        // Fetch all payments for this quotation to calculate cumulative sum
        const { data: allPayments, error: allPaymentsError } = await supabase
            .from('payments')
            .select('amount')
            .eq('quotation_id', quotation_id);

        if (allPaymentsError) throw allPaymentsError;

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
            .eq('id', quotation_id);

        if (updateError) throw updateError;

        // Log action if available
        try {
            const { logAction } = require('../utils/logger');
            await logAction(req.user.id, 'RECORD_PAYMENT', 'payment', newPayment.id, {
                quotation_id,
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
