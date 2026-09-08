const supabase = require('../config/supabase');

// 1. Create Delivery Challan
exports.createDeliveryChallan = async (req, res) => {
    try {
        const { order_id, branch_id, dispatch_date, vehicle_no, transporter_name, total_packages, notes } = req.body;

        if (!order_id) {
            return res.status(400).json({ error: 'Order ID is required.' });
        }

        // Generate DC Number: YY/MM/DC-XXXX
        const dateStr = new Date().toISOString().slice(2, 7).replace('-', '/');
        const randNum = Math.floor(1000 + Math.random() * 9000);
        const dc_no = `${dateStr}/DC-${randNum}`;

        const { data: dc, error } = await supabase
            .from('delivery_challans')
            .insert([{
                dc_no,
                order_id,
                branch_id: branch_id || null,
                dispatch_date: dispatch_date || new Date().toISOString().split('T')[0],
                vehicle_no: vehicle_no || '',
                transporter_name: transporter_name || '',
                total_packages: parseInt(total_packages || 1, 10),
                notes: notes || '',
                created_by: req.user?.id || null,
                created_at: new Date().toISOString()
            }])
            .select()
            .single();

        if (error) throw error;

        res.status(201).json(dc);
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
            .select('*, orders(*, quotations(quotation_no, final_quote_value, paid_amount, organizations(name, address)))')
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
