const supabase = require('../config/supabase');
const { logAction } = require('../utils/logger');

// Helper to fetch default configuration
const getActiveConfigForProduct = async (productId) => {
    // There is a single global configuration in the system (product_id is null)
    const { data: defaultConfig, error: defaultErr } = await supabase
        .from('sam_configurations')
        .select(`
            *,
            components:sam_configuration_components(*)
        `)
        .is('product_id', null)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

    return defaultConfig;
};

// Helper to compute Base SAM from components
const calculateBaseSAM = (components, baseValue = 100) => {
    if (!components || components.length === 0) return baseValue;

    // All components are now percentages of baseValue
    const percentageSum = components.reduce((sum, c) => sum + (parseFloat(c.value || 0) / 100 * baseValue), 0);

    return baseValue + percentageSum;
};

// Helper to find adjustment percent from slabs
const getAdjustmentPercent = (slabs, quantity) => {
    if (!slabs || !Array.isArray(slabs)) return 0;
    
    const qty = parseInt(quantity, 10);
    const matchingSlab = slabs.find(s => {
        if (!s.enabled) return false;
        const min = parseInt(s.min_qty, 10);
        const max = s.max_qty === null || s.max_qty === undefined ? null : parseInt(s.max_qty, 10);
        
        if (max === null) {
            return qty >= min;
        } else {
            return qty >= min && qty <= max;
        }
    });

    return matchingSlab ? parseFloat(matchingSlab.adjustment_percent || 0) : 0;
};

// Endpoints
exports.listConfigurations = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('sam_configurations')
            .select(`
                *,
                components:sam_configuration_components(*),
                product:products(id, name, art_number)
            `)
            .order('name', { ascending: true });

        if (error) {
            if (error.code === '42P01') {
                return res.json({ error: 'SCHEMA_MISSING', message: 'SAM tables have not been created yet.' });
            }
            throw error;
        }

        res.json(data || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.createConfiguration = async (req, res) => {
    try {
        const { wholesale_slabs, retail_slabs, components } = req.body;

        // Insert Parent
        const { data: config, error: configErr } = await supabase
            .from('sam_configurations')
            .insert([{
                name: 'Default Readymade SAM Setup',
                product_id: null,
                wholesale_slabs: wholesale_slabs || [],
                retail_slabs: retail_slabs || [],
                is_active: true
            }])
            .select()
            .single();

        if (configErr) throw configErr;

        // Insert Components
        const componentsToInsert = (components || []).map(comp => ({
            configuration_id: config.id,
            name: comp.name.trim(),
            type: 'percentage',
            value: parseFloat(comp.value || 0)
        }));

        let insertedComps = [];
        if (componentsToInsert.length > 0) {
            const { data: cData, error: compErr } = await supabase
                .from('sam_configuration_components')
                .insert(componentsToInsert)
                .select();

            if (compErr) throw compErr;
            insertedComps = cData;
        }

        // Log action
        try {
            await logAction(req.user.id, 'CREATE', 'sam_configuration', config.id, {
                name: config.name,
                components: insertedComps
            });
        } catch (logErr) {
            console.error('Logging failed:', logErr.message);
        }

        res.json({ success: true, data: { ...config, components: insertedComps } });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.updateConfiguration = async (req, res) => {
    try {
        const { id } = req.params;
        const { wholesale_slabs, retail_slabs, components } = req.body;

        // Fetch old state for logging
        const { data: oldConfig } = await supabase
            .from('sam_configurations')
            .select('*, components:sam_configuration_components(*)')
            .eq('id', id)
            .single();

        // Update Parent Slabs
        const { data: config, error: configErr } = await supabase
            .from('sam_configurations')
            .update({
                wholesale_slabs: wholesale_slabs || [],
                retail_slabs: retail_slabs || [],
                updated_at: new Date()
            })
            .eq('id', id)
            .select()
            .single();

        if (configErr) throw configErr;

        // Delete old components
        const { error: deleteErr } = await supabase
            .from('sam_configuration_components')
            .delete()
            .eq('configuration_id', id);

        if (deleteErr) throw deleteErr;

        // Insert new components list
        const componentsToInsert = (components || []).map(comp => ({
            configuration_id: id,
            name: comp.name.trim(),
            type: 'percentage',
            value: parseFloat(comp.value || 0)
        }));

        let updatedComponents = [];
        if (componentsToInsert.length > 0) {
            const { data: cData, error: compErr } = await supabase
                .from('sam_configuration_components')
                .insert(componentsToInsert)
                .select();

            if (compErr) throw compErr;
            updatedComponents = cData;
        }

        // Log action
        try {
            await logAction(req.user.id, 'UPDATE', 'sam_configuration', id, {
                previous: oldConfig,
                updated: { ...config, components: updatedComponents }
            });
        } catch (logErr) {
            console.error('Logging failed:', logErr.message);
        }

        res.json({ success: true, data: { ...config, components: updatedComponents } });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.deleteConfiguration = async (req, res) => {
    try {
        const { id } = req.params;
        
        // Fetch old config for logging
        const { data: oldConfig } = await supabase
            .from('sam_configurations')
            .select('*')
            .eq('id', id)
            .single();

        const { error } = await supabase
            .from('sam_configurations')
            .delete()
            .eq('id', id);

        if (error) throw error;

        // Log action
        try {
            await logAction(req.user.id, 'DELETE', 'sam_configuration', id, {
                deleted_config: oldConfig
            });
        } catch (logErr) {
            console.error('Logging failed:', logErr.message);
        }

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.calculateSAM = async (req, res) => {
    try {
        const { product_id, quantity, sales_type, base_value, custom_components } = req.body;
        
        if (!sales_type || !['wholesale', 'retail'].includes(sales_type)) {
            return res.status(400).json({ error: 'Sales type must be wholesale or retail' });
        }
        if (!quantity || parseInt(quantity, 10) <= 0) {
            return res.status(400).json({ error: 'Quantity must be a positive integer' });
        }

        const baseValueNum = parseFloat(base_value || 100);

        // Fetch configuration
        let config = null;
        if (custom_components) {
            // Simulator mode with custom temporary components
            config = {
                name: 'Simulator Temp Config',
                wholesale_slabs: req.body.wholesale_slabs || [],
                retail_slabs: req.body.retail_slabs || [],
                components: custom_components
            };
        } else {
            config = await getActiveConfigForProduct(product_id);
        }

        if (!config) {
            return res.status(404).json({ error: 'No active SAM configuration found' });
        }

        // Calculations
        const baseSAM = calculateBaseSAM(config.components, baseValueNum);
        
        // Wholesale calculation
        const slabsW = config.wholesale_slabs;
        const adjustmentPercentW = getAdjustmentPercent(slabsW, quantity);
        const wholesaleSAM = baseSAM * (1 + adjustmentPercentW / 100);

        let finalCost = wholesaleSAM;
        let appliedSlabPercent = adjustmentPercentW;
        let adjustedSAM = wholesaleSAM;

        // Retail calculation (applied cumulatively on top of wholesale value)
        if (sales_type === 'retail') {
            const slabsR = config.retail_slabs;
            const adjustmentPercentR = getAdjustmentPercent(slabsR, quantity);
            const retailSAM = wholesaleSAM * (1 + adjustmentPercentR / 100);
            
            finalCost = retailSAM;
            adjustedSAM = retailSAM;
            appliedSlabPercent = adjustmentPercentR;
        }

        let calculationRecord = null;
        if (!custom_components) {
            // Save to history
            const { data, error: saveErr } = await supabase
                .from('sam_calculations')
                .insert([{
                    product_id: product_id ? parseInt(product_id, 10) : null,
                    sam_configuration_id: config.id,
                    sales_type,
                    quantity: parseInt(quantity, 10),
                    base_sam: baseSAM,
                    applied_slab_percent: appliedSlabPercent,
                    adjusted_sam: adjustedSAM,
                    final_sam_cost: finalCost,
                    components_snapshot: {
                        config_name: config.name,
                        base_value: baseValueNum,
                        wholesale_adjustment: adjustmentPercentW,
                        retail_adjustment: sales_type === 'retail' ? appliedSlabPercent : 0,
                        components: config.components
                    },
                    calculated_by: req.user?.id || null
                }])
                .select()
                .single();

            if (saveErr) throw saveErr;
            calculationRecord = data;

            // Proactively update the product's sam values if product_id is specified
            if (product_id) {
                const updatePayload = {};
                if (sales_type === 'wholesale') {
                    updatePayload.sam_value = finalCost;
                } else {
                    updatePayload.retail_sam_value = finalCost;
                }

                await supabase
                    .from('products')
                    .update(updatePayload)
                    .eq('id', product_id);
            }
        }

        res.json({
            success: true,
            base_sam: baseSAM,
            applied_slab_percent: appliedSlabPercent,
            adjusted_sam: adjustedSAM,
            final_sam_cost: finalCost,
            config_name: config.name,
            calculation_id: calculationRecord ? calculationRecord.id : null
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getHistory = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('sam_calculations')
            .select(`
                *,
                product:products(id, name, art_number),
                performer:user_profiles(full_name)
            `)
            .order('created_at', { ascending: false });

        if (error) {
            if (error.code === '42P01') {
                return res.json({ error: 'SCHEMA_MISSING', message: 'SAM tables have not been created yet.' });
            }
            throw error;
        }

        res.json(data || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getProductWiseReport = async (req, res) => {
    try {
        // Fetch all products
        const { data: products, error: prodErr } = await supabase
            .from('products')
            .select('id, name, art_number, gender, sam_value, retail_sam_value');

        if (prodErr) throw prodErr;

        // Fetch configurations
        const { data: configs, error: configErr } = await supabase
            .from('sam_configurations')
            .select('*, components:sam_configuration_components(*)');

        if (configErr) throw configErr;

        const defaultconfig = configs.find(c => c.product_id === null && c.is_active);
        const defaultBase = defaultconfig ? calculateBaseSAM(defaultconfig.components, 100) : 100;

        const report = (products || []).map(p => {
            const customConfig = configs.find(c => c.product_id === p.id && c.is_active);
            const baseSAM = customConfig ? calculateBaseSAM(customConfig.components, 100) : defaultBase;
            const configName = customConfig ? customConfig.name : (defaultconfig ? defaultconfig.name : 'None');

            return {
                id: p.id,
                name: p.name,
                art_number: p.art_number,
                gender: p.gender || 'Unisex',
                config_name: configName,
                base_sam: baseSAM,
                wholesale_cost: p.sam_value,
                retail_cost: p.retail_sam_value
            };
        });

        res.json(report);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getSlabAnalysis = async (req, res) => {
    try {
        const { configuration_id } = req.query;
        let config = null;

        if (configuration_id) {
            const { data } = await supabase
                .from('sam_configurations')
                .select('*, components:sam_configuration_components(*)')
                .eq('id', configuration_id)
                .single();
            config = data;
        } else {
            config = await getActiveConfigForProduct(null);
        }

        if (!config) {
            return res.status(404).json({ error: 'No configuration found' });
        }

        const baseSAM = calculateBaseSAM(config.components, 100);

        // Generate dynamic table of all slabs for Wholesale & Retail
        const wholesaleAnalysis = (config.wholesale_slabs || []).map(slab => {
            const adj = parseFloat(slab.adjustment_percent || 0);
            const finalVal = baseSAM * (1 + adj / 100);
            return {
                range: `${slab.min_qty}${slab.max_qty ? ' - ' + slab.max_qty : '+'}`,
                adjustment: adj >= 0 ? `+${adj}%` : `${adj}%`,
                final_val: finalVal,
                enabled: slab.enabled
            };
        });

        const retailAnalysis = (config.retail_slabs || []).map((slab, index) => {
            const adjR = parseFloat(slab.adjustment_percent || 0);
            // Wholesale slab matching same index/range
            const slabW = config.wholesale_slabs[index] || { adjustment_percent: 0 };
            const adjW = parseFloat(slabW.adjustment_percent || 0);
            
            // Sequential calculation: baseSAM -> wholesale -> retail
            const wholesaleVal = baseSAM * (1 + adjW / 100);
            const finalVal = wholesaleVal * (1 + adjR / 100);
            
            return {
                range: `${slab.min_qty}${slab.max_qty ? ' - ' + slab.max_qty : '+'}`,
                adjustment: adjR >= 0 ? `+${adjR}%` : `${adjR}%`,
                final_val: finalVal,
                enabled: slab.enabled
            };
        });

        res.json({
            config_name: config.name,
            base_sam: baseSAM,
            wholesale: wholesaleAnalysis,
            retail: retailAnalysis
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getComparisonReport = async (req, res) => {
    try {
        const { configuration_id } = req.query;
        let config = null;

        if (configuration_id) {
            const { data } = await supabase
                .from('sam_configurations')
                .select('*, components:sam_configuration_components(*)')
                .eq('id', configuration_id)
                .single();
            config = data;
        } else {
            config = await getActiveConfigForProduct(null);
        }

        if (!config) {
            return res.status(404).json({ error: 'No configuration found' });
        }

        const baseSAM = calculateBaseSAM(config.components, 100);
        const ranges = [
            { min: 1, max: 2, label: '1 - 2' },
            { min: 3, max: 10, label: '3 - 10' },
            { min: 11, max: 25, label: '11 - 25' },
            { min: 26, max: 100, label: '26 - 100' },
            { min: 101, max: 200, label: '101 - 200' },
            { min: 201, max: 500, label: '201 - 500' },
            { min: 501, max: 1000, label: '501 - 1000' },
            { min: 1001, max: 2000, label: '1001 - 2000' },
            { min: 2001, max: 5000, label: '2001 - 5000' },
            { min: 5001, max: null, label: '5000+' }
        ];

        const comparison = ranges.map(r => {
            const wAdj = getAdjustmentPercent(config.wholesale_slabs, r.min);
            const rAdj = getAdjustmentPercent(config.retail_slabs, r.min);

            // Sequential calculations
            const wCost = baseSAM * (1 + wAdj / 100);
            const rCost = wCost * (1 + rAdj / 100);

            return {
                range: r.label,
                wholesale_adj: wAdj >= 0 ? `+${wAdj}%` : `${wAdj}%`,
                wholesale_cost: wCost,
                retail_adj: rAdj >= 0 ? `+${rAdj}%` : `${rAdj}%`,
                retail_cost: rCost,
                difference: rCost - wCost,
                markup_percent: wCost > 0 ? ((rCost - wCost) / wCost * 100) : 0
            };
        });

        res.json({
            config_name: config.name,
            base_sam: baseSAM,
            comparison
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getAuditLogs = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('audit_logs')
            .select(`
                *,
                performer:user_profiles (
                    full_name
                )
            `)
            .eq('entity_type', 'sam_configuration')
            .order('created_at', { ascending: false })
            .limit(100);

        if (error) throw error;

        const formatted = (data || []).map(l => ({
            id: l.id.slice(0, 8),
            action: l.action,
            entity_type: l.entity_type,
            user: l.performer?.full_name || 'System / External',
            details: JSON.stringify(l.details),
            time: new Date(l.created_at).toLocaleString(),
            created_at: l.created_at
        }));

        res.json(formatted);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Fabric SAM - Inward Transportation Controllers
exports.listInwardTransportation = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('fabric_inward_transportation')
            .select('*')
            .order('item', { ascending: true })
            .order('width', { ascending: true });

        if (error) {
            if (error.code === '42P01') {
                return res.json({ error: 'SCHEMA_MISSING', message: 'Inward transportation table has not been created yet.' });
            }
            throw error;
        }
        res.json(data || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.createInwardTransportation = async (req, res) => {
    try {
        const { item, width, rate } = req.body;
        if (!item || !width || rate === undefined || rate === null) {
            return res.status(400).json({ error: 'Item, width, and rate are required.' });
        }
        const { data, error } = await supabase
            .from('fabric_inward_transportation')
            .insert([{ 
                item: item.toUpperCase().trim(), 
                width: width.trim(), 
                rate: parseFloat(rate) 
            }])
            .select()
            .single();

        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.updateInwardTransportation = async (req, res) => {
    try {
        const { id } = req.params;
        const { item, width, rate } = req.body;
        const { data, error } = await supabase
            .from('fabric_inward_transportation')
            .update({ 
                item: item ? item.toUpperCase().trim() : undefined, 
                width: width ? width.trim() : undefined, 
                rate: rate !== undefined && rate !== null ? parseFloat(rate) : undefined,
                updated_at: new Date()
            })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.deleteInwardTransportation = async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabase
            .from('fabric_inward_transportation')
            .delete()
            .eq('id', id);

        if (error) throw error;
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Fabric SAM - Margin Calculations Controllers
exports.listMargins = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('fabric_margin_calculations')
            .select('*')
            .order('sales_type', { ascending: true })
            .order('customer_type', { ascending: true });

        if (error) {
            if (error.code === '42P01') {
                return res.json({ error: 'SCHEMA_MISSING', message: 'Margin calculations table has not been created yet.' });
            }
            throw error;
        }
        res.json(data || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.createMargin = async (req, res) => {
    try {
        const { sales_type, customer_type, branded, semi_branded, non_branded } = req.body;
        if (!sales_type || !customer_type || branded === undefined || semi_branded === undefined || non_branded === undefined) {
            return res.status(400).json({ error: 'All margin fields are required.' });
        }
        const { data, error } = await supabase
            .from('fabric_margin_calculations')
            .insert([{ 
                sales_type: sales_type.toUpperCase().trim(), 
                customer_type: customer_type.toUpperCase().trim(), 
                branded: parseFloat(branded), 
                semi_branded: parseFloat(semi_branded), 
                non_branded: parseFloat(non_branded) 
            }])
            .select()
            .single();

        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.updateMargin = async (req, res) => {
    try {
        const { id } = req.params;
        const { sales_type, customer_type, branded, semi_branded, non_branded } = req.body;
        const { data, error } = await supabase
            .from('fabric_margin_calculations')
            .update({ 
                sales_type: sales_type ? sales_type.toUpperCase().trim() : undefined, 
                customer_type: customer_type ? customer_type.toUpperCase().trim() : undefined, 
                branded: branded !== undefined && branded !== null ? parseFloat(branded) : undefined, 
                semi_branded: semi_branded !== undefined && semi_branded !== null ? parseFloat(semi_branded) : undefined, 
                non_branded: non_branded !== undefined && non_branded !== null ? parseFloat(non_branded) : undefined,
                updated_at: new Date()
            })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.deleteMargin = async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabase
            .from('fabric_margin_calculations')
            .delete()
            .eq('id', id);

        if (error) throw error;
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
