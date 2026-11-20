const supabase = require('../config/supabase');
const specsStore = require('../utils/specificationsStore');

function isMissingTableError(error) {
    if (!error) return false;
    const msg = (error.message || '').toLowerCase();
    return (
        error.code === 'PGRST205' ||
        error.code === 'PGRST200' ||
        error.code === '42P01' ||
        error.code === '42703' ||
        msg.includes('schema cache') ||
        msg.includes('does not exist') ||
        msg.includes('relationship') ||
        msg.includes('could not find a relationship')
    );
}

// ==========================================
// 1. ITEMS (MASTER GARMENT ITEMS) CRUD
// ==========================================
exports.listItems = async (req, res) => {
    try {
        let { data, error } = await supabase
            .from('art_items')
            .select('*, art_item_specifications(id, code, name, description, display_order), product_types(id, name)')
            .order('code', { ascending: true });

        if (error && isMissingTableError(error)) {
            // Try simple art_items select without relationships
            const simpleRes = await supabase.from('art_items').select('*').order('code', { ascending: true });
            if (!simpleRes.error) {
                data = (simpleRes.data || []).map(d => ({ ...d, art_item_specifications: specsStore.list(d.id) }));
            } else {
                // Fallback to art_dresses if art_items is not yet created
                const dressRes = await supabase.from('art_dresses').select('*').order('code', { ascending: true });
                if (!dressRes.error) {
                    data = (dressRes.data || []).map(d => ({ ...d, art_item_specifications: specsStore.list(d.id) }));
                } else {
                    data = [];
                }
            }
        } else if (error) {
            throw error;
        }

        // Ensure each item has art_item_specifications populated
        data = (data || []).map(d => {
            const currentSpecs = d.art_item_specifications;
            if (!currentSpecs || currentSpecs.length === 0) {
                return { ...d, art_item_specifications: specsStore.list(d.id) };
            }
            return d;
        });

        res.json(data || []);
    } catch (err) {
        console.error('[ArtNumberHub] listItems error:', err.message);
        res.status(500).json({ error: err.message });
    }
};

exports.createItem = async (req, res) => {
    try {
        const { code, name, description, product_type_id } = req.body;
        if (!code || !name) {
            return res.status(400).json({ error: 'Item code and name are required' });
        }

        const cleanCode = code.trim().toUpperCase();
        const cleanName = name.trim();
        const payload = {
            code: cleanCode,
            name: cleanName,
            description: description ? description.trim() : null,
            product_type_id: product_type_id ? Number(product_type_id) : null
        };

        let { data, error } = await supabase
            .from('art_items')
            .insert([payload])
            .select('*, art_item_specifications(*), product_types(id, name)')
            .single();

        if (error && isMissingTableError(error)) {
            // Fallback insert into art_dresses
            const dressRes = await supabase
                .from('art_dresses')
                .insert([{ code: cleanCode, name: cleanName, description: payload.description }])
                .select()
                .single();
            if (dressRes.error) throw dressRes.error;
            data = { ...dressRes.data, art_item_specifications: [] };
        } else if (error) {
            if (error.code === '23505') {
                return res.status(400).json({ error: `An item with code '${cleanCode}' already exists` });
            }
            throw error;
        }

        // Also sync into art_dresses if table exists for backward compatibility
        try {
            await supabase.from('art_dresses').upsert([{ code: cleanCode, name: cleanName, description: payload.description }], { onConflict: 'code' });
        } catch (_) {}

        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.updateItem = async (req, res) => {
    try {
        const { id } = req.params;
        const { code, name, description, product_type_id } = req.body;
        if (!code || !name) {
            return res.status(400).json({ error: 'Item code and name are required' });
        }

        const cleanCode = code.trim().toUpperCase();
        const cleanName = name.trim();
        const payload = {
            code: cleanCode,
            name: cleanName,
            description: description ? description.trim() : null,
            product_type_id: product_type_id ? Number(product_type_id) : null,
            updated_at: new Date()
        };

        let { data, error } = await supabase
            .from('art_items')
            .update(payload)
            .eq('id', id)
            .select('*, art_item_specifications(*), product_types(id, name)')
            .single();

        if (error && isMissingTableError(error)) {
            const dressRes = await supabase
                .from('art_dresses')
                .update({ code: cleanCode, name: cleanName, description: payload.description, updated_at: new Date() })
                .eq('id', id)
                .select()
                .single();
            if (dressRes.error) throw dressRes.error;
            data = { ...dressRes.data, art_item_specifications: [] };
        } else if (error) {
            if (error.code === '23505') {
                return res.status(400).json({ error: `An item with code '${cleanCode}' already exists` });
            }
            throw error;
        }

        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.deleteItem = async (req, res) => {
    try {
        const { id } = req.params;
        let { error } = await supabase
            .from('art_items')
            .delete()
            .eq('id', id);

        if (error && isMissingTableError(error)) {
            const dressRes = await supabase.from('art_dresses').delete().eq('id', id);
            if (dressRes.error) throw dressRes.error;
        } else if (error) {
            throw error;
        }

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ==========================================
// 2. ITEM SPECIFICATIONS CRUD
// ==========================================
exports.listSpecifications = async (req, res) => {
    try {
        const itemId = req.params.itemId || req.query.item_id;
        let query = supabase
            .from('art_item_specifications')
            .select('*, art_items(id, code, name)')
            .order('display_order', { ascending: true })
            .order('code', { ascending: true });

        if (itemId) {
            query = query.eq('item_id', itemId);
        }

        const { data, error } = await query;
        if (error) {
            if (isMissingTableError(error)) {
                return res.json(specsStore.list(itemId));
            }
            throw error;
        }

        if ((!data || data.length === 0) && specsStore.list(itemId).length > 0) {
            return res.json(specsStore.list(itemId));
        }

        res.json(data || []);
    } catch (err) {
        console.error('[ArtNumberHub] listSpecifications error:', err.message);
        res.status(500).json({ error: err.message });
    }
};

exports.createSpecification = async (req, res) => {
    try {
        const itemId = req.params.itemId || req.body.item_id;
        const { code, name, description, display_order } = req.body;

        if (!itemId) {
            return res.status(400).json({ error: 'item_id is required for a specification' });
        }
        if (!code || !name) {
            return res.status(400).json({ error: 'Specification code (e.g. A, B) and name (e.g. Half Sleeve) are required' });
        }

        const cleanCode = code.trim().toUpperCase();
        const cleanName = name.trim();

        const { data, error } = await supabase
            .from('art_item_specifications')
            .insert([{
                item_id: Number(itemId),
                code: cleanCode,
                name: cleanName,
                description: description ? description.trim() : null,
                display_order: display_order !== undefined ? Number(display_order) : 0
            }])
            .select('*, art_items(id, code, name)')
            .single();

        if (error) {
            if (isMissingTableError(error)) {
                try {
                    const fallbackData = specsStore.create({
                        itemId,
                        code: cleanCode,
                        name: cleanName,
                        description,
                        display_order
                    });
                    return res.json({ success: true, data: fallbackData });
                } catch (storeErr) {
                    return res.status(400).json({ error: storeErr.message });
                }
            }
            if (error.code === '23505') {
                return res.status(400).json({ error: `Specification code '${cleanCode}' already exists for this item` });
            }
            throw error;
        }

        try {
            specsStore.create({ itemId, code: cleanCode, name: cleanName, description, display_order });
        } catch (_) {}

        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.updateSpecification = async (req, res) => {
    try {
        const id = req.params.specId || req.params.id;
        const { code, name, description, display_order } = req.body;

        if (!code || !name) {
            return res.status(400).json({ error: 'Specification code and name are required' });
        }

        const cleanCode = code.trim().toUpperCase();
        const cleanName = name.trim();

        const { data, error } = await supabase
            .from('art_item_specifications')
            .update({
                code: cleanCode,
                name: cleanName,
                description: description !== undefined ? (description ? description.trim() : null) : undefined,
                display_order: display_order !== undefined ? Number(display_order) : undefined,
                updated_at: new Date()
            })
            .eq('id', id)
            .select('*, art_items(id, code, name)')
            .single();

        if (error) {
            if (isMissingTableError(error)) {
                try {
                    const fallbackData = specsStore.update(id, {
                        code: cleanCode,
                        name: cleanName,
                        description,
                        display_order
                    });
                    return res.json({ success: true, data: fallbackData });
                } catch (storeErr) {
                    return res.status(400).json({ error: storeErr.message });
                }
            }
            if (error.code === '23505') {
                return res.status(400).json({ error: `Specification code '${cleanCode}' already exists for this item` });
            }
            throw error;
        }

        try {
            specsStore.update(id, { code: cleanCode, name: cleanName, description, display_order });
        } catch (_) {}

        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.deleteSpecification = async (req, res) => {
    try {
        const id = req.params.specId || req.params.id;
        const { error } = await supabase
            .from('art_item_specifications')
            .delete()
            .eq('id', id);

        if (error && isMissingTableError(error)) {
            specsStore.delete(id);
            return res.json({ success: true });
        } else if (error) {
            throw error;
        }

        specsStore.delete(id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ==========================================
// 3. DRESS PREFIXES CRUD (Backwards Compatibility)
// ==========================================
exports.listDresses = exports.listItems;
exports.createDress = exports.createItem;
exports.updateDress = exports.updateItem;
exports.deleteDress = exports.deleteItem;

// ==========================================
// 4. GENDER CODES CRUD
// ==========================================
exports.listGenders = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('art_genders')
            .select('*')
            .order('code', { ascending: true });

        if (error) throw error;
        res.json(data || []);
    } catch (err) {
        console.error('[ArtNumberHub] listGenders error:', err.message);
        res.status(500).json({ error: err.message });
    }
};

exports.createGender = async (req, res) => {
    try {
        const { code, name } = req.body;
        if (!code || !name) {
            return res.status(400).json({ error: 'Code and name are required' });
        }

        const { data, error } = await supabase
            .from('art_genders')
            .insert([{ code: code.trim(), name: name.trim() }])
            .select()
            .single();

        if (error) {
            if (isMissingTableError(error)) {
                return res.status(400).json({ error: "Table 'public.art_genders' does not exist yet. Please run migration script." });
            }
            if (error.code === '23505') {
                return res.status(400).json({ error: 'A gender code with this prefix already exists' });
            }
            throw error;
        }
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.updateGender = async (req, res) => {
    try {
        const { id } = req.params;
        const { code, name } = req.body;
        if (!code || !name) {
            return res.status(400).json({ error: 'Code and name are required' });
        }

        const { data, error } = await supabase
            .from('art_genders')
            .update({ code: code.trim(), name: name.trim(), updated_at: new Date() })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            if (error.code === '23505') {
                return res.status(400).json({ error: 'A gender code with this prefix already exists' });
            }
            throw error;
        }
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.deleteGender = async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabase
            .from('art_genders')
            .delete()
            .eq('id', id);

        if (error) throw error;
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ==========================================
// 5. PATTERN CODES CRUD
// ==========================================
exports.getNextPatternCode = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('art_patterns')
            .select('code')
            .order('code', { ascending: true });

        if (error) {
            if (isMissingTableError(error)) {
                return res.json({ nextCode: '001' });
            }
            throw error;
        }

        let maxNum = 0;
        (data || []).forEach(p => {
            if (p.code && /^\d{1,3}$/.test(String(p.code).trim())) {
                const num = parseInt(p.code, 10);
                if (!isNaN(num) && num > maxNum && num < 1000) maxNum = num;
            }
        });

        const nextCode = String(maxNum + 1).padStart(3, '0');
        res.json({ nextCode });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.listPatterns = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('art_patterns')
            .select('*')
            .order('code', { ascending: true });

        if (error) throw error;
        res.json(data || []);
    } catch (err) {
        console.error('[ArtNumberHub] listPatterns error:', err.message);
        res.status(500).json({ error: err.message });
    }
};

exports.createPattern = async (req, res) => {
    try {
        const { code, name } = req.body;
        if (!code || !name) {
            return res.status(400).json({ error: 'Code and name are required' });
        }

        const { data, error } = await supabase
            .from('art_patterns')
            .insert([{ code: code.trim(), name: name.trim() }])
            .select()
            .single();

        if (error) {
            if (error.code === '23505') {
                return res.status(400).json({ error: 'A pattern code with this prefix already exists' });
            }
            throw error;
        }
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.updatePattern = async (req, res) => {
    try {
        const { id } = req.params;
        const { code, name } = req.body;
        if (!code || !name) {
            return res.status(400).json({ error: 'Code and name are required' });
        }

        const { data, error } = await supabase
            .from('art_patterns')
            .update({ code: code.trim(), name: name.trim(), updated_at: new Date() })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            if (error.code === '23505') {
                return res.status(400).json({ error: 'A pattern code with this prefix already exists' });
            }
            throw error;
        }
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.deletePattern = async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabase
            .from('art_patterns')
            .delete()
            .eq('id', id);

        if (error) throw error;
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ==========================================
// 6. FITS MASTER CRUD
// ==========================================
exports.listFits = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('art_fits')
            .select('*')
            .order('code', { ascending: true });

        if (error) throw error;
        res.json(data || []);
    } catch (err) {
        console.error('[ArtNumberHub] listFits error:', err.message);
        res.status(500).json({ error: err.message });
    }
};

exports.createFit = async (req, res) => {
    try {
        const { code, name, description } = req.body;
        if (!code || !name) {
            return res.status(400).json({ error: 'Fit code (e.g. S, R, L) and name are required' });
        }

        const { data, error } = await supabase
            .from('art_fits')
            .insert([{ 
                code: code.trim().toUpperCase(), 
                name: name.trim(), 
                description: description ? description.trim() : null 
            }])
            .select()
            .single();

        if (error) {
            if (error.code === '23505') {
                return res.status(400).json({ error: 'A fit with this code already exists' });
            }
            throw error;
        }
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.updateFit = async (req, res) => {
    try {
        const { id } = req.params;
        const { code, name, description } = req.body;
        if (!code || !name) {
            return res.status(400).json({ error: 'Fit code and name are required' });
        }

        const { data, error } = await supabase
            .from('art_fits')
            .update({ 
                code: code.trim().toUpperCase(), 
                name: name.trim(), 
                description: description ? description.trim() : null, 
                updated_at: new Date() 
            })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            if (error.code === '23505') {
                return res.status(400).json({ error: 'A fit with this code already exists' });
            }
            throw error;
        }
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.deleteFit = async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabase
            .from('art_fits')
            .delete()
            .eq('id', id);

        if (error) throw error;
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ==========================================
// 7. COMBINED MASTER DATA (SINGLE CALL)
// ==========================================
exports.getMasterData = async (req, res) => {
    try {
        let itemsPromise = supabase.from('art_items').select('*, art_item_specifications(*), product_types(id, name)').order('code', { ascending: true });
        const [itemsRes, gendersRes, patternsRes, fitsRes, specsRes] = await Promise.all([
            itemsPromise,
            supabase.from('art_genders').select('*').order('code', { ascending: true }),
            supabase.from('art_patterns').select('*').order('code', { ascending: true }),
            supabase.from('art_fits').select('*').order('code', { ascending: true }),
            supabase.from('art_item_specifications').select('*').order('display_order', { ascending: true }).order('code', { ascending: true })
        ]);

        let itemsData = itemsRes.data;
        if (itemsRes.error && isMissingTableError(itemsRes.error)) {
            const simpleItemRes = await supabase.from('art_items').select('*').order('code', { ascending: true });
            if (!simpleItemRes.error) {
                itemsData = simpleItemRes.data || [];
            } else {
                const dressRes = await supabase.from('art_dresses').select('*').order('code', { ascending: true });
                itemsData = dressRes.data || [];
            }
        }

        // Ensure specifications are attached to items
        let allSpecs = specsRes.data || [];
        if (specsRes.error || !allSpecs || allSpecs.length === 0) {
            allSpecs = specsStore.list();
        }

        itemsData = (itemsData || []).map(item => {
            let itemSpecs = item.art_item_specifications;
            if (!itemSpecs || itemSpecs.length === 0) {
                itemSpecs = specsStore.list(item.id);
            }
            return {
                ...item,
                art_item_specifications: itemSpecs || []
            };
        });

        res.json({
            items: itemsData || [],
            specifications: allSpecs,
            dresses: itemsData || [], // backward compatibility
            genders: gendersRes.data || [],
            patterns: patternsRes.data || [],
            fits: fitsRes.data || []
        });
    } catch (err) {
        console.error('[ArtNumberHub] getMasterData error:', err.message);
        res.status(500).json({ error: err.message });
    }
};

// ==========================================
// 8. COMBINED ART NUMBERS CRUD
// ==========================================
exports.listArtNumbers = async (req, res) => {
    try {
        // Step 1: Try full joined select with art_items and art_item_specifications
        let result = await supabase
            .from('art_numbers')
            .select('*, art_items(id, code, name), art_item_specifications(id, code, name), art_dresses(code, name), art_genders(code, name), art_patterns(code, name), art_fits(code, name)')
            .order('created_at', { ascending: false });

        // Step 2: If relationship to art_items or art_item_specifications fails in schema cache
        if (result.error && isMissingTableError(result.error)) {
            result = await supabase
                .from('art_numbers')
                .select('*, art_dresses(code, name), art_genders(code, name), art_patterns(code, name), art_fits(code, name)')
                .order('created_at', { ascending: false });
        }

        // Step 3: If art_fits join also fails
        if (result.error && isMissingTableError(result.error)) {
            result = await supabase
                .from('art_numbers')
                .select('*, art_dresses(code, name), art_genders(code, name), art_patterns(code, name)')
                .order('created_at', { ascending: false });
        }

        // Step 4: Fallback to plain art_numbers
        if (result.error && isMissingTableError(result.error)) {
            result = await supabase
                .from('art_numbers')
                .select('*')
                .order('created_at', { ascending: false });
        }

        if (result.error) throw result.error;

        // Enrich missing art_items and art_item_specifications from art_dresses or parse from code
        const enriched = (result.data || []).map(an => {
            let artItems = an.art_items;
            let artItemSpecs = an.art_item_specifications;

            if (!artItems && an.art_dresses) {
                artItems = an.art_dresses;
            }

            if (!artItems && an.code) {
                const parts = an.code.split('-');
                if (parts.length >= 2) {
                    const raw = parts[0];
                    const match = raw.match(/^([0-9a-zA-Z]+?)([A-Za-z])$/);
                    if (match) {
                        artItems = { code: match[1], name: `Item ${match[1]}` };
                        if (!artItemSpecs) {
                            artItemSpecs = { code: match[2].toUpperCase(), name: `Spec ${match[2].toUpperCase()}` };
                        }
                    } else {
                        artItems = { code: raw, name: `Item ${raw}` };
                    }
                }
            }

            return {
                ...an,
                art_items: artItems,
                art_item_specifications: artItemSpecs
            };
        });

        res.json(enriched);
    } catch (err) {
        console.error('[ArtNumberHub] listArtNumbers error:', err.message);
        res.status(500).json({ error: err.message });
    }
};

exports.createArtNumber = async (req, res) => {
    try {
        const { item_id, dress_id, specification_id, gender_id, pattern_id, fit_id, allowance, base_size, fit } = req.body;
        const effectiveItemId = item_id || dress_id;

        if (!effectiveItemId || !gender_id || !pattern_id) {
            return res.status(400).json({ error: 'Item, Gender, and Pattern links are required' });
        }

        // Fetch codes to build combined code: [Item][Specification]-[Gender][Pattern]-[Fit][Allowance]
        // Example: 1A-3053-R2
        const queries = [
            // Try fetching from art_items first
            supabase.from('art_items').select('id, code, name').eq('id', effectiveItemId).single(),
            supabase.from('art_genders').select('code').eq('id', gender_id).single(),
            supabase.from('art_patterns').select('code').eq('id', pattern_id).single()
        ];
        if (specification_id) {
            queries.push(supabase.from('art_item_specifications').select('id, code, name').eq('id', specification_id).single());
        }
        if (fit_id) {
            queries.push(supabase.from('art_fits').select('id, code, name').eq('id', fit_id).single());
        }

        const results = await Promise.all(queries);
        let itemRes = results[0];
        const genderRes = results[1];
        const patternRes = results[2];
        let specRes = specification_id ? results[3] : { data: null };
        let fitRes = fit_id ? (specification_id ? results[4] : results[3]) : { data: null };

        // Fallback to specsStore if specification lookup failed or table missing
        if (specification_id && (!specRes.data || specRes.error)) {
            const fallbackSpec = specsStore.getById(specification_id);
            if (fallbackSpec) {
                specRes = { data: fallbackSpec };
            }
        }

        // Fallback to art_dresses if art_items query failed
        if (itemRes.error || !itemRes.data) {
            const fallbackDress = await supabase.from('art_dresses').select('id, code, name').eq('id', effectiveItemId).maybeSingle();
            if (fallbackDress.data) {
                itemRes = fallbackDress;
            } else {
                return res.status(400).json({ error: 'Selected Item not found' });
            }
        }

        if (genderRes.error || !genderRes.data) return res.status(400).json({ error: 'Selected Gender Code not found' });
        if (patternRes.error || !patternRes.data) return res.status(400).json({ error: 'Selected Pattern Code not found' });

        const itemCode = itemRes.data.code;
        const specCode = specRes.data ? specRes.data.code : '';
        const genderCode = genderRes.data.code;
        const patternCode = String(patternRes.data.code).padStart(3, '0');

        // Resolve Fit Code & Name
        let fitCode = fitRes.data?.code;
        let fitName = fitRes.data?.name;
        let resolvedFitId = fitRes.data?.id || null;

        if (!fitCode && fit) {
            const { data: matchedFit } = await supabase
                .from('art_fits')
                .select('id, code, name')
                .or(`code.ilike.${fit.trim()},name.ilike.${fit.trim()}`)
                .maybeSingle();

            if (matchedFit) {
                fitCode = matchedFit.code;
                fitName = matchedFit.name;
                resolvedFitId = matchedFit.id;
            } else {
                fitCode = fit.trim().slice(0, 1).toUpperCase();
                fitName = fit.trim();
            }
        }

        if (!fitCode) {
            fitCode = 'R';
            fitName = fitName || 'Regular Fit';
        }

        const cleanAllowance = allowance && String(allowance).trim() ? String(allowance).trim() : '';

        // Auto-generate code: [item][specification]-[gender][pattern-code]-[fit][allowance]
        // Example: 1A-3053-R2
        const firstSegment = `${itemCode}${specCode}`;
        const secondSegment = `${genderCode}${patternCode}`;
        const thirdSegment = `${fitCode}${cleanAllowance}`;
        const combinedCode = `${firstSegment}-${secondSegment}-${thirdSegment}`;

        const basePayload = {
            dress_id: itemRes.data.id, // for legacy foreign key constraints
            gender_id,
            pattern_id,
            fit_id: resolvedFitId,
            allowance: cleanAllowance || null,
            code: combinedCode,
            art_number: combinedCode,
            base_size: base_size || null,
            fit: fitName || null
        };

        let { data, error } = await supabase
            .from('art_numbers')
            .insert([{
                ...basePayload,
                item_id: itemRes.data.id,
                specification_id: specRes.data?.id || null
            }])
            .select()
            .single();

        // If item_id / specification_id column does not exist on art_numbers yet
        if (error && isMissingTableError(error)) {
            const retryRes = await supabase
                .from('art_numbers')
                .insert([basePayload])
                .select()
                .single();
            if (retryRes.error) throw retryRes.error;
            data = retryRes.data;
        } else if (error) {
            if (error.code === '23505') {
                return res.status(400).json({ error: `The Art Number code '${combinedCode}' is already registered` });
            }
            throw error;
        }

        const enriched = {
            ...data,
            art_items: itemRes.data,
            art_item_specifications: specRes.data || null,
            art_dresses: itemRes.data,
            art_genders: genderRes.data,
            art_patterns: patternRes.data,
            art_fits: fitRes.data
        };

        res.json({ success: true, data: enriched });
    } catch (err) {
        console.error('[ArtNumberHub] createArtNumber error:', err.message);
        res.status(500).json({ error: err.message });
    }
};

exports.deleteArtNumber = async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabase
            .from('art_numbers')
            .delete()
            .eq('id', id);

        if (error) throw error;
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
