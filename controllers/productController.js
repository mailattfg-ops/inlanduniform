const supabase = require('../config/supabase');

const parseMaterialsMetadata = (rawText) => {
    if (!rawText) return { main_fabric_id: null, attachment_fabric1_id: null, attachment_fabric2_id: null, main_fabric_meters: null, description: null, cleanMaterials: '' };

    let text = rawText;
    let main_fabric_id = null;
    let attachment_fabric1_id = null;
    let attachment_fabric2_id = null;
    let main_fabric_meters = null;
    let description = null;

    // Parse description if serialized
    const descMatch = text.match(/\[Description:\s*([^\]]+)\]/);
    if (descMatch) {
        description = descMatch[1].trim();
        text = text.replace(/\[Description:\s*([^\]]+)\]/, '').trim();
    }

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

    return { main_fabric_id, attachment_fabric1_id, attachment_fabric2_id, main_fabric_meters, description, cleanMaterials: text };
};

const serializeMaterialsMetadata = (materials, main_fabric_id, attachment_fabric1_id, attachment_fabric2_id, main_fabric_meters, description) => {
    let text = materials || '';
    if (description && description.trim()) text = `[Description: ${description.trim()}] ${text}`;
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
    if (art_number.startsWith('ACC-') || art_number.startsWith('TRIM-') || art_number.startsWith('FAB-')) return;
    try {
        const parts = art_number.split('-');
        let rawItemCode = null;
        let genderCode = null;
        let patternCode = null;
        let fitCode = null;
        let artAllowance = allowance || null;

        // 5-part: [ItemPrefix]-[Gender]-[Pattern]-[Fit]-[Allowance] (e.g. 1A-1-012-R-2)
        if (parts.length === 5) {
            rawItemCode = parts[0];
            genderCode = parts[1];
            patternCode = parts[2];
            fitCode = parts[3].toUpperCase();
            artAllowance = parts[4];
        } else if (parts.length === 4) {
            // [ItemPrefix]-[GenderPattern]-[Fit]-[Allowance] (e.g. 1A-3053-R-2) or legacy 4-part
            if (parts[2].length <= 2 && isNaN(Number(parts[2]))) {
                rawItemCode = parts[0];
                const middle = parts[1];
                genderCode = middle.slice(0, 1);
                patternCode = middle.slice(1);
                fitCode = parts[2].toUpperCase();
                artAllowance = parts[3];
            } else {
                rawItemCode = parts[0];
                genderCode = parts[1];
                patternCode = parts[2];
                fitCode = parts[3].toUpperCase();
            }
        } else if (parts.length === 3) {
            // Option 1 / New format: [item][spec]-[gender][pattern]-[fit][allowance] (e.g. 1A-3053-R2)
            rawItemCode = parts[0];
            const middle = parts[1];
            const lastPart = parts[2];

            const fitMatch = lastPart.match(/^([A-Za-z]+)(.*)$/);
            if (fitMatch && isNaN(Number(lastPart))) {
                fitCode = fitMatch[1].toUpperCase();
                if (fitMatch[2] && !artAllowance) {
                    artAllowance = fitMatch[2].trim();
                }
                genderCode = middle.slice(0, 1);
                patternCode = middle.slice(1);
            } else {
                // Legacy: [Prefix]-[Gender]-[Pattern] (e.g. 4J-1-012)
                genderCode = parts[1];
                patternCode = parts[2];
                if (fit) {
                    fitCode = fit.trim().slice(0, 1).toUpperCase();
                }
            }
        } else if (parts.length === 2) {
            rawItemCode = parts[0];
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
            if (fit) {
                fitCode = fit.trim().slice(0, 1).toUpperCase();
            }
        }

        if (!rawItemCode || !genderCode || !patternCode) return;

        // Resolve Item and Specification from rawItemCode (e.g. '1A' -> Item '1' and Spec 'A')
        let foundItem = null;
        let foundSpec = null;

        // 1. Try exact match in art_items
        const { data: exactItem } = await supabase.from('art_items').select('id, code, name').eq('code', rawItemCode).maybeSingle();
        if (exactItem) {
            foundItem = exactItem;
        } else {
            // 2. Check if rawItemCode ends with a letter (e.g. '1A' -> base '1' and spec 'A')
            const itemMatch = rawItemCode.match(/^([0-9a-zA-Z]+?)([A-Za-z])$/);
            if (itemMatch) {
                const baseItemCode = itemMatch[1];
                const specChar = itemMatch[2].toUpperCase();
                const { data: bItem } = await supabase.from('art_items').select('id, code, name').eq('code', baseItemCode).maybeSingle();
                if (bItem) {
                    foundItem = bItem;
                    const { data: bSpec } = await supabase.from('art_item_specifications')
                        .select('id, code, name')
                        .eq('item_id', bItem.id)
                        .eq('code', specChar)
                        .maybeSingle();
                    foundSpec = bSpec;
                }
            }
        }

        // 3. Fallback to art_dresses if art_items table doesn't have it
        if (!foundItem) {
            const { data: foundDress } = await supabase.from('art_dresses').select('id, code, name').eq('code', rawItemCode).maybeSingle();
            if (foundDress) foundItem = foundDress;
        }

        if (!foundItem) return;

        // Fetch gender
        const { data: foundGender } = await supabase.from('art_genders').select('id').eq('code', genderCode).maybeSingle();

        // Fetch / create pattern
        let { data: foundPattern } = await supabase.from('art_patterns').select('id').eq('code', patternCode).maybeSingle();
        if (!foundPattern && patternCode && /^\d{1,3}$/.test(String(patternCode).trim())) {
            const cleanPat = String(patternCode).trim().padStart(3, '0');
            const { data: newPat } = await supabase
                .from('art_patterns')
                .insert([{ code: cleanPat, name: `Pattern ${cleanPat}` }])
                .select('id')
                .maybeSingle();
            foundPattern = newPat;
        }

        // Fetch / resolve fit
        let foundFitId = null;
        if (fitCode) {
            let { data: foundFit } = await supabase.from('art_fits').select('id, name').eq('code', fitCode).maybeSingle();
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

        if (foundItem && foundGender && foundPattern) {
            const artInsertData = {
                item_id: foundItem.id,
                specification_id: foundSpec?.id || null,
                dress_id: foundItem.id,
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
                if (insertError.message?.includes('item_id') || insertError.message?.includes('specification_id') || insertError.message?.includes('allowance')) {
                    delete artInsertData.item_id;
                    delete artInsertData.specification_id;
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

function formatArtNumberDisplayName(p) {
    if (!p) return '';
    const rawArt = (p.art_number || '').toUpperCase();
    const accPrefixes = ['TIE-', 'BLT-', 'SCK-', 'BDG-', 'CAP-', 'SCF-', 'EPL-', 'LNY-', 'BOW-', 'PKS-', 'CRST-', 'ACC-'];
    if (
        accPrefixes.some(pref => rawArt.startsWith(pref)) ||
        p.category === 'accessories' ||
        p.category === 'trade_readymade' ||
        p.category === 'readymade_trade'
    ) {
        return p.name || '';
    }
    if (p.art_number && p.art_number.includes('-')) {
        const parts = p.art_number.split('-');
        if (parts.length >= 2) {
            const rawItem = parts[0];
            const middle = parts[1];

            let itemCode = rawItem;
            let specCode = '';
            const match = rawItem.match(/^([0-9a-zA-Z]+?)([A-Za-z])$/);
            if (match) {
                itemCode = match[1];
                specCode = match[2].toUpperCase();
            }

            let itemName = '';
            if (itemCode === '1') itemName = 'Shirt';
            else if (itemCode === '2') itemName = 'Trouser';
            else if (itemCode === '3') itemName = 'Blazer';
            else if (itemCode === '4') itemName = 'T-Shirt';
            else if (itemCode === '5') itemName = 'Skirt';

            let specName = '';
            if (specCode === 'A') {
                if (itemCode === '1') specName = 'Half Sleeve';
                else if (itemCode === '2') specName = 'Full Length Pleated';
                else if (itemCode === '3') specName = 'Single Breasted';
            } else if (specCode === 'B') {
                if (itemCode === '1') specName = 'Full Sleeve';
                else if (itemCode === '2') specName = 'Flat Front';
                else if (itemCode === '3') specName = 'Double Breasted';
            } else if (specCode === 'C') {
                if (itemCode === '1') specName = 'Sleeveless';
                else if (itemCode === '2') specName = 'Shorts';
            }

            const genderCode = middle.length >= 1 ? middle.slice(0, 1) : '';
            let genderName = p.gender || '';
            if (!genderName) {
                if (genderCode === '1') genderName = 'Male';
                else if (genderCode === '2') genderName = 'Female';
                else if (genderCode === '3') genderName = 'Boys';
                else if (genderCode === '4') genderName = 'Girls';
            } else {
                genderName = genderName.charAt(0).toUpperCase() + genderName.slice(1).toLowerCase();
            }

            if (itemName) {
                return [genderName, itemName, specName].filter(Boolean).join(' ');
            }
        }
    }
    return p.name || '';
}

function parseProductMetadata(p) {
    if (!p) return p;
    let brand_name = p.brand_name || '';
    let specification = p.specification || '';
    let color = p.color || '';
    let shade_no = p.shade_no || '';
    let size = p.base_size || '';
    let size_uom = p.size_uom || '';
    let desc = p.description || '';

    // Parse from remarks or materials
    const remarksText = Array.isArray(p.remarks)
        ? p.remarks.map(r => (typeof r === 'object' ? r.text : r)).join(' ')
        : (typeof p.remarks === 'string' ? p.remarks : '');
    const allText = `${p.materials || ''} ${remarksText} ${desc}`;

    const jsonMatch = allText.match(/<!--PROD_META:(\{.*?\})-->/);
    if (jsonMatch) {
        try {
            const meta = JSON.parse(jsonMatch[1]);
            if (!brand_name && meta.brand_name) brand_name = meta.brand_name;
            if (!specification && meta.specification) specification = meta.specification;
            if (!color && meta.color) color = meta.color;
            if (!shade_no && meta.shade_no) shade_no = meta.shade_no;
            if (!size && meta.size) size = meta.size;
            if (!size_uom && meta.size_uom) size_uom = meta.size_uom;
        } catch (e) { }
    }

    if (!brand_name) {
        const trMatch = allText.match(/\[(?:Trader|Brand):\s*([^\]]+)\]/i) || allText.match(/Trader:\s*([^|;\n\]]+)/i);
        if (trMatch) brand_name = trMatch[1].trim();
    }
    if (!color) {
        const colMatch = allText.match(/\[Color:\s*([^\]]+)\]/i) || allText.match(/Color:\s*([^|;\n\]]+)/i);
        if (colMatch) color = colMatch[1].trim();
    }
    if (!specification) {
        const specMatch = allText.match(/\[(?:Spec|Specification):\s*([^\]]+)\]/i);
        if (specMatch) specification = specMatch[1].trim();
    }
    if (!shade_no) {
        const shMatch = allText.match(/\[Shade(?:\s*No)?:\s*([^\]]+)\]/i);
        if (shMatch) shade_no = shMatch[1].trim();
    }
    if (!size_uom && size) {
        const parts = size.trim().split(/\s+/);
        if (parts.length > 1 && isNaN(Number(parts[parts.length - 1]))) {
            size_uom = parts.slice(1).join(' ');
            size = parts[0];
        }
    }

    return {
        ...p,
        brand_name: brand_name || '',
        specification: specification || '',
        color: color || '',
        shade_no: shade_no || '',
        size: size || p.base_size || '',
        size_uom: size_uom || ''
    };
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

            const formattedName = formatArtNumberDisplayName(p);
            const parsedMeta = parseProductMetadata(p);

            return {
                ...p,
                ...parsedMeta,
                name: formattedName || p.name,
                description: p.description || meta.description || null,
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

const knownMissingProductColumns = new Set([
    'brand_name',
    'button_count',
    'button_id',
    'color',
    'description',
    'main_fabric',
    'shade_no',
    'size_uom',
    'specification',
    'thread_count',
    'thread_id',
    'size_chart_id',
    'entry_methods'
]);

async function safeInsertProduct(payload) {
    let currentPayload = { ...payload };
    // Strip out any keys with undefined values
    Object.keys(currentPayload).forEach(key => {
        if (currentPayload[key] === undefined) delete currentPayload[key];
    });
    // Strip known missing columns upfront
    knownMissingProductColumns.forEach(col => {
        delete currentPayload[col];
    });

        for (let attempt = 0; attempt < 30; attempt++) {
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
                knownMissingProductColumns.add(missingCol);
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
        // Strip known missing columns upfront
        knownMissingProductColumns.forEach(col => {
            delete currentPayload[col];
        });

            for (let attempt = 0; attempt < 30; attempt++) {
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
                    knownMissingProductColumns.add(missingCol);
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

        async function resolveArtNumberProductTitle(artNumber, itemId, specificationId, gender, category, productType, materials) {
            if (!artNumber && !itemId) return null;

            // Only in-house manufactured readymades use the [Gender] [Item] [Specification] format
            const rawArt = (artNumber || '').toUpperCase();
            const accPrefixes = ['TIE-', 'BLT-', 'SCK-', 'BDG-', 'CAP-', 'SCF-', 'EPL-', 'LNY-', 'BOW-', 'PKS-', 'CRST-', 'ACC-'];
            const cat = (category || '').toLowerCase();
            const pType = (productType || '').toLowerCase();
            const mat = (materials || '').toLowerCase();

            if (
                accPrefixes.some(pref => rawArt.startsWith(pref)) ||
                cat === 'accessories' || cat === 'accessory' || cat === 'trade_readymade' || cat === 'readymade_trade' ||
                pType === 'accessories' || pType === 'accessory' || pType === 'trade_readymade' || pType === 'readymade_trade' ||
                mat.includes('[producttype: accessories]') || mat.includes('[producttype: trade_readymade]') || mat.includes('[producttype: readymade_trade]')
            ) {
                return null;
            }

            let itemName = '';
            let specName = '';
            let resolvedGender = gender || '';

            // 1. Try itemId
            if (itemId) {
                const { data: itemData } = await supabase.from('art_items').select('code, name').eq('id', itemId).maybeSingle();
                if (itemData) itemName = itemData.name;
                if (!itemName) {
                    const { data: dressData } = await supabase.from('art_dresses').select('code, name').eq('id', itemId).maybeSingle();
                    if (dressData) itemName = dressData.name;
                }
            }

            // 2. Try specificationId
            if (specificationId) {
                const { data: specData } = await supabase.from('art_item_specifications').select('code, name').eq('id', specificationId).maybeSingle();
                if (specData) specName = specData.name;
            }

            // 3. If artNumber is present, parse it: [item][spec]-[gender][pattern]-[fit][allowance]
            if (artNumber && artNumber.includes('-')) {
                const parts = artNumber.split('-');
                const rawItem = parts[0];
                const middle = parts[1];

                let itemCode = rawItem;
                let specCode = '';
                const match = rawItem.match(/^([0-9a-zA-Z]+?)([A-Za-z])$/);
                if (match) {
                    itemCode = match[1];
                    specCode = match[2].toUpperCase();
                }

                if (!itemName) {
                    const { data: itemData } = await supabase.from('art_items').select('name').eq('code', itemCode).maybeSingle();
                    if (itemData) itemName = itemData.name;
                    if (!itemName) {
                        const { data: dressData } = await supabase.from('art_dresses').select('name').eq('code', itemCode).maybeSingle();
                        if (dressData) itemName = dressData.name;
                    }
                    if (!itemName) {
                        if (itemCode === '1') itemName = 'Shirt';
                        else if (itemCode === '2') itemName = 'Trouser';
                        else if (itemCode === '3') itemName = 'Blazer';
                        else if (itemCode === '4') itemName = 'T-Shirt';
                        else if (itemCode === '5') itemName = 'Skirt';
                    }
                }

                if (!specName && specCode) {
                    const { data: specData } = await supabase.from('art_item_specifications').select('name').eq('code', specCode).maybeSingle();
                    if (specData) specName = specData.name;
                    if (!specName) {
                        if (specCode === 'A' && itemName.toLowerCase().includes('shirt')) specName = 'Half Sleeve';
                        else if (specCode === 'B' && itemName.toLowerCase().includes('shirt')) specName = 'Full Sleeve';
                        else if (specCode === 'A' && itemName.toLowerCase().includes('trouser')) specName = 'Full Length Pleated';
                        else if (specCode === 'B' && itemName.toLowerCase().includes('trouser')) specName = 'Flat Front';
                        else if (specCode === 'A' && itemName.toLowerCase().includes('blazer')) specName = 'Single Breasted';
                        else if (specCode === 'B' && itemName.toLowerCase().includes('blazer')) specName = 'Double Breasted';
                    }
                }

                if (!resolvedGender && middle && middle.length >= 1) {
                    const gCode = middle.slice(0, 1);
                    const { data: gData } = await supabase.from('art_genders').select('name').eq('code', gCode).maybeSingle();
                    if (gData) resolvedGender = gData.name;
                    if (!resolvedGender) {
                        if (gCode === '1') resolvedGender = 'Male';
                        else if (gCode === '2') resolvedGender = 'Female';
                        else if (gCode === '3') resolvedGender = 'Boys';
                        else if (gCode === '4') resolvedGender = 'Girls';
                    }
                }
            }

            const cleanItem = itemName ? (itemName.charAt(0).toUpperCase() + itemName.slice(1).toLowerCase()) : '';
            const cleanSpec = specName ? specName.trim() : '';
            const cleanGender = resolvedGender ? (resolvedGender.charAt(0).toUpperCase() + resolvedGender.slice(1).toLowerCase()) : '';

            const partsTitle = [cleanGender, cleanItem, cleanSpec].filter(Boolean);
            if (partsTitle.length > 0) {
                return partsTitle.join(' ');
            }
            return null;
        }

        exports.createProduct = async (req, res) => {
            try {
                let {
                    name, art_number, gender, measurements, materials, description, entry_methods, size_chart_id, category, product_type_id, sam_value, retail_sam_value, base_price,
                    main_fabric, attachment_fabric1, attachment_fabric2, button_count, thread_count, base_size, fit, images, design_number,
                    main_fabric_id, attachment_fabric1_id, attachment_fabric2_id, button_id, thread_id,
                    other_sizes, other_fits, measurement_type, class_fabric_consumption, remarks,
                    trims, attachment_fabrics, allowance,
                    brand_name, specification, color, shade_no, size_uom
                } = req.body;

                // Auto-derive product name for Art Numbers: Format is [Gender] [Item] [Specification] (Readymades in-house only)
                const derivedTitle = await resolveArtNumberProductTitle(art_number, req.body.item_id, req.body.specification_id, gender, category, req.body.product_type || product_type_id, materials);
                if (derivedTitle) {
                    name = derivedTitle;
                }

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
                    main_fabric,
                    description
                );

                let enrichedRemarks = remarks;
                if (brand_name || specification || color || shade_no || size_uom) {
                    const metaTag = `<!--PROD_META:${JSON.stringify({
                        brand_name: brand_name ? String(brand_name).trim() : '',
                        specification: specification ? String(specification).trim() : '',
                        color: color ? String(color).trim() : '',
                        shade_no: shade_no ? String(shade_no).trim() : '',
                        size: base_size ? String(base_size).trim() : '',
                        size_uom: size_uom ? String(size_uom).trim() : ''
                    })}-->`;
                    if (Array.isArray(enrichedRemarks)) {
                        enrichedRemarks = [...enrichedRemarks, { text: metaTag, images: [] }];
                    } else if (typeof enrichedRemarks === 'string') {
                        enrichedRemarks = `${enrichedRemarks}\n${metaTag}`.trim();
                    } else {
                        enrichedRemarks = [{ text: metaTag, images: [] }];
                    }
                }

                const insertPayload = {
                    name,
                    art_number,
                    gender,
                    description: description || null,
                    measurements,
                    materials: serializedMaterials,
                    ...(entry_methods !== undefined ? { entry_methods } : {}),
                    size_chart_id,
                    category,
                    product_type_id,
                    ...(req.body.item_id ? { item_id: req.body.item_id } : {}),
                    ...(req.body.specification_id ? { specification_id: req.body.specification_id } : {}),
                    sam_value: sam_value !== '' && sam_value !== null && sam_value !== undefined ? parseFloat(sam_value) : null,
                    retail_sam_value: retail_sam_value !== '' && retail_sam_value !== null && retail_sam_value !== undefined ? parseFloat(retail_sam_value) : null,
                    base_price: base_price !== '' && base_price !== null && base_price !== undefined ? parseFloat(base_price) : 0,
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
                    remarks: enrichedRemarks || null,
                    brand_name: brand_name ? String(brand_name).trim() : null,
                    specification: specification ? String(specification).trim() : null,
                    color: color ? String(color).trim() : null,
                    shade_no: shade_no ? String(shade_no).trim() : null,
                    size_uom: size_uom ? String(size_uom).trim() : null
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
                            const middle = artParts[1];
                            const lastPart = artParts[2];
                            // If last part is fit e.g. R, R2, S
                            if (/^[A-Za-z]/.test(lastPart)) {
                                patternCode = middle.slice(1);
                            } else {
                                patternCode = artParts[2];
                            }
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

                res.json(parseProductMetadata(data));
            } catch (err) {
                res.status(500).json({ error: err.message });
            }
        };

        exports.updateProduct = async (req, res) => {
            try {
                const { id } = req.params;
                let {
                    name, art_number, gender, measurements, materials, description, entry_methods, size_chart_id, category, product_type_id, sam_value, retail_sam_value, base_price,
                    main_fabric, attachment_fabric1, attachment_fabric2, button_count, thread_count, base_size, fit, images, design_number,
                    main_fabric_id, attachment_fabric1_id, attachment_fabric2_id, button_id, thread_id,
                    other_sizes, other_fits, measurement_type, class_fabric_consumption, remarks,
                    trims, attachment_fabrics, allowance,
                    brand_name, specification, color, shade_no, size_uom
                } = req.body;

                // Auto-derive product name for Art Numbers: Format is [Gender] [Item] [Specification] (Readymades in-house only)
                const derivedTitle = await resolveArtNumberProductTitle(art_number, req.body.item_id, req.body.specification_id, gender, category, req.body.product_type || product_type_id, materials);
                if (derivedTitle) {
                    name = derivedTitle;
                }

                const designNumberId = design_number ? await findOrCreateProductDesignNumber(design_number) : null;

                let enrichedRemarks = remarks;
                if (brand_name || specification || color || shade_no || size_uom) {
                    const metaTag = `<!--PROD_META:${JSON.stringify({
                        brand_name: brand_name ? String(brand_name).trim() : '',
                        specification: specification ? String(specification).trim() : '',
                        color: color ? String(color).trim() : '',
                        shade_no: shade_no ? String(shade_no).trim() : '',
                        size: base_size ? String(base_size).trim() : '',
                        size_uom: size_uom ? String(size_uom).trim() : ''
                    })}-->`;
                    if (Array.isArray(enrichedRemarks)) {
                        enrichedRemarks = [...enrichedRemarks, { text: metaTag, images: [] }];
                    } else if (typeof enrichedRemarks === 'string') {
                        enrichedRemarks = `${enrichedRemarks}\n${metaTag}`.trim();
                    } else {
                        enrichedRemarks = [{ text: metaTag, images: [] }];
                    }
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
                    main_fabric,
                    description
                );

                // Fetch current base product values to detect button/thread changes
                const { data: currentProduct } = await supabase
                    .from('products')
                    .select('button_id, thread_id, button_count, thread_count, design_number_id, base_price')
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
                        description: description || null,
                        measurements,
                        materials: serializedMaterials,
                        ...(entry_methods !== undefined ? { entry_methods } : {}),
                        size_chart_id,
                        category,
                        product_type_id,
                        sam_value: sam_value !== '' && sam_value !== null && sam_value !== undefined ? parseFloat(sam_value) : null,
                        retail_sam_value: retail_sam_value !== '' && retail_sam_value !== null && retail_sam_value !== undefined ? parseFloat(retail_sam_value) : null,
                        base_price: base_price !== '' && base_price !== null && base_price !== undefined ? parseFloat(base_price) : (currentProduct?.base_price !== undefined ? currentProduct.base_price : 0),
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
                        remarks: enrichedRemarks || null,
                        brand_name: brand_name !== undefined ? (brand_name ? String(brand_name).trim() : null) : undefined,
                        specification: specification !== undefined ? (specification ? String(specification).trim() : null) : undefined,
                        color: color !== undefined ? (color ? String(color).trim() : null) : undefined,
                        shade_no: shade_no !== undefined ? (shade_no ? String(shade_no).trim() : null) : undefined,
                        size_uom: size_uom !== undefined ? (size_uom ? String(size_uom).trim() : null) : undefined,
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
                    return res.json({ ...parseProductMetadata(data), variant_created: true });
                }

                // No button/thread change – regular update
                const updatePayload2 = {
                    name,
                    art_number,
                    gender,
                    description: description || null,
                    measurements,
                    materials: serializedMaterials,
                    ...(entry_methods !== undefined ? { entry_methods } : {}),
                    size_chart_id,
                    category,
                    product_type_id,
                    ...(req.body.item_id ? { item_id: req.body.item_id } : {}),
                    ...(req.body.specification_id ? { specification_id: req.body.specification_id } : {}),
                    sam_value: sam_value !== '' && sam_value !== null && sam_value !== undefined ? parseFloat(sam_value) : null,
                    retail_sam_value: retail_sam_value !== '' && retail_sam_value !== null && retail_sam_value !== undefined ? parseFloat(retail_sam_value) : null,
                    base_price: base_price !== '' && base_price !== null && base_price !== undefined ? parseFloat(base_price) : 0,
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
                    remarks: enrichedRemarks || null,
                    brand_name: brand_name !== undefined ? (brand_name ? String(brand_name).trim() : null) : undefined,
                    specification: specification !== undefined ? (specification ? String(specification).trim() : null) : undefined,
                    color: color !== undefined ? (color ? String(color).trim() : null) : undefined,
                    shade_no: shade_no !== undefined ? (shade_no ? String(shade_no).trim() : null) : undefined,
                    size_uom: size_uom !== undefined ? (size_uom ? String(size_uom).trim() : null) : undefined,
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

                res.json(parseProductMetadata(data));
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


// Shared with inventory stock listing so stock pages see the same derived fields as /products
exports.parseProductMetadata = parseProductMetadata;
