const supabase = require('../config/supabase');
const { generateNextDocumentNumber } = require('../utils/documentNumberGenerator');
const { sendMail, renderEmail, money } = require('../utils/mailer');

// Payment receipt email. Resolves { sent, to?, reason? }; never throws on mail errors.
async function sendPaymentReceipt({ req, voucherNo, amount, method, reference, paidAt, quotation, invoice, quoteId, orderId, toOverride }) {
    const orgId = quotation?.organization_id || invoice?.organization_id;
    if (!orgId && !toOverride) return { sent: false, reason: 'No customer linked to this payment' };
    const { data: org } = orgId
        ? await supabase.from('organizations').select('name, contact_email, contact_person').eq('id', orgId).maybeSingle()
        : { data: null };
    const to = String(toOverride || org?.contact_email || '').trim();
    if (!to) return { sent: false, reason: 'Customer has no email address on file' };

    // Totals after this payment, against the same document it was recorded on
    let total = null;
    let paidSoFar = null;
    if (invoice) {
        total = parseFloat(invoice.total_amount || 0);
        if (orderId) {
            const { data: rows } = await supabase.from('payments').select('amount, status').eq('order_id', orderId);
            paidSoFar = (rows || []).filter(r => r.status !== 'Cancelled').reduce((s, r) => s + parseFloat(r.amount || 0), 0);
        } else paidSoFar = amount;
    } else if (quotation && quoteId) {
        total = parseFloat(quotation.final_quote_value || 0);
        const { data: rows } = await supabase.from('payments').select('amount, status').eq('quotation_id', quoteId);
        paidSoFar = (rows || []).filter(r => r.status !== 'Cancelled').reduce((s, r) => s + parseFloat(r.amount || 0), 0);
    }
    const balance = total !== null && paidSoFar !== null ? Math.max(0, total - paidSoFar) : null;
    const against = invoice ? `Invoice #${invoice.invoice_number || invoice.id}` : `Quotation #${quotation?.quotation_no || quoteId}`;
    const brand = process.env.MAIL_FROM_NAME || 'Inland Uniform';
    const date = new Date(paidAt || Date.now()).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

    const { html, text } = renderEmail({
        greeting: `Dear ${org?.contact_person || org?.name || 'Customer'},`,
        intro: [`Thank you. We have received your payment of ${money(amount)}.`],
        rows: [
            ['Receipt No', voucherNo],
            ['Date', date],
            ['Customer', org?.name],
            ['Against', against],
            ['Amount Received', money(amount)],
            ['Payment Mode', method],
            ['Reference', reference && reference !== voucherNo ? reference : null],
            ['Total Value', total !== null ? money(total) : null],
            ['Total Paid to Date', paidSoFar !== null ? money(paidSoFar) : null],
            ['Balance Due', balance !== null ? money(balance) : null],
        ],
        outro: ['Please keep this email as your payment receipt.'],
        signature: ['Regards,', req.user?.fullName || 'Accounts Team', brand],
    });
    const sent = await sendMail({ to, subject: `Payment receipt ${voucherNo} - ${money(amount)}`, html, text, replyTo: req.user?.email });
    if (!sent.ok) {
        console.warn(`[paymentController] receipt not sent to ${to}:`, sent.error);
        return { sent: false, to, reason: sent.error };
    }
    return { sent: true, to, message_id: sent.messageId };
}

// 1. List all payments
exports.listPayments = async (req, res) => {
    try {
        const isAdmin = req.user?.role === 'Admin' || req.user?.role === 'Super Admin' || req.user?.role === 'SuperAdmin' || (req.user?.role || '').toLowerCase() === 'corporate' || (req.user?.permissions || []).includes('all');
        const userBranchId = req.user?.branchId;

        let query = supabase
            .from('payments')
            .select('*, quotations(quotation_no, title, final_quote_value, branch_id)')
            .order('created_at', { ascending: false });

        if (!isAdmin && userBranchId) {
            query = query.eq('quotations.branch_id', userBranchId);
        }

        // Salespeople (Marketing / Sales Executive): only payments against their own quotes
        const { getOwnScope, ids: ownIds } = require('../utils/ownScope');
        const own = await getOwnScope(req);
        if (own && own.quoteIds.size === 0) return res.json([]);
        if (own) query = query.in('quotation_id', ownIds(own.quoteIds));

        const { data, error } = await query;

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
// 3. Record a new payment (supports Quotation or Invoice target)
exports.recordPayment = async (req, res) => {
    try {
        const { 
            quotation_id, 
            invoice_id,
            target_type,
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

        if (!quotation_id && !invoice_id) {
            return res.status(400).json({ error: 'Quotation ID or Invoice ID is required.' });
        }
        if (!amount || parseFloat(amount) <= 0) {
            return res.status(400).json({ error: 'Payment amount must be greater than zero.' });
        }
        if (!effectivePaymentMethod) {
            return res.status(400).json({ error: 'Payment method is required.' });
        }

        let parsedQuoteId = quotation_id ? parseInt(quotation_id, 10) : null;
        if (quotation_id && isNaN(parsedQuoteId)) {
            return res.status(400).json({ error: `Invalid Quotation ID format: "${quotation_id}"` });
        }

        let targetInvoice = null;
        let parsedOrderId = null;

        // If invoice_id is supplied, look up invoice and resolve linked order/quotation
        if (invoice_id) {
            const parsedInvId = parseInt(invoice_id, 10);
            if (!isNaN(parsedInvId)) {
                const { data: invData, error: invErr } = await supabase
                    .from('invoices')
                    .select('id, invoice_number, order_id, organization_id, status, total_amount')
                    .eq('id', parsedInvId)
                    .maybeSingle();

                if (invErr) {
                    console.error('[paymentController:recordPayment] Error querying invoice:', invErr);
                }

                if (invData) {
                    targetInvoice = invData;
                    parsedOrderId = invData.order_id || null;
                    if (!parsedQuoteId && parsedOrderId) {
                        const { data: ordData } = await supabase
                            .from('orders')
                            .select('quotation_id')
                            .eq('id', parsedOrderId)
                            .maybeSingle();
                        if (ordData && ordData.quotation_id) {
                            parsedQuoteId = ordData.quotation_id;
                        }
                    }
                }
            }
        }

        // Fetch quotation details if linked
        let quotation = null;
        if (parsedQuoteId) {
            const { data: qData, error: quoteError } = await supabase
                .from('quotations')
                .select('id, quotation_no, final_quote_value, paid_amount, payment_status, organization_id')
                .eq('id', parsedQuoteId)
                .maybeSingle();

            if (quoteError) {
                console.error('[paymentController:recordPayment] Database error querying quotation:', quoteError);
            }
            quotation = qData;
        }

        if (!quotation && !targetInvoice) {
            return res.status(404).json({ error: 'Selected Quotation or Invoice not found.' });
        }

        // Formulate payment notes
        let paymentNotes = notes || '';
        if (targetInvoice) {
            const invRef = targetInvoice.invoice_number || targetInvoice.id;
            if (!paymentNotes.includes(String(invRef))) {
                paymentNotes = paymentNotes ? `${paymentNotes} (Against Invoice #${invRef})` : `Payment against Invoice #${invRef}`;
            }
        }

        // Generate Customer Payment voucher number: CP-IU[Branch NO]-[FY]/[MM][seq]
        const branchForPayment = targetInvoice?.branch_id || quotation?.branch_id || req.user?.branchId || 1;
        const voucher_no = await generateNextDocumentNumber(supabase, {
            prefix: 'CP',
            table: 'payments',
            column: 'reference_no',
            branch: branchForPayment,
            date: effectivePaidAt
        });

        // Insert new payment line
        const insertPayload = {
            amount: parseFloat(amount),
            payment_method: effectivePaymentMethod,
            payment_mode: effectivePaymentMethod,
            reference_no: effectiveReferenceNo || voucher_no,
            notes: paymentNotes,
            paid_at: effectivePaidAt,
            status: 'Completed'
        };
        if (parsedQuoteId) insertPayload.quotation_id = parsedQuoteId;
        if (parsedOrderId) insertPayload.order_id = parsedOrderId;

        // Insert payment record
        const { data: newPayment, error: paymentError } = await supabase
            .from('payments')
            .insert([insertPayload])
            .select()
            .single();

        if (paymentError || !newPayment) {
            console.error('[paymentController:recordPayment] Database error inserting payment:', paymentError);
            return res.status(500).json({
                error: `Database error inserting payment: ${paymentError?.message || 'Insert failed'}. Ensure the 'payments' table exists in database.`
            });
        }

        // Attach voucher_no to response object
        if (!newPayment.voucher_no) {
            newPayment.voucher_no = voucher_no;
        }

        // If quotation is linked, calculate cumulative sum & update quotation
        if (parsedQuoteId && quotation) {
            const { data: allPayments } = await supabase
                .from('payments')
                .select('amount')
                .eq('quotation_id', parsedQuoteId);

            const totalPaid = (allPayments || []).reduce((sum, p) => sum + parseFloat(p.amount), 0);
            const finalValue = parseFloat(quotation.final_quote_value || 0);

            let newStatus = 'Pending';
            if (totalPaid >= finalValue) {
                newStatus = 'Paid';
            } else if (totalPaid > 0) {
                newStatus = 'Partially Paid';
            }

            await supabase
                .from('quotations')
                .update({
                    paid_amount: totalPaid,
                    payment_status: newStatus
                })
                .eq('id', parsedQuoteId);
        }

        // If invoice was targeted, update invoice payment status
        if (targetInvoice) {
            let invPaid = parseFloat(amount);
            if (parsedOrderId) {
                const { data: ordPayments } = await supabase
                    .from('payments')
                    .select('amount')
                    .eq('order_id', parsedOrderId);
                if (ordPayments && ordPayments.length > 0) {
                    invPaid = ordPayments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
                }
            }
            const invTotal = parseFloat(targetInvoice.total_amount || 0);
            let invStatus = 'Partially Paid';
            if (invPaid >= invTotal) {
                invStatus = 'Fully Paid';
            }

            await supabase
                .from('invoices')
                .update({
                    status: invStatus,
                    updated_at: new Date().toISOString()
                })
                .eq('id', targetInvoice.id);
        }

        // Auto-advance linked lead in Sales Pipeline to 'Deals'
        const orgIdToAdvance = quotation?.organization_id || targetInvoice?.organization_id;
        if (orgIdToAdvance) {
            try {
                const { data: matchedLead } = await supabase
                    .from('leads')
                    .select('id, status, remarks')
                    .eq('organization_id', orgIdToAdvance)
                    .maybeSingle();

                if (matchedLead && matchedLead.status !== 'SO Converted Deals') {
                    const now = new Date();
                    const dateStr = now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
                    const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

                    let curRemarks = Array.isArray(matchedLead.remarks) ? [...matchedLead.remarks] : [];
                    const targetLabel = targetInvoice 
                        ? `Invoice #${targetInvoice.invoice_number || targetInvoice.id}` 
                        : `Quotation #${quotation?.quotation_no || parsedQuoteId}`;

                    curRemarks.push({
                        date: dateStr,
                        time: timeStr,
                        text: `Deal Closed: Payment of ₹${parseFloat(amount)} recorded for ${targetLabel}. Pipeline advanced to Deals.`,
                        stage: 'Deals',
                        response_type: 'positive',
                        author: {
                            name: req.user?.fullName || req.user?.full_name || 'Finance Staff',
                            designation: req.user?.designation || req.user?.role || 'Staff',
                            department: 'Accounts & Commercials'
                        }
                    });

                    await supabase
                        .from('leads')
                        .update({
                            status: 'Deals',
                            remarks: curRemarks,
                            updated_at: new Date()
                        })
                        .eq('id', matchedLead.id);

                    await supabase.from('lead_stage_history').insert([{
                        lead_id: matchedLead.id,
                        stage: 'Deals',
                        transition_reason: `Payment of ₹${parseFloat(amount)} received for ${targetLabel}`
                    }]).then(() => {}, () => {});

                    await supabase.from('lead_activities').insert([{
                        lead_id: matchedLead.id,
                        stage: 'Deals',
                        activity_type: 'initial_payment_received',
                        performed_by_name: req.user?.fullName || req.user?.full_name || 'Finance Staff',
                        notes: `Deal Closed: Payment of ₹${parseFloat(amount)} recorded for ${targetLabel}. Pipeline advanced to Deals.`,
                        outcome: 'deal_won'
                    }]).then(() => {}, () => {});
                }
            } catch (leadDealErr) {
                console.warn('[paymentController] Could not auto-advance lead to Deals:', leadDealErr.message);
            }
        }

        // Log action if available
        try {
            const { logAction } = require('../utils/logger');
            await logAction(req.user?.id, 'RECORD_PAYMENT', 'payment', newPayment.id, {
                quotation_id: parsedQuoteId,
                invoice_id: targetInvoice?.id,
                amount: parseFloat(amount),
                method: effectivePaymentMethod
            });
        } catch (logErr) {}

        // Email the payment receipt to the customer (never blocks the payment)
        let receiptEmail = { sent: false, reason: 'Receipt email skipped' };
        if (req.body.send_receipt !== false) {
            try {
                receiptEmail = await sendPaymentReceipt({
                    req, payment: newPayment, voucherNo: newPayment.voucher_no || voucher_no,
                    amount: parseFloat(amount), method: effectivePaymentMethod, reference: effectiveReferenceNo,
                    paidAt: effectivePaidAt, quotation, invoice: targetInvoice, quoteId: parsedQuoteId, orderId: parsedOrderId,
                    toOverride: req.body.receipt_email
                });
            } catch (mailErr) {
                console.warn('[paymentController] receipt email failed:', mailErr.message);
                receiptEmail = { sent: false, reason: mailErr.message };
            }
        }

        res.status(201).json({
            message: 'Payment recorded successfully',
            payment: newPayment,
            target_type: targetInvoice ? 'invoice' : 'quotation',
            receipt_email: receiptEmail
        });
    } catch (err) {
        console.error('[paymentController:recordPayment] Error:', err);
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
