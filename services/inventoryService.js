const supabase = require("../config/supabase");

/**
 * Ensures that stock records exist for a product and size.
 * If not, creates one with 0 stock and default threshold.
 */
async function ensureStockRecord(productId, size) {
  if (!productId || !size) return null;

  try {
    const { data: existing, error } = await supabase
      .from("product_stocks")
      .select("*")
      .eq("product_id", productId)
      .eq("size", size)
      .maybeSingle();

    if (error) throw error;
    if (existing) return existing;

    const { data: created, error: createError } = await supabase
      .from("product_stocks")
      .insert([
        {
          product_id: productId,
          size: size,
          quantity: 0,
          reserved_quantity: 0,
          low_stock_threshold: 5,
        },
      ])
      .select()
      .single();

    if (createError) {
      // Handle unique constraint race condition
      if (createError.code === "23505") {
        const { data: reload, error: reloadError } = await supabase
          .from("product_stocks")
          .select("*")
          .eq("product_id", productId)
          .eq("size", size)
          .single();
        if (reloadError) throw reloadError;
        return reload;
      }
      throw createError;
    }
    return created;
  } catch (err) {
    console.error(
      `[InventoryService] ensureStockRecord Error for Product: ${productId}, Size: ${size}:`,
      err.message,
    );
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
      .from("orders")
      .select("id, quotation_id, order_no")
      .eq("id", orderId)
      .single();

    if (orderError || !order) {
      throw new Error(orderError?.message || "Order not found");
    }

    // 2. Fetch quotation items for this order's quotation
    const { data: items, error: itemsError } = await supabase
      .from("quotation_items")
      .select("*")
      .eq("quotation_id", order.quotation_id);

    if (itemsError) throw itemsError;

    // 3. For each quotation item, resolve products and sizes
    for (const item of items || []) {
      let sizeBreakdown = item.size_breakdown;
      if (!sizeBreakdown && item.notes) {
        try {
          sizeBreakdown = typeof item.notes === "string" ? JSON.parse(item.notes) : item.notes;
        } catch (_) {
          sizeBreakdown = {};
        }
      }
      sizeBreakdown = sizeBreakdown || {};

      const productTypeId = item.product_type_id || sizeBreakdown.product_type_id;
      let productId = sizeBreakdown.product_id || item.product_id;

      if (!productId && productTypeId) {
        const { data: matchedProds } = await supabase
          .from("products")
          .select("id")
          .eq("product_type_id", productTypeId)
          .limit(1);
        if (matchedProds && matchedProds.length > 0) {
          productId = matchedProds[0].id;
        }
      }

      if (!productId) {
        console.warn(
          `[InventoryService] No product found for product_type_id: ${productTypeId || item.product_type_id}. Skipping allocation.`,
        );
        continue;
      }

      // Resolve sizes & quantities to reserve
      const sizesToReserve = {};
      let hasSizeKeys = false;

      const standardSizes = ["XS", "S", "M", "L", "XL", "XXL", "XXXL"];
      for (const [key, val] of Object.entries(sizeBreakdown)) {
        if (
          standardSizes.includes(key.toUpperCase()) &&
          typeof val === "number"
        ) {
          sizesToReserve[key.toUpperCase()] = val;
          hasSizeKeys = true;
        }
      }

      if (!hasSizeKeys) {
        sizesToReserve["M"] = item.quantity || 1;
      }

      for (const [size, qty] of Object.entries(sizesToReserve)) {
        const stock = await ensureStockRecord(productId, size);
        if (!stock) continue;

        // Increment reserved_quantity
        const newReserved = (stock.reserved_quantity || 0) + qty;
        await supabase
          .from("product_stocks")
          .update({
            reserved_quantity: newReserved,
            updated_at: new Date(),
          })
          .eq("id", stock.id);

        console.log(
          `[InventoryService] Reserved ${qty} units of Product: ${productId}, Size: ${size} (Total Reserved: ${newReserved})`,
        );
      }
    }
  } catch (err) {
    console.error(
      `[InventoryService] allocateStockForOrder Error for Order ID: ${orderId}:`,
      err.message,
    );
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
      .from("orders")
      .select("id, quotation_id")
      .eq("id", orderId)
      .single();

    if (orderError || !order) {
      throw new Error(orderError?.message || "Order not found");
    }

    const { data: items, error: itemsError } = await supabase
      .from("quotation_items")
      .select("*")
      .eq("quotation_id", order.quotation_id);

    if (itemsError) throw itemsError;

    for (const item of items || []) {
      const sizeBreakdown = item.size_breakdown || {};
      let productId = sizeBreakdown.product_id || item.product_id;

      if (!productId) {
        const { data: matchedProds } = await supabase
          .from("products")
          .select("id")
          .eq("product_type_id", item.product_type_id)
          .limit(1);
        if (matchedProds && matchedProds.length > 0) {
          productId = matchedProds[0].id;
        }
      }

      if (!productId) continue;

      const sizesToFulfill = {};
      let hasSizeKeys = false;
      const standardSizes = ["XS", "S", "M", "L", "XL", "XXL", "XXXL"];

      for (const [key, val] of Object.entries(sizeBreakdown)) {
        if (
          standardSizes.includes(key.toUpperCase()) &&
          typeof val === "number"
        ) {
          sizesToFulfill[key.toUpperCase()] = val;
          hasSizeKeys = true;
        }
      }

      if (!hasSizeKeys) {
        sizesToFulfill["M"] = item.quantity || 1;
      }

      for (const [size, qty] of Object.entries(sizesToFulfill)) {
        const stock = await ensureStockRecord(productId, size);
        if (!stock) continue;

        // Deduct from physical stock, and release from reserved stock
        const newQty = Math.max(0, (stock.quantity || 0) - qty);
        const newReserved = Math.max(0, (stock.reserved_quantity || 0) - qty);

        await supabase
          .from("product_stocks")
          .update({
            quantity: newQty,
            reserved_quantity: newReserved,
            updated_at: new Date(),
          })
          .eq("id", stock.id);

        console.log(
          `[InventoryService] Fulfilled ${qty} units of Product: ${productId}, Size: ${size} (Qty: ${newQty}, Reserved: ${newReserved})`,
        );
      }
    }
  } catch (err) {
    console.error(
      `[InventoryService] fulfillStockForOrder Error for Order ID: ${orderId}:`,
      err.message,
    );
    throw err;
  }
}

/**
 * Releases reserved stock if an order is cancelled.
 */
async function releaseStockForOrder(orderId) {
  console.log(
    `[InventoryService] Releasing stock reservations for Order ID: ${orderId}`,
  );
  try {
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id, quotation_id")
      .eq("id", orderId)
      .single();

    if (orderError || !order) {
      throw new Error(orderError?.message || "Order not found");
    }

    const { data: items, error: itemsError } = await supabase
      .from("quotation_items")
      .select("*")
      .eq("quotation_id", order.quotation_id);

    if (itemsError) throw itemsError;

    for (const item of items || []) {
      const sizeBreakdown = item.size_breakdown || {};
      let productId = sizeBreakdown.product_id || item.product_id;

      if (!productId) {
        const { data: matchedProds } = await supabase
          .from("products")
          .select("id")
          .eq("product_type_id", item.product_type_id)
          .limit(1);
        if (matchedProds && matchedProds.length > 0) {
          productId = matchedProds[0].id;
        }
      }

      if (!productId) continue;

      const sizesToRelease = {};
      let hasSizeKeys = false;
      const standardSizes = ["XS", "S", "M", "L", "XL", "XXL", "XXXL"];

      for (const [key, val] of Object.entries(sizeBreakdown)) {
        if (
          standardSizes.includes(key.toUpperCase()) &&
          typeof val === "number"
        ) {
          sizesToRelease[key.toUpperCase()] = val;
          hasSizeKeys = true;
        }
      }

      if (!hasSizeKeys) {
        sizesToRelease["M"] = item.quantity || 1;
      }

      for (const [size, qty] of Object.entries(sizesToRelease)) {
        const stock = await ensureStockRecord(productId, size);
        if (!stock) continue;

        const newReserved = Math.max(0, (stock.reserved_quantity || 0) - qty);

        await supabase
          .from("product_stocks")
          .update({
            reserved_quantity: newReserved,
            updated_at: new Date(),
          })
          .eq("id", stock.id);

        console.log(
          `[InventoryService] Released reservation of ${qty} units of Product: ${productId}, Size: ${size}`,
        );
      }
    }
  } catch (err) {
    console.error(
      `[InventoryService] releaseStockForOrder Error for Order ID: ${orderId}:`,
      err.message,
    );
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
      .from("fabrics")
      .select("*")
      .eq("id", fabricId)
      .single();

    if (fetchErr || !fabric) {
      console.error(`[InventoryService] Fabric ID ${fabricId} not found.`);
      return;
    }

    const quantity = parseFloat(fabric.quantity || 0);
    const threshold = parseFloat(fabric.low_stock_threshold || 10.0);

    if (quantity < threshold) {
      console.log(
        `[InventoryService] LOW FABRIC STOCK DETECTED: Fabric: ${fabric.name} (Code: ${fabric.code}). Qty: ${quantity}, Threshold: ${threshold}`,
      );

      // 1. Check if there's already an active (Draft/Ordered) purchase order item for this fabric
      const { data: activePOItems, error: activeErr } = await supabase
        .from("purchase_order_items")
        .select("id, purchase_order_id, purchase_orders(status)")
        .eq("fabric_id", fabricId)
        .eq("status", "Pending"); // Item hasn't been received yet

      if (activeErr) throw activeErr;

      const hasActivePO =
        activePOItems &&
        activePOItems.some(
          (item) =>
            item.purchase_orders &&
            ["Draft", "Ordered"].includes(item.purchase_orders.status),
        );

      if (hasActivePO) {
        console.log(
          `[InventoryService] Active PO already exists for Fabric: ${fabric.name}. Skipping auto-PO trigger.`,
        );
        return;
      }

      // 2. Find or create an auto-triggered Draft PO
      let poId = null;
      let poNumber = null;

      const { data: existingDraftPO, error: draftPOErr } = await supabase
        .from("purchase_orders")
        .select("id, po_number")
        .eq("status", "Draft")
        .eq("is_auto_triggered", true)
        .limit(1)
        .maybeSingle();

      if (draftPOErr) throw draftPOErr;

      if (existingDraftPO) {
        poId = existingDraftPO.id;
        poNumber = existingDraftPO.po_number;
        console.log(
          `[InventoryService] Consolidating auto-PO item into draft PO: ${poNumber}`,
        );
      } else {
        poNumber = `PO-AUTO-${Date.now().toString().slice(-6)}`;
        const { data: newPO, error: newPOErr } = await supabase
          .from("purchase_orders")
          .insert([
            {
              po_number: poNumber,
              status: "Draft",
              supplier_name: "Fabric Auto-Replenish System",
              notes: "Automatically generated due to low fabric stock levels.",
              is_auto_triggered: true,
            },
          ])
          .select()
          .single();

        if (newPOErr) throw newPOErr;
        poId = newPO.id;
        console.log(
          `[InventoryService] Created new draft auto-PO: ${poNumber}`,
        );
      }

      // 3. Add PO item. Reorder Qty = max(50, threshold * 2) in meters/yards
      const reorderQty = Math.max(50.0, threshold * 2.0);

      const { error: insertItemErr } = await supabase
        .from("purchase_order_items")
        .insert([
          {
            purchase_order_id: poId,
            fabric_id: fabricId,
            quantity: reorderQty,
            status: "Pending",
          },
        ]);

      if (insertItemErr) {
        if (insertItemErr.code === "23505") {
          // Already in this PO
          return;
        }
        throw insertItemErr;
      }

      console.log(
        `[InventoryService] Successfully triggered PO item: ${reorderQty} meters of Fabric: ${fabric.name} added to ${poNumber}`,
      );
    }
  } catch (err) {
    console.error(
      `[InventoryService] checkAndTriggerFabricAutoPO Error for Fabric: ${fabricId}:`,
      err.message,
    );
  }
}

/**
 * Helper to accumulate numeric quantities in a Map
 */
function accumulate(map, key, qty) {
  if (!key || isNaN(qty) || qty <= 0) return;
  const current = map.get(key) || 0;
  map.set(key, current + qty);
}

/**
 * Analyzes BOM requirements (fabrics & trims) for a Sales Order
 * and compares against current stock levels.
 */
async function checkOrderMaterialFeasibility(orderId) {
  console.log(`[InventoryService] Checking material feasibility for Order ID: ${orderId}`);
  try {
    // 1. Fetch Order details
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, order_no, quotation_id')
      .eq('id', orderId)
      .maybeSingle();

    if (orderError || !order) {
      console.warn(`[InventoryService] Order #${orderId} not found.`);
      return {
        order_id: orderId,
        order_no: '',
        is_sufficient: true,
        shortage_items_count: 0,
        fabrics: [],
        trims: [],
        shortages: []
      };
    }

    // 2. Fetch quotation items
    const { data: items, error: itemsError } = await supabase
      .from('quotation_items')
      .select('*')
      .eq('quotation_id', order.quotation_id);

    if (itemsError || !items || items.length === 0) {
      console.log(`[InventoryService] No quotation items found for quotation #${order.quotation_id}.`);
      return {
        order_id: orderId,
        order_no: order.order_no,
        is_sufficient: true,
        shortage_items_count: 0,
        fabrics: [],
        trims: [],
        shortages: []
      };
    }

    // Hydrate size_breakdown if stored as string or in notes
    const hydratedItems = (items || []).map(it => {
      if ((!it.size_breakdown || typeof it.size_breakdown !== 'object') && it.notes && typeof it.notes === 'string' && it.notes.startsWith('{')) {
        try {
          it.size_breakdown = JSON.parse(it.notes);
        } catch (e) {}
      } else if (typeof it.size_breakdown === 'string' && it.size_breakdown.startsWith('{')) {
        try {
          it.size_breakdown = JSON.parse(it.size_breakdown);
        } catch (e) {}
      }
      return it;
    });

    // 3. Resolve products for line items (both explicit product_id and fallback by product_type_id)
    const productIds = Array.from(new Set(
      hydratedItems.map(i => i.product_id || i.size_breakdown?.product_id).filter(Boolean)
    ));

    const productsMap = new Map();
    if (productIds.length > 0) {
      const { data: prods } = await supabase
        .from('products')
        .select('*')
        .in('id', productIds);

      (prods || []).forEach(p => productsMap.set(p.id, p));
    }

    // Also resolve by product_type_id for any line items lacking explicit product_id
    const typeIdsToResolve = Array.from(new Set(
      hydratedItems.filter(i => !i.product_id && !i.size_breakdown?.product_id && i.product_type_id).map(i => i.product_type_id)
    ));
    if (typeIdsToResolve.length > 0) {
      const { data: typeProds } = await supabase
        .from('products')
        .select('*')
        .in('product_type_id', typeIdsToResolve);

      (typeProds || []).forEach(p => {
        if (!productsMap.has(p.id)) productsMap.set(p.id, p);
        if (!productsMap.has(`type_${p.product_type_id}`)) productsMap.set(`type_${p.product_type_id}`, p);
      });
    }

    // Fetch available fabrics (safe select all columns to prevent column name errors)
    const { data: allFabrics } = await supabase.from('fabrics').select('*');
    const defaultFabric = allFabrics && allFabrics.length > 0 ? allFabrics[0] : null;

    // Fetch available trims (safe select all columns)
    const { data: allTrims } = await supabase.from('trims').select('*');

    // Also fetch legacy buttons and threads if those separate tables exist
    let allButtons = [];
    try {
      const { data: btns } = await supabase.from('buttons').select('*');
      if (btns) allButtons = btns;
    } catch (e) {}

    let allThreads = [];
    try {
      const { data: thrds } = await supabase.from('threads').select('*');
      if (thrds) allThreads = thrds;
    } catch (e) {}

    const requiredFabrics = new Map(); // fabric_id -> total_meters
    const requiredTrims = new Map();   // trim_id -> total_units

    const isValidTrimIdentifier = (id) => {
      if (!id) return false;
      const clean = String(id).trim().toLowerCase();
      if (!clean || clean === 'btn' || clean === 'thr' || clean === 'trim' || clean === 'null' || clean === 'undefined' || clean === 'none' || clean === '0') {
        return false;
      }
      return true;
    };

    // 4. Calculate total required amounts across items
    for (const item of hydratedItems) {
      const qty = parseInt(item.quantity, 10) || 1;
      const sb = item.size_breakdown || {};
      const productId = item.product_id || sb.product_id;
      const prod = productsMap.get(productId) || (item.product_type_id ? productsMap.get(`type_${item.product_type_id}`) : null);

      // --- STANDALONE / SEPARATE FABRICS RESOLUTION ---
      if (sb.is_separate_fabric === true || item.is_separate_fabric === true) {
        const sepFabricId = item.fabric_id || sb.fabric_id;
        const sepMeters = parseFloat(sb.meters || item.quantity || 0);
        if (sepFabricId && sepMeters > 0) {
          accumulate(requiredFabrics, sepFabricId, sepMeters);
        }
        continue; // Skip garment attachment/trims calculation for standalone fabrics
      }

      // --- FABRIC RESOLUTION (STRICT: ONLY CONFIGURED FABRICS, NO RANDOM GUESSES) ---
      const fabricId = 
        item.fabric_id || 
        sb.fabric_id || 
        sb.main_fabric_id || 
        prod?.fabric_id ||
        prod?.main_fabric_id || 
        prod?.class_fabric_consumption?._base_main_fabric_id;

      if (fabricId) {
        let mainMeters = null;
        if (sb.main_fabric_meters != null && sb.main_fabric_meters !== '') {
          mainMeters = parseFloat(sb.main_fabric_meters);
        } else if (item.main_fabric_meters != null && item.main_fabric_meters !== '') {
          mainMeters = parseFloat(item.main_fabric_meters);
        } else if (item.fabric_consumption != null && item.fabric_consumption !== '') {
          mainMeters = parseFloat(item.fabric_consumption);
        } else if (prod?.main_fabric != null && prod?.main_fabric !== '') {
          mainMeters = parseFloat(prod.main_fabric);
        } else if (prod?.class_fabric_consumption?._base_main_fabric != null) {
          mainMeters = parseFloat(prod.class_fabric_consumption._base_main_fabric);
        }

        if (mainMeters != null && !isNaN(mainMeters) && mainMeters > 0) {
          accumulate(requiredFabrics, fabricId, qty * mainMeters);
        }
      }

      // --- ATTACHMENT FABRICS RESOLUTION (STRICT: ONLY IF SPECIFIED) ---
      const att1Id = item.attachment_fabric1_id || sb.attachment_fabric1_id;
      if (att1Id) {
        let m1 = 0;
        if (sb.attachment_fabric1_meters != null && sb.attachment_fabric1_meters !== '') m1 = parseFloat(sb.attachment_fabric1_meters);
        else if (item.attachment_fabric1_meters != null && item.attachment_fabric1_meters !== '') m1 = parseFloat(item.attachment_fabric1_meters);
        else if (item.attachment_fabric1 != null && item.attachment_fabric1 !== '') m1 = parseFloat(item.attachment_fabric1);
        else if (sb.attachment_fabric1 != null && sb.attachment_fabric1 !== '') m1 = parseFloat(sb.attachment_fabric1);
        else if (prod?.attachment_fabric1 != null) m1 = parseFloat(prod.attachment_fabric1);

        if (m1 > 0) {
          accumulate(requiredFabrics, att1Id, qty * m1);
        }
      }

      const att2Id = item.attachment_fabric2_id || sb.attachment_fabric2_id;
      if (att2Id) {
        let m2 = 0;
        if (sb.attachment_fabric2_meters != null && sb.attachment_fabric2_meters !== '') m2 = parseFloat(sb.attachment_fabric2_meters);
        else if (item.attachment_fabric2_meters != null && item.attachment_fabric2_meters !== '') m2 = parseFloat(item.attachment_fabric2_meters);
        else if (item.attachment_fabric2 != null && item.attachment_fabric2 !== '') m2 = parseFloat(item.attachment_fabric2);
        else if (sb.attachment_fabric2 != null && sb.attachment_fabric2 !== '') m2 = parseFloat(sb.attachment_fabric2);
        else if (prod?.attachment_fabric2 != null) m2 = parseFloat(prod.attachment_fabric2);

        if (m2 > 0) {
          accumulate(requiredFabrics, att2Id, qty * m2);
        }
      }

      // Dynamic attachment fabrics (from item or size breakdown)
      const dynamicAttFabrics = Array.isArray(item.attachment_fabrics) ? item.attachment_fabrics :
        (Array.isArray(sb.attachment_fabrics) ? sb.attachment_fabrics : []);

      for (const af of dynamicAttFabrics) {
        const afId = af.fabric_id || af.id;
        const afMeters = parseFloat(af.meters || af.quantity || 0);
        if (afId && afMeters > 0 && String(afId) !== String(att1Id) && String(afId) !== String(att2Id)) {
          accumulate(requiredFabrics, afId, qty * afMeters);
        }
      }

      // --- TRIMS RESOLUTION (STRICT & ACCURATE) ---
      const itemProcessedTrims = new Set();

      // Case A: The item or size_breakdown has an explicit trims array (even if empty [])
      const hasExplicitItemTrims = Array.isArray(item.trims) || Array.isArray(sb.trims);
      if (hasExplicitItemTrims) {
        const itemTrimsList = Array.isArray(item.trims) ? item.trims : sb.trims;
        for (const t of itemTrimsList) {
          const rawId = t.trim_id || t.id;
          if (!isValidTrimIdentifier(rawId)) continue;
          const cleanTrimId = String(rawId).trim();
          if (itemProcessedTrims.has(cleanTrimId)) continue;
          const countPerUnit = parseFloat(t.quantity !== undefined ? t.quantity : (t.count || 0));
          if (countPerUnit > 0) {
            accumulate(requiredTrims, cleanTrimId, qty * countPerUnit);
            itemProcessedTrims.add(cleanTrimId);
          }
        }
      } else {
        // Case B: No explicit trims array - check specific button_id and thread_id if provided
        const buttonId = item.button_id || sb.button_id;
        if (isValidTrimIdentifier(buttonId)) {
          let buttonCount = 0;
          if (item.button_count != null && item.button_count !== '') buttonCount = parseFloat(item.button_count);
          else if (sb.button_count != null && sb.button_count !== '') buttonCount = parseFloat(sb.button_count);
          else if (prod?.button_count != null) buttonCount = parseFloat(prod.button_count);

          if (buttonCount > 0) {
            accumulate(requiredTrims, String(buttonId).trim(), qty * buttonCount);
            itemProcessedTrims.add(String(buttonId).trim());
          }
        }

        const threadId = item.thread_id || sb.thread_id;
        if (isValidTrimIdentifier(threadId)) {
          let threadCount = 0;
          if (item.thread_count != null && item.thread_count !== '') threadCount = parseFloat(item.thread_count);
          else if (sb.thread_count != null && sb.thread_count !== '') threadCount = parseFloat(sb.thread_count);
          else if (prod?.thread_count != null) threadCount = parseFloat(prod.thread_count);

          if (threadCount > 0) {
            accumulate(requiredTrims, String(threadId).trim(), qty * threadCount);
            itemProcessedTrims.add(String(threadId).trim());
          }
        }

        // Only fall back to catalog product trims if this is a standard catalog product (not a manual custom item)
        if (!item.is_manual && !sb.is_manual && Array.isArray(prod?.trims) && prod.trims.length > 0) {
          for (const t of prod.trims) {
            const rawId = t.trim_id || t.id;
            if (!isValidTrimIdentifier(rawId)) continue;
            const cleanTrimId = String(rawId).trim();
            if (itemProcessedTrims.has(cleanTrimId)) continue;
            const countPerUnit = parseFloat(t.quantity !== undefined ? t.quantity : (t.count || 0));
            if (countPerUnit > 0) {
              accumulate(requiredTrims, cleanTrimId, qty * countPerUnit);
              itemProcessedTrims.add(cleanTrimId);
            }
          }
        }
      }
    }

    // 5. Query live stock in fabrics table
    const fabricReports = [];
    for (const [fabricId, reqQty] of requiredFabrics.entries()) {
      let fabric = (allFabrics || []).find(f => String(f.id) === String(fabricId) || String(f.code) === String(fabricId));
      if (!fabric) {
        const { data: dbFab } = await supabase.from('fabrics').select('*').eq('id', fabricId).maybeSingle();
        fabric = dbFab;
      }

      const available = parseFloat(
        fabric?.quantity !== undefined && fabric?.quantity !== null 
          ? fabric.quantity 
          : (fabric?.meters !== undefined && fabric?.meters !== null ? fabric.meters : 0)
      );
      const reqRounded = parseFloat(reqQty.toFixed(2));
      const shortage = Math.max(0, parseFloat((reqRounded - available).toFixed(2)));
      const reorderQty = parseFloat(shortage.toFixed(2)); // Exact required - existing in inventory

      fabricReports.push({
        type: 'fabric',
        id: fabric?.id || fabricId,
        name: fabric?.name || (fabric?.brand_name ? `${fabric.brand_name} Fabric` : 'Fabric'),
        code: fabric?.code || '',
        required: reqRounded,
        available: parseFloat(available.toFixed(2)),
        shortage: parseFloat(shortage.toFixed(2)),
        reorder_quantity: reorderQty,
        unit_price: parseFloat(fabric?.unit_price || 0),
        unit: 'meters'
      });
    }

    // 6. Query live stock in trims table (with fallback to buttons/threads and prefix handling)
    const trimReports = [];
    for (const [trimId, reqQty] of requiredTrims.entries()) {
      const rawTrimId = String(trimId).trim();
      const strippedId = rawTrimId.replace(/^(btn_|thr_|trim_)/i, '');

      let trim = (allTrims || []).find(t => 
        String(t.id) === rawTrimId || String(t.id) === strippedId || String(t.code) === rawTrimId
      );

      if (!trim && (rawTrimId.toLowerCase().startsWith('btn_') || allButtons.length > 0)) {
        trim = (allButtons || []).find(b => 
          String(b.id) === rawTrimId || String(b.id) === strippedId || String(b.code) === rawTrimId
        );
      }

      if (!trim && (rawTrimId.toLowerCase().startsWith('thr_') || allThreads.length > 0)) {
        trim = (allThreads || []).find(th => 
          String(th.id) === rawTrimId || String(th.id) === strippedId || String(th.code) === rawTrimId
        );
      }

      if (!trim) {
        try {
          const { data: dbTrim } = await supabase.from('trims').select('*').or(`id.eq.${strippedId},code.eq.${rawTrimId}`).maybeSingle();
          if (dbTrim) trim = dbTrim;
        } catch (trimErr) {}
      }
      if (!trim) {
        try {
          const { data: dbBtn } = await supabase.from('buttons').select('*').or(`id.eq.${strippedId},code.eq.${rawTrimId}`).maybeSingle();
          if (dbBtn) trim = dbBtn;
        } catch (btnErr) {}
      }
      if (!trim) {
        try {
          const { data: dbThrd } = await supabase.from('threads').select('*').or(`id.eq.${strippedId},code.eq.${rawTrimId}`).maybeSingle();
          if (dbThrd) trim = dbThrd;
        } catch (thrdErr) {}
      }

      const available = parseFloat(
        trim?.quantity !== undefined && trim?.quantity !== null ? trim.quantity : 0
      );
      const reqRounded = parseFloat(reqQty.toFixed(2));
      const shortage = Math.max(0, parseFloat((reqRounded - available).toFixed(2)));
      const reorderUnits = Math.ceil(shortage); // Trims are discrete whole units

      trimReports.push({
        type: 'trim',
        id: trim?.id || rawTrimId,
        name: trim?.name || (rawTrimId.startsWith('btn_') ? 'Button' : rawTrimId.startsWith('thr_') ? 'Thread' : 'Trim'),
        code: trim?.code || '',
        required: reqRounded,
        available: parseFloat(available.toFixed(2)),
        shortage: parseFloat(shortage.toFixed(2)),
        reorder_quantity: reorderUnits,
        unit_price: parseFloat(trim?.unit_price || 0),
        unit: trim?.uom || trim?.unit || 'pcs'
      });
    }

    const allShortages = [...fabricReports, ...trimReports].filter(i => i.reorder_quantity > 0);

    // Build Product Summary for clear display across all stages
    const productsSummary = hydratedItems.map(item => {
      const sb = item.size_breakdown || {};
      const productId = item.product_id || sb.product_id;
      const prod = productsMap.get(productId) || (item.product_type_id ? productsMap.get(`type_${item.product_type_id}`) : null);

      const fabricId = item.fabric_id || sb.fabric_id || sb.main_fabric_id || prod?.fabric_id || prod?.main_fabric_id;
      const fabricObj = (allFabrics || []).find(f => String(f.id) === String(fabricId));

      const att1 = (allFabrics || []).find(f => String(f.id) === String(item.attachment_fabric1_id || sb.attachment_fabric1_id || prod?.attachment_fabric1_id));
      const att2 = (allFabrics || []).find(f => String(f.id) === String(item.attachment_fabric2_id || sb.attachment_fabric2_id || prod?.attachment_fabric2_id));

      const attNames = [att1?.name, att2?.name].filter(Boolean);

      const resolvedProdName = item.product_name || sb.product_name || item.manual_item_name || prod?.name || item.product_type_name || prod?.product_types?.name || (sb.is_separate_fabric ? 'Fabric Only' : 'Garment Item');

      return {
        id: item.id,
        product_name: resolvedProdName,
        product_type_id: item.product_type_id,
        quantity: parseInt(item.quantity, 10) || 1,
        unit_price: parseFloat(item.unit_price || 0),
        total_price: parseFloat(item.total_price || 0),
        size_breakdown: sb.sizes || sb || {},
        main_fabric: fabricObj ? `${fabricObj.name} (${fabricObj.code || ''})` : (prod?.main_fabric ? `${prod.main_fabric}m` : 'Main Fabric'),
        attachment_fabrics: attNames.length > 0 ? attNames.join(', ') : 'None'
      };
    });

    console.log(`[InventoryService] Order #${orderId} Feasibility Result: ${allShortages.length} shortage items detected (Sufficient: ${allShortages.length === 0}).`);

    return {
      order_id: orderId,
      order_no: order.order_no,
      is_sufficient: allShortages.length === 0,
      shortage_items_count: allShortages.length,
      products: productsSummary,
      fabrics: fabricReports,
      trims: trimReports,
      shortages: allShortages
    };
  } catch (err) {
    console.error(`[InventoryService] checkOrderMaterialFeasibility Error for Order ID ${orderId}:`, err.message);
    throw err;
  }
}

/**
 * Automatically creates a consolidated Draft PO for raw material deficits
 * with quantities rounded up to integer values.
 */
async function createAutoPOForOrderShortages(orderId, shortages, userId = null) {
  if (!shortages || shortages.length === 0) return null;

  console.log(`[InventoryService] Generating auto-PO for Order ID: ${orderId} (${shortages.length} shortage items)`);
  try {
    const { data: order } = await supabase
      .from('orders')
      .select('id, order_no, order_notes')
      .eq('id', orderId)
      .maybeSingle();

    const cleanOrderNo = (order?.order_no || `ORD-${orderId}`).replace(/[^A-Za-z0-9]/g, '');
    const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
    const poNumber = `PO-AUTO-${cleanOrderNo}-${randomSuffix}`;

    // Calculate estimated total amount
    let totalAmount = 0;
    for (const item of shortages) {
      const reorderQty = item.reorder_quantity !== undefined 
        ? item.reorder_quantity 
        : (item.type === 'fabric' ? parseFloat(item.shortage.toFixed(2)) : Math.ceil(item.shortage));
      const unitPrice = parseFloat(item.unit_price || 0);
      totalAmount += reorderQty * unitPrice;
    }
    totalAmount = parseFloat(totalAmount.toFixed(2));

    // Resolve default vendor if table exists
    let defaultVendorId = null;
    try {
      const { data: vendorList } = await supabase.from('vendors').select('id').limit(1);
      if (vendorList && vendorList.length > 0) {
        defaultVendorId = vendorList[0].id;
      }
    } catch (vErr) {}

    // 1. Insert Purchase Order Header with multi-tier schema fallbacks
    let createdPO = null;
    const headerAttempts = [
      // Attempt 1: Full modern schema (with sales_order_id, supplier_name, is_auto_triggered)
      {
        po_number: poNumber,
        status: 'Draft',
        supplier_name: 'Raw Materials Auto-Replenishment',
        notes: `Auto-generated for Sales Order #${order?.order_no || orderId} due to raw material deficits.`,
        is_auto_triggered: true,
        sales_order_id: orderId,
        total_amount: totalAmount,
        ...(defaultVendorId ? { vendor_id: defaultVendorId } : {})
      },
      // Attempt 2: Without sales_order_id
      {
        po_number: poNumber,
        status: 'Draft',
        supplier_name: 'Raw Materials Auto-Replenishment',
        notes: `Auto-generated for Sales Order #${order?.order_no || orderId} due to raw material deficits.`,
        is_auto_triggered: true,
        total_amount: totalAmount,
        ...(defaultVendorId ? { vendor_id: defaultVendorId } : {})
      },
      // Attempt 3: Schema A (vendor_id, status Pending, total_amount, notes)
      {
        po_number: poNumber,
        status: 'Pending',
        notes: `Auto-generated for Sales Order #${order?.order_no || orderId} due to raw material deficits.`,
        total_amount: totalAmount,
        ...(defaultVendorId ? { vendor_id: defaultVendorId } : {})
      },
      // Attempt 4: Minimal with status Draft
      {
        po_number: poNumber,
        status: 'Draft',
        notes: `Auto-generated for Sales Order #${order?.order_no || orderId} due to raw material deficits.`
      },
      // Attempt 5: Absolute minimal (only po_number & notes)
      {
        po_number: poNumber,
        notes: `Auto-generated for Sales Order #${order?.order_no || orderId} due to raw material deficits.`
      }
    ];

    for (const payload of headerAttempts) {
      const { data, error } = await supabase
        .from('purchase_orders')
        .insert([payload])
        .select()
        .maybeSingle();

      if (!error && data) {
        createdPO = data;
        break;
      }
      console.warn(`[InventoryService] PO header insert attempt failed (${error?.message}). Trying next fallback...`);
    }

    if (!createdPO) {
      throw new Error(`Failed to create Purchase Order header for Order #${orderId}`);
    }

    console.log(`[InventoryService] Purchase Order header created: ID ${createdPO.id} (${createdPO.po_number})`);

    // 2. Insert PO Line Items
    const itemsCreated = [];
    const trimNotesFallback = [];

    for (const item of shortages) {
      const reorderQty = item.reorder_quantity !== undefined 
        ? item.reorder_quantity 
        : (item.type === 'fabric' ? parseFloat(item.shortage.toFixed(2)) : Math.ceil(item.shortage));
      if (reorderQty <= 0) continue;
      const unitPrice = parseFloat(item.unit_price || 0);

      if (item.type === 'fabric') {
        const fabricPayloads = [
          {
            purchase_order_id: createdPO.id,
            fabric_id: item.id,
            item_type: 'fabric',
            quantity: reorderQty,
            unit_price: unitPrice,
            status: 'Pending'
          },
          {
            purchase_order_id: createdPO.id,
            fabric_id: item.id,
            quantity: reorderQty,
            unit_price: unitPrice,
            status: 'Pending'
          },
          {
            purchase_order_id: createdPO.id,
            fabric_id: item.id,
            quantity: reorderQty,
            status: 'Pending'
          },
          {
            purchase_order_id: createdPO.id,
            fabric_id: item.id,
            item_type: 'fabric',
            quantity: reorderQty,
            unit_price: unitPrice,
            status: 'Ordered'
          }
        ];

        let inserted = false;
        for (const fp of fabricPayloads) {
          const { data, error } = await supabase
            .from('purchase_order_items')
            .insert([fp])
            .select()
            .maybeSingle();

          if (!error) {
            inserted = true;
            itemsCreated.push(data || fp);
            break;
          }
        }
        if (!inserted) {
          console.warn(`[InventoryService] Could not insert PO item for fabric ${item.name}`);
        }
      } else if (item.type === 'trim') {
        const trimPayloads = [
          {
            purchase_order_id: createdPO.id,
            trim_id: item.id,
            item_type: 'trim',
            quantity: reorderQty,
            unit_price: unitPrice,
            status: 'Pending'
          },
          {
            purchase_order_id: createdPO.id,
            trim_id: item.id,
            item_type: 'trim',
            quantity: reorderQty,
            unit_price: unitPrice,
            status: 'Ordered'
          },
          {
            purchase_order_id: createdPO.id,
            trim_id: item.id,
            quantity: reorderQty,
            unit_price: unitPrice,
            status: 'Pending'
          }
        ];

        let inserted = false;
        for (const tp of trimPayloads) {
          const { data, error } = await supabase
            .from('purchase_order_items')
            .insert([tp])
            .select()
            .maybeSingle();

          if (!error) {
            inserted = true;
            itemsCreated.push(data || tp);
            break;
          }
        }

        if (!inserted) {
          console.warn(`[InventoryService] Could not insert PO item for trim ${item.name} directly. Recording in PO notes.`);
          trimNotesFallback.push(`Trim: ${item.name} (${item.code || ''}) - ${reorderQty} ${item.unit}`);
        }
      }
    }

    // If any trim requirements couldn't be inserted into items table, record into PO notes
    if (trimNotesFallback.length > 0) {
      try {
        const extraNotes = `\n[Auto Trims Required]: ` + trimNotesFallback.join('; ');
        await supabase
          .from('purchase_orders')
          .update({ notes: (createdPO.notes || '') + extraNotes })
          .eq('id', createdPO.id);
      } catch (noteErr) {}
    }

    // 3. Link PO back to Sales Order
    try {
      const updatedNotes = (order?.order_notes ? order.order_notes + ' | ' : '') + `Auto-PO: ${createdPO.po_number}`;
      await supabase
        .from('orders')
        .update({
          auto_po_id: createdPO.id,
          material_status: 'PO Generated',
          order_notes: updatedNotes
        })
        .eq('id', orderId);
    } catch (linkErr) {
      try {
        await supabase
          .from('orders')
          .update({
            order_notes: (order?.order_notes ? order.order_notes + ' | ' : '') + `Auto-PO: ${createdPO.po_number}`
          })
          .eq('id', orderId);
      } catch (nErr) {}
    }

    console.log(`[InventoryService] Successfully created Auto-PO: ${createdPO.po_number} with ${itemsCreated.length} items recorded.`);
    return createdPO;
  } catch (err) {
    console.error(`[InventoryService] createAutoPOForOrderShortages Error for Order ID ${orderId}:`, err.message);
    throw err;
  }
}

module.exports = {
  ensureStockRecord,
  allocateStockForOrder,
  fulfillStockForOrder,
  releaseStockForOrder,
  checkAndTriggerFabricAutoPO,
  checkOrderMaterialFeasibility,
  createAutoPOForOrderShortages
};


