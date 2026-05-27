const supabase = require('../config/supabase');

// Local helper to generate the next design number
async function generateNextDesignNumberLocal() {
    try {
        const { data, error } = await supabase
            .from('design_numbers')
            .select('code')
            .not('code', 'is', null);

        if (error) {
            console.error('Error fetching design numbers:', error.message);
            return 'DNS-0001';
        }

        let maxNum = 0;
        if (data && data.length > 0) {
            data.forEach(dnRecord => {
                const dn = dnRecord.code;
                if (dn && dn.startsWith('DNS-')) {
                    const numPart = dn.substring(4);
                    const num = parseInt(numPart, 10);
                    if (!isNaN(num) && num > maxNum) {
                        maxNum = num;
                    }
                }
            });
        }

        const nextNum = maxNum + 1;
        const padded = String(nextNum).padStart(4, '0');
        return `DNS-${padded}`;
    } catch (err) {
        console.error('Exception in generateNextDesignNumberLocal:', err.message);
        return 'DNS-0001';
    }
}

// Local helper to resolve or auto-create variant design numbers
async function resolveOrCreateQuotationItemDesignNumber(item) {
    const productId = item.product_id || (item.size_breakdown && item.size_breakdown.product_id);
    if (!productId) {
        return item.design_number || (item.size_breakdown && item.size_breakdown.design_number) || null;
    }

    const { data: product } = await supabase
        .from('products')
        .select('*, design_numbers(code)')
        .eq('id', productId)
        .maybeSingle();

    if (!product) {
        return item.design_number || (item.size_breakdown && item.size_breakdown.design_number) || null;
    }

    const buttonId = item.button_id || (item.size_breakdown && item.size_breakdown.button_id) || null;
    const threadId = item.thread_id || (item.size_breakdown && item.size_breakdown.thread_id) || null;
    const buttonCount = item.button_count || (item.size_breakdown && item.size_breakdown.button_count) || 0;
    const threadCount = item.thread_count || (item.size_breakdown && item.size_breakdown.thread_count) || 0;

    const normButtonId = buttonId === '' ? null : buttonId;
    const normThreadId = threadId === '' ? null : threadId;

    // 1. Check if it matches the base product's button and thread specs
    if (product.button_id === normButtonId && product.thread_id === normThreadId) {
        return product.design_numbers?.code || null;
    }

    // 2. Check if a variant already exists
    const { data: existingVariant } = await supabase
        .from('product_design_variants')
        .select('*, design_numbers(code)')
        .eq('product_id', productId)
        .eq('button_id', normButtonId)
        .eq('thread_id', normThreadId)
        .maybeSingle();

    if (existingVariant) {
        return existingVariant.design_numbers?.code || null;
    }

    // 3. Create a new variant
    try {
        const nextCode = await generateNextDesignNumberLocal();
        const { data: newDn, error: dnError } = await supabase
            .from('design_numbers')
            .insert([{ code: nextCode }])
            .select()
            .single();

        if (dnError) throw dnError;

        const { error: varError } = await supabase
            .from('product_design_variants')
            .insert([{
                product_id: parseInt(productId, 10),
                design_number_id: newDn.id,
                button_id: normButtonId,
                thread_id: normThreadId,
                button_count: parseInt(buttonCount, 10) || 0,
                thread_count: parseInt(threadCount, 10) || 0,
                variant_status: 'active'
            }]);

        if (varError) {
            await supabase.from('design_numbers').delete().eq('id', newDn.id);
            throw varError;
        }

        return nextCode;
    } catch (err) {
        console.error('Error auto-creating variant design number:', err.message);
        return product.design_numbers?.code || null;
    }
}

// Helper to find or create a Group Design Number based on associated design codes
async function findOrCreateGroupDesignNumber(designCodes) {
    if (!designCodes || !Array.isArray(designCodes)) return null;

    // Filter, trim, uppercase, and get unique design numbers
    const uniqueCodes = [...new Set(
        designCodes
            .map(code => (code || '').trim())
            .filter(code => code !== '')
    )].sort();

    if (uniqueCodes.length === 0) return null;

    // 1. Ensure all individual design numbers exist in public.design_numbers
    const { data: existingDNs, error: fetchError } = await supabase
        .from('design_numbers')
        .select('*')
        .in('code', uniqueCodes);

    if (fetchError) throw fetchError;

    const existingCodes = existingDNs ? existingDNs.map(dn => dn.code) : [];
    const missingCodes = uniqueCodes.filter(code => !existingCodes.includes(code));

    // Insert missing design numbers
    if (missingCodes.length > 0) {
        const insertPayload = missingCodes.map(code => ({ code }));
        const { error: insertError } = await supabase
            .from('design_numbers')
            .insert(insertPayload);
        if (insertError) throw insertError;
    }

    // Fetch all of them again to get IDs
    const { data: allDNs, error: fetchAllError } = await supabase
        .from('design_numbers')
        .select('id, code')
        .in('code', uniqueCodes);

    if (fetchAllError) throw fetchAllError;

    const dnMap = {};
    allDNs.forEach(dn => {
        dnMap[dn.code] = dn.id;
    });

    const targetIds = uniqueCodes.map(code => Number(dnMap[code])).sort((a, b) => a - b);

    // 2. Find if an existing Group Design Number matches this exact set of child IDs
    const { data: mappings, error: mapErr } = await supabase
        .from('group_design_mappings')
        .select('parent_id, child_id');

    if (mapErr) throw mapErr;

    const groupMap = {};
    (mappings || []).forEach(m => {
        if (!groupMap[m.parent_id]) groupMap[m.parent_id] = [];
        groupMap[m.parent_id].push(Number(m.child_id));
    });

    let matchedParentId = null;
    for (const parentId of Object.keys(groupMap)) {
        const childIds = groupMap[parentId].sort((a, b) => a - b);
        if (childIds.length === targetIds.length && childIds.every((val, index) => val === targetIds[index])) {
            matchedParentId = Number(parentId);
            break;
        }
    }

    if (matchedParentId !== null) {
        return matchedParentId;
    }

    // 3. Create a new Group Design Number (continuous with DNG- prefix)
    const { data: allDNsList, error: allDNsError } = await supabase
        .from('group_design_numbers')
        .select('code')
        .ilike('code', 'DNG-%');

    if (allDNsError) throw allDNsError;

    let maxNum = 0;
    if (allDNsList && allDNsList.length > 0) {
        allDNsList.forEach(dnRecord => {
            const dn = dnRecord.code;
            if (dn && dn.startsWith('DNG-')) {
                const numPart = dn.substring(4);
                const num = parseInt(numPart, 10);
                if (!isNaN(num) && num > maxNum) {
                    maxNum = num;
                }
            }
        });
    }

    const nextNum = maxNum + 1;
    const nextCode = `DNG-${String(nextNum).padStart(4, '0')}`;

    // Insert new GDN record
    const { data: newGDN, error: newGDNError } = await supabase
        .from('group_design_numbers')
        .insert([{ code: nextCode }])
        .select()
        .single();

    if (newGDNError) throw newGDNError;

    // Insert mappings
    const mappingsToInsert = targetIds.map(childId => ({
        parent_id: newGDN.id,
        child_id: childId
    }));

    const { error: mapInsertError } = await supabase
        .from('group_design_mappings')
        .insert(mappingsToInsert);

    if (mapInsertError) throw mapInsertError;

    return newGDN.id;
}

// 1. List all quotations
exports.listQuotations = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('quotations')
            .select('*, organizations(name), group_design_number:group_design_numbers(code)')
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 2. Get details of a single quotation with its items
exports.getQuotationDetails = async (req, res) => {
    try {
        const { id } = req.params;

        // Fetch the quotation header
        const { data: quotation, error: quoteError } = await supabase
            .from('quotations')
            .select('*, organizations(name), group_design_number:group_design_numbers(code)')
            .eq('id', id)
            .single();

        if (quoteError) throw quoteError;
        if (!quotation) {
            return res.status(404).json({ error: 'Quotation not found' });
        }

        // Fetch all items within this quotation
        const { data: items, error: itemsError } = await supabase
            .from('quotation_items')
            .select('*, product_types(name)')
            .eq('quotation_id', id);

        if (itemsError) throw itemsError;

        const enrichedItems = await enrichQuotationItemsWithDesignNumbers(items);

        res.json({
            ...quotation,
            items: enrichedItems || []
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Helper to resolve actual design codes (DN-XXXX) for product IDs or explicit design number descriptions
async function resolveDesignCodes(items) {
    const productIds = [];
    const explicitDesignCodes = [];

    (items || []).forEach(item => {
        const pId = item.product_id || (item.size_breakdown && item.size_breakdown.product_id);
        if (pId) {
            productIds.push(pId);
        }
        const dNum = item.design_number || (item.size_breakdown && item.size_breakdown.design_number);
        if (dNum) {
            explicitDesignCodes.push(dNum);
        }
    });

    let productDesignCodes = [];
    if (productIds.length > 0) {
        const { data: prods, error: prodsErr } = await supabase
            .from('products')
            .select('id, design_numbers(code)')
            .in('id', productIds);
        
        if (!prodsErr && prods) {
            productDesignCodes = prods
                .map(p => p.design_numbers?.code)
                .filter(Boolean);
        }
    }

    const combinedCodes = [...new Set([...productDesignCodes, ...explicitDesignCodes])]
        .filter(code => {
            const clean = (code || '').trim();
            return clean.startsWith('DN-') || clean.startsWith('DNS-');
        });

    return combinedCodes.length > 0 ? combinedCodes : explicitDesignCodes.filter(Boolean);
}

// Helper to enrich quotation items with product design numbers
async function enrichQuotationItemsWithDesignNumbers(items) {
    if (!items || items.length === 0) return items;
    
    const productIds = items
        .map(it => it.size_breakdown?.product_id)
        .filter(Boolean);
    
    if (productIds.length > 0) {
        const { data: prods } = await supabase
            .from('products')
            .select('id, design_numbers(code)')
            .in('id', productIds);
        
        if (prods) {
            const prodMap = {};
            prods.forEach(p => {
                prodMap[String(p.id)] = p.design_numbers?.code;
            });
            items.forEach(it => {
                const pId = it.size_breakdown?.product_id;
                if (pId && prodMap[String(pId)]) {
                    if (!it.size_breakdown) it.size_breakdown = {};
                    it.size_breakdown.product_design_number = prodMap[String(pId)];
                }
            });
        }
    }
    return items;
}

// 3. Create a new quotation and its items
exports.createQuotation = async (req, res) => {
    try {
        const {
            quotation_no,
            title,
            organization_id,
            estimated_expenses,
            total_estimated_time,
            production_days_estimate,
            expected_delivery_date,
            profit_margin_percent,
            final_quote_value,
            metrics_summary,
            items // Array of items
        } = req.body;

        if (!title || !title.trim()) {
            return res.status(400).json({ error: 'Quotation title is required' });
        }
        if (!organization_id) {
            return res.status(400).json({ error: 'Organization (customer) is required' });
        }
        if (!items || !items.length) {
            return res.status(400).json({ error: 'At least one product item is required' });
        }

        // Resolve or auto-create variant design numbers for each configured item
        for (const item of items) {
            const resolvedDn = await resolveOrCreateQuotationItemDesignNumber(item);
            if (resolvedDn) {
                item.design_number = resolvedDn;
                if (!item.size_breakdown) item.size_breakdown = {};
                item.size_breakdown.design_number = resolvedDn;
            }
        }

        // Collect the resolved design codes directly from each item (already resolved above)
        // Do NOT call resolveDesignCodes() - it would overwrite variant codes with base product codes
        const designCodes = [...new Set(
            items
                .map(item => item.design_number || (item.size_breakdown && item.size_breakdown.design_number))
                .filter(code => code && (code.startsWith('DNS-') || code.startsWith('DN-')))
        )];

        // Find or create group design number
        const groupDesignNumberId = designCodes.length > 0
            ? await findOrCreateGroupDesignNumber(designCodes)
            : null;

        // Generate a unique quotation number if not provided
        const finalQuotationNo = quotation_no && quotation_no.trim() 
            ? quotation_no.trim() 
            : `QT-${Date.now().toString().slice(-6)}`;

        // Insert the quotation header
        const { data: quote, error: quoteError } = await supabase
            .from('quotations')
            .insert([{
                quotation_no: finalQuotationNo,
                title: title.trim(),
                organization_id,
                estimated_expenses: estimated_expenses || 0,
                total_estimated_time: total_estimated_time || '',
                production_days_estimate: production_days_estimate || 0,
                expected_delivery_date: expected_delivery_date || null,
                profit_margin_percent: profit_margin_percent || 0,
                final_quote_value: final_quote_value || 0,
                status: 'Draft',
                metrics_summary: metrics_summary || {},
                group_design_number_id: groupDesignNumberId
            }])
            .select()
            .single();

        if (quoteError) {
            if (quoteError.code === '23505') {
                return res.status(400).json({ error: 'Quotation number already exists' });
            }
            throw quoteError;
        }

        // Format items with quotation ID
        const itemsToInsert = items.map(item => ({
            quotation_id: quote.id,
            product_type_id: item.product_type_id || null,
            quantity: item.quantity || 1,
            unit_price: item.unit_price || 0,
            total_price: item.total_price || 0,
            size_breakdown: {
                ...(item.size_breakdown || {}),
                fabric_id: item.fabric_id || (item.size_breakdown && item.size_breakdown.fabric_id) || null,
                sam_value: item.sam_value !== undefined ? item.sam_value : (item.size_breakdown && item.size_breakdown.sam_value) || null,
                design_number: item.design_number || (item.size_breakdown && item.size_breakdown.design_number) || null,
                is_manual: item.is_manual !== undefined ? item.is_manual : (item.size_breakdown && item.size_breakdown.is_manual !== undefined ? item.size_breakdown.is_manual : false)
            },
            fabric_cost_per_item: item.fabric_cost_per_item || 0,
            accessories_cost_per_item: item.accessories_cost_per_item || 0,
            labor_cost_per_item: item.labor_cost_per_item || 0
        }));

        // Insert quotation items
        const { error: itemsError } = await supabase
            .from('quotation_items')
            .insert(itemsToInsert);

        if (itemsError) {
            // Roll back quotation header if item insert fails
            await supabase.from('quotations').delete().eq('id', quote.id);
            throw itemsError;
        }

        // Log action if available
        try {
            const { logAction } = require('../utils/logger');
            await logAction(req.user.id, 'CREATE', 'quotation', quote.id, { 
                quotation_no: quote.quotation_no, 
                final_quote_value: quote.final_quote_value 
            });
        } catch (logErr) {
            console.error('Logging failed:', logErr.message);
        }

        res.json({ success: true, quotationId: quote.id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 4. Delete a quotation
exports.deleteQuotation = async (req, res) => {
    try {
        const { id } = req.params;

        const { error } = await supabase
            .from('quotations')
            .delete()
            .eq('id', id);

        if (error) throw error;

        // Log action if available
        try {
            const { logAction } = require('../utils/logger');
            await logAction(req.user.id, 'DELETE', 'quotation', id, { quotation_id: id });
        } catch (logErr) {
            console.error('Logging failed:', logErr.message);
        }

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 5. Calculate Organization Sizing and Measurement Audits live
exports.calculateOrgMeasurements = async (req, res) => {
    try {
        const { orgId } = req.params;

        // 1. Fetch Organization Departments
        const { data: departments, error: deptError } = await supabase
            .from('departments')
            .select('*')
            .eq('organization_id', orgId);

        if (deptError) throw deptError;

        // 2. Fetch all registry members inside the organization
        const { data: members, error: memError } = await supabase
            .from('registry_members')
            .select('id, full_name, gender, department_id')
            .eq('organization_id', orgId);

        if (memError) throw memError;

        // 3. Fetch industry templates for this organization to extract linked products & designs
        const { data: templates, error: templatesError } = await supabase
            .from('industry_templates')
            .select('*')
            .eq('organization_id', orgId);

        if (templatesError) throw templatesError;

        // 3a. Extract all unique product_ids from template configs
        const productIdSet = new Set();

        (templates || []).forEach(tmpl => {
            const configs = [...(tmpl.boys_config || []), ...(tmpl.girls_config || [])];
            configs.forEach(cfg => {
                if (cfg.product_id) productIdSet.add(cfg.product_id);
            });
        });

        const productIds = Array.from(productIdSet);

        // 3b. Fetch linked products (with product type info)
        let templateProducts = [];
        if (productIds.length > 0) {
            const { data: prods, error: prodsError } = await supabase
                .from('products')
                .select('id, name, art_number, gender, sam_value, materials, product_types(id, name)')
                .in('id', productIds);
            if (!prodsError) templateProducts = prods || [];
        }

        // 3c. Build enriched template line items (product info)
        const templateLineItems = [];
        (templates || []).forEach(tmpl => {
            const configs = [...(tmpl.boys_config || []), ...(tmpl.girls_config || [])];
            configs.forEach(cfg => {
                const product = templateProducts.find(p => String(p.id) === String(cfg.product_id));
                if (product) {
                    templateLineItems.push({
                        product_id: product.id,
                        art_number: product.art_number,
                        product_name: product.name,
                        gender: product.gender,
                        sam_value: product.sam_value,
                        materials: product.materials,
                        product_type: product.product_types?.name || null,
                        design_id: null,
                        design_code: null,
                        template_quantity: cfg.quantity || null
                    });
                }
            });
        });

        if (!members || members.length === 0) {
            return res.json({
                total_entities: 0,
                measured_count: 0,
                pending_count: 0,
                missing_count: 0,
                size_distribution: {},
                departments: departments || [],
                entities: [],
                template_line_items: templateLineItems
            });
        }

        const memberIds = members.map(m => m.id);

        // 4. Fetch all measurements for these members
        const { data: measurements, error: measError } = await supabase
            .from('measurements')
            .select('id, member_id, suggested_size, status, recorded_at')
            .in('member_id', memberIds)
            .order('recorded_at', { ascending: false });

        if (measError) throw measError;

        // 5. Map each member to their latest measurement
        const memberLatestMeas = {};
        if (measurements) {
            measurements.forEach(m => {
                const mid = String(m.member_id);
                // Since ordered by recorded_at desc, the first one encountered is the latest
                if (!memberLatestMeas[mid]) {
                    memberLatestMeas[mid] = m;
                }
            });
        }

        // 6. Compute tallies and distributions
        let measured_count = 0;
        let pending_count = 0;
        let missing_count = 0;
        const size_distribution = {};

        const enrichedEntities = members.map(m => {
            const latest = memberLatestMeas[String(m.id)];
            let mStatus = 'Missing';
            let activeSize = '';

            if (latest) {
                if (latest.status === 'Approved' || latest.status === 'Completed') {
                    mStatus = 'Completed';
                    activeSize = latest.suggested_size || '';
                    measured_count++;
                } else if (latest.status === 'Pending') {
                    mStatus = 'Pending';
                    activeSize = latest.suggested_size || '';
                    pending_count++;
                } else {
                    // E.g. Rejected
                    mStatus = 'Missing';
                    missing_count++;
                }
            } else {
                missing_count++;
            }

            // Clean suggested size to match standard tags
            const cleanedSize = activeSize ? activeSize.trim().toUpperCase() : '';
            if (mStatus === 'Completed' && cleanedSize) {
                size_distribution[cleanedSize] = (size_distribution[cleanedSize] || 0) + 1;
            }

            return {
                id: m.id,
                full_name: m.full_name,
                gender: m.gender,
                department_id: m.department_id,
                measurement_status: mStatus,
                suggested_size: cleanedSize || 'M' // Assume Default size M if empty/missing
            };
        });

        res.json({
            total_entities: members.length,
            measured_count,
            pending_count,
            missing_count,
            size_distribution,
            departments: departments || [],
            entities: enrichedEntities,
            template_line_items: templateLineItems
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 6. Update an existing quotation and its items
exports.updateQuotation = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            title,
            quotation_no,
            organization_id,
            status,
            estimated_expenses,
            total_estimated_time,
            production_days_estimate,
            expected_delivery_date,
            profit_margin_percent,
            final_quote_value,
            metrics_summary,
            pdf_html,
            items // Array of items
        } = req.body;

        if (!title || !title.trim()) {
            return res.status(400).json({ error: 'Quotation title is required' });
        }
        if (!organization_id) {
            return res.status(400).json({ error: 'Organization (customer) is required' });
        }
        if (!items || !items.length) {
            return res.status(400).json({ error: 'At least one product item is required' });
        }

        // Resolve or auto-create variant design numbers for each configured item
        for (const item of items) {
            const resolvedDn = await resolveOrCreateQuotationItemDesignNumber(item);
            if (resolvedDn) {
                item.design_number = resolvedDn;
                if (!item.size_breakdown) item.size_breakdown = {};
                item.size_breakdown.design_number = resolvedDn;
            }
        }

        // Collect the resolved design codes directly from each item (already resolved above)
        // Do NOT call resolveDesignCodes() - it would overwrite variant codes with base product codes
        const designCodes = [...new Set(
            items
                .map(item => item.design_number || (item.size_breakdown && item.size_breakdown.design_number))
                .filter(code => code && (code.startsWith('DNS-') || code.startsWith('DN-')))
        )];

        // Find or create group design number
        const groupDesignNumberId = await findOrCreateGroupDesignNumber(designCodes);

        // Update the quotation header
        const { data: quote, error: quoteError } = await supabase
            .from('quotations')
            .update({
                title: title.trim(),
                quotation_no: quotation_no ? quotation_no.trim() : undefined,
                organization_id,
                status: status || 'Draft',
                estimated_expenses: estimated_expenses || 0,
                total_estimated_time: total_estimated_time || '',
                production_days_estimate: production_days_estimate || 0,
                expected_delivery_date: expected_delivery_date || null,
                profit_margin_percent: profit_margin_percent || 0,
                final_quote_value: final_quote_value || 0,
                metrics_summary: metrics_summary || {},
                pdf_html: pdf_html || undefined,
                group_design_number_id: groupDesignNumberId
            })
            .eq('id', id)
            .select()
            .single();

        if (quoteError) {
            throw quoteError;
        }

        // Delete existing quotation items
        const { error: deleteError } = await supabase
            .from('quotation_items')
            .delete()
            .eq('quotation_id', id);

        if (deleteError) throw deleteError;

        // Format items with quotation ID
        const itemsToInsert = items.map(item => ({
            quotation_id: id,
            product_type_id: item.product_type_id || null,
            quantity: item.quantity || 1,
            unit_price: item.unit_price || 0,
            total_price: item.total_price || 0,
            size_breakdown: {
                ...(item.size_breakdown || {}),
                fabric_id: item.fabric_id || (item.size_breakdown && item.size_breakdown.fabric_id) || null,
                sam_value: item.sam_value !== undefined ? item.sam_value : (item.size_breakdown && item.size_breakdown.sam_value) || null,
                design_number: item.design_number || (item.size_breakdown && item.size_breakdown.design_number) || null,
                is_manual: item.is_manual !== undefined ? item.is_manual : (item.size_breakdown && item.size_breakdown.is_manual !== undefined ? item.size_breakdown.is_manual : false)
            },
            fabric_cost_per_item: item.fabric_cost_per_item || 0,
            accessories_cost_per_item: item.accessories_cost_per_item || 0,
            labor_cost_per_item: item.labor_cost_per_item || 0
        }));

        // Insert quotation items
        const { error: itemsError } = await supabase
            .from('quotation_items')
            .insert(itemsToInsert);

        if (itemsError) {
            throw itemsError;
        }

        // Log action if available
        try {
            const { logAction } = require('../utils/logger');
            await logAction(req.user.id, 'UPDATE', 'quotation', id, { 
                quotation_no: quote.quotation_no, 
                final_quote_value: quote.final_quote_value,
                status: quote.status
            });
        } catch (logErr) {
            console.error('Logging failed:', logErr.message);
        }

        res.json({ success: true, quotationId: id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getSharePDF = async (req, res) => {
    try {
        const { id } = req.params;
        const { data, error } = await supabase
            .from('quotations')
            .select('pdf_html, quotation_no, status')
            .eq('id', id)
            .single();

        if (error) throw error;
        if (!data) {
            return res.status(404).send('Quotation not found.');
        }

        let rawHtml = data.pdf_html;

        if (!rawHtml) {
            // If status is not Approved, we do not expose/generate the public PDF
            if (data.status !== 'Approved') {
                return res.status(404).send('Proposal PDF not generated or not approved yet.');
            }

            // Dynamically compile PDF HTML for Approved quotations that don't have it saved
            console.log(`[Share PDF] Dynamically compiling PDF HTML for approved quotation ID: ${id}`);
            
            // 1. Fetch full quotation details
            const { data: quote, error: quoteError } = await supabase
                .from('quotations')
                .select('*, organizations(name), group_design_number:group_design_numbers(code)')
                .eq('id', id)
                .single();

            if (quoteError || !quote) {
                return res.status(404).send('Quotation details not found.');
            }

            // 2. Fetch quotation items
            const { data: items, error: itemsError } = await supabase
                .from('quotation_items')
                .select('*, product_types(name)')
                .eq('quotation_id', id);

            if (itemsError) throw itemsError;

            const enrichedItems = await enrichQuotationItemsWithDesignNumbers(items);

            // 3. Fetch company settings
            let companySettings = {
                company_name: 'Forma Apparels',
                address: '63/3608, CD Tower, Arayidathupalam, Kozhikode, Kerala - 673 004, India',
                phone: '(+91) 7902 499 990 | 0495 2 922 992',
                email: 'info@formaapparels.com',
                website: 'www.formaapparels.com',
                bank_name: 'HDFC BANK',
                account_no: '50200076116064',
                branch_name: 'MAJESTIC CENTER',
                ifsc_code: 'HDFC0001255',
                upi_id: '7902 499 991'
            };

            try {
                const { data: settingsData } = await supabase
                    .from('company_settings')
                    .select('*')
                    .eq('id', 1)
                    .maybeSingle();
                if (settingsData) {
                    companySettings = { ...companySettings, ...settingsData };
                }
            } catch (e) {
                console.warn('[Share PDF] Failed to load company settings:', e.message);
            }

            // 4. Fetch fabrics
            let fabricsList = [];
            try {
                const { data: fabrics } = await supabase
                    .from('fabrics')
                    .select('id, brand_name');
                if (fabrics) {
                    fabricsList = fabrics;
                }
            } catch (e) {
                console.warn('[Share PDF] Failed to load fabrics:', e.message);
            }

            // Compute pricing
            const subtotal = (items || []).reduce((acc, item) => acc + Number(item.total_price), 0) || 0;
            const gstRate = 18;
            const gstValue = subtotal * (gstRate / 100);
            const finalValue = subtotal + gstValue;

            const dateStr = new Date(quote.created_at).toLocaleDateString('en-IN', { month: 'long', day: 'numeric', year: 'numeric' });
            const deliveryDateStr = quote.expected_delivery_date
                ? new Date(quote.expected_delivery_date).toLocaleDateString('en-IN', { month: 'long', day: 'numeric', year: 'numeric' })
                : 'N/A';

            // Construct items HTML
            let itemsHtml = '';
            if (items && items.length > 0) {
                items.forEach((item) => {
                    const pTypeName = item.product_types?.name || item.product_type_name || 'Uniform Item';
                    const fabricId = item.size_breakdown?.fabric_id;
                    const fabricBrand = fabricsList.find((f) => String(f.id) === String(fabricId))?.brand_name || 'Custom Fabric';
                    const designNum = item.size_breakdown?.product_design_number || item.size_breakdown?.design_number || '—';
                    const sam = item.size_breakdown?.sam_value ? `₹ ${Number(item.size_breakdown.sam_value).toFixed(2)}` : '—';
                    const qty = item.quantity || 0;
                    const price = Number(item.unit_price) || 0;
                    const total = Number(item.total_price) || 0;

                    itemsHtml += `
              <tr class="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                <td class="py-3.5 px-4 font-bold text-gray-800 text-xs">${pTypeName}</td>
                <td class="py-3.5 px-4 text-gray-600 text-xs">${fabricBrand}</td>
                <td class="py-3.5 px-4 text-gray-600 text-xs">${designNum}</td>
                <td class="py-3.5 px-4 text-gray-600 text-xs text-center font-mono">${sam}</td>
                <td class="py-3.5 px-4 text-gray-800 text-xs text-right font-black">${qty}</td>
                <td class="py-3.5 px-4 text-gray-700 text-xs text-right font-mono">₹ ${price.toFixed(2)}</td>
                <td class="py-3.5 px-4 text-[#2d8d9b] text-xs text-right font-black font-mono">₹ ${total.toFixed(2)}</td>
              </tr>
            `;
                });
            }

            const compiledHtml = `
          <div class="max-w-4xl mx-auto border border-gray-150 p-8 md:p-10 rounded-[2.5rem] shadow-sm relative bg-white print-container">
            
            <!-- LETTERHEAD BRANDING -->
            <div class="flex justify-between items-start border-b-2 border-gray-100 pb-8 flex-wrap gap-4">
              <div>
                <div class="flex items-center gap-2.5">
                  <!-- SVG Gradient Logo -->
                  <div class="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#3a525d] to-[#2d8d9b] flex items-center justify-center text-white shadow-md">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="3" stroke="currentColor" class="w-5 h-5">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M15.59 14.37a6 6 0 0 1-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 0 0 6.16-12.12A14.98 14.98 0 0 0 9.61 3.51a6 6 0 0 1 5.98 10.86Z" />
                    </svg>
                  </div>
                   <span class="text-xl font-black italic tracking-tighter text-[#3a525d] font-outfit">${companySettings.company_name.toUpperCase()}</span>
                </div>
                <p class="text-[9px] font-black uppercase tracking-[0.2em] text-[#2d8d9b] mt-1.5 pl-0.5">Corporate Apparel & Sizing Specialists</p>
                <p class="text-[10px] text-gray-400 mt-2 font-medium">${companySettings.address}<br/>${companySettings.phone} | ${companySettings.email}</p>
              </div>

              <div class="text-right">
                <span class="px-3 py-1 bg-[#2d8d9b]/10 text-[#2d8d9b] font-black text-[9px] uppercase tracking-widest rounded-lg border border-[#2d8d9b]/15 inline-block">
                  ${quote.status} Proposal
                </span>
                <h1 class="text-xl font-black text-gray-800 mt-2 font-outfit">${quote.quotation_no}</h1>
                <p class="text-xs text-gray-500 font-bold mt-1">Date: ${dateStr}</p>
              </div>
            </div>

            <!-- CLIENT & TARGET INFO -->
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6 py-6 border-b border-gray-100 text-xs">
              <div>
                <p class="text-[9px] font-black text-gray-400 uppercase tracking-widest">Prepared For</p>
                <p class="text-sm font-black text-gray-800 mt-1">${quote.organizations?.name || 'Customer'}</p>
                <p class="text-gray-500 mt-0.5 font-medium">Associated Uniform Contract Client</p>
              </div>
              <div class="md:text-center">
                <p class="text-[9px] font-black text-gray-400 uppercase tracking-widest">Group Design Number</p>
                <p class="text-sm font-black text-[#2d8d9b] mt-1">${quote.group_design_number?.code || '—'}</p>
                <p class="text-gray-500 mt-0.5 font-medium">Auto-generated Design Collection</p>
              </div>
              <div class="md:text-right">
                <p class="text-[9px] font-black text-gray-400 uppercase tracking-widest">Expected Delivery Target</p>
                <p class="text-sm font-black text-[#2d8d9b] mt-1">${deliveryDateStr}</p>
                <p class="text-gray-500 mt-0.5 font-medium">Est. Days: ${quote.production_days_estimate} Production Days</p>
              </div>
            </div>

            <!-- CUSTOM COVER LETTER SECTION -->
            ${quote.metrics_summary?.cover_letter ? `
              <div class="py-8 border-b border-gray-100">
                <p class="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-4">Letter of Proposal</p>
                <div class="text-xs text-gray-600 leading-relaxed font-semibold whitespace-pre-wrap italic bg-gray-50/50 p-6 rounded-2xl border border-gray-150">
                  ${quote.metrics_summary.cover_letter}
                </div>
              </div>
            ` : ''}

            <!-- SPECIFICATIONS TABLE -->
            <div class="py-8 page-break">
              <p class="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-4">Quotation Product Specifications</p>
              <div class="border border-gray-150 rounded-2xl overflow-hidden shadow-sm">
                <table class="w-full text-left border-collapse">
                  <thead>
                    <tr class="bg-gray-50 border-b border-gray-150 text-[9px] font-black uppercase tracking-widest text-gray-500">
                      <th class="py-3 px-4">Garment Line</th>
                      <th class="py-3 px-4">Fabric Style</th>
                      <th class="py-3 px-4">Design Num</th>
                      <th class="py-3 px-4 text-center font-mono">SAM (₹)</th>
                      <th class="py-3 px-4 text-right">Quantity</th>
                      <th class="py-3 px-4 text-right">Unit Price</th>
                      <th class="py-3 px-4 text-right">Total Price</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-gray-100 font-semibold">
                    ${itemsHtml}
                  </tbody>
                </table>
              </div>
            </div>

            <!-- PRICING & GST COMPILATION -->
            <div class="flex justify-end py-6 border-t border-gray-100">
              <div class="w-80 space-y-3.5 text-xs font-bold text-gray-500">
                <div class="flex justify-between">
                  <span>Subtotal (Pre-Tax):</span>
                  <span class="font-mono text-gray-800 font-black">₹ ${subtotal.toFixed(2)}</span>
                </div>
                <div class="flex justify-between border-b border-gray-100 pb-2">
                  <span>GST Tax (${gstRate}%):</span>
                  <span class="font-mono text-red-500 font-black">₹ ${gstValue.toFixed(2)}</span>
                </div>
                <div class="flex justify-between items-end pt-2 text-[#2d8d9b]">
                  <div>
                    <p class="text-[9px] font-black uppercase text-gray-400 tracking-wider">Total Contract Value</p>
                    <p class="text-2xl font-black italic font-outfit mt-0.5">₹ ${finalValue.toFixed(2)}</p>
                  </div>
                </div>
              </div>
            </div>

            <!-- BANK PAYMENT DETAILS -->
            <div class="mt-8 p-6 bg-gray-50/50 border border-gray-150 rounded-2xl text-[10px] text-gray-600 font-semibold grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p class="text-[8px] font-black text-gray-450 uppercase tracking-widest mb-2">Bank Transfer Details</p>
                <p><span class="text-gray-400">Bank Name:</span> ${companySettings.bank_name}</p>
                <p class="mt-1"><span class="text-gray-400">Account No:</span> <span class="font-mono text-gray-800 font-black">${companySettings.account_no}</span></p>
                <p class="mt-1"><span class="text-gray-400">Branch Name:</span> ${companySettings.branch_name}</p>
              </div>
              <div>
                <p class="text-[8px] font-black text-gray-450 uppercase tracking-widest mb-2">Alternative/UPI Payment</p>
                <p><span class="text-gray-400">IFSC Code:</span> <span class="font-mono text-gray-800 font-black">${companySettings.ifsc_code}</span></p>
                <p class="mt-1"><span class="text-gray-400">UPI Pay No:</span> <span class="font-mono text-[#2d8d9b] font-black">${companySettings.upi_id}</span></p>
              </div>
            </div>

            <!-- SIGNATURES BLOCK -->
            <div class="grid grid-cols-2 gap-12 mt-16 pt-8 border-t border-gray-100 text-xs">
              <div class="space-y-12">
                <p class="text-[9px] font-black text-gray-400 uppercase tracking-widest">Authorized By</p>
                <div class="border-t border-gray-200 pt-3">
                  <p class="font-black text-gray-800">Forma Apparels Representative</p>
                  <p class="text-gray-400 text-[10px] font-medium mt-0.5">Title: Operations Desk Manager</p>
                </div>
              </div>
              <div class="space-y-12 text-right">
                <p class="text-[9px] font-black text-gray-400 uppercase tracking-widest">Accepted By</p>
                <div class="border-t border-gray-200 pt-3">
                  <p class="font-black text-gray-800">Client Signatory Authority</p>
                  <p class="text-gray-400 text-[10px] font-medium mt-0.5">Organization: ${quote.organizations?.name || 'Customer'}</p>
                </div>
              </div>
            </div>

          </div>
        `;

            // Update database with dynamically compiled HTML to optimize future hits
            await supabase
                .from('quotations')
                .update({ pdf_html: compiledHtml })
                .eq('id', id);

            rawHtml = compiledHtml;
        }

        // Wrap the rawHtml in the automatic html2pdf downloader page
        const downloaderHtml = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Downloading Proposal...</title>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
        <script src="https://cdn.tailwindcss.com"></script>
        <!-- Load premium fonts -->
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Outfit:wght@600;700;800&display=swap" rel="stylesheet">
        <style>
          #pdf-wrapper {
            position: absolute;
            left: -9999px;
            top: -9999px;
            width: 800px;
          }
          body {
            font-family: 'Inter', sans-serif;
          }
          h2 {
            font-family: 'Outfit', sans-serif;
          }
        </style>
      </head>
      <body class="bg-gray-50 flex items-center justify-center min-h-screen">
        
        <div id="loading-overlay" class="text-center p-8 bg-white rounded-3xl shadow-xl max-w-sm w-full mx-4 border border-gray-100">
          <div class="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-[#3a525d] to-[#2d8d9b] text-white shadow-lg animate-pulse mb-6">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-8 h-8">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
          </div>
          <h2 class="text-xl font-black text-[#3a525d] tracking-tight">Generating Proposal PDF</h2>
          <p class="text-xs text-gray-500 mt-2 leading-relaxed">Please wait, your official proposal document is compiling and will download automatically.</p>
          
          <div class="mt-6 w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
            <div class="bg-[#2d8d9b] h-1.5 rounded-full animate-shimmer" style="width: 70%;"></div>
          </div>
        </div>

        <div id="pdf-wrapper">
          ${rawHtml}
        </div>

        <script>
          const style = document.createElement('style');
          style.innerHTML = \`
            @keyframes shimmer {
              0% { background-position: -200% 0; }
              100% { background-position: 200% 0; }
            }
            .animate-shimmer {
              background-image: linear-gradient(90deg, #2d8d9b 0%, #3a525d 50%, #2d8d9b 100%);
              background-size: 200% 100%;
              animation: shimmer 1.5s infinite linear;
            }
          \`;
          document.head.appendChild(style);

          window.addEventListener('load', function() {
            const wrapper = document.getElementById('pdf-wrapper');
            let element = wrapper.querySelector('.print-container');
            if (!element) {
              element = wrapper;
            }
            
            // Remove print toolbar/no-print elements if present
            const noPrintElements = element.querySelectorAll('.no-print');
            noPrintElements.forEach(el => el.remove());

            const opt = {
              margin:       [0.3, 0.3, 0.3, 0.3],
              filename:     'Proposal_${data.quotation_no || 'QT-' + id}.pdf',
              image:        { type: 'jpeg', quality: 0.98 },
              html2canvas:  { scale: 2, useCORS: true, logging: false },
              jsPDF:        { unit: 'in', format: 'a4', orientation: 'portrait' }
            };
            
            html2pdf().set(opt).from(element).save().then(() => {
              const overlay = document.getElementById('loading-overlay');
              overlay.innerHTML = \`
                <div class="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-green-500 text-white shadow-lg mb-6">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="3" stroke="currentColor" class="w-8 h-8">
                    <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                </div>
                <h2 class="text-xl font-black text-gray-800 tracking-tight">Download Complete!</h2>
                <p class="text-xs text-gray-500 mt-2 font-medium">You can close this window now.</p>
                <button onclick="window.close()" class="mt-6 w-full py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-xl transition-all border border-gray-200">
                  Close Window
                </button>
              \`;
            }).catch(err => {
              console.error(err);
              const overlay = document.getElementById('loading-overlay');
              overlay.innerHTML = \`
                <div class="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-red-500 text-white shadow-lg mb-6">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-8 h-8">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                  </svg>
                </div>
                <h2 class="text-xl font-black text-red-600 tracking-tight">Download Failed</h2>
                <p class="text-xs text-gray-500 mt-2 leading-relaxed">We had trouble compiling the PDF. Please print/save it manually using your browser (Ctrl+P).</p>
              \`;
            });
          });
        </script>
      </body>
      </html>
        `;

        res.setHeader('Content-Type', 'text/html');
        res.send(downloaderHtml);
    } catch (err) {
        res.status(500).send('Error retrieving proposal PDF: ' + err.message);
    }
};

exports.listGroupDesignCombinations = async (req, res) => {
    try {
        const { data: groupDesigns, error: gdError } = await supabase
            .from('group_design_numbers')
            .select('id, code, name, description');

        if (gdError) throw gdError;

        const { data: mappings, error: mapError } = await supabase
            .from('group_design_mappings')
            .select(`
                parent_id,
                child_id,
                remarks,
                design_numbers:child_id(id, code)
            `);

        if (mapError) throw mapError;

        const { data: products, error: prodError } = await supabase
            .from('products')
            .select(`
                *,
                product_types(id, name),
                design_number_ref:design_numbers(id, code)
            `);

        if (prodError) throw prodError;

        const { data: variants, error: varError } = await supabase
            .from('product_design_variants')
            .select(`
                *,
                design_numbers(id, code)
            `);

        if (varError) throw varError;

        // Group mappings by parent_id
        const mappingsByParent = {};
        (mappings || []).forEach(m => {
            if (!mappingsByParent[m.parent_id]) {
                mappingsByParent[m.parent_id] = [];
            }
            mappingsByParent[m.parent_id].push({
                child_id: m.child_id,
                remarks: m.remarks || '',
                design_code: m.design_numbers?.code || 'DNS-xxxx'
            });
        });

        // Format product records to have design_number field
        const formattedProducts = (products || []).map(p => ({
            ...p,
            design_number: p.design_number_ref?.code || null,
            design_number_id: p.design_number_ref?.id || null,
            design_number_ref: undefined
        }));

        const results = (groupDesigns || []).map(gd => {
            const childItems = mappingsByParent[gd.id] || [];
            const items = childItems.map(item => {
                const variant = (variants || []).find(v => v.design_number_id === item.child_id);
                let product = null;
                let buttonId = null;
                let buttonCount = null;
                let threadId = null;
                let threadCount = null;

                if (variant) {
                    product = formattedProducts.find(p => p.id === variant.product_id);
                    buttonId = variant.button_id;
                    buttonCount = variant.button_count;
                    threadId = variant.thread_id;
                    threadCount = variant.thread_count;
                } else {
                    product = formattedProducts.find(p => p.design_number_id === item.child_id);
                    if (product) {
                        buttonId = product.button_id;
                        buttonCount = product.button_count;
                        threadId = product.thread_id;
                        threadCount = product.thread_count;
                    }
                }

                return {
                    design_number_id: item.child_id,
                    design_number: item.design_code,
                    remarks: item.remarks,
                    product_id: product ? product.id : null,
                    name: product ? product.name : 'Unregistered Product',
                    art_number: product ? product.art_number : '—',
                    main_fabric: product ? product.main_fabric : null,
                    main_fabric_id: product ? product.main_fabric_id : null,
                    sam_value: product ? product.sam_value : null,
                    button_id: buttonId,
                    button_count: buttonCount,
                    thread_id: threadId,
                    thread_count: threadCount
                };
            });
            return {
                id: gd.id,
                code: gd.code,
                name: gd.name || gd.code,
                description: gd.description || '',
                products: items
            };
        });

        res.json(results);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.updateGroupDesignCombination = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, products } = req.body;

        let targetParentId = parseInt(id, 10);
        if (products && Array.isArray(products) && products.length > 0) {
            const newDesignCodes = products.map(p => p.design_number).filter(Boolean);
            const resolvedParentId = await findOrCreateGroupDesignNumber(newDesignCodes);
            
            if (resolvedParentId && resolvedParentId !== targetParentId) {
                // Redirect quotations pointing to the old combination to the new resolved one
                await supabase
                    .from('quotations')
                    .update({ group_design_number_id: resolvedParentId })
                    .eq('group_design_number_id', targetParentId);

                // Clear new parent's mappings to prevent conflict before overwrite
                await supabase
                    .from('group_design_mappings')
                    .delete()
                    .eq('parent_id', resolvedParentId);

                // Delete old mappings
                await supabase
                    .from('group_design_mappings')
                    .delete()
                    .eq('parent_id', targetParentId);

                // Delete old unused group design number record
                await supabase
                    .from('group_design_numbers')
                    .delete()
                    .eq('id', targetParentId);

                targetParentId = resolvedParentId;
            }
        }

        // Update group design details for the resolved parent
        const { error: gdError } = await supabase
            .from('group_design_numbers')
            .update({ name, description })
            .eq('id', targetParentId);

        if (gdError) throw gdError;

        // Re-create mappings under the resolved parent ID
        if (products && Array.isArray(products)) {
            await supabase
                .from('group_design_mappings')
                .delete()
                .eq('parent_id', targetParentId);

            const mappingsToInsert = products.map(prod => ({
                parent_id: targetParentId,
                child_id: parseInt(prod.design_number_id, 10),
                remarks: prod.remarks || ''
            }));

            const { error: insError } = await supabase
                .from('group_design_mappings')
                .insert(mappingsToInsert);

            if (insError) throw insError;
        }

        res.json({ success: true, groupDesignId: targetParentId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.listDesignNumbers = async (req, res) => {
    try {
        const { data: designNumbers, error: dnError } = await supabase
            .from('design_numbers')
            .select('id, code, name, description, created_at')
            .order('code', { ascending: true });

        if (dnError) throw dnError;

        // Fetch products
        const { data: products, error: prodError } = await supabase
            .from('products')
            .select('id, name, art_number, main_fabric, sam_value, button_id, button_count, thread_id, thread_count, design_number_id');

        if (prodError) throw prodError;

        // Fetch product variants
        const { data: variants, error: varError } = await supabase
            .from('product_design_variants')
            .select(`
                id,
                product_id,
                design_number_id,
                button_id,
                button_count,
                thread_id,
                thread_count
            `);

        if (varError) throw varError;

        const results = (designNumbers || []).map(dn => {
            // Find if it's a main product design
            const mainProduct = (products || []).find(p => p.design_number_id === dn.id);
            
            // Find if it's a variant design
            const variant = (variants || []).find(v => v.design_number_id === dn.id);
            
            let spec = null;
            if (mainProduct) {
                spec = {
                    product_id: mainProduct.id,
                    product_name: mainProduct.name,
                    art_number: mainProduct.art_number || '—',
                    main_fabric_id: null,
                    main_fabric_meters: mainProduct.main_fabric || '1.25',
                    sam_value: mainProduct.sam_value,
                    button_id: mainProduct.button_id,
                    button_count: mainProduct.button_count || 0,
                    thread_id: mainProduct.thread_id,
                    thread_count: mainProduct.thread_count || 0,
                    type: 'Main Product'
                };
            } else if (variant) {
                const parentProduct = (products || []).find(p => p.id === variant.product_id);
                spec = {
                    product_id: variant.product_id,
                    product_name: parentProduct ? parentProduct.name : 'Unregistered Product',
                    art_number: parentProduct ? parentProduct.art_number : '—',
                    main_fabric_id: null,
                    main_fabric_meters: parentProduct ? (parentProduct.main_fabric || '1.25') : '1.25',
                    sam_value: parentProduct ? parentProduct.sam_value : null,
                    button_id: variant.button_id,
                    button_count: variant.button_count || 0,
                    thread_id: variant.thread_id,
                    thread_count: variant.thread_count || 0,
                    type: 'Variant'
                };
            }

            return {
                id: dn.id,
                code: dn.code,
                name: dn.name || dn.code,
                description: dn.description || '',
                created_at: dn.created_at,
                spec: spec
            };
        });

        res.json(results);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.updateDesignNumber = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description } = req.body;

        const { error } = await supabase
            .from('design_numbers')
            .update({ name, description })
            .eq('id', id);

        if (error) throw error;

        res.json({ success: true, designNumberId: id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};


