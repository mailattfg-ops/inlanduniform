const supabase = require('../config/supabase');

const parseMaterialsMetadata = (rawText) => {
    if (!rawText) return { main_fabric_id: null, attachment_fabric1_id: null, attachment_fabric2_id: null, cleanMaterials: '' };
    
    let text = rawText;
    let main_fabric_id = null;
    let attachment_fabric1_id = null;
    let attachment_fabric2_id = null;

    // Parse main_fabric_id
    const mainMatch = text.match(/\[MainFabricId:\s*([^\]]+)\]/);
    if (mainMatch) {
        main_fabric_id = mainMatch[1];
        text = text.replace(/\[MainFabricId:\s*([^\]]+)\]/, '').trim();
    }
    
    // Parse attachment_fabric1_id
    const att1Match = text.match(/\[AttachmentFabric1Id:\s*([^\]]+)\]/);
    if (att1Match) {
        attachment_fabric1_id = att1Match[1];
        text = text.replace(/\[AttachmentFabric1Id:\s*([^\]]+)\]/, '').trim();
    }

    // Parse attachment_fabric2_id
    const att2Match = text.match(/\[AttachmentFabric2Id:\s*([^\]]+)\]/);
    if (att2Match) {
        attachment_fabric2_id = att2Match[1];
        text = text.replace(/\[AttachmentFabric2Id:\s*([^\]]+)\]/, '').trim();
    }

    return { main_fabric_id, attachment_fabric1_id, attachment_fabric2_id, cleanMaterials: text };
};

const serializeMaterialsMetadata = (materials, main_fabric_id, attachment_fabric1_id, attachment_fabric2_id) => {
    let text = materials || '';
    if (main_fabric_id) text = `[MainFabricId: ${main_fabric_id}] ${text}`;
    if (attachment_fabric1_id) text = `[AttachmentFabric1Id: ${attachment_fabric1_id}] ${text}`;
    if (attachment_fabric2_id) text = `[AttachmentFabric2Id: ${attachment_fabric2_id}] ${text}`;
    return text.trim();
};

async function findOrCreateProductDesignNumber(code) {
    if (!code || code.trim() === '') return null;
    const cleanCode = code.trim();

    // Check if it exists
    const { data: existing, error } = await supabase
        .from('design_numbers')
        .select('id')
        .eq('code', cleanCode)
        .maybeSingle();

    if (existing) return existing.id;

    // Insert new
    const { data: inserted, error: insertError } = await supabase
        .from('design_numbers')
        .insert([{ code: cleanCode }])
        .select('id')
        .single();

    if (insertError) throw insertError;
    return inserted.id;
}


async function registerArtNumberInHub(art_number, base_size, fit) {
    if (!art_number) return;
    try {
        const parts = art_number.split('-');
        if (parts.length !== 2) return;
        
        const genderCode = parts[0];
        const rest = parts[1]; // e.g. "4J012"
        
        // 1. Fetch gender
        const { data: genderData } = await supabase
            .from('art_genders')
            .select('id')
            .eq('code', genderCode)
            .single();
            
        if (!genderData) return;
        
        // 2. Fetch all dresses to find prefix match
        const { data: dresses } = await supabase
            .from('art_dresses')
            .select('id, code');
            
        if (!dresses) return;
        
        let foundDress = null;
        let foundPattern = null;
        
        for (const d of dresses) {
            if (rest.startsWith(d.code)) {
                const remainder = rest.slice(d.code.length);
                
                // 3. Fetch matching pattern
                const { data: patternData } = await supabase
                    .from('art_patterns')
                    .select('id')
                    .eq('code', remainder)
                    .single();
                    
                if (patternData) {
                    foundDress = d;
                    foundPattern = patternData;
                    break;
                }
            }
        }
        
        if (foundDress && foundPattern) {
            const { error: insertError } = await supabase
                .from('art_numbers')
                .insert([{
                    dress_id: foundDress.id,
                    gender_id: genderData.id,
                    pattern_id: foundPattern.id,
                    code: art_number,
                    base_size: base_size || null,
                    fit: fit || null
                }]);
                
            if (insertError && insertError.code !== '23505') {
                console.error('Error inserting art number into hub:', insertError.message);
            }
        }
    } catch (err) {
        console.error('Failed to register art number in hub:', err.message);
    }
}

exports.listProducts = async (req, res) => {
    try {
        const { data: products, error: prodError } = await supabase
            .from('products')
            .select(`
                *,
                product_types(id, name),
                design_number_ref:design_numbers(code)
            `)
            .order('created_at', { ascending: false });

        if (prodError) throw prodError;

        const formatted = (products || []).map(p => {
            const meta = parseMaterialsMetadata(p.materials);
            return {
                ...p,
                design_number: p.design_number_ref?.code || null,
                design_number_ref: undefined,
                main_fabric_id: meta.main_fabric_id,
                attachment_fabric1_id: meta.attachment_fabric1_id,
                attachment_fabric2_id: meta.attachment_fabric2_id,
                materials: meta.cleanMaterials
            };
        });

        res.json(formatted || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.createProduct = async (req, res) => {
    try {
        let { 
            name, art_number, gender, measurements, materials, entry_methods, size_chart_id, category, product_type_id, sam_value, retail_sam_value,
            main_fabric, attachment_fabric1, attachment_fabric2, button_count, thread_count, base_size, fit, images, design_number,
            main_fabric_id, attachment_fabric1_id, attachment_fabric2_id, button_id, thread_id,
            other_sizes, other_fits, measurement_type, class_fabric_consumption, remarks
        } = req.body;
        
        if (!design_number || design_number.trim() === '') {
            design_number = await generateNextDesignNumberInternal();
        } else {
            design_number = design_number.trim();
        }

        const designNumberId = await findOrCreateProductDesignNumber(design_number);

        const serializedMaterials = serializeMaterialsMetadata(
            materials,
            main_fabric_id,
            attachment_fabric1_id,
            attachment_fabric2_id
        );
        
        const { data, error } = await supabase
            .from('products')
            .insert([{ 
                name, 
                art_number, 
                gender, 
                measurements, 
                materials: serializedMaterials, 
                entry_methods, 
                size_chart_id, 
                category, 
                product_type_id, 
                sam_value: sam_value !== '' && sam_value !== null && sam_value !== undefined ? parseFloat(sam_value) : null,
                retail_sam_value: retail_sam_value !== '' && retail_sam_value !== null && retail_sam_value !== undefined ? parseFloat(retail_sam_value) : null,
                main_fabric: main_fabric !== '' && main_fabric !== null && main_fabric !== undefined ? parseInt(main_fabric, 10) : 0,
                attachment_fabric1: attachment_fabric1 !== '' && attachment_fabric1 !== null && attachment_fabric1 !== undefined ? parseInt(attachment_fabric1, 10) : null,
                attachment_fabric2: attachment_fabric2 !== '' && attachment_fabric2 !== null && attachment_fabric2 !== undefined ? parseInt(attachment_fabric2, 10) : null,
                button_count: button_count !== '' && button_count !== null && button_count !== undefined ? parseInt(button_count, 10) : 0,
                thread_count: thread_count !== '' && thread_count !== null && thread_count !== undefined ? parseInt(thread_count, 10) : 0,
                button_id: button_id || null,
                thread_id: thread_id || null,
                base_size: base_size || null,
                fit: fit || null,
                images: images || [],
                design_number_id: designNumberId,
                other_sizes: other_sizes || null,
                other_fits: other_fits || null,
                measurement_type: measurement_type || null,
                class_fabric_consumption: class_fabric_consumption || {},
                remarks: remarks || null
            }])
            .select()
            .single();

        if (error) {
            if (error.code === '23505') {
                return res.status(400).json({ error: 'A product with this ART Number already exists' });
            }
            throw error;
        }

        // Log the action
        const { logAction } = require('../utils/logger');
        await logAction(req.user.id, 'CREATE', 'product', data.id, { name: data.name });

        // Auto-register the pattern code in art_patterns if it doesn't exist
        if (art_number) {
            try {
                const artParts = art_number.split('-');
                if (artParts.length === 2) {
                    const { data: allDresses } = await supabase.from('art_dresses').select('code');
                    const rest = artParts[1];
                    let patternCode = rest;
                    if (allDresses) {
                        for (const d of allDresses) {
                            if (rest.startsWith(d.code)) {
                                patternCode = rest.slice(d.code.length);
                                break;
                            }
                        }
                    }
                    if (patternCode) {
                        const { data: existingPattern } = await supabase
                            .from('art_patterns')
                            .select('id')
                            .eq('code', patternCode)
                            .maybeSingle();
                        if (!existingPattern) {
                            await supabase.from('art_patterns').insert([{
                                code: patternCode,
                                name: `Pattern ${patternCode}`
                            }]);
                        }
                    }
                }
            } catch (patternErr) {
                console.error('Pattern auto-register error (non-critical):', patternErr.message);
            }
        }

        // Register in Art Number Hub
        await registerArtNumberInHub(data.art_number, data.base_size, data.fit);

        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.updateProduct = async (req, res) => {
    try {
        const { id } = req.params;
        const { 
            name, art_number, gender, measurements, materials, entry_methods, size_chart_id, category, product_type_id, sam_value, retail_sam_value,
            main_fabric, attachment_fabric1, attachment_fabric2, button_count, thread_count, base_size, fit, images, design_number,
            main_fabric_id, attachment_fabric1_id, attachment_fabric2_id, button_id, thread_id,
            other_sizes, other_fits, measurement_type, class_fabric_consumption, remarks
        } = req.body;
        
        const designNumberId = design_number ? await findOrCreateProductDesignNumber(design_number) : null;

        const serializedMaterials = serializeMaterialsMetadata(
            materials,
            main_fabric_id,
            attachment_fabric1_id,
            attachment_fabric2_id
        );

        // Fetch current base product values to detect button/thread changes
        const { data: currentProduct } = await supabase
            .from('products')
            .select('button_id, thread_id, button_count, thread_count, design_number_id')
            .eq('id', id)
            .maybeSingle();

        const normNewButtonId = button_id || null;
        const normNewThreadId = thread_id || null;
        const normCurButtonId = currentProduct?.button_id || null;
        const normCurThreadId = currentProduct?.thread_id || null;

        const buttonChanged = normNewButtonId !== normCurButtonId;
        const threadChanged = normNewThreadId !== normCurThreadId;

        // If button or thread changed, auto-create a variant for the NEW combination
        // so the base design number stays clean with its original specs.
        if ((buttonChanged || threadChanged) && (normNewButtonId || normNewThreadId)) {
            // Check if a variant already exists for the new combination
            const { data: existingVariant } = await supabase
                .from('product_design_variants')
                .select('id, design_number_id, design_numbers(code)')
                .eq('product_id', id)
                .eq('button_id', normNewButtonId)
                .eq('thread_id', normNewThreadId)
                .maybeSingle();

            if (!existingVariant) {
                // Also make sure it doesn't match the base product itself
                const baseMatches = normNewButtonId === normCurButtonId && normNewThreadId === normCurThreadId;
                if (!baseMatches) {
                    // Create a new variant design number for the new combination
                    const nextCode = await generateNextDesignNumberInternal();
                    const { data: newDn, error: dnErr } = await supabase
                        .from('design_numbers')
                        .insert([{ code: nextCode }])
                        .select()
                        .single();

                    if (!dnErr && newDn) {
                        await supabase
                            .from('product_design_variants')
                            .insert([{
                                product_id: parseInt(id, 10),
                                design_number_id: newDn.id,
                                button_id: normNewButtonId,
                                thread_id: normNewThreadId,
                                button_count: parseInt(button_count, 10) || 0,
                                thread_count: parseInt(thread_count, 10) || 0,
                                variant_status: 'active'
                            }]);
                    }
                }
            }

            // Keep the base product's button/thread unchanged (don't overwrite)
            const { data, error } = await supabase
                .from('products')
                .update({ 
                    name, 
                    art_number, 
                    gender, 
                    measurements, 
                    materials: serializedMaterials, 
                    entry_methods, 
                    size_chart_id,
                    category,
                    product_type_id,
                    sam_value: sam_value !== '' && sam_value !== null && sam_value !== undefined ? parseFloat(sam_value) : null,
                    retail_sam_value: retail_sam_value !== '' && retail_sam_value !== null && retail_sam_value !== undefined ? parseFloat(retail_sam_value) : null,
                    main_fabric: main_fabric !== '' && main_fabric !== null && main_fabric !== undefined ? parseInt(main_fabric, 10) : 0,
                    attachment_fabric1: attachment_fabric1 !== '' && attachment_fabric1 !== null && attachment_fabric1 !== undefined ? parseInt(attachment_fabric1, 10) : null,
                    attachment_fabric2: attachment_fabric2 !== '' && attachment_fabric2 !== null && attachment_fabric2 !== undefined ? parseInt(attachment_fabric2, 10) : null,
                    // Keep base button/thread unchanged - they belong to the base design number
                    button_count: currentProduct?.button_count !== undefined ? currentProduct.button_count : 0,
                    thread_count: currentProduct?.thread_count !== undefined ? currentProduct.thread_count : 0,
                    button_id: normCurButtonId,
                    thread_id: normCurThreadId,
                    base_size: base_size || null,
                    fit: fit || null,
                    images: images || [],
                    design_number_id: designNumberId || currentProduct?.design_number_id || null,
                    other_sizes: other_sizes || null,
                    other_fits: other_fits || null,
                    measurement_type: measurement_type || null,
                    class_fabric_consumption: class_fabric_consumption || {},
                    remarks: remarks || null,
                    updated_at: new Date() 
                })
                .eq('id', id)
                .select()
                .single();

            if (error) {
                if (error.code === '23505') {
                    return res.status(400).json({ error: 'A product with this ART Number already exists' });
                }
                throw error;
            }

            const { logAction } = require('../utils/logger');
            await logAction(req.user.id, 'UPDATE', 'product', id, { name: data.name });
            await registerArtNumberInHub(data.art_number, data.base_size, data.fit);
            return res.json({ ...data, variant_created: true });
        }
        
        // No button/thread change – regular update
        const { data, error } = await supabase
            .from('products')
            .update({ 
                name, 
                art_number, 
                gender, 
                measurements, 
                materials: serializedMaterials, 
                entry_methods, 
                size_chart_id,
                category,
                product_type_id,
                sam_value: sam_value !== '' && sam_value !== null && sam_value !== undefined ? parseFloat(sam_value) : null,
                retail_sam_value: retail_sam_value !== '' && retail_sam_value !== null && retail_sam_value !== undefined ? parseFloat(retail_sam_value) : null,
                main_fabric: main_fabric !== '' && main_fabric !== null && main_fabric !== undefined ? parseInt(main_fabric, 10) : 0,
                attachment_fabric1: attachment_fabric1 !== '' && attachment_fabric1 !== null && attachment_fabric1 !== undefined ? parseInt(attachment_fabric1, 10) : null,
                attachment_fabric2: attachment_fabric2 !== '' && attachment_fabric2 !== null && attachment_fabric2 !== undefined ? parseInt(attachment_fabric2, 10) : null,
                button_count: button_count !== '' && button_count !== null && button_count !== undefined ? parseInt(button_count, 10) : 0,
                thread_count: thread_count !== '' && thread_count !== null && thread_count !== undefined ? parseInt(thread_count, 10) : 0,
                button_id: button_id || null,
                thread_id: thread_id || null,
                base_size: base_size || null,
                fit: fit || null,
                images: images || [],
                design_number_id: designNumberId,
                other_sizes: other_sizes || null,
                other_fits: other_fits || null,
                measurement_type: measurement_type || null,
                class_fabric_consumption: class_fabric_consumption || {},
                remarks: remarks || null,
                updated_at: new Date() 
            })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            if (error.code === '23505') {
                return res.status(400).json({ error: 'A product with this ART Number already exists' });
            }
            throw error;
        }

        // Log the action
        const { logAction } = require('../utils/logger');
        await logAction(req.user.id, 'UPDATE', 'product', id, { name: data.name });

        // Register in Art Number Hub (handles new edit updates)
        await registerArtNumberInHub(data.art_number, data.base_size, data.fit);

        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};


exports.deleteProduct = async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabase
            .from('products')
            .delete()
            .eq('id', id);

        if (error) throw error;

        // Log the action
        const { logAction } = require('../utils/logger');
        await logAction(req.user.id, 'DELETE', 'product', id, { product_id: id });

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

async function generateNextDesignNumberInternal() {
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
        console.error('Exception in generateNextDesignNumberInternal:', err.message);
        return 'DNS-0001';
    }
}

exports.getNextDesignNumber = async (req, res) => {
    try {
        const nextDesignNumber = await generateNextDesignNumberInternal();
        res.json({ nextDesignNumber });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getProductVariants = async (req, res) => {
    try {
        const { id } = req.params;
        const { data, error } = await supabase
            .from('product_design_variants')
            .select(`
                *,
                design_numbers(id, code),
                buttons(id, name),
                threads(id, name, code)
            `)
            .eq('product_id', id);

        if (error) throw error;
        
        const formatted = (data || []).map(v => ({
            id: v.id,
            product_id: v.product_id,
            design_number_id: v.design_number_id,
            design_code: v.design_numbers?.code || 'DNS-xxxx',
            button_id: v.button_id,
            button_name: v.buttons?.name || 'Standard',
            button_count: v.button_count,
            thread_id: v.thread_id,
            thread_name: v.threads?.name || 'Standard',
            thread_code: v.threads?.code || 'Standard',
            thread_count: v.thread_count,
            material_combination: v.material_combination || '',
            variant_status: v.variant_status,
            created_at: v.created_at
        }));

        res.json(formatted);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.createProductVariant = async (req, res) => {
    try {
        const { id: product_id } = req.params;
        const { button_id, thread_id, button_count, thread_count, material_combination } = req.body;

        const { data: existingVariant, error: findError } = await supabase
            .from('product_design_variants')
            .select('id, design_number_id, design_numbers(code)')
            .eq('product_id', product_id)
            .eq('button_id', button_id || null)
            .eq('thread_id', thread_id || null)
            .maybeSingle();

        if (findError) throw findError;

        if (existingVariant) {
            return res.status(400).json({ 
                error: 'Combination already exists', 
                design_number: existingVariant.design_numbers?.code,
                design_number_id: existingVariant.design_number_id,
                id: existingVariant.id
            });
        }

        const { data: baseProduct, error: baseError } = await supabase
            .from('products')
            .select('id, design_number_id, design_numbers(code)')
            .eq('id', product_id)
            .eq('button_id', button_id || null)
            .eq('thread_id', thread_id || null)
            .maybeSingle();

        if (baseError) throw baseError;

        if (baseProduct) {
            return res.status(400).json({
                error: 'Combination matches default/base product design',
                design_number: baseProduct.design_numbers?.code,
                design_number_id: baseProduct.design_number_id
            });
        }

        const nextCode = await generateNextDesignNumberInternal();
        const { data: newDn, error: dnError } = await supabase
            .from('design_numbers')
            .insert([{ code: nextCode }])
            .select()
            .single();

        if (dnError) throw dnError;

        const { data: variant, error: varError } = await supabase
            .from('product_design_variants')
            .insert([{
                product_id: parseInt(product_id, 10),
                design_number_id: newDn.id,
                button_id: button_id || null,
                thread_id: thread_id || null,
                button_count: button_count !== undefined && button_count !== '' && button_count !== null ? parseInt(button_count, 10) : 0,
                thread_count: thread_count !== undefined && thread_count !== '' && thread_count !== null ? parseInt(thread_count, 10) : 0,
                material_combination: material_combination || '',
                variant_status: 'active'
            }])
            .select(`
                *,
                design_numbers(id, code),
                buttons(id, name),
                threads(id, name, code)
            `)
            .single();

        if (varError) {
            await supabase.from('design_numbers').delete().eq('id', newDn.id);
            throw varError;
        }

        res.json({
            id: variant.id,
            product_id: variant.product_id,
            design_number_id: variant.design_number_id,
            design_code: variant.design_numbers?.code || nextCode,
            button_id: variant.button_id,
            button_name: variant.buttons?.name || 'Standard',
            button_count: variant.button_count,
            thread_id: variant.thread_id,
            thread_name: variant.threads?.name || 'Standard',
            thread_code: variant.threads?.code || 'Standard',
            thread_count: variant.thread_count,
            material_combination: variant.material_combination,
            variant_status: variant.variant_status,
            created_at: variant.created_at
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

