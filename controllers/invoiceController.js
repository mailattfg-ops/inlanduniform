const supabase = require('../config/supabase');

// Helper to calculate exact Due / Overdue status based on credit period
function calculateDueInfo(invoiceDate, creditPeriodDays, paymentStatus, paidAmount, totalAmount) {
    const period = parseInt(creditPeriodDays || 30, 10);
    const isPaid = paymentStatus === 'Fully Paid' || paymentStatus === 'Paid' || (parseFloat(paidAmount || 0) >= parseFloat(totalAmount || 0) && parseFloat(totalAmount || 0) > 0);

    const invDateObj = new Date(invoiceDate || new Date());
    const dueDateObj = new Date(invDateObj.getTime() + period * 24 * 60 * 60 * 1000);

    const today = new Date();
    const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const dueMidnight = new Date(dueDateObj.getFullYear(), dueDateObj.getMonth(), dueDateObj.getDate()).getTime();

    const diffDays = Math.round((todayMidnight - dueMidnight) / (24 * 60 * 60 * 1000));
    const dueDateStr = dueDateObj.toISOString().slice(0, 10);

    if (isPaid) {
        return {
            due_status: 'Paid',
            status_message: 'Fully Paid',
            due_date: dueDateStr,
            credit_period_days: period,
            days_overdue: 0,
            days_remaining: 0,
            badge_color: 'green'
        };
    }

    if (diffDays === 0) {
        // The last day of the credit period is marked as due
        return {
            due_status: 'Due',
            status_message: 'Due Today (Last day of credit period)',
            due_date: dueDateStr,
            credit_period_days: period,
            days_overdue: 0,
            days_remaining: 0,
            badge_color: 'amber'
        };
    }

    if (diffDays > 0) {
        // The next day onwards it becomes overdue
        return {
            due_status: 'Overdue',
            status_message: `Overdue by ${diffDays} day${diffDays === 1 ? '' : 's'}`,
            due_date: dueDateStr,
            credit_period_days: period,
            days_overdue: diffDays,
            days_remaining: 0,
            badge_color: 'red'
        };
    }

    // Within credit period
    const remaining = Math.abs(diffDays);
    return {
        due_status: 'Active',
        status_message: `${remaining} day${remaining === 1 ? '' : 's'} remaining`,
        due_date: dueDateStr,
        credit_period_days: period,
        days_overdue: 0,
        days_remaining: remaining,
        badge_color: 'blue'
    };
}

// 1. Create Invoice (Manual retail sale or against sales order)
exports.createInvoice = async (req, res) => {
    try {
        const {
            order_id,
            quotation_id,
            organization_id,
            branch_id,
            customer_name,
            customer_type,
            sale_type, // 'bulk' or 'retail'
            credit_period_days,
            invoice_date,
            is_tax_inclusive,
            items,
            notes,
            payment_status,
            paid_amount
        } = req.body;

        if (!customer_name || !items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'Customer name and at least one item are required.' });
        }

        // Determine credit period from customer profile if not explicitly passed
        let effectiveCreditPeriod = credit_period_days ? parseInt(credit_period_days, 10) : 30;
        if (organization_id && !credit_period_days) {
            const { data: orgData } = await supabase
                .from('organizations')
                .select('credit_period_days')
                .eq('id', organization_id)
                .maybeSingle();
            if (orgData && orgData.credit_period_days) {
                effectiveCreditPeriod = parseInt(orgData.credit_period_days, 10);
            }
        }

        const invDateStr = invoice_date || new Date().toISOString().slice(0, 10);
        const invDateObj = new Date(invDateStr);
        const dueDateObj = new Date(invDateObj.getTime() + effectiveCreditPeriod * 24 * 60 * 60 * 1000);
        const dueDateStr = dueDateObj.toISOString().slice(0, 10);

        // Generate Invoice Number: YY/MM/INV-XXXX
        const dateStr = new Date().toISOString().slice(2, 7).replace('-', '/');
        const randNum = Math.floor(1000 + Math.random() * 9000);
        const invoice_no = `${dateStr}/INV-${randNum}`;

        let subtotal = 0;
        let totalTax = 0;

        items.forEach(it => {
            const qty = parseInt(it.quantity || 1, 10);
            const price = parseFloat(it.unit_price || 0);
            const taxRate = parseFloat(it.tax_rate || 0);
            const lineTotal = qty * price;

            subtotal += lineTotal;

            if (!is_tax_inclusive) {
                totalTax += lineTotal * (taxRate / 100);
            }
        });

        const totalAmount = is_tax_inclusive ? subtotal : subtotal + totalTax;

        const effectiveSaleType = sale_type || (order_id ? 'bulk' : 'retail');
        const effectivePaymentStatus = payment_status || (effectiveSaleType === 'retail' ? 'Fully Paid' : 'Unpaid');
        const effectivePaidAmount = effectivePaymentStatus === 'Fully Paid'
            ? totalAmount
            : parseFloat(paid_amount || 0);

        // Prepare invoice insert payload
        let currentPayload = {
            invoice_no,
            order_id: order_id || null,
            quotation_id: quotation_id || null,
            organization_id: organization_id || null,
            branch_id: branch_id || null,
            customer_name,
            customer_type: customer_type || (effectiveSaleType === 'retail' ? 'Individual' : 'Business'),
            sale_type: effectiveSaleType,
            credit_period_days: effectiveCreditPeriod,
            invoice_date: invDateStr,
            due_date: dueDateStr,
            is_tax_inclusive: is_tax_inclusive !== undefined ? is_tax_inclusive : true,
            subtotal,
            tax_amount: totalTax,
            total_amount: totalAmount,
            paid_amount: effectivePaidAmount,
            payment_status: effectivePaymentStatus,
            notes: notes || '',
            created_by: req.user?.id && /^\d+$/.test(String(req.user.id)) ? parseInt(req.user.id, 10) : null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        // Resilient insert with unmigrated column pruning
        let invoice = null;
        let invError = null;

        for (let attempt = 0; attempt < 10; attempt++) {
            const { data, error } = await supabase
                .from('invoices')
                .insert([currentPayload])
                .select()
                .single();

            if (!error) {
                invoice = data;
                invError = null;
                break;
            }

            invError = error;
            const errLower = (error.message || '').toLowerCase();
            let pruned = false;

            for (const col of Object.keys(currentPayload)) {
                if (errLower.includes(col.toLowerCase())) {
                    delete currentPayload[col];
                    pruned = true;
                    break;
                }
            }

            if (!pruned) break;
        }

        if (invError) throw invError;

        // Insert invoice line items
        const invoiceItemsPayload = items.map(it => ({
            invoice_id: invoice.id,
            item_description: it.item_description || 'Custom Item',
            design_number: it.design_number || null,
            barcode: it.barcode || null,
            quantity: parseInt(it.quantity || 1, 10),
            unit_price: parseFloat(it.unit_price || 0),
            tax_rate: parseFloat(it.tax_rate || 0),
            total_price: (parseInt(it.quantity || 1, 10) * parseFloat(it.unit_price || 0))
        }));

        const { error: itemsError } = await supabase
            .from('invoice_items')
            .insert(invoiceItemsPayload);

        if (itemsError) throw itemsError;

        // Calculate due info
        const dueInfo = calculateDueInfo(
            invoice.invoice_date || invoice.created_at,
            invoice.credit_period_days || effectiveCreditPeriod,
            invoice.payment_status,
            invoice.paid_amount,
            invoice.total_amount
        );

        // Activity log
        try {
            await supabase.from('record_activity_logs').insert([{
                entity_type: 'Invoice',
                entity_id: invoice.id,
                action: 'INVOICE_CREATED',
                performed_by: invoice.created_by,
                details: {
                    invoice_no: invoice.invoice_no,
                    customer_name: invoice.customer_name,
                    sale_type: effectiveSaleType,
                    order_id: invoice.order_id,
                    total_amount: invoice.total_amount,
                    credit_period_days: effectiveCreditPeriod,
                    due_date: dueDateStr,
                    items_count: items.length
                }
            }]);
        } catch (logErr) {
            console.error('[Invoice] Activity log failed:', logErr.message);
        }

        res.status(201).json({ ...invoice, ...dueInfo, items: invoiceItemsPayload });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 2. Generate Invoice directly from a Confirmed Sales Order (Bulk Order)
exports.createInvoiceFromOrder = async (req, res) => {
    try {
        const { order_id, credit_period_days, invoice_date, notes } = req.body;

        if (!order_id) {
            return res.status(400).json({ error: 'order_id is required' });
        }

        // Fetch Order with Quotation & Items
        const { data: order, error: orderErr } = await supabase
            .from('orders')
            .select(`
                id,
                order_no,
                quotation_id,
                branch_id,
                status,
                items,
                order_notes,
                quotations (
                    id,
                    quotation_no,
                    title,
                    final_quote_value,
                    organization_id,
                    is_tax_inclusive,
                    tax_rate,
                    organizations (
                        id,
                        name,
                        credit_period_days,
                        client_tag
                    ),
                    quotation_items (
                        id,
                        product_type_id,
                        unit_price,
                        quantity,
                        product_types (name)
                    )
                )
            `)
            .eq('id', order_id)
            .single();

        if (orderErr || !order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        const quote = order.quotations;
        const org = quote?.organizations;
        const customerName = org?.name || 'Bulk Order Client';
        const organizationId = org?.id || quote?.organization_id;

        // Credit period resolution
        let effectiveCreditPeriod = credit_period_days 
            ? parseInt(credit_period_days, 10) 
            : (org?.credit_period_days ? parseInt(org.credit_period_days, 10) : 30);

        // Convert quotation items to invoice items
        let invoiceItems = [];
        const qItems = quote?.quotation_items || [];

        if (qItems.length > 0) {
            invoiceItems = qItems.map(qi => ({
                item_description: qi.product_types?.name || `Order Item #${qi.id}`,
                quantity: qi.quantity || 1,
                unit_price: parseFloat(qi.unit_price || 0),
                tax_rate: parseFloat(quote.tax_rate || 5)
            }));
        } else if (Array.isArray(order.items) && order.items.length > 0) {
            invoiceItems = order.items.map((oi, idx) => ({
                item_description: oi.name || oi.product_name || `Item ${idx + 1}`,
                quantity: oi.quantity || 1,
                unit_price: parseFloat(oi.unit_price || (parseFloat(quote?.final_quote_value || 0) / (oi.quantity || 1))),
                tax_rate: parseFloat(quote?.tax_rate || 5)
            }));
        } else {
            invoiceItems = [{
                item_description: `Bulk Order Execution: ${order.order_no} (${quote?.title || 'Custom Uniforms'})`,
                quantity: 1,
                unit_price: parseFloat(quote?.final_quote_value || 0),
                tax_rate: parseFloat(quote?.tax_rate || 5)
            }];
        }

        // Delegate to createInvoice logic
        req.body = {
            order_id: order.id,
            quotation_id: quote?.id,
            organization_id: organizationId,
            branch_id: order.branch_id,
            customer_name: customerName,
            customer_type: 'Business',
            sale_type: 'bulk',
            credit_period_days: effectiveCreditPeriod,
            invoice_date: invoice_date || new Date().toISOString().slice(0, 10),
            is_tax_inclusive: quote?.is_tax_inclusive !== undefined ? quote.is_tax_inclusive : true,
            payment_status: 'Unpaid',
            paid_amount: 0,
            items: invoiceItems,
            notes: notes || `Generated from Sales Order ${order.order_no}`
        };

        return exports.createInvoice(req, res);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 3. List Invoices (with Branch Isolation, Org filtering, and Due Calculations)
exports.listInvoices = async (req, res) => {
    try {
        const isAdmin = req.user?.role === 'Admin' || req.user?.role === 'Super Admin' || req.user?.role === 'SuperAdmin' || (req.user?.permissions || []).includes('all');
        const userBranchId = req.user?.branchId;
        const userOrgId = req.user?.organizationId;
        const filterOrgId = req.query.organization_id;
        const userRole = (req.user?.role || '').toLowerCase();

        if (userRole === 'entity' || userRole === 'student' || userRole === 'member' || req.user?.memberId) {
            return res.json([]);
        }

        let query = supabase
            .from('invoices')
            .select('*, invoice_items(*)')
            .order('created_at', { ascending: false });

        if (filterOrgId) {
            query = query.eq('organization_id', filterOrgId);
        } else if (userOrgId) {
            // Fetch quotation IDs and order IDs for this organization
            const { data: orgQuotes } = await supabase
                .from('quotations')
                .select('id')
                .eq('organization_id', userOrgId);
            const quoteIds = (orgQuotes || []).map(q => q.id);

            let orderIds = [];
            if (quoteIds.length > 0) {
                const { data: orgOrders } = await supabase
                    .from('orders')
                    .select('id')
                    .in('quotation_id', quoteIds);
                orderIds = (orgOrders || []).map(o => o.id);
            }

            const orConditions = [];
            if (quoteIds.length > 0) orConditions.push(`quotation_id.in.(${quoteIds.join(',')})`);
            if (orderIds.length > 0) orConditions.push(`order_id.in.(${orderIds.join(',')})`);
            orConditions.push(`organization_id.eq.${userOrgId}`);

            query = query.or(orConditions.join(','));
        } else if (!isAdmin && userBranchId) {
            query = query.eq('branch_id', userBranchId);
        }

        const { data, error } = await query;
        if (error) throw error;

        // Enrich all invoices with dynamic due status & overdue calculations
        const enriched = (data || []).map(inv => {
            const dueInfo = calculateDueInfo(
                inv.invoice_date || inv.created_at,
                inv.credit_period_days || 30,
                inv.payment_status,
                inv.paid_amount,
                inv.total_amount
            );
            return {
                ...inv,
                ...dueInfo
            };
        });

        res.json(enriched);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 4. Update Invoice
exports.updateInvoice = async (req, res) => {
    try {
        const userRole = (req.user?.role || '').toLowerCase();
        if (!['branch manager', 'admin', 'corporate'].includes(userRole)) {
            return res.status(403).json({ error: 'Invoice editing is strictly restricted to Branch Managers.' });
        }

        const { id } = req.params;
        const { notes, payment_status, paid_amount, credit_period_days, due_date } = req.body;

        const updateObj = {
            notes,
            payment_status,
            paid_amount,
            updated_at: new Date().toISOString()
        };
        if (credit_period_days !== undefined) updateObj.credit_period_days = credit_period_days;
        if (due_date !== undefined) updateObj.due_date = due_date;

        const { data, error } = await supabase
            .from('invoices')
            .update(updateObj)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        // Log Invoice update
        try {
            await supabase.from('record_activity_logs').insert([{
                entity_type: 'Invoice',
                entity_id: id,
                action: 'INVOICE_UPDATED',
                performed_by: req.user?.id || null,
                details: { invoice_no: data?.invoice_no, payment_status, paid_amount, notes }
            }]);
        } catch (logErr) {
            console.error('[Invoice] Activity log failed:', logErr.message);
        }

        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 5. Delete Invoice
exports.deleteInvoice = async (req, res) => {
    try {
        const userRole = (req.user?.role || '').toLowerCase();
        if (!['branch manager', 'admin'].includes(userRole)) {
            return res.status(403).json({ error: 'Invoice deletion is strictly restricted to Branch Managers.' });
        }

        const { id } = req.params;

        const { data: existingInv } = await supabase
            .from('invoices')
            .select('invoice_no, total_amount')
            .eq('id', id)
            .maybeSingle();

        const { error } = await supabase
            .from('invoices')
            .delete()
            .eq('id', id);

        if (error) throw error;

        try {
            await supabase.from('record_activity_logs').insert([{
                entity_type: 'Invoice',
                entity_id: id,
                action: 'INVOICE_DELETED',
                performed_by: req.user?.id || null,
                details: { invoice_no: existingInv?.invoice_no, total_amount: existingInv?.total_amount }
            }]);
        } catch (logErr) {
            console.error('[Invoice] Activity log failed:', logErr.message);
        }

        res.json({ success: true, message: 'Invoice deleted successfully.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
