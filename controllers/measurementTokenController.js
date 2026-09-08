const supabase = require('../config/supabase');

// 1. Create / Assign Measurement Token
exports.createToken = async (req, res) => {
    try {
        const {
            token_number,
            organization_id,
            org_code,
            order_id,
            order_no,
            member_id,
            student_name,
            class_name,
            section_name,
            item_name,
            alteration_details
        } = req.body;

        if (!token_number || !student_name || !item_name) {
            return res.status(400).json({ error: 'Token number, student name, and item name are required.' });
        }

        // Clean values for composite ID string
        const cleanOrg = (org_code || 'ORG').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
        const cleanOrd = (order_no || 'ORD').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
        const cleanTok = token_number.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
        const cleanItem = item_name.replace(/[^A-Za-z0-9]/g, '').toUpperCase();

        // Unique ID composition: Organisation + Sales Order + Token Number + Item
        const unique_composite_id = `${cleanOrg}-${cleanOrd}-${cleanTok}-${cleanItem}`;

        const { data: tokenRecord, error } = await supabase
            .from('measurement_tokens')
            .insert([{
                token_number,
                organization_id: organization_id || null,
                order_id: order_id || null,
                member_id: member_id || null,
                student_name,
                class_name: class_name || '',
                section_name: section_name || '',
                item_name,
                alteration_details: alteration_details || '',
                unique_composite_id,
                status: 'Assigned',
                created_by: req.user?.id || null
            }])
            .select()
            .single();

        if (error) throw error;

        res.status(201).json(tokenRecord);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 2. Lookup tokens by institution/organization or order
exports.lookupTokens = async (req, res) => {
    try {
        const { organizationId, orderId, search } = req.query;

        let query = supabase
            .from('measurement_tokens')
            .select('*, organizations(name, customer_code), orders(order_no)')
            .order('created_at', { ascending: false });

        if (organizationId) query = query.eq('organization_id', organizationId);
        if (orderId) query = query.eq('order_id', orderId);
        if (search) query = query.or(`student_name.ilike.%${search}%,token_number.ilike.%${search}%,unique_composite_id.ilike.%${search}%`);

        const { data, error } = await query;
        if (error) throw error;

        res.json(data || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
