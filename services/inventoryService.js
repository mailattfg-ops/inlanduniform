const supabase = require('../config/supabase');

/**
 * Ensures that stock records exist for a product and size.
 * If not, creates one with 0 stock and default threshold.
 */
async function ensureStockRecord(productId, size) {
    if (!productId || !size) return null;

    try {
        const { data: existing, error } = await supabase
            .from('product_stocks')
            .select('*')
            .eq('product_id', productId)
            .eq('size', size)
            .maybeSingle();

        if (error) throw error;
        if (existing) return existing;

        const { data: created, error: createError } = await supabase
            .from('product_stocks')
            .insert([{
                product_id: productId,
                size: size,
                quantity: 0,
                reserved_quantity: 0,
                low_stock_threshold: 5
            }])
            .select()
            .single();

        if (createError) {
            // Handle unique constraint race condition
            if (createError.code === '23505') {
                const { data: reload, error: reloadError } = await supabase
                    .from('product_stocks')
                    .select('*')
                    .eq('product_id', productId)
                    .eq('size', size)
                    .single();
                if (reloadError) throw reloadError;
                return reload;
            }
            throw createError;
        }
        return created;
    } catch (err) {
        console.error(`[InventoryService] ensureStockRecord Error for Product: ${productId}, Size: ${size}:`, err.message);
        throw err;
    }
}

/**
 * Allocates (reserves) stock for a newly placed order.
 */
async function allocateStockForOrder(orderId) {
    console.log(`[InventoryService] Allocating stock for Order ID: ${orderId}`);
    try {
        // 1. Fetch order details to get quotation items
        const { data: order, error: orderError } = await supabase
            .from('orders')
            .select('id, quotation_id, order_no')
            .eq('id', orderId)
            .single();
            
        if (orderError || !order) {
            throw new Error(orderError?.message || 'Order not found');
        }

        // 2. Fetch quotation items for this order's quotation
        const { data: items, error: itemsError } = await supabase
            .from('quotation_items')
            .select('*')
            .eq('quotation_id', order.quotation_id);

        if (itemsError) throw itemsError;

        // 3. For each quotation item, resolve products and sizes
        for (const item of (items || [])) {
            const sizeBreakdown = item.size_breakdown || {};
            
            let productId = sizeBreakdown.product_id || item.product_id;
            
            if (!productId) {
                const { data: matchedProds } = await supabase
                    .from('products')
                    .select('id')
                    .eq('product_type_id', item.product_type_id)
                    .limit(1);
                if (matchedProds && matchedProds.length > 0) {
                    productId = matchedProds[0].id;
                }
            }

            if (!productId) {
                console.warn(`[InventoryService] No product found for product_type_id: ${item.product_type_id}. Skipping allocation.`);
                continue;
            }

            // Resolve sizes & quantities to reserve
            const sizesToReserve = {};
            let hasSizeKeys = false;
            
            const standardSizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
            for (const [key, val] of Object.entries(sizeBreakdown)) {
                if (standardSizes.includes(key.toUpperCase()) && typeof val === 'number') {
                    sizesToReserve[key.toUpperCase()] = val;
                    hasSizeKeys = true;
                }
            }

            if (!hasSizeKeys) {
                sizesToReserve['M'] = item.quantity || 1;
            }

            for (const [size, qty] of Object.entries(sizesToReserve)) {
                const stock = await ensureStockRecord(productId, size);
                if (!stock) continue;

                // Increment reserved_quantity
                const newReserved = (stock.reserved_quantity || 0) + qty;
                await supabase
                    .from('product_stocks')
                    .update({ 
                        reserved_quantity: newReserved,
                        updated_at: new Date()
                    })
                    .eq('id', stock.id);

                console.log(`[InventoryService] Reserved ${qty} units of Product: ${productId}, Size: ${size} (Total Reserved: ${newReserved})`);
            }
        }
    } catch (err) {
        console.error(`[InventoryService] allocateStockForOrder Error for Order ID: ${orderId}:`, err.message);
        throw err;
    }
}

/**
 * Reduces actual physical stock when an order is fulfilled/completed (e.g. Shipped or Delivered).
 */
async function fulfillStockForOrder(orderId) {
    console.log(`[InventoryService] Fulfilling stock for Order ID: ${orderId}`);
    try {
        const { data: order, error: orderError } = await supabase
            .from('orders')
            .select('id, quotation_id')
            .eq('id', orderId)
            .single();
            
        if (orderError || !order) {
            throw new Error(orderError?.message || 'Order not found');
        }

        const { data: items, error: itemsError } = await supabase
            .from('quotation_items')
            .select('*')
            .eq('quotation_id', order.quotation_id);

        if (itemsError) throw itemsError;

        for (const item of (items || [])) {
            const sizeBreakdown = item.size_breakdown || {};
            let productId = sizeBreakdown.product_id || item.product_id;
            
            if (!productId) {
                const { data: matchedProds } = await supabase
                    .from('products')
                    .select('id')
                    .eq('product_type_id', item.product_type_id)
                    .limit(1);
                if (matchedProds && matchedProds.length > 0) {
                    productId = matchedProds[0].id;
                }
            }

            if (!productId) continue;

            const sizesToFulfill = {};
            let hasSizeKeys = false;
            const standardSizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
            
            for (const [key, val] of Object.entries(sizeBreakdown)) {
                if (standardSizes.includes(key.toUpperCase()) && typeof val === 'number') {
                    sizesToFulfill[key.toUpperCase()] = val;
                    hasSizeKeys = true;
                }
            }

            if (!hasSizeKeys) {
                sizesToFulfill['M'] = item.quantity || 1;
            }

            for (const [size, qty] of Object.entries(sizesToFulfill)) {
                const stock = await ensureStockRecord(productId, size);
                if (!stock) continue;

                // Deduct from physical stock, and release from reserved stock
                const newQty = Math.max(0, (stock.quantity || 0) - qty);
                const newReserved = Math.max(0, (stock.reserved_quantity || 0) - qty);

                await supabase
                    .from('product_stocks')
                    .update({
                        quantity: newQty,
                        reserved_quantity: newReserved,
                        updated_at: new Date()
                    })
                    .eq('id', stock.id);

                console.log(`[InventoryService] Fulfilled ${qty} units of Product: ${productId}, Size: ${size} (Qty: ${newQty}, Reserved: ${newReserved})`);
            }
        }
    } catch (err) {
        console.error(`[InventoryService] fulfillStockForOrder Error for Order ID: ${orderId}:`, err.message);
        throw err;
    }
}

/**
 * Releases reserved stock if an order is cancelled.
 */
async function releaseStockForOrder(orderId) {
    console.log(`[InventoryService] Releasing stock reservations for Order ID: ${orderId}`);
    try {
        const { data: order, error: orderError } = await supabase
            .from('orders')
            .select('id, quotation_id')
            .eq('id', orderId)
            .single();
            
        if (orderError || !order) {
            throw new Error(orderError?.message || 'Order not found');
        }

        const { data: items, error: itemsError } = await supabase
            .from('quotation_items')
            .select('*')
            .eq('quotation_id', order.quotation_id);

        if (itemsError) throw itemsError;

        for (const item of (items || [])) {
            const sizeBreakdown = item.size_breakdown || {};
            let productId = sizeBreakdown.product_id || item.product_id;
            
            if (!productId) {
                const { data: matchedProds } = await supabase
                    .from('products')
                    .select('id')
                    .eq('product_type_id', item.product_type_id)
                    .limit(1);
                if (matchedProds && matchedProds.length > 0) {
                    productId = matchedProds[0].id;
                }
            }

            if (!productId) continue;

            const sizesToRelease = {};
            let hasSizeKeys = false;
            const standardSizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
            
            for (const [key, val] of Object.entries(sizeBreakdown)) {
                if (standardSizes.includes(key.toUpperCase()) && typeof val === 'number') {
                    sizesToRelease[key.toUpperCase()] = val;
                    hasSizeKeys = true;
                }
            }

            if (!hasSizeKeys) {
                sizesToRelease['M'] = item.quantity || 1;
            }

            for (const [size, qty] of Object.entries(sizesToRelease)) {
                const stock = await ensureStockRecord(productId, size);
                if (!stock) continue;

                const newReserved = Math.max(0, (stock.reserved_quantity || 0) - qty);

                await supabase
                    .from('product_stocks')
                    .update({
                        reserved_quantity: newReserved,
                        updated_at: new Date()
                    })
                    .eq('id', stock.id);

                console.log(`[InventoryService] Released reservation of ${qty} units of Product: ${productId}, Size: ${size}`);
            }
        }
    } catch (err) {
        console.error(`[InventoryService] releaseStockForOrder Error for Order ID: ${orderId}:`, err.message);
        throw err;
    }
}

/**
 * Checks if raw fabric stock level is below the low stock threshold.
 * If yes, automatically triggers a consolidated Draft PO for this fabric.
 */
async function checkAndTriggerFabricAutoPO(fabricId) {
    if (!fabricId) return;

    try {
        // Fetch fabric record
        const { data: fabric, error: fetchErr } = await supabase
            .from('fabrics')
            .select('*')
            .eq('id', fabricId)
            .single();

        if (fetchErr || !fabric) {
            console.error(`[InventoryService] Fabric ID ${fabricId} not found.`);
            return;
        }

        const quantity = parseFloat(fabric.quantity || 0);
        const threshold = parseFloat(fabric.low_stock_threshold || 10.00);

        if (quantity < threshold) {
            console.log(`[InventoryService] LOW FABRIC STOCK DETECTED: Fabric: ${fabric.name} (Code: ${fabric.code}). Qty: ${quantity}, Threshold: ${threshold}`);

            // 1. Check if there's already an active (Draft/Ordered) purchase order item for this fabric
            const { data: activePOItems, error: activeErr } = await supabase
                .from('purchase_order_items')
                .select('id, purchase_order_id, purchase_orders(status)')
                .eq('fabric_id', fabricId)
                .eq('status', 'Pending'); // Item hasn't been received yet

            if (activeErr) throw activeErr;

            const hasActivePO = activePOItems && activePOItems.some(item => 
                item.purchase_orders && ['Draft', 'Ordered'].includes(item.purchase_orders.status)
            );

            if (hasActivePO) {
                console.log(`[InventoryService] Active PO already exists for Fabric: ${fabric.name}. Skipping auto-PO trigger.`);
                return;
            }

            // 2. Find or create an auto-triggered Draft PO
            let poId = null;
            let poNumber = null;

            const { data: existingDraftPO, error: draftPOErr } = await supabase
                .from('purchase_orders')
                .select('id, po_number')
                .eq('status', 'Draft')
                .eq('is_auto_triggered', true)
                .limit(1)
                .maybeSingle();

            if (draftPOErr) throw draftPOErr;

            if (existingDraftPO) {
                poId = existingDraftPO.id;
                poNumber = existingDraftPO.po_number;
                console.log(`[InventoryService] Consolidating auto-PO item into draft PO: ${poNumber}`);
            } else {
                poNumber = `PO-AUTO-${Date.now().toString().slice(-6)}`;
                const { data: newPO, error: newPOErr } = await supabase
                    .from('purchase_orders')
                    .insert([{
                        po_number: poNumber,
                        status: 'Draft',
                        supplier_name: 'Fabric Auto-Replenish System',
                        notes: 'Automatically generated due to low fabric stock levels.',
                        is_auto_triggered: true
                    }])
                    .select()
                    .single();

                if (newPOErr) throw newPOErr;
                poId = newPO.id;
                console.log(`[InventoryService] Created new draft auto-PO: ${poNumber}`);
            }

            // 3. Add PO item. Reorder Qty = max(50, threshold * 2) in meters/yards
            const reorderQty = Math.max(50.00, threshold * 2.00);

            const { error: insertItemErr } = await supabase
                .from('purchase_order_items')
                .insert([{
                    purchase_order_id: poId,
                    fabric_id: fabricId,
                    quantity: reorderQty,
                    status: 'Pending'
                }]);

            if (insertItemErr) {
                if (insertItemErr.code === '23505') {
                    // Already in this PO
                    return;
                }
                throw insertItemErr;
            }

            console.log(`[InventoryService] Successfully triggered PO item: ${reorderQty} meters of Fabric: ${fabric.name} added to ${poNumber}`);
        }
    } catch (err) {
        console.error(`[InventoryService] checkAndTriggerFabricAutoPO Error for Fabric: ${fabricId}:`, err.message);
    }
}

module.exports = {
    ensureStockRecord,
    allocateStockForOrder,
    fulfillStockForOrder,
    releaseStockForOrder,
    checkAndTriggerFabricAutoPO
};
