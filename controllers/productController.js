const supabase = require('../config/supabase');

const parseMaterialsMetadata = (rawText) => {
    if (!rawText) return { main_fabric_id: null, attachment_fabric1_id: null, attachment_fabric2_id: null, main_fabric_meters: null, cleanMaterials: '' };
    
    let text = rawText;
    let main_fabric_id = null;
    let attachment_fabric1_id = null;
    let attachment_fabric2_id = null;
    let main_fabric_meters = null;

    // Parse main_fabric_id
    const mainMatch = text.match(/\[MainFabricId:\s*([^\]]+)\]/);
    if (mainMatch) {
        main_fabric_id = mainMatch[1];
        text = text.replace(/\[MainFabricId:\s*([^\]]+)\]/, '').trim();
    }

    // Parse main_fabric_meters
    const mainMetersMatch = text.match(/\[MainFabricMeters:\s*([^\]]+)\]/);
    if (mainMetersMatch) {
        const parsed = parseFloat(mainMetersMatch[1]);
        if (!isNaN(parsed)) main_fabric_meters = parsed;
        text = text.replace(/\[MainFabricMeters:\s*([^\]]+)\]/, '').trim();
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

    return { main_fabric_id, attachment_fabric1_id, attachment_fabric2_id, main_fabric_meters, cleanMaterials: text };
};

const serializeMaterialsMetadata = (materials, main_fabric_id, attachment_fabric1_id, attachment_fabric2_id, main_fabric_meters) => {
    let text = materials || '';
    if (main_fabric_id) text = `[MainFabricId: ${main_fabric_id}] ${text}`;
    if (attachment_fabric1_id) text = `[AttachmentFabric1Id: ${attachment_fabric1_id}] ${text}`;
    if (attachment_fabric2_id) text = `[AttachmentFabric2Id: ${attachment_fabric2_id}] ${text}`;
    if (main_fabric_meters !== undefined && main_fabric_meters !== null && main_fabric_meters !== '') {
        text = `[MainFabricMeters: ${main_fabric_meters}] ${text}`;
    }
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


async function registerArtNumberInHub(art_number, base_size, fit, allowance) {
    if (!art_number) return;
    try {
        const parts = art_number.split('-');
        let dressCode = null;
        let genderCode = null;
        let patternCode = null;
        let fitCode = null;
        let artAllowance = allowance || null;

        // 5-part: [DressPrefix]-[Gender]-[Pattern]-[Fit]-[Allowance] (e.g. 4J-1-012-R-2)
        if (parts.length === 5) {
            dressCode = parts[0];
            genderCode = parts[1];
            patternCode = parts[2];
            fitCode = parts[3].toUpperCase();
            artAllowance = parts[4];
        } else if (parts.length === 4) {
            // A) Option 1 with allowance: [DressPrefix]-[GenderPattern]-[Fit]-[Allowance] (e.g. 4J-1012-R-2)
            // B) Legacy 4-part: [DressPrefix]-[Gender]-[Pattern]-[Fit] (e.g. 4J-1-012-R)
            if (parts[2].length <= 2 && isNaN(Number(parts[2]))) {
                dressCode = parts[0];
                const middle = parts[1];
                genderCode = middle.slice(0, 1);
                patternCode = middle.slice(1);
                fitCode = parts[2].toUpperCase();
                artAllowance = parts[3];
            } else {
                dressCode = parts[0];
                genderCode = parts[1];
                patternCode = parts[2];
                fitCode = parts[3].toUpperCase();
            }
        } else if (parts.length === 3) {
            dressCode = parts[0];
            const middle = parts[1];
            const lastPart = parts[2];

            // If lastPart starts with fit letters (S, R, L, etc.) followed optionally by allowance (e.g. R2, R1.5, R)
            const fitMatch = lastPart.match(/^([A-Za-z]+)(.*)$/);
            if (fitMatch && isNaN(Number(lastPart))) {
                fitCode = fitMatch[1].toUpperCase();
                if (fitMatch[2] && !artAllowance) {
                    artAllowance = fitMatch[2].trim();
                }
                genderCode = middle.slice(0, 1);
                patternCode = middle.slice(1);
            } else {
                // Legacy: [DressPrefix]-[Gender]-[Pattern] (e.g. 4J-1-012)
                genderCode = parts[1];
                patternCode = parts[2];
                if (fit) {
                    fitCode = fit.trim().slice(0, 1).toUpperCase();
                }
            }
        } else if (parts.length === 2) {
            // Check if parts[0] is Dress Prefix (e.g. 4J-1012)
            const { data: dMatch } = await supabase.from('art_dresses').select('id, code').eq('code', parts[0]).maybeSingle();
            if (dMatch) {
                dressCode = dMatch.code;
                const rest = parts[1];
                const { data: genders } = await supabase.from('art_genders').select('id, code');
                if (genders) {
                    for (const g of genders) {
                        if (rest.startsWith(g.code)) {
                            genderCode = g.code;
                            patternCode = rest.slice(g.code.length);
                            break;
                        }
                    }
                }
            } else {
                // Legacy: [GenderCode]-[DressPrefix][PatternCode] (e.g. 1-4J012)
                genderCode = parts[0];
                const rest = parts[1];
                const { data: dresses } = await supabase.from('art_dresses').select('id, code');
                if (dresses) {
                    for (const d of dresses) {
                        if (rest.startsWith(d.code)) {
                            dressCode = d.code;
                            patternCode = rest.slice(d.code.length);
                            break;
                        }
                    }
                }
            }
            if (fit) {
                fitCode = fit.trim().slice(0, 1).toUpperCase();
            }
        }

        if (!dressCode || !genderCode || !patternCode) return;

        // 1. Fetch dress
        const { data: foundDress } = await supabase
            .from('art_dresses')
            .select('id')
            .eq('code', dressCode)
            .maybeSingle();

        // 2. Fetch gender
        const { data: foundGender } = await supabase
            .from('art_genders')
            .select('id')
            .eq('code', genderCode)
            .maybeSingle();

        // 3. Fetch pattern
        let { data: foundPattern } = await supabase
            .from('art_patterns')
            .select('id')
            .eq('code', patternCode)
            .maybeSingle();

        if (!foundPattern && patternCode) {
            const { data: newPat } = await supabase
                .from('art_patterns')
                .insert([{ code: patternCode, name: `Pattern ${patternCode}` }])
                .select('id')
                .maybeSingle();
            foundPattern = newPat;
        }

        // 4. Fetch / resolve fit
        let foundFitId = null;
        if (fitCode) {
            let { data: foundFit } = await supabase
                .from('art_fits')
                .select('id, name')
                .eq('code', fitCode)
                .maybeSingle();

            if (!foundFit && fitCode) {
                const fitName = fitCode === 'S' ? 'Slim Fit' : (fitCode === 'L' ? 'Loose Fit' : 'Regular Fit');
                const { data: newFit } = await supabase
                    .from('art_fits')
                    .insert([{ code: fitCode, name: fitName }])
                    .select('id, name')
                    .maybeSingle();
                foundFit = newFit;
            }
            if (foundFit) {
                foundFitId = foundFit.id;
                if (!fit) fit = foundFit.name;
            }
        }

        if (foundDress && foundGender && foundPattern) {
            const artInsertData = {
                dress_id: foundDress.id,
                gender_id: foundGender.id,
                pattern_id: foundPattern.id,
                fit_id: foundFitId,
                code: art_number,
                art_number: art_number,
                base_size: base_size || null,
                fit: fit || null,
                allowance: artAllowance ? String(artAllowance).trim() : null
            };
            const { error: insertError } = await supabase
                .from('art_numbers')
                .insert([artInsertData]);

            if (insertError && insertError.code !== '23505') {
                if (insertError.message?.includes('allowance')) {
                    delete artInsertData.allowance;
                    await supabase.from('art_numbers').insert([artInsertData]);
                } else {
                    console.error('Error inserting art number into hub:', insertError.message);
                }
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
                product_types(id, name)
            `)
            .order('created_at', { ascending: false });

        if (prodError) {
            console.error('❌ [DATABASE ERROR] Table "products" query failed:');
            console.error('  Code:', prodError.code, '| Message:', prodError.message);
            if (prodError.code === '42P01') {
                console.error('  Hint: Table public.products is missing in database.');
            } else if (prodError.code === '42703') {
                console.error('  Hint: A referenced column does not exist on products or joined tables.');
            }
            return res.status(500).json({ error: prodError.message, code: prodError.code });
        }

        const dnIds = (products || []).map(p => p.design_number_id).filter(Boolean);
        let dnMap = {};
        if (dnIds.length > 0) {
            const { data: dns } = await supabase
                .from('design_numbers')
                .select('id, code')
                .in('id', dnIds);
            (dns || []).forEach(d => { dnMap[d.id] = d.code; });
        }

        const formatted = (products || []).map(p => {
            const meta = parseMaterialsMetadata(p.materials);
            const resolvedMainFabric = (p.main_fabric !== null && p.main_fabric !== undefined && p.main_fabric !== '')
                ? Number(p.main_fabric)
                : (p.class_fabric_consumption?._base_main_fabric !== undefined && p.class_fabric_consumption?._base_main_fabric !== null && p.class_fabric_consumption?._base_main_fabric !== ''
                    ? Number(p.class_fabric_consumption._base_main_fabric)
                    : (meta.main_fabric_meters !== null ? Number(meta.main_fabric_meters) : (p.class_fabric_consumption?.Corporate?.main_fabric ? Number(p.class_fabric_consumption.Corporate.main_fabric) : null)));

            return {
                ...p,
                main_fabric: resolvedMainFabric,
                main_fabric_meters: resolvedMainFabric,
                design_number: dnMap[p.design_number_id] || null,
                main_fabric_id: p.main_fabric_id || meta.main_fabric_id || p.class_fabric_consumption?._base_main_fabric_id || null,
                attachment_fabric1_id: p.attachment_fabric1_id || meta.attachment_fabric1_id,
                attachment_fabric2_id: p.attachment_fabric2_id || meta.attachment_fabric2_id,
                trims: Array.isArray(p.trims) && p.trims.length > 0 ? p.trims : (p.class_fabric_consumption?._base_trims || []),
                attachment_fabrics: Array.isArray(p.attachment_fabrics) && p.attachment_fabrics.length > 0 ? p.attachment_fabrics : (p.class_fabric_consumption?._base_attachment_fabrics || []),
                materials: meta.cleanMaterials
            };
        });

        // Live data directly from database! If table is blank, returns []
        res.json(formatted || []);
    } catch (err) {
        console.error('❌ [DATABASE ERROR] listProducts caught exception:', err.message);
        res.status(500).json({ error: err.message });
    }
};

async function safeInsertProduct(payload) {
    let currentPayload = { ...payload };
    // Strip out any keys with undefined values
    Object.keys(currentPayload).forEach(key => {
        if (currentPayload[key] === undefined) delete currentPayload[key];
    });

    for (let attempt = 0; attempt < 10; attempt++) {
        const { data, error } = await supabase
            .from('products')
            .insert([currentPayload])
            .select()
            .single();

        if (!error) return { data, error: null };

        // Handle missing column in schema cache
        const missingColMatch = error.message && error.message.match(/Could not find the '([^']+)' column of 'products'/i);
        if (missingColMatch && missingColMatch[1]) {
            const missingCol = missingColMatch[1];
            console.warn(`Column '${missingCol}' not found in products table schema cache. Omitting and retrying...`);
            delete currentPayload[missingCol];
            continue;
        }

        // Handle foreign key constraint violations
        if (error.code === '23503' || (error.message && error.message.includes('foreign key constraint'))) {
            if (error.message.includes('button_id') && currentPayload.button_id !== undefined) {
                console.warn('Foreign key violation on button_id. Omitting button_id and retrying...');
                delete currentPayload.button_id;
                continue;
            }
            if (error.message.includes('thread_id') && currentPayload.thread_id !== undefined) {
                console.warn('Foreign key violation on thread_id. Omitting thread_id and retrying...');
                delete currentPayload.thread_id;
                continue;
            }
            if ((error.message.includes('main_fabric_id') || error.message.includes('fabric')) && currentPayload.main_fabric_id !== undefined) {
                console.warn('Foreign key violation on fabric. Omitting main_fabric_id and retrying...');
                delete currentPayload.main_fabric_id;
                delete currentPayload.attachment_fabric1_id;
                delete currentPayload.attachment_fabric2_id;
                continue;
            }
            if (error.message.includes('product_type_id') && currentPayload.product_type_id !== undefined) {
                console.warn('Foreign key violation on product_type_id. Omitting product_type_id and retrying...');
                delete currentPayload.product_type_id;
                continue;
            }
            if (error.message.includes('size_chart_id') && currentPayload.size_chart_id !== undefined) {
                console.warn('Foreign key violation on size_chart_id. Omitting size_chart_id and retrying...');
                delete currentPayload.size_chart_id;
                continue;
            }
        }

        return { data: null, error };
    }
    return { data: null, error: new Error('Max retry attempts reached inserting product') };
}

async function safeUpdateProduct(id, payload) {
    let currentPayload = { ...payload };
    // Strip out any keys with undefined values
    Object.keys(currentPayload).forEach(key => {
        if (currentPayload[key] === undefined) delete currentPayload[key];
    });

    for (let attempt = 0; attempt < 10; attempt++) {
        const { data, error } = await supabase
            .from('products')
            .update(currentPayload)
            .eq('id', id)
            .select()
            .single();

        if (!error) return { data, error: null };

        // Handle missing column in schema cache
        const missingColMatch = error.message && error.message.match(/Could not find the '([^']+)' column of 'products'/i);
        if (missingColMatch && missingColMatch[1]) {
            const missingCol = missingColMatch[1];
            console.warn(`Column '${missingCol}' not found in products table schema cache. Omitting and retrying...`);
            delete currentPayload[missingCol];
            continue;
        }

        // Handle foreign key constraint violations
        if (error.code === '23503' || (error.message && error.message.includes('foreign key constraint'))) {
            if (error.message.includes('button_id') && currentPayload.button_id !== undefined) {
                console.warn('Foreign key violation on button_id. Omitting button_id and retrying...');
                delete currentPayload.button_id;
                continue;
            }
            if (error.message.includes('thread_id') && currentPayload.thread_id !== undefined) {
                console.warn('Foreign key violation on thread_id. Omitting thread_id and retrying...');
                delete currentPayload.thread_id;
                continue;
            }
            if ((error.message.includes('main_fabric_id') || error.message.includes('fabric')) && currentPayload.main_fabric_id !== undefined) {
                console.warn('Foreign key violation on fabric. Omitting main_fabric_id and retrying...');
                delete currentPayload.main_fabric_id;
                delete currentPayload.attachment_fabric1_id;
                delete currentPayload.attachment_fabric2_id;
                continue;
            }
            if (error.message.includes('product_type_id') && currentPayload.product_type_id !== undefined) {
                console.warn('Foreign key violation on product_type_id. Omitting product_type_id and retrying...');
                delete currentPayload.product_type_id;
                continue;
            }
            if (error.message.includes('size_chart_id') && currentPayload.size_chart_id !== undefined) {
                console.warn('Foreign key violation on size_chart_id. Omitting size_chart_id and retrying...');
                delete currentPayload.size_chart_id;
                continue;
            }
        }

        return { data: null, error };
    }
    return { data: null, error: new Error('Max retry attempts reached updating product') };
}

exports.createProduct = async (req, res) => {
    try {
        let { 
            name, art_number, gender, measurements, materials, entry_methods, size_chart_id, category, product_type_id, sam_value, retail_sam_value,
            main_fabric, attachment_fabric1, attachment_fabric2, button_count, thread_count, base_size, fit, images, design_number,
            main_fabric_id, attachment_fabric1_id, attachment_fabric2_id, button_id, thread_id,
            other_sizes, other_fits, measurement_type, class_fabric_consumption, remarks,
            trims, attachment_fabrics, allowance
        } = req.body;
        
        let designNumberId = null;
        if (design_number && design_number.trim() !== '') {
            designNumberId = await findOrCreateProductDesignNumber(design_number.trim());
        }

        // Map dynamic trims counts and preserve valid button_id/thread_id
        if (Array.isArray(trims) && trims.length > 0) {
            const btnTrim = trims.find(t => (t.uom || '').toLowerCase() === 'pcs' || (t.name || '').toLowerCase().includes('button') || String(t.trim_id).includes('btn'));
            if (btnTrim) {
                if (!button_count) button_count = parseInt(btnTrim.count, 10) || 0;
            }
            const thrTrim = trims.find(t => (t.uom || '').toLowerCase() === 'cones' || (t.uom || '').toLowerCase() === 'spools' || (t.name || '').toLowerCase().includes('thread') || String(t.trim_id).includes('thr'));
            if (thrTrim) {
                if (!thread_count) thread_count = parseInt(thrTrim.count, 10) || 0;
            }
        }

        // Validate button_id and thread_id against their respective tables to prevent FK constraint failures
        if (button_id) {
            const { data: btnMatch } = await supabase.from('buttons').select('id').eq('id', button_id).maybeSingle();
            if (!btnMatch) button_id = null;
        }
        if (thread_id) {
            const { data: thrMatch } = await supabase.from('threads').select('id').eq('id', thread_id).maybeSingle();
            if (!thrMatch) thread_id = null;
        }

        if (Array.isArray(attachment_fabrics) && attachment_fabrics.length > 0) {
            if (attachment_fabrics[0]) {
                if (attachment_fabric1 === undefined || attachment_fabric1 === null) attachment_fabric1 = attachment_fabrics[0].meters;
                if (!attachment_fabric1_id) attachment_fabric1_id = attachment_fabrics[0].fabric_id || null;
            }
            if (attachment_fabrics[1]) {
                if (attachment_fabric2 === undefined || attachment_fabric2 === null) attachment_fabric2 = attachment_fabrics[1].meters;
                if (!attachment_fabric2_id) attachment_fabric2_id = attachment_fabrics[1].fabric_id || null;
            }
        }

        // Store dynamic trims and attachment fabrics inside class_fabric_consumption metadata
        const enrichedClassConsumption = {
            ...(class_fabric_consumption || {}),
            _base_main_fabric: (main_fabric !== undefined && main_fabric !== null && main_fabric !== '') ? parseFloat(main_fabric) : ((class_fabric_consumption && class_fabric_consumption._base_main_fabric) || null),
            _base_main_fabric_id: main_fabric_id || null,
            _base_trims: Array.isArray(trims) ? trims : ((class_fabric_consumption && class_fabric_consumption._base_trims) || []),
            _base_attachment_fabrics: Array.isArray(attachment_fabrics) ? attachment_fabrics : ((class_fabric_consumption && class_fabric_consumption._base_attachment_fabrics) || [])
        };

        const serializedMaterials = serializeMaterialsMetadata(
            materials,
            main_fabric_id,
            attachment_fabric1_id,
            attachment_fabric2_id,
            main_fabric
        );
        
        const insertPayload = { 
            name, 
            art_number, 
            gender, 
            measurements, 
            materials: serializedMaterials, 
            ...(entry_methods !== undefined ? { entry_methods } : {}), 
            size_chart_id, 
            category, 
            product_type_id, 
            sam_value: sam_value !== '' && sam_value !== null && sam_value !== undefined ? parseFloat(sam_value) : null,
            retail_sam_value: retail_sam_value !== '' && retail_sam_value !== null && retail_sam_value !== undefined ? parseFloat(retail_sam_value) : null,
            main_fabric: main_fabric !== '' && main_fabric !== null && main_fabric !== undefined ? parseFloat(main_fabric) : 0,
            attachment_fabric1: attachment_fabric1 !== '' && attachment_fabric1 !== null && attachment_fabric1 !== undefined ? parseFloat(attachment_fabric1) : null,
            attachment_fabric2: attachment_fabric2 !== '' && attachment_fabric2 !== null && attachment_fabric2 !== undefined ? parseFloat(attachment_fabric2) : null,
            button_count: button_count !== '' && button_count !== null && button_count !== undefined ? parseInt(button_count, 10) : 0,
            thread_count: thread_count !== '' && thread_count !== null && thread_count !== undefined ? parseInt(thread_count, 10) : 0,
            button_id: button_id || null,
            thread_id: thread_id || null,
            base_size: base_size || null,
            fit: fit || null,
            allowance: allowance !== undefined && allowance !== null && allowance !== '' ? String(allowance).trim() : null,
            images: images || [],
            design_number_id: designNumberId,
            other_sizes: other_sizes || null,
            other_fits: other_fits || null,
            measurement_type: measurement_type || null,
            class_fabric_consumption: enrichedClassConsumption,
            remarks: remarks || null
        };

        const { data, error } = await safeInsertProduct(insertPayload);

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
                let patternCode = null;
                if (artParts.length === 3) {
                    patternCode = artParts[2];
                } else if (artParts.length === 2) {
                    const { data: allDresses } = await supabase.from('art_dresses').select('code');
                    const isFirstDress = allDresses?.some(d => d.code === artParts[0]);
                    if (isFirstDress) {
                        const rest = artParts[1];
                        const { data: allGenders } = await supabase.from('art_genders').select('code');
                        if (allGenders) {
                            for (const g of allGenders) {
                                if (rest.startsWith(g.code)) {
                                    patternCode = rest.slice(g.code.length);
                                    break;
                                }
                            }
                        }
                    } else {
                        const rest = artParts[1];
                        if (allDresses) {
                            for (const d of allDresses) {
                                if (rest.startsWith(d.code)) {
                                    patternCode = rest.slice(d.code.length);
                                    break;
                                }
                            }
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
            } catch (patternErr) {
                console.error('Pattern auto-register error (non-critical):', patternErr.message);
            }
        }

        // Register in Art Number Hub
        await registerArtNumberInHub(data.art_number, data.base_size, data.fit, allowance);

        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.updateProduct = async (req, res) => {
    try {
        const { id } = req.params;
        let { 
            name, art_number, gender, measurements, materials, entry_methods, size_chart_id, category, product_type_id, sam_value, retail_sam_value,
            main_fabric, attachment_fabric1, attachment_fabric2, button_count, thread_count, base_size, fit, images, design_number,
            main_fabric_id, attachment_fabric1_id, attachment_fabric2_id, button_id, thread_id,
            other_sizes, other_fits, measurement_type, class_fabric_consumption, remarks,
            trims, attachment_fabrics, allowance
        } = req.body;
        
        const designNumberId = design_number ? await findOrCreateProductDesignNumber(design_number) : null;

        // Map dynamic trims counts and preserve valid button_id/thread_id
        if (Array.isArray(trims) && trims.length > 0) {
            const btnTrim = trims.find(t => (t.uom || '').toLowerCase() === 'pcs' || (t.name || '').toLowerCase().includes('button') || String(t.trim_id).includes('btn'));
            if (btnTrim) {
                if (!button_count) button_count = parseInt(btnTrim.count, 10) || 0;
            }
            const thrTrim = trims.find(t => (t.uom || '').toLowerCase() === 'cones' || (t.uom || '').toLowerCase() === 'spools' || (t.name || '').toLowerCase().includes('thread') || String(t.trim_id).includes('thr'));
            if (thrTrim) {
                if (!thread_count) thread_count = parseInt(thrTrim.count, 10) || 0;
            }
        }

        // Validate button_id and thread_id against their respective tables
        if (button_id) {
            const { data: btnMatch } = await supabase.from('buttons').select('id').eq('id', button_id).maybeSingle();
            if (!btnMatch) button_id = null;
        }
        if (thread_id) {
            const { data: thrMatch } = await supabase.from('threads').select('id').eq('id', thread_id).maybeSingle();
            if (!thrMatch) thread_id = null;
        }

        if (Array.isArray(attachment_fabrics) && attachment_fabrics.length > 0) {
            if (attachment_fabrics[0]) {
                if (attachment_fabric1 === undefined || attachment_fabric1 === null) attachment_fabric1 = attachment_fabrics[0].meters;
                if (!attachment_fabric1_id) attachment_fabric1_id = attachment_fabrics[0].fabric_id || null;
            }
            if (attachment_fabrics[1]) {
                if (attachment_fabric2 === undefined || attachment_fabric2 === null) attachment_fabric2 = attachment_fabrics[1].meters;
                if (!attachment_fabric2_id) attachment_fabric2_id = attachment_fabrics[1].fabric_id || null;
            }
        }

        const enrichedClassConsumption = {
            ...(class_fabric_consumption || {}),
            _base_main_fabric: (main_fabric !== undefined && main_fabric !== null && main_fabric !== '') ? parseFloat(main_fabric) : ((class_fabric_consumption && class_fabric_consumption._base_main_fabric) || null),
            _base_main_fabric_id: main_fabric_id || null,
            _base_trims: Array.isArray(trims) ? trims : ((class_fabric_consumption && class_fabric_consumption._base_trims) || []),
            _base_attachment_fabrics: Array.isArray(attachment_fabrics) ? attachment_fabrics : ((class_fabric_consumption && class_fabric_consumption._base_attachment_fabrics) || [])
        };

        const serializedMaterials = serializeMaterialsMetadata(
            materials,
            main_fabric_id,
            attachment_fabric1_id,
            attachment_fabric2_id,
            main_fabric
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
            const updatePayload1 = { 
                name, 
                art_number, 
                gender, 
                measurements, 
                materials: serializedMaterials, 
                ...(entry_methods !== undefined ? { entry_methods } : {}), 
                size_chart_id,
                category,
                product_type_id, 
                sam_value: sam_value !== '' && sam_value !== null && sam_value !== undefined ? parseFloat(sam_value) : null,
                retail_sam_value: retail_sam_value !== '' && retail_sam_value !== null && retail_sam_value !== undefined ? parseFloat(retail_sam_value) : null,
                main_fabric: main_fabric !== '' && main_fabric !== null && main_fabric !== undefined ? parseFloat(main_fabric) : 0,
                attachment_fabric1: attachment_fabric1 !== '' && attachment_fabric1 !== null && attachment_fabric1 !== undefined ? parseFloat(attachment_fabric1) : null,
                attachment_fabric2: attachment_fabric2 !== '' && attachment_fabric2 !== null && attachment_fabric2 !== undefined ? parseFloat(attachment_fabric2) : null,
                // Keep base button/thread unchanged - they belong to the base design number
                button_count: currentProduct?.button_count !== undefined ? currentProduct.button_count : 0,
                thread_count: currentProduct?.thread_count !== undefined ? currentProduct.thread_count : 0,
                button_id: normCurButtonId,
                thread_id: normCurThreadId,
                base_size: base_size || null,
                fit: fit || null,
                allowance: allowance !== undefined && allowance !== null && allowance !== '' ? String(allowance).trim() : null,
                images: images || [],
                design_number_id: designNumberId || currentProduct?.design_number_id || null,
                other_sizes: other_sizes || null,
                other_fits: other_fits || null,
                measurement_type: measurement_type || null,
                class_fabric_consumption: enrichedClassConsumption,
                remarks: remarks || null,
                updated_at: new Date() 
            };

            const { data, error } = await safeUpdateProduct(id, updatePayload1);

            if (error) {
                if (error.code === '23505') {
                    return res.status(400).json({ error: 'A product with this ART Number already exists' });
                }
                throw error;
            }

            const { logAction } = require('../utils/logger');
            await logAction(req.user.id, 'UPDATE', 'product', id, { name: data.name });
            await registerArtNumberInHub(data.art_number, data.base_size, data.fit, allowance);
            return res.json({ ...data, variant_created: true });
        }
        
        // No button/thread change – regular update
        const updatePayload2 = { 
            name, 
            art_number, 
            gender, 
            measurements, 
            materials: serializedMaterials, 
            ...(entry_methods !== undefined ? { entry_methods } : {}), 
            size_chart_id, 
            category, 
            product_type_id, 
            sam_value: sam_value !== '' && sam_value !== null && sam_value !== undefined ? parseFloat(sam_value) : null,
            retail_sam_value: retail_sam_value !== '' && retail_sam_value !== null && retail_sam_value !== undefined ? parseFloat(retail_sam_value) : null,
            main_fabric: main_fabric !== '' && main_fabric !== null && main_fabric !== undefined ? parseFloat(main_fabric) : 0,
            attachment_fabric1: attachment_fabric1 !== '' && attachment_fabric1 !== null && attachment_fabric1 !== undefined ? parseFloat(attachment_fabric1) : null,
            attachment_fabric2: attachment_fabric2 !== '' && attachment_fabric2 !== null && attachment_fabric2 !== undefined ? parseFloat(attachment_fabric2) : null,
            button_count: button_count !== '' && button_count !== null && button_count !== undefined ? parseInt(button_count, 10) : 0,
            thread_count: thread_count !== '' && thread_count !== null && thread_count !== undefined ? parseInt(thread_count, 10) : 0,
            button_id: button_id || null,
            thread_id: thread_id || null,
            base_size: base_size || null,
            fit: fit || null,
            allowance: allowance !== undefined && allowance !== null && allowance !== '' ? String(allowance).trim() : null,
            images: images || [],
            design_number_id: designNumberId,
            other_sizes: other_sizes || null,
            other_fits: other_fits || null,
            measurement_type: measurement_type || null,
            class_fabric_consumption: enrichedClassConsumption,
            remarks: remarks || null,
            updated_at: new Date() 
        };

        const { data, error } = await safeUpdateProduct(id, updatePayload2);

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
        await registerArtNumberInHub(data.art_number, data.base_size, data.fit, allowance);

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

