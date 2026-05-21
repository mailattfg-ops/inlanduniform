const supabase = require('../config/supabase');

// 1. List all quotations
exports.listQuotations = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('quotations')
            .select('*, organizations(name)')
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
            .select('*, organizations(name)')
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

        res.json({
            ...quotation,
            items: items || []
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

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
                metrics_summary: metrics_summary || {}
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
                fabric_id: item.fabric_id || null,
                sam_value: item.sam_value || null,
                design_number: item.design_number || null,
                is_manual: item.is_manual || false
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

        // 3a. Extract all unique product_ids and design_ids from template configs
        const productIdSet = new Set();
        const designIdSet = new Set();

        (templates || []).forEach(tmpl => {
            const configs = [...(tmpl.boys_config || []), ...(tmpl.girls_config || [])];
            configs.forEach(cfg => {
                if (cfg.product_id) productIdSet.add(cfg.product_id);
                if (cfg.design_id) designIdSet.add(cfg.design_id);
            });
        });

        const productIds = Array.from(productIdSet);
        const designIds = Array.from(designIdSet);

        // 3b. Fetch linked products (with product type info)
        let templateProducts = [];
        if (productIds.length > 0) {
            const { data: prods, error: prodsError } = await supabase
                .from('products')
                .select('id, name, art_number, gender, sam_value, materials, product_types(id, name)')
                .in('id', productIds);
            if (!prodsError) templateProducts = prods || [];
        }

        // 3c. Fetch linked designs
        let templateDesigns = [];
        if (designIds.length > 0) {
            const { data: desigs, error: desigError } = await supabase
                .from('designs')
                .select('id, design_code')
                .in('id', designIds);
            if (!desigError) templateDesigns = desigs || [];
        }

        // 3d. Build enriched template line items (product + design pairing per template config row)
        const templateLineItems = [];
        (templates || []).forEach(tmpl => {
            const configs = [...(tmpl.boys_config || []), ...(tmpl.girls_config || [])];
            configs.forEach(cfg => {
                const product = templateProducts.find(p => String(p.id) === String(cfg.product_id));
                const design = templateDesigns.find(d => d.id === cfg.design_id);
                if (product) {
                    templateLineItems.push({
                        product_id: product.id,
                        art_number: product.art_number,
                        product_name: product.name,
                        gender: product.gender,
                        sam_value: product.sam_value,
                        materials: product.materials,
                        product_type: product.product_types?.name || null,
                        design_id: cfg.design_id || null,
                        design_code: design?.design_code || null,
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
