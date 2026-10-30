const supabase = require('../config/supabase');

// Safe helper to convert any date-like input (YYYY-MM-DD string, Date object, ISO string)
// to a local midnight Date object without timezone shifting bugs.
function parseToMidnight(dateInput) {
    if (!dateInput) return null;
    if (dateInput instanceof Date) {
        if (isNaN(dateInput.getTime())) return null;
        return new Date(dateInput.getFullYear(), dateInput.getMonth(), dateInput.getDate());
    }
    if (typeof dateInput === 'string') {
        const datePart = dateInput.split('T')[0].trim();
        const match = datePart.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
        if (match) {
            const year = parseInt(match[1], 10);
            const month = parseInt(match[2], 10) - 1;
            const day = parseInt(match[3], 10);
            return new Date(year, month, day);
        }
        const parsed = new Date(dateInput);
        if (!isNaN(parsed.getTime())) {
            return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
        }
    }
    return null;
}

function formatDateOnly(d) {
    if (!d || isNaN(d.getTime())) return '';
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Helper to calculate exact Due / Overdue status directly against the invoice's due_date
function calculateDueInfo(invoiceDateOrObj, creditPeriodDays, paymentStatus, paidAmount, totalAmount, explicitDueDate) {
    let invoiceDate, period, status, paid, total, dueDateInput;

    if (invoiceDateOrObj && typeof invoiceDateOrObj === 'object' && !(invoiceDateOrObj instanceof Date)) {
        invoiceDate = invoiceDateOrObj.invoice_date || invoiceDateOrObj.created_at;
        period = parseInt(invoiceDateOrObj.credit_period_days || 30, 10);
        status = invoiceDateOrObj.status || invoiceDateOrObj.payment_status || 'Unpaid';
        paid = parseFloat(invoiceDateOrObj.paid_amount || 0);
        total = parseFloat(invoiceDateOrObj.total_amount || 0);
        dueDateInput = invoiceDateOrObj.due_date;
    } else {
        invoiceDate = invoiceDateOrObj;
        period = parseInt(creditPeriodDays || 30, 10);
        status = paymentStatus || 'Unpaid';
        paid = parseFloat(paidAmount || 0);
        total = parseFloat(totalAmount || 0);
        dueDateInput = explicitDueDate;
    }

    const isPaid = status === 'Fully Paid' || status === 'Paid' || (total > 0 && paid >= total);

    // Primary: calculate directly against the invoice's due date
    let dueMidnight = parseToMidnight(dueDateInput);

    // Fallback if due_date is not explicitly present: calculate from invoice_date + credit_period_days
    if (!dueMidnight) {
        const invMidnight = parseToMidnight(invoiceDate) || parseToMidnight(new Date());
        dueMidnight = new Date(invMidnight.getTime() + period * 24 * 60 * 60 * 1000);
    }

    const dueDateStr = formatDateOnly(dueMidnight);

    const now = new Date();
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const msPerDay = 24 * 60 * 60 * 1000;
    // diffDays:
    // > 0 => today is past due date (Overdue)
    // = 0 => today is exactly due date (Due)
    // < 0 => today is before due date (Active / Remaining)
    const diffDays = Math.round((todayMidnight.getTime() - dueMidnight.getTime()) / msPerDay);

    if (isPaid) {
        return {
            due_status: 'Paid',
            status_message: 'Fully Paid',
            due_date: dueDateStr,
            credit_period_days: period,
            days_overdue: 0,
            days_remaining: 0,
            is_due_today: false,
            is_overdue: false,
            badge_color: 'green'
        };
    }

    if (diffDays === 0) {
        // Today is the due date
        return {
            due_status: 'Due',
            status_message: 'Due Today',
            due_date: dueDateStr,
            credit_period_days: period,
            days_overdue: 0,
            days_remaining: 0,
            is_due_today: true,
            is_overdue: false,
            badge_color: 'amber'
        };
    }

    if (diffDays > 0) {
        // Passed due date => Overdue
        return {
            due_status: 'Overdue',
            status_message: `Overdue by ${diffDays} day${diffDays === 1 ? '' : 's'}`,
            due_date: dueDateStr,
            credit_period_days: period,
            days_overdue: diffDays,
            days_remaining: 0,
            is_due_today: false,
            is_overdue: true,
            badge_color: 'red'
        };
    }

    // Future due date => Active
    const remaining = Math.abs(diffDays);
    return {
        due_status: 'Active',
        status_message: `${remaining} day${remaining === 1 ? '' : 's'} remaining`,
        due_date: dueDateStr,
        credit_period_days: period,
        days_overdue: 0,
        days_remaining: remaining,
        is_due_today: false,
        is_overdue: false,
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
            due_date,
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

        const invDateStr = invoice_date || formatDateOnly(new Date());
        let dueDateStr = due_date ? formatDateOnly(parseToMidnight(due_date)) : null;
        if (!dueDateStr) {
            const invDateObj = parseToMidnight(invDateStr) || new Date();
            const dueDateObj = new Date(invDateObj.getTime() + effectiveCreditPeriod * 24 * 60 * 60 * 1000);
            dueDateStr = formatDateOnly(dueDateObj);
        }

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

        // Prepare invoice insert payload targeting verified DB columns
        let currentPayload = {
            invoice_number: invoice_no,
            order_id: order_id || null,
            organization_id: organization_id || null,
            branch_id: branch_id || null,
            sale_type: effectiveSaleType,
            status: effectivePaymentStatus || 'Unpaid',
            tax_amount: totalTax,
            total_amount: totalAmount,
            credit_period_days: effectiveCreditPeriod,
            invoice_date: invDateStr,
            due_date: dueDateStr,
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
            console.warn(`[createInvoice] insert attempt ${attempt + 1} warning:`, error.message);
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

        if (invError) {
            console.error('[createInvoice] Critical error inserting invoice:', invError);
            throw invError;
        }

        // Insert invoice line items targeting verified DB columns (invoice_id, description, quantity, unit_price, total_price)
        const invoiceItemsPayload = items.map(it => {
            const desc = it.description || it.item_description || 'Custom Item';
            const qty = parseInt(it.quantity || 1, 10);
            const price = parseFloat(it.unit_price || 0);
            const lineTotal = it.total_price !== undefined ? parseFloat(it.total_price) : (qty * price);

            return {
                invoice_id: invoice.id,
                description: desc,
                quantity: qty,
                unit_price: price,
                total_price: lineTotal
            };
        });

        if (invoiceItemsPayload.length > 0) {
            let currentItemPayloads = invoiceItemsPayload.map(i => ({ ...i }));
            let itemsError = null;

            for (let attempt = 0; attempt < 5; attempt++) {
                const { error } = await supabase
                    .from('invoice_items')
                    .insert(currentItemPayloads);

                if (!error) {
                    itemsError = null;
                    break;
                }

                itemsError = error;
                console.warn(`[createInvoice] item insert attempt ${attempt + 1} warning:`, error.message);
                const errLower = (error.message || '').toLowerCase();
                let pruned = false;

                if (currentItemPayloads.length > 0) {
                    for (const col of Object.keys(currentItemPayloads[0])) {
                        if (errLower.includes(col.toLowerCase())) {
                            currentItemPayloads.forEach(obj => delete obj[col]);
                            pruned = true;
                            break;
                        }
                    }
                }

                if (!pruned) break;
            }

            if (itemsError) {
                console.error('[createInvoice] items error:', itemsError);
                throw itemsError;
            }
        }

        // Calculate due info directly against invoice due_date
        const dueInfo = calculateDueInfo(
            invoice.invoice_date || invoice.created_at,
            invoice.credit_period_days || effectiveCreditPeriod,
            invoice.status || effectivePaymentStatus,
            invoice.paid_amount || 0,
            invoice.total_amount,
            invoice.due_date || dueDateStr
        );

        // Activity log
        try {
            await supabase.from('record_activity_logs').insert([{
                entity_type: 'Invoice',
                entity_id: invoice.id,
                action: 'INVOICE_CREATED',
                performed_by: req.user?.id && /^\d+$/.test(String(req.user.id)) ? parseInt(req.user.id, 10) : null,
                details: {
                    invoice_no: invoice.invoice_number || invoice_no,
                    customer_name: customer_name,
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

        // Resolve full customer profile for Tax Invoice document rendering
        let customerProfile = req.body.customer || null;
        if (!customerProfile && (organization_id || invoice.organization_id)) {
            const orgLookupId = organization_id || invoice.organization_id;
            const { data: orgData } = await supabase
                .from('organizations')
                .select('*')
                .eq('id', orgLookupId)
                .maybeSingle();
            customerProfile = orgData;
        }

        // Return unified object with both legacy and schema column names for complete UI compatibility
        const formattedInvoice = {
            ...invoice,
            invoice_no: invoice.invoice_number || invoice_no,
            invoice_number: invoice.invoice_number || invoice_no,
            customer_name: customerProfile?.name || customer_name,
            customer: customerProfile,
            organizations: customerProfile,
            customer_type: customer_type || (effectiveSaleType === 'retail' ? 'Individual' : 'Business'),
            subtotal,
            tax_amount: totalTax,
            total_amount: totalAmount,
            is_tax_inclusive: is_tax_inclusive !== undefined ? is_tax_inclusive : true,
            payment_status: invoice.status || effectivePaymentStatus,
            items: invoiceItemsPayload,
            invoice_items: invoiceItemsPayload,
            ...dueInfo
        };

        res.status(201).json(formattedInvoice);
    } catch (err) {
        console.error('[createInvoice] Error:', err);
        res.status(500).json({ error: err.message, details: err.details });
    }
};

// 2. Generate Invoice directly from a Confirmed Sales Order (Bulk Order)
exports.createInvoiceFromOrder = async (req, res) => {
    try {
        const { order_id, quotation_id, credit_period_days, invoice_date, due_date, notes } = req.body;

        if (!order_id && !quotation_id) {
            return res.status(400).json({ error: 'order_id or quotation_id is required' });
        }

        let order = null;
        let quote = null;

        if (order_id) {
            // Fetch Order with Quotation & Organization cleanly using wildcards to avoid missing column errors
            const { data: orderData, error: orderErr } = await supabase
                .from('orders')
                .select('*, quotations (*, organizations (*))')
                .eq('id', order_id)
                .single();

            if (orderErr || !orderData) {
                console.error('[createInvoiceFromOrder] Error fetching order:', orderErr);
                return res.status(404).json({ error: 'Order not found', details: orderErr?.message });
            }
            order = orderData;
            quote = order.quotations;
        } else if (quotation_id) {
            // Check if there is an existing order for this quotation
            const { data: linkedOrderData } = await supabase
                .from('orders')
                .select('*, quotations (*, organizations (*))')
                .eq('quotation_id', quotation_id)
                .maybeSingle();

            if (linkedOrderData) {
                order = linkedOrderData;
                quote = order.quotations;
            } else {
                const { data: quoteData, error: quoteErr } = await supabase
                    .from('quotations')
                    .select('*, organizations (*)')
                    .eq('id', quotation_id)
                    .single();

                if (quoteErr || !quoteData) {
                    console.error('[createInvoiceFromOrder] Error fetching quotation:', quoteErr);
                    return res.status(404).json({ error: 'Quotation not found', details: quoteErr?.message });
                }
                quote = quoteData;
            }
        }

        const org = quote?.organizations;
        const customerName = org?.name || 'Bulk Order Client';
        const organizationId = org?.id || quote?.organization_id || order?.organization_id;

        // Fetch existing advance payments and credits linked to this quotation or order
        let existingPayments = [];
        const payFilter = [];
        if (order?.id) payFilter.push(`order_id.eq.${order.id}`);
        if (quote?.id) payFilter.push(`quotation_id.eq.${quote.id}`);

        if (payFilter.length > 0) {
            const { data: pData } = await supabase
                .from('payments')
                .select('*')
                .or(payFilter.join(','));
            if (pData) existingPayments = pData;
        }

        const paymentsSum = existingPayments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
        const quotePaid = parseFloat(quote?.paid_amount || 0);
        const existingCredits = Math.max(paymentsSum, quotePaid);

        // Auto-link any payments linked to quote where order_id is null to this order
        if (existingPayments.length > 0 && order?.id) {
            const unlinkedPaymentIds = existingPayments.filter(p => !p.order_id).map(p => p.id);
            if (unlinkedPaymentIds.length > 0) {
                try {
                    await supabase
                        .from('payments')
                        .update({ order_id: order.id })
                        .in('id', unlinkedPaymentIds);
                } catch (linkErr) {
                    console.warn('[createInvoiceFromOrder] Warning linking payments to order:', linkErr.message);
                }
            }
        }

        // Credit period resolution
        let effectiveCreditPeriod = credit_period_days 
            ? parseInt(credit_period_days, 10) 
            : (org?.credit_period_days ? parseInt(org.credit_period_days, 10) : 30);

        // Fetch quotation items directly to guarantee complete item specifications
        let qItems = [];
        if (quote?.id) {
            const { data: directQItems } = await supabase
                .from('quotation_items')
                .select('*, product_types(name)')
                .eq('quotation_id', quote.id);
            if (directQItems && directQItems.length > 0) {
                qItems = directQItems;
            } else {
                const { data: fallbackQItems } = await supabase
                    .from('quotation_items')
                    .select('*')
                    .eq('quotation_id', quote.id);
                qItems = fallbackQItems || [];
            }
        }

        // Determine tax rate and tax inclusiveness safely
        const effectiveTaxRate = parseFloat(
            quote?.tax_percent !== undefined && quote?.tax_percent !== null 
                ? quote.tax_percent 
                : (quote?.tax_rate !== undefined && quote?.tax_rate !== null ? quote.tax_rate : 5)
        );

        const isTaxInclusive = quote?.is_tax_inclusive !== undefined 
            ? quote.is_tax_inclusive 
            : (quote?.metrics_summary?.is_tax_inclusive !== undefined ? quote.metrics_summary.is_tax_inclusive : true);

        // Convert quotation items to invoice items
        let invoiceItems = [];

        if (qItems.length > 0) {
            invoiceItems = qItems.map((qi, idx) => {
                const pType = qi.product_types?.name || qi.product_type_name || '';
                const spec = qi.specification || qi.sub_details || qi.product_name || qi.name || '';
                const desc = (pType && spec) ? `${pType} - ${spec}` : (pType || spec || qi.item_description || `Order Item #${idx + 1}`);

                return {
                    item_description: desc,
                    description: desc,
                    design_number: qi.design_number || qi.art_number || null,
                    barcode: qi.barcode || null,
                    quantity: parseInt(qi.quantity || qi.total_qty || 1, 10),
                    unit_price: parseFloat(qi.unit_price || qi.final_unit_price || 0),
                    tax_rate: parseFloat(qi.tax_rate !== undefined && qi.tax_rate !== null ? qi.tax_rate : effectiveTaxRate)
                };
            });
        } else {
            const fallbackDesc = order
                ? `Sales Order Execution: ${order.order_no} (${quote?.title || 'Custom Uniforms'})`
                : `Quotation Billing: ${quote?.quotation_no || `QT-${quote?.id}`} (${quote?.title || 'Custom Uniforms'})`;
            invoiceItems = [{
                item_description: fallbackDesc,
                description: fallbackDesc,
                design_number: null,
                barcode: null,
                quantity: 1,
                unit_price: parseFloat(quote?.final_quote_value || order?.total_amount || 0),
                tax_rate: effectiveTaxRate
            }];
        }

        // Calculate items subtotal and total to evaluate payment status and deductions
        let calcSubtotal = 0;
        let calcTax = 0;
        invoiceItems.forEach(it => {
            const qty = parseInt(it.quantity || 1, 10);
            const price = parseFloat(it.unit_price || 0);
            const rate = parseFloat(it.tax_rate || 0);
            const lineTot = qty * price;
            calcSubtotal += lineTot;
            if (!isTaxInclusive) calcTax += lineTot * (rate / 100);
        });
        const totalInvoiceValue = isTaxInclusive ? calcSubtotal : calcSubtotal + calcTax;
        const remainingDue = Math.max(0, totalInvoiceValue - existingCredits);

        const paymentStatus = remainingDue <= 0 && totalInvoiceValue > 0
            ? 'Fully Paid'
            : (existingCredits > 0 ? 'Partially Paid' : 'Unpaid');

        let invoiceNotesCombined = notes || (order ? `Generated against Sales Order ${order.order_no}` : `Generated against Quotation ${quote?.quotation_no || `QT-${quote?.id}`}`);
        if (existingCredits > 0) {
            invoiceNotesCombined += ` (Advance credits of ₹${existingCredits.toFixed(2)} applied. Remaining payment due: ₹${remainingDue.toFixed(2)})`;
        }

        // Delegate to createInvoice logic with existing credits deducted
        req.body = {
            order_id: order?.id || null,
            quotation_id: quote?.id || null,
            organization_id: organizationId,
            customer: org,
            branch_id: order?.branch_id || quote?.branch_id || null,
            customer_name: customerName,
            customer_type: 'Business',
            sale_type: 'bulk',
            credit_period_days: effectiveCreditPeriod,
            invoice_date: invoice_date || new Date().toISOString().slice(0, 10),
            due_date: due_date || null,
            is_tax_inclusive: isTaxInclusive,
            payment_status: paymentStatus,
            paid_amount: existingCredits,
            existing_credits: existingCredits,
            remaining_amount: remainingDue,
            due_amount: remainingDue,
            items: invoiceItems,
            notes: invoiceNotesCombined
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
            .select('*, invoice_items(*), orders(id, order_no, quotations(*, organizations(*))), organizations(*)')
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
            if (orderIds.length > 0) orConditions.push(`order_id.in.(${orderIds.join(',')})`);
            orConditions.push(`organization_id.eq.${userOrgId}`);

            query = query.or(orConditions.join(','));
        } else if (!isAdmin && userBranchId) {
            query = query.eq('branch_id', userBranchId);
        }

        const { data, error } = await query;
        if (error) throw error;

        // Collect order IDs and quotation IDs to fetch real recorded payments/credits
        const invOrderIds = (data || []).map(i => i.order_id).filter(Boolean);
        const invQuoteIds = (data || []).map(i => i.orders?.quotations?.id || i.quotation_id).filter(Boolean);

        let relatedPayments = [];
        const payOr = [];
        if (invOrderIds.length > 0) payOr.push(`order_id.in.(${invOrderIds.join(',')})`);
        if (invQuoteIds.length > 0) payOr.push(`quotation_id.in.(${invQuoteIds.join(',')})`);
        if (payOr.length > 0) {
            const { data: pData } = await supabase
                .from('payments')
                .select('*')
                .or(payOr.join(','));
            if (pData) relatedPayments = pData;
        }

        const orderPaymentsMap = new Map();
        const quotePaymentsMap = new Map();
        relatedPayments.forEach(p => {
            if (p.order_id) {
                orderPaymentsMap.set(p.order_id, (orderPaymentsMap.get(p.order_id) || 0) + parseFloat(p.amount || 0));
            }
            if (p.quotation_id) {
                quotePaymentsMap.set(p.quotation_id, (quotePaymentsMap.get(p.quotation_id) || 0) + parseFloat(p.amount || 0));
            }
        });

        // Enrich all invoices with dynamic due status & credit deductions
        const enriched = (data || []).map(inv => {
            const orderCredit = inv.order_id ? (orderPaymentsMap.get(inv.order_id) || 0) : 0;
            const linkedQuoteId = inv.orders?.quotations?.id || inv.quotation_id;
            const quoteCredit = linkedQuoteId ? (quotePaymentsMap.get(linkedQuoteId) || 0) : 0;
            const quotePaid = parseFloat(inv.orders?.quotations?.paid_amount || 0);
            const totalCredits = Math.max(orderCredit, quoteCredit, quotePaid, parseFloat(inv.paid_amount || 0));

            const totalAmt = parseFloat(inv.total_amount || 0);
            const effectivePaid = Math.min(totalAmt, totalCredits > 0 ? totalCredits : ((inv.status === 'Fully Paid' || inv.status === 'Paid') ? totalAmt : 0));
            const remainingDue = Math.max(0, totalAmt - effectivePaid);
            const effectiveStatus = remainingDue <= 0 && totalAmt > 0
                ? 'Fully Paid'
                : (effectivePaid > 0 ? 'Partially Paid' : (inv.status || inv.payment_status || 'Unpaid'));

            const dueInfo = calculateDueInfo(
                inv.invoice_date || inv.created_at,
                inv.credit_period_days || 30,
                effectiveStatus,
                effectivePaid,
                inv.total_amount,
                inv.due_date
            );
            const customerObj = inv.organizations || inv.orders?.quotations?.organizations || null;
            return {
                ...inv,
                invoice_no: inv.invoice_number || inv.invoice_no,
                order_no: inv.orders?.order_no || null,
                customer: customerObj,
                organizations: customerObj,
                customer_name: customerObj?.name || inv.customer_name || 'Bulk Order Client',
                payment_status: effectiveStatus,
                paid_amount: effectivePaid,
                existing_credits: effectivePaid,
                due_amount: remainingDue,
                remaining_amount: remainingDue,
                subtotal: inv.subtotal !== undefined ? inv.subtotal : (parseFloat(inv.total_amount || 0) - parseFloat(inv.tax_amount || 0)),
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
        const { notes, payment_status, status, paid_amount, credit_period_days, due_date } = req.body;

        const updateObj = {
            updated_at: new Date().toISOString()
        };
        if (status !== undefined) updateObj.status = status;
        else if (payment_status !== undefined) updateObj.status = payment_status;
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
                details: { invoice_no: data?.invoice_number || data?.invoice_no, status: data?.status }
            }]);
        } catch (logErr) {
            console.error('[Invoice] Activity log failed:', logErr.message);
        }

        res.json({
            ...data,
            invoice_no: data?.invoice_number || data?.invoice_no,
            payment_status: data?.status || payment_status
        });
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
            .select('invoice_number, total_amount')
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
                details: { invoice_no: existingInv?.invoice_number, total_amount: existingInv?.total_amount }
            }]);
        } catch (logErr) {
            console.error('[Invoice] Activity log failed:', logErr.message);
        }

        res.json({ success: true, message: 'Invoice deleted successfully.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 6. Get Single Invoice by ID (with Line Items, organization info, and due info)
exports.getInvoiceById = async (req, res) => {
    try {
        const { id } = req.params;
        const { data: invoice, error } = await supabase
            .from('invoices')
            .select(`
                *,
                invoice_items(*),
                orders (
                    id,
                    order_no,
                    status,
                    quotations (
                        *,
                        organizations (*)
                    )
                ),
                organizations (*)
            `)
            .eq('id', id)
            .single();

        if (error || !invoice) {
            return res.status(404).json({ error: 'Invoice not found' });
        }

        // Find existing advance credits/payments
        const linkedOrder = invoice.orders;
        const linkedQuote = invoice.orders?.quotations;
        const invPayFilter = [];
        if (invoice.order_id) invPayFilter.push(`order_id.eq.${invoice.order_id}`);
        if (linkedQuote?.id) invPayFilter.push(`quotation_id.eq.${linkedQuote.id}`);

        let invPayments = [];
        if (invPayFilter.length > 0) {
            const { data: pData } = await supabase
                .from('payments')
                .select('*')
                .or(invPayFilter.join(','));
            if (pData) invPayments = pData;
        }

        const invPaymentsSum = invPayments.reduce((s, p) => s + parseFloat(p.amount || 0), 0);
        const quotePaid = parseFloat(linkedQuote?.paid_amount || 0);
        const totalCredits = Math.max(invPaymentsSum, quotePaid, parseFloat(invoice.paid_amount || 0));

        const totalAmt = parseFloat(invoice.total_amount || 0);
        const effectivePaid = Math.min(totalAmt, totalCredits > 0 ? totalCredits : ((invoice.status === 'Fully Paid' || invoice.status === 'Paid') ? totalAmt : 0));
        const remainingDue = Math.max(0, totalAmt - effectivePaid);
        const effectiveStatus = remainingDue <= 0 && totalAmt > 0
            ? 'Fully Paid'
            : (effectivePaid > 0 ? 'Partially Paid' : (invoice.status || invoice.payment_status || 'Unpaid'));

        const dueInfo = calculateDueInfo(
            invoice.invoice_date || invoice.created_at,
            invoice.credit_period_days || 30,
            effectiveStatus,
            effectivePaid,
            invoice.total_amount,
            invoice.due_date
        );

        const orderNo = invoice.orders?.order_no || null;
        const customerProfile = invoice.organizations || invoice.orders?.quotations?.organizations || null;

        res.json({
            ...invoice,
            invoice_no: invoice.invoice_number || invoice.invoice_no,
            invoice_number: invoice.invoice_number || invoice.invoice_no,
            payment_status: effectiveStatus,
            paid_amount: effectivePaid,
            existing_credits: effectivePaid,
            due_amount: remainingDue,
            remaining_amount: remainingDue,
            order_no: orderNo,
            customer: customerProfile,
            organizations: customerProfile,
            customer_name: customerProfile?.name || invoice.customer_name || 'Bulk Order Client',
            subtotal: invoice.subtotal !== undefined ? invoice.subtotal : (parseFloat(invoice.total_amount || 0) - parseFloat(invoice.tax_amount || 0)),
            ...dueInfo
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.calculateDueInfo = calculateDueInfo;
exports.parseToMidnight = parseToMidnight;
exports.formatDateOnly = formatDateOnly;

