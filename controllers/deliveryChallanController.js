const supabase = require('../config/supabase');

// Helper to check if logged in user is global admin
const isGlobalAdmin = (user) => {
    if (!user) return false;
    const role = user.role || '';
    return role === 'Admin' || role === 'Super Admin' || role === 'SuperAdmin';
};

// 1. List Delivery Challans (with Branch Isolation)
exports.listDeliveryChallans = async (req, res) => {
    try {
        const isAdmin = isGlobalAdmin(req.user);
        const userBranchId = req.user?.branchId;

        let query = supabase
            .from('delivery_challans')
            .select('*, orders(id, order_no, branch_id, quotation_id, quotations(id, quotation_no, title, final_quote_value, organizations(name)))')
            .order('created_at', { ascending: false });

        if (!isAdmin && userBranchId) {
            query = query.eq('branch_id', userBranchId);
        }

        const { data, error } = await query;
        if (error) throw error;
        res.json(data || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 2. Create Delivery Challan
exports.createDeliveryChallan = async (req, res) => {
    try {
        const { order_id, branch_id, dispatch_date, vehicle_no, transporter_name, total_packages, notes } = req.body;

        if (!order_id) {
            return res.status(400).json({ error: 'Order ID is required.' });
        }

        // Auto-resolve branch_id from order if not provided
        let targetBranchId = branch_id || req.user?.branchId || null;
        const { data: orderRecord } = await supabase
            .from('orders')
            .select('id, order_no, quotation_id, branch_id, quotations(id, quotation_no, title, final_quote_value, organizations(name, address))')
            .eq('id', order_id)
            .maybeSingle();

        if (orderRecord && !targetBranchId) {
            targetBranchId = orderRecord.branch_id;
        }

        // One Delivery Challan per Sales Order
        // NOTE: .maybeSingle() returns null (not error) when >1 rows exist, so use array + limit instead
        const { data: existingDCs } = await supabase
            .from('delivery_challans')
            .select('id, dc_no')
            .eq('order_id', order_id)
            .limit(1);

        if (existingDCs && existingDCs.length > 0) {
            const existingDC = existingDCs[0];
            return res.status(409).json({
                error: `A Delivery Challan (${existingDC.dc_no}) already exists for this Sales Order. Select it from the dispatch log to reprint.`,
                existing_dc_id: existingDC.id,
                existing_dc_no: existingDC.dc_no
            });
        }

        // Generate DC Number: YY/MM/DC-XXXX
        const dateStr = new Date().toISOString().slice(2, 7).replace('-', '/');
        const randNum = Math.floor(1000 + Math.random() * 9000);
        const dc_no = `${dateStr}/DC-${randNum}`;

        const rawUserId = req.user?.id;
        const createdBy = rawUserId && /^\d+$/.test(String(rawUserId)) ? parseInt(rawUserId, 10) : null;

        const { data: dc, error } = await supabase
            .from('delivery_challans')
            .insert([{
                dc_no,
                order_id,
                branch_id: targetBranchId,
                dispatch_date: dispatch_date || new Date().toISOString().split('T')[0],
                vehicle_no: vehicle_no || '',
                transporter_name: transporter_name || '',
                total_packages: parseInt(total_packages || 1, 10),
                notes: notes || '',
                created_by: createdBy,
                created_at: new Date().toISOString()
            }])
            .select()
            .single();

        if (error) throw error;

        // Log DC creation in record_activity_logs (PRD M1.7)
        try {
            await supabase.from('record_activity_logs').insert([{
                entity_type: 'DeliveryChallan',
                entity_id: dc.id,
                action: 'DC_CREATED',
                performed_by: createdBy,
                details: {
                    dc_no: dc.dc_no,
                    order_id: dc.order_id,
                    total_packages: dc.total_packages,
                    transporter_name: dc.transporter_name,
                    vehicle_no: dc.vehicle_no,
                    dispatch_date: dc.dispatch_date
                }
            }]);
        } catch (logErr) {
            console.error('[DeliveryChallan] Activity log failed:', logErr.message);
        }

        // Fetch enclosed items from quotation_items
        let items = [];
        if (orderRecord?.quotation_id) {
            const { data: qItems } = await supabase
                .from('quotation_items')
                .select('*')
                .eq('quotation_id', orderRecord.quotation_id);
            items = qItems || [];
        }

        res.status(201).json({
            ...dc,
            orders: orderRecord,
            items
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 2. Get Delivery Challan details (with Customer copy vs Office copy formatted views)
exports.getDeliveryChallanDetails = async (req, res) => {
    try {
        const { id } = req.params;
        const { mode } = req.query; // 'customer' or 'office'

        const { data: dc, error } = await supabase
            .from('delivery_challans')
            .select('*, orders(*, quotations(quotation_no, final_quote_value, paid_amount, metrics_summary, organizations(name, address)))')
            .eq('id', id)
            .single();

        if (error || !dc) return res.status(404).json({ error: 'Delivery Challan not found.' });

        // Fetch quotation items for this DC's order
        const { data: items } = await supabase
            .from('quotation_items')
            .select('*')
            .eq('quotation_id', dc.orders?.quotation_id);

        const responsePayload = {
            ...dc,
            view_mode: mode === 'office' ? 'Office Copy (With Pricing)' : 'Customer Copy (No Pricing)',
            items: (items || []).map(it => {
                if (mode === 'office') {
                    return it; // include price details
                } else {
                    // Customer copy: omit pricing details
                    const { unit_price, total_price, ...noPriceItem } = it;
                    return noPriceItem;
                }
            })
        };

        res.json(responsePayload);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
