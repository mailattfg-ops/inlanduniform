const supabase = require('../config/supabase');

// 1. List all orders
exports.listOrders = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('orders')
            .select('*, quotations(id, quotation_no, title, final_quote_value, paid_amount, organizations(name))')
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 2. Get single order details
exports.getOrderDetails = async (req, res) => {
    try {
        const { id } = req.params;
        const { data: order, error } = await supabase
            .from('orders')
            .select('*, quotations(id, quotation_no, title, final_quote_value, paid_amount, expected_delivery_date, organizations(name, address))')
            .eq('id', id)
            .single();

        if (error) throw error;
        if (!order) {
            return res.status(404).json({ error: 'Order not found.' });
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

// 3. Create order from a paid quotation
exports.createOrder = async (req, res) => {
    try {
        const { quotation_id, order_notes } = req.body;

        if (!quotation_id) {
            return res.status(400).json({ error: 'Quotation ID is required.' });
        }

        // Fetch quotation status and amount details
        const { data: quotation, error: quoteError } = await supabase
            .from('quotations')
            .select('id, quotation_no, final_quote_value, paid_amount, payment_status')
            .eq('id', quotation_id)
            .single();

        if (quoteError || !quotation) {
            return res.status(404).json({ error: 'Quotation not found.' });
        }

        // Verify quotation has a payment (paid_amount > 0)
        if (!quotation.paid_amount || parseFloat(quotation.paid_amount) <= 0) {
            return res.status(400).json({ 
                error: `Order placement requires a payment to be registered. Current paid amount is $${quotation.paid_amount || 0}.` 
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

        // Generate unique order number and barcode sequence
        const cleanQuoteNo = quotation.quotation_no.replace(/[^A-Za-z0-9]/g, '');
        const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase(); // e.g. "A9BC"
        const order_no = `ORD-${cleanQuoteNo}-${randomSuffix}`;
        const barcode = `BRC-${cleanQuoteNo}-${randomSuffix}`;

        // Insert new order
        const { data: newOrder, error: orderError } = await supabase
            .from('orders')
            .insert([{
                quotation_id,
                order_no,
                barcode,
                status: 'Placed',
                order_notes: order_notes || '',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            }])
            .select()
            .single();

        if (orderError) throw orderError;

        // Allocate stock reservations for the placed order
        try {
            const inventoryService = require('../services/inventoryService');
            await inventoryService.allocateStockForOrder(newOrder.id);
        } catch (stockErr) {
            console.error('[InventoryHook] Stock allocation failed:', stockErr.message);
        }

        // Log action if available
        try {
            const { logAction } = require('../utils/logger');
            await logAction(req.user.id, 'CREATE_ORDER', 'order', newOrder.id, {
                quotation_id,
                order_no,
                barcode,
                quotation_no: quotation.quotation_no
            });
        } catch (logErr) {
            console.error('Logging failed:', logErr.message);
        }

        res.json(newOrder);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 4. Update order status (Placed, In Production, Shipped, Delivered)
exports.updateOrderStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, order_notes } = req.body;

        const validStatuses = ['Placed', 'In Production', 'Shipped', 'Delivered'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
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
            if (['Shipped', 'Delivered'].includes(status) && order.status === 'Placed') {
                // Fulfill: physically deduct stock and release reservations
                await inventoryService.fulfillStockForOrder(id);
            } else if (status === 'Cancelled' && order.status === 'Placed') {
                // Cancelled: release reservations
                await inventoryService.releaseStockForOrder(id);
            }
        } catch (stockErr) {
            console.error('[InventoryHook] Stock transition failed:', stockErr.message);
        }

        // Log status change if logger is available
        try {
            const { logAction } = require('../utils/logger');
            await logAction(req.user.id, 'UPDATE_ORDER_STATUS', 'order', id, {
                order_no: order.order_no,
                old_status: order.status,
                new_status: status
            });
        } catch (logErr) {
            console.error('Logging failed:', logErr.message);
        }

        res.json(updatedOrder);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
