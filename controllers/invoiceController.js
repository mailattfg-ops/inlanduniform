const supabase = require('../config/supabase');

// 1. Create Invoice (Manual final invoice at branch or instant counter sale)
exports.createInvoice = async (req, res) => {
    try {
        const {
            order_id,
            quotation_id,
            branch_id,
            customer_name,
            customer_type,
            is_tax_inclusive,
            items,
            notes
        } = req.body;

        if (!customer_name || !items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'Customer name and at least one item are required.' });
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

        // Insert invoice master
        const { data: invoice, error: invError } = await supabase
            .from('invoices')
            .insert([{
                invoice_no,
                order_id: order_id || null,
                quotation_id: quotation_id || null,
                branch_id: branch_id || null,
                customer_name,
                customer_type: customer_type || 'Business',
                is_tax_inclusive: is_tax_inclusive !== undefined ? is_tax_inclusive : true,
                subtotal,
                tax_amount: totalTax,
                total_amount: totalAmount,
                paid_amount: totalAmount, // Default counter sale as paid
                payment_status: 'Fully Paid',
                notes: notes || '',
                created_by: req.user?.id && /^\d+$/.test(String(req.user.id)) ? parseInt(req.user.id, 10) : null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            }])
            .select()
            .single();

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

        // Log Invoice creation to record_activity_logs (PRD M1.7)
        try {
            await supabase.from('record_activity_logs').insert([{
                entity_type: 'Invoice',
                entity_id: invoice.id,
                action: 'INVOICE_CREATED',
                performed_by: invoice.created_by,
                details: {
                    invoice_no: invoice.invoice_no,
                    customer_name: invoice.customer_name,
                    order_id: invoice.order_id,
                    total_amount: invoice.total_amount,
                    items_count: items.length
                }
            }]);
        } catch (logErr) {
            console.error('[Invoice] Activity log failed:', logErr.message);
        }

        res.status(201).json({ ...invoice, items: invoiceItemsPayload });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 2. List Invoices (with Branch Isolation)
exports.listInvoices = async (req, res) => {
    try {
        const isAdmin = req.user?.role === 'Admin' || req.user?.role === 'Super Admin' || req.user?.role === 'SuperAdmin' || (req.user?.permissions || []).includes('all');
        const userBranchId = req.user?.branchId;
        const userOrgId = req.user?.organizationId;
        const userRole = (req.user?.role || '').toLowerCase();

        if (userRole === 'entity' || userRole === 'student' || userRole === 'member' || req.user?.memberId) {
            return res.json([]);
        }

        let query = supabase
            .from('invoices')
            .select('*, invoice_items(*)')
            .order('created_at', { ascending: false });

        if (userOrgId) {
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

            if (quoteIds.length > 0 || orderIds.length > 0) {
                const orConditions = [];
                if (quoteIds.length > 0) orConditions.push(`quotation_id.in.(${quoteIds.join(',')})`);
                if (orderIds.length > 0) orConditions.push(`order_id.in.(${orderIds.join(',')})`);
                query = query.or(orConditions.join(','));
            } else {
                return res.json([]);
            }
        } else if (!isAdmin && userBranchId) {
            query = query.eq('branch_id', userBranchId);
        }

        const { data, error } = await query;
        if (error) throw error;
        res.json(data || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 3. Update Invoice (Restricted strictly to Branch Managers)
exports.updateInvoice = async (req, res) => {
    try {
        const userRole = (req.user?.role || '').toLowerCase();
        if (!['branch manager', 'admin', 'corporate'].includes(userRole)) {
            return res.status(403).json({ error: 'Invoice editing is strictly restricted to Branch Managers.' });
        }

        const { id } = req.params;
        const { notes, payment_status, paid_amount } = req.body;

        const { data, error } = await supabase
            .from('invoices')
            .update({
                notes,
                payment_status,
                paid_amount,
                updated_at: new Date().toISOString()
            })
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

// 4. Delete Invoice (Restricted strictly to Branch Managers)
exports.deleteInvoice = async (req, res) => {
    try {
        const userRole = (req.user?.role || '').toLowerCase();
        if (!['branch manager', 'admin'].includes(userRole)) {
            return res.status(403).json({ error: 'Invoice deletion is strictly restricted to Branch Managers.' });
        }

        const { id } = req.params;

        // Fetch invoice before deletion for audit record
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

        // Log Invoice deletion
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
