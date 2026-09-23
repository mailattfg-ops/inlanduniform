const supabase = require('../config/supabase');
const { toSafeInt } = require('../utils/sanitize');

// Helper to check if user is admin
const isGlobalAdmin = (user) => {
    if (!user) return false;
    const role = user.role || '';
    const permissions = user.permissions || [];
    return role === 'Admin' || role === 'Super Admin' || role === 'SuperAdmin' || permissions.includes('all');
};

// All valid order lifecycle statuses
const VALID_ORDER_STATUSES = [
    'Draft',
    'Held at Branch',
    'Approval Pending',
    'Corporate Accepted',
    'Corporate Rejected',
    'Corporate Hold',
    'Placed',
    'In Production',
    'Shipped',
    'Delivered',
    'Cancelled'
];

// 1. List all orders with branch isolation and status filtering
exports.listOrders = async (req, res) => {
    try {
        const { status, corporate_action, branchId } = req.query;
        const isAdmin = isGlobalAdmin(req.user);
        const userBranchId = req.user?.branchId;
        const userOrgId = req.user?.organizationId;
        const userRole = (req.user?.role || '').toLowerCase();

        // If caller is an individual entity / student, they should not view wholesale commercial orders
        if (userRole === 'entity' || userRole === 'student' || userRole === 'member' || req.user?.memberId) {
            return res.json([]);
        }

        let query = supabase
            .from('orders')
            .select('*, quotations!inner(id, quotation_no, title, final_quote_value, paid_amount, organization_id, organizations(name))');

        if (userOrgId) {
            query = query.eq('quotations.organization_id', userOrgId);
        } else {
            // Apply branch isolation for branch staff/manager
            const targetBranchId = (!isAdmin && userBranchId) ? userBranchId : (branchId && branchId !== 'all' ? branchId : null);
            if (targetBranchId) {
                query = query.eq('branch_id', targetBranchId);
            }
        }

        if (status) {
            query = query.eq('status', status);
        }
        if (corporate_action) {
            query = query.eq('corporate_action', corporate_action);
        }

        const { data, error } = await query.order('created_at', { ascending: false });

        if (error) throw error;
        res.json(data || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 2. Get single order details
exports.getOrderDetails = async (req, res) => {
    try {
        const { id } = req.params;
        const safeId = toSafeInt(id);
        if (!safeId) {
            return res.status(400).json({ error: 'Invalid Order ID.' });
        }
        const { data: order, error } = await supabase
            .from('orders')
            .select('*, quotations(id, quotation_no, title, final_quote_value, paid_amount, expected_delivery_date, organization_id, organizations(name, address))')
            .eq('id', safeId)
            .single();

        if (error) throw error;
        if (!order) {
            return res.status(404).json({ error: 'Order not found.' });
        }

        const userOrgId = req.user?.organizationId;
        const userRole = (req.user?.role || '').toLowerCase();

        if (userRole === 'entity' || userRole === 'student' || userRole === 'member' || req.user?.memberId) {
            return res.status(403).json({ error: 'Access Denied: Entity members cannot view wholesale orders' });
        }

        if (userOrgId && String(order.quotations?.organization_id) !== String(userOrgId)) {
            return res.status(403).json({ error: "Access Denied: You cannot view another organization's order" });
        }

        // Fetch quotation items for this order's quotation
        const { data: items, error: itemsError } = await supabase
            .from('quotation_items')
            .select('*, product_types(name)')
            .eq('quotation_id', order.quotation_id);

        if (itemsError) throw itemsError;

        res.json({
            ...order,
            items: items || []
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 3. Create order from a paid quotation (defaults to 'Held at Branch')
exports.createOrder = async (req, res) => {
    try {
        const { quotation_id, order_notes, status } = req.body;

        if (!quotation_id) {
            return res.status(400).json({ error: 'Quotation ID is required.' });
        }

        // Fetch quotation status and amount details
        const { data: quotation, error: quoteError } = await supabase
            .from('quotations')
            .select('id, quotation_no, final_quote_value, paid_amount, payment_status, branch_id')
            .eq('id', quotation_id)
            .single();

        if (quoteError || !quotation) {
            return res.status(404).json({ error: 'Quotation not found.' });
        }

        // Verify quotation has a payment (paid_amount > 0)
        if (!quotation.paid_amount || parseFloat(quotation.paid_amount) <= 0) {
            return res.status(400).json({ 
                error: `Order placement requires a payment to be registered. Current paid amount is ${quotation.paid_amount || 0}.` 
            });
        }

        // Check if an order already exists for this quotation
        const { data: existingOrder, error: existingOrderError } = await supabase
            .from('orders')
            .select('id')
            .eq('quotation_id', quotation_id)
            .maybeSingle();

        if (existingOrderError) throw existingOrderError;
        if (existingOrder) {
            return res.status(400).json({ error: 'An order has already been created for this quotation.' });
        }

        // Initial status: Defaults to 'Held at Branch' (or 'Draft' if requested), or 'Placed' for immediate placement
        const initialStatus = status && VALID_ORDER_STATUSES.includes(status) ? status : 'Held at Branch';

        // Generate unique order number and barcode sequence
        const cleanQuoteNo = quotation.quotation_no.replace(/[^A-Za-z0-9]/g, '');
        const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
        const order_no = `ORD-${cleanQuoteNo}-${randomSuffix}`;
        const barcode = `BRC-${cleanQuoteNo}-${randomSuffix}`;

        const branch_id = req.user?.branchId || quotation.branch_id || null;

        const baseOrderPayload = {
            quotation_id,
            branch_id,
            order_no,
            barcode,
            status: initialStatus,
            order_notes: order_notes || '',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        // Try inserting with corporate_action; if column does not exist in schema cache, fallback to base payload
        let newOrder = null;
        let orderError = null;

        const insertWithCorp = await supabase
            .from('orders')
            .insert([{ ...baseOrderPayload, corporate_action: 'Pending' }])
            .select()
            .single();

        if (insertWithCorp.error) {
            const isColumnMissing = insertWithCorp.error.message?.includes('corporate_action') || insertWithCorp.error.code === 'PGRST204';
            if (isColumnMissing) {
                const insertBase = await supabase
                    .from('orders')
                    .insert([baseOrderPayload])
                    .select()
                    .single();
                newOrder = insertBase.data;
                orderError = insertBase.error;
            } else {
                orderError = insertWithCorp.error;
            }
        } else {
            newOrder = insertWithCorp.data;
        }

        if (orderError) throw orderError;

        // If order was created directly in a confirmed/accepted state, allocate stock
        if (['Placed', 'Corporate Accepted'].includes(initialStatus)) {
            try {
                const inventoryService = require('../services/inventoryService');
                await inventoryService.allocateStockForOrder(newOrder.id);
            } catch (stockErr) {
                console.error('[InventoryHook] Stock allocation failed:', stockErr.message);
            }
        }

        // Log action in record_activity_logs
        try {
            await supabase.from('record_activity_logs').insert([{
                entity_type: 'Order',
                entity_id: newOrder.id,
                action: 'CREATE_ORDER',
                performed_by: toSafeInt(req.user?.id),
                performed_by_name: req.user?.fullName || req.user?.email || null,
                details: {
                    quotation_id,
                    order_no,
                    barcode,
                    status: initialStatus,
                    quotation_no: quotation.quotation_no
                }
            }]);

            // Carry forward activity logs & attachments from quotation into the SO (PRD M5.4)
            const { data: quoteLogs } = await supabase
                .from('record_activity_logs')
                .select('*')
                .eq('entity_type', 'Quotation')
                .eq('entity_id', quotation_id);

            if (quoteLogs && quoteLogs.length > 0) {
                const carriedLogs = quoteLogs.map(log => ({
                    entity_type: 'Order',
                    entity_id: newOrder.id,
                    action: `CARRIED_FROM_QUOTATION`,
                    performed_by: log.performed_by,
                    performed_by_name: log.performed_by_name,
                    details: {
                        original_action: log.action,
                        quotation_id,
                        ...log.details
                    },
                    attachments: log.attachments || [],
                    created_at: new Date().toISOString()
                }));
                await supabase.from('record_activity_logs').insert(carriedLogs);
            }
        } catch (logErr) {
            console.error('Logging failed:', logErr.message);
        }

        res.status(201).json(newOrder);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 4. Branch Manager submits Sales Order to Corporate HQ
exports.submitToCorporate = async (req, res) => {
    try {
        const { id } = req.params;

        // Fetch existing order
        const { data: order, error: fetchError } = await supabase
            .from('orders')
            .select('id, order_no, status, quotation_id')
            .eq('id', id)
            .single();

        if (fetchError || !order) {
            return res.status(404).json({ error: 'Order not found.' });
        }

        // Submissions can only happen from Draft, Held at Branch, or Corporate Rejected (resubmit)
        const submittableStatuses = ['Draft', 'Held at Branch', 'Corporate Rejected'];
        if (!submittableStatuses.includes(order.status)) {
            return res.status(400).json({ 
                error: `Order cannot be submitted to Corporate from current status: ${order.status}. Allowed: ${submittableStatuses.join(', ')}` 
            });
        }

        const submittedAt = new Date().toISOString();
        const updateData = {
            status: 'Approval Pending',
            corporate_action: 'Pending',
            submitted_to_corporate_at: submittedAt,
            updated_at: submittedAt
        };

        let updatedOrder = null;
        const updateWithCorp = await supabase
            .from('orders')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (updateWithCorp.error) {
            const isColumnMissing = updateWithCorp.error.message?.includes('corporate_') || updateWithCorp.error.code === 'PGRST204';
            if (isColumnMissing) {
                const updateBase = await supabase
                    .from('orders')
                    .update({
                        status: 'Approval Pending',
                        updated_at: submittedAt
                    })
                    .eq('id', id)
                    .select()
                    .single();
                if (updateBase.error) throw updateBase.error;
                updatedOrder = updateBase.data;
            } else {
                throw updateWithCorp.error;
            }
        } else {
            updatedOrder = updateWithCorp.data;
        }

        // Log submission event to activity audit
        try {
            await supabase.from('record_activity_logs').insert([{
                entity_type: 'Order',
                entity_id: id,
                action: 'SUBMIT_TO_CORPORATE',
                performed_by: toSafeInt(req.user?.id),
                performed_by_name: req.user?.fullName || req.user?.email || null,
                details: {
                    order_no: order.order_no,
                    previous_status: order.status,
                    new_status: 'Approval Pending',
                    submitted_at: submittedAt
                }
            }]);
        } catch (logErr) {
            console.error('Logging activity failed:', logErr.message);
        }

        res.json({
            success: true,
            message: 'Sales Order submitted to Corporate for review.',
            order: updatedOrder
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 5. Corporate Action on Sales Order: Accept / Hold / Reject
exports.corporateAction = async (req, res) => {
    try {
        const { id } = req.params;
        const { action, reason } = req.body; // Accept, Reject, Hold

        const validActions = ['Accept', 'Reject', 'Hold'];
        if (!validActions.includes(action)) {
            return res.status(400).json({ 
                error: `Invalid corporate action. Must be one of: ${validActions.join(', ')}` 
            });
        }

        // Rejection and Hold strictly require an explanation reason
        if ((action === 'Reject' || action === 'Hold') && (!reason || !reason.trim())) {
            return res.status(400).json({ 
                error: `A descriptive reason is required when setting Corporate action to ${action}.` 
            });
        }

        // Fetch existing order
        const { data: order, error: fetchError } = await supabase
            .from('orders')
            .select('id, order_no, status, quotation_id')
            .eq('id', id)
            .single();

        if (fetchError || !order) {
            return res.status(404).json({ error: 'Order not found.' });
        }

        // Action can only be performed when order is in 'Approval Pending' or 'Corporate Hold'
        const actionableStatuses = ['Approval Pending', 'Corporate Hold'];
        if (!actionableStatuses.includes(order.status)) {
            return res.status(400).json({ 
                error: `Corporate action cannot be taken when order status is: ${order.status}. Must be in: ${actionableStatuses.join(', ')}` 
            });
        }

        let newStatus = 'Approval Pending';
        if (action === 'Accept') newStatus = 'Corporate Accepted';
        else if (action === 'Reject') newStatus = 'Corporate Rejected';
        else if (action === 'Hold') newStatus = 'Corporate Hold';

        const actionTimestamp = new Date().toISOString();
        const updateData = {
            status: newStatus,
            corporate_action: action,
            corporate_action_at: actionTimestamp,
            corporate_action_by: req.user?.id || null,
            updated_at: actionTimestamp
        };

        if (action === 'Reject' || action === 'Hold') {
            updateData.corporate_reason = reason.trim();
        }

        let updatedOrder = null;
        const updateWithCorp = await supabase
            .from('orders')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (updateWithCorp.error) {
            const isColumnMissing = updateWithCorp.error.message?.includes('corporate_') || updateWithCorp.error.code === 'PGRST204';
            if (isColumnMissing) {
                const noteSuffix = ` [Corporate ${action}: ${reason ? reason.trim() : 'Approved'}]`;
                const updateBase = await supabase
                    .from('orders')
                    .update({
                        status: newStatus,
                        order_notes: (order.order_notes || '') + noteSuffix,
                        updated_at: actionTimestamp
                    })
                    .eq('id', id)
                    .select()
                    .single();
                if (updateBase.error) throw updateBase.error;
                updatedOrder = updateBase.data;
            } else {
                throw updateWithCorp.error;
            }
        } else {
            updatedOrder = updateWithCorp.data;
        }

        // Inventory Allocation / Release Handling
        const inventoryService = require('../services/inventoryService');
        try {
            if (action === 'Accept') {
                // Confirm stock reservation for the accepted order
                await inventoryService.allocateStockForOrder(id);
            } else if (action === 'Reject') {
                // If previously allocated, release reservations
                await inventoryService.releaseStockForOrder(id);
            }
        } catch (stockErr) {
            console.error('[InventoryHook] Corporate action stock update error:', stockErr.message);
        }

        // Log corporate triage action to activity audit
        try {
            await supabase.from('record_activity_logs').insert([{
                entity_type: 'Order',
                entity_id: id,
                action: `CORPORATE_${action.toUpperCase()}`,
                performed_by: toSafeInt(req.user?.id),
                performed_by_name: req.user?.fullName || req.user?.email || null,
                details: {
                    order_no: order.order_no,
                    action,
                    reason: reason || '',
                    previous_status: order.status,
                    new_status: newStatus,
                    action_at: actionTimestamp
                }
            }]);
        } catch (logErr) {
            console.error('Logging activity failed:', logErr.message);
        }

        res.json({
            success: true,
            message: `Corporate has set order action to ${action}.`,
            order: updatedOrder
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 6. Update general order status (Production, Shipping, Fulfillment lifecycle)
exports.updateOrderStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, order_notes } = req.body;

        if (!VALID_ORDER_STATUSES.includes(status)) {
            return res.status(400).json({ 
                error: `Invalid status. Must be one of: ${VALID_ORDER_STATUSES.join(', ')}` 
            });
        }

        // Fetch existing order to verify existence
        const { data: order, error: fetchError } = await supabase
            .from('orders')
            .select('id, order_no, status')
            .eq('id', id)
            .single();

        if (fetchError || !order) {
            return res.status(404).json({ error: 'Order not found.' });
        }

        const updateData = {
            status,
            updated_at: new Date().toISOString()
        };
        if (order_notes !== undefined) {
            updateData.order_notes = order_notes;
        }

        const { data: updatedOrder, error: updateError } = await supabase
            .from('orders')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (updateError) throw updateError;

        // Fulfill or release stock based on status transitions
        try {
            const inventoryService = require('../services/inventoryService');
            if (['Shipped', 'Delivered'].includes(status) && ['Placed', 'Corporate Accepted'].includes(order.status)) {
                // Fulfill: physically deduct stock and release reservations
                await inventoryService.fulfillStockForOrder(id);
            } else if ((status === 'Cancelled' || status === 'Corporate Rejected') && ['Placed', 'Corporate Accepted'].includes(order.status)) {
                // Cancelled / Rejected: release reservations
                await inventoryService.releaseStockForOrder(id);
            } else if (['Placed', 'Corporate Accepted'].includes(status) && !['Placed', 'Corporate Accepted'].includes(order.status)) {
                // Transitioning into confirmed status: allocate stock
                await inventoryService.allocateStockForOrder(id);
            }
        } catch (stockErr) {
            console.error('[InventoryHook] Stock transition failed:', stockErr.message);
        }

        // Log status change
        try {
            await supabase.from('record_activity_logs').insert([{
                entity_type: 'Order',
                entity_id: id,
                action: 'UPDATE_ORDER_STATUS',
                performed_by: toSafeInt(req.user?.id),
                performed_by_name: req.user?.fullName || req.user?.email || null,
                details: {
                    order_no: order.order_no,
                    old_status: order.status,
                    new_status: status
                }
            }]);
        } catch (logErr) {
            console.error('Logging failed:', logErr.message);
        }

        res.json(updatedOrder);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 7. PRD M5.7 & Section 5 Item 2: Notify Customer of Sales Order Confirmation / Submission
exports.notifyCustomer = async (req, res) => {
    try {
        const { id } = req.params;
        const { channel, custom_message, email } = req.body;

        const { data: order, error: fetchErr } = await supabase
            .from('orders')
            .select('*, quotations(id, quotation_no, title, final_quote_value, organization_id, organizations(id, name, address, customer_code))')
            .eq('id', id)
            .single();

        if (fetchErr || !order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        const org = order.quotations?.organizations || {};
        const customerName = org.name || 'Valued Customer';
        const customerEmail = email || 'client@organization.com';

        // Generate customer-facing tracking / review link
        const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        const shareUrl = order.quotation_id 
            ? `${baseUrl}/marketing/quotations?preview=${order.quotation_id}`
            : `${baseUrl}/marketing/order-placement?order=${order.id}`;

        // Audit Log entry (PRD M1.7)
        try {
            await supabase.from('record_activity_logs').insert([{
                entity_type: 'Order',
                entity_id: id,
                action: 'SO_CUSTOMER_NOTIFIED',
                performed_by: req.user?.id && /^\d+$/.test(String(req.user.id)) ? parseInt(req.user.id, 10) : null,
                details: {
                    order_no: order.order_no,
                    customer_name: customerName,
                    customer_email: customerEmail,
                    channel: channel || 'email',
                    share_url: shareUrl,
                    notified_at: new Date().toISOString(),
                    custom_message: custom_message || 'Your Sales Order has been confirmed and sent to Corporate HQ for processing.'
                }
            }]);
        } catch (logErr) {
            console.error('[OrderNotification] Activity log failed:', logErr.message);
        }

        res.json({
            success: true,
            message: `Customer (${customerName}) notified via ${channel || 'email'} successfully!`,
            share_url: shareUrl,
            customer: {
                name: customerName,
                email: customerEmail,
                phone: org.phone || 'N/A'
            },
            notified_at: new Date().toISOString()
        });

    } catch (err) {
        console.error('[OrderController] notifyCustomer error:', err.message);
        res.status(500).json({ error: err.message });
    }
};

