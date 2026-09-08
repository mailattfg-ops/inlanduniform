const supabase = require('../config/supabase');

// 1. Raise Job Card from confirmed Sales Order (per item)
exports.createJobCardFromOrder = async (req, res) => {
    try {
        const { order_id, item_id, item_name, design_number, quantity, size_breakdown } = req.body;

        if (!order_id || !item_name) {
            return res.status(400).json({ error: 'Order ID and Item Name are required.' });
        }

        // Generate unique Job Card number: JC-YY/MM-XXXX
        const dateStr = new Date().toISOString().slice(2, 7).replace('-', '/'); // YY/MM
        const randNum = Math.floor(1000 + Math.random() * 9000);
        const job_card_no = `JC-${dateStr}-${randNum}`;

        const { data: jobCard, error } = await supabase
            .from('job_cards')
            .insert([{
                job_card_no,
                order_id,
                item_id: item_id || null,
                item_name,
                design_number: design_number || '',
                quantity: quantity || 1,
                size_breakdown: size_breakdown || {},
                status: 'Pending PO Handler',
                po_handler_action: 'Pending',
                created_by: req.user?.id || null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            }])
            .select()
            .single();

        if (error) throw error;

        // Log timeline activity
        await supabase.from('record_activity_logs').insert([{
            entity_type: 'JobCard',
            entity_id: jobCard.id,
            action: 'RAISED',
            performed_by: req.user?.id || null,
            details: { order_id, job_card_no, item_name }
        }]);

        res.status(201).json(jobCard);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 2. Factory PO Handler Action (Accept / Reject with reason / Hold)
exports.poHandlerAction = async (req, res) => {
    try {
        const { id } = req.params;
        const { action, reason } = req.body; // Accept, Reject, Hold

        if (!['Accept', 'Reject', 'Hold'].includes(action)) {
            return res.status(400).json({ error: 'Action must be Accept, Reject, or Hold.' });
        }

        if ((action === 'Reject' || action === 'Hold') && !reason) {
            return res.status(400).json({ error: `A reason is required when setting status to ${action}.` });
        }

        let newStatus = 'Pending PO Handler';
        if (action === 'Accept') newStatus = 'Accepted';
        else if (action === 'Reject') newStatus = 'Rejected';
        else if (action === 'Hold') newStatus = 'Hold';

        const updateData = {
            po_handler_action: action,
            status: newStatus,
            updated_at: new Date().toISOString()
        };

        if (action === 'Reject') updateData.po_handler_reason = reason;
        if (action === 'Hold') updateData.hold_reason = reason;

        const { data: updated, error } = await supabase
            .from('job_cards')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        // Log timeline activity
        await supabase.from('record_activity_logs').insert([{
            entity_type: 'JobCard',
            entity_id: id,
            action: `PO_HANDLER_${action.toUpperCase()}`,
            performed_by: req.user?.id || null,
            details: { action, reason }
        }]);

        res.json(updated);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 3. List Job Cards for Factory / PC queue
exports.listJobCards = async (req, res) => {
    try {
        const { status, orderId } = req.query;

        let query = supabase
            .from('job_cards')
            .select('*, orders(order_no, customer_name, quotations(quotation_no))')
            .order('created_at', { ascending: false });

        if (status) query = query.eq('status', status);
        if (orderId) query = query.eq('order_id', orderId);

        const { data, error } = await query;
        if (error) throw error;

        res.json(data || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 4. Sub-Job Card / Batch Breakdown by Production Coordinator
exports.createSubJobCard = async (req, res) => {
    try {
        const { job_card_id, batch_size, target_date, assigned_to } = req.body;

        if (!job_card_id || !batch_size) {
            return res.status(400).json({ error: 'Job Card ID and Batch Size are required.' });
        }

        // Fetch parent job card
        const { data: parentCard, error: parentError } = await supabase
            .from('job_cards')
            .select('job_card_no')
            .eq('id', job_card_id)
            .single();

        if (parentError || !parentCard) return res.status(404).json({ error: 'Parent Job Card not found.' });

        const countRes = await supabase.from('sub_job_cards').select('id', { count: 'exact' }).eq('job_card_id', job_card_id);
        const subIndex = (countRes.count || 0) + 1;
        const sub_card_no = `${parentCard.job_card_no}-BATCH${subIndex}`;

        const { data: subCard, error } = await supabase
            .from('sub_job_cards')
            .insert([{
                job_card_id,
                sub_card_no,
                batch_size: parseInt(batch_size, 10),
                stage: 'Cutting',
                assigned_to: assigned_to || 'Factory Floor',
                target_date: target_date || null
            }])
            .select()
            .single();

        if (error) throw error;

        // Update parent Job Card status to In Production
        await supabase.from('job_cards').update({ status: 'In Production' }).eq('id', job_card_id);

        res.status(201).json(subCard);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 5. Update Production Stage for Sub-Job Card
exports.updateSubJobCardStage = async (req, res) => {
    try {
        const { id } = req.params;
        const { stage } = req.body; // Cutting, Stitching, Finishing, QC, Packing, Ready

        const validStages = ['Cutting', 'Stitching', 'Finishing', 'QC', 'Packing', 'Ready'];
        if (!validStages.includes(stage)) {
            return res.status(400).json({ error: `Invalid stage. Allowed: ${validStages.join(', ')}` });
        }

        const { data: updated, error } = await supabase
            .from('sub_job_cards')
            .update({
                stage,
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        res.json(updated);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 6. Fabric Consumption Logging & Issue with 10% Safety Margin
exports.logFabricConsumption = async (req, res) => {
    try {
        const { job_card_id, sub_job_card_id, fabric_id, fabric_name, required_meters, returned_meters, cut_piece_notes } = req.body;

        if (!job_card_id || !required_meters) {
            return res.status(400).json({ error: 'Job Card ID and Required Meters are required.' });
        }

        const reqMeters = parseFloat(required_meters);
        // Enforce 10% safety margin rule (M9.10)
        const safetyMargin = reqMeters * 0.10;
        const issuedMeters = reqMeters + safetyMargin;

        let cutPieceBatchNo = null;
        if (returned_meters && parseFloat(returned_meters) > 0) {
            const dateStr = new Date().toISOString().slice(2, 7).replace('-', '');
            cutPieceBatchNo = `CUT-${dateStr}-${Math.floor(1000 + Math.random() * 9000)}`;
        }

        const { data, error } = await supabase
            .from('fabric_consumption_logs')
            .insert([{
                job_card_id,
                sub_job_card_id: sub_job_card_id || null,
                fabric_id: fabric_id || null,
                fabric_name: fabric_name || 'Standard Production Fabric',
                required_meters: reqMeters,
                safety_margin_meters: safetyMargin,
                issued_meters: issuedMeters,
                consumed_meters: reqMeters, // default estimated
                returned_meters: parseFloat(returned_meters || 0),
                cut_piece_batch_no: cutPieceBatchNo,
                created_by: req.user?.id || null
            }])
            .select()
            .single();

        if (error) throw error;

        res.status(201).json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
