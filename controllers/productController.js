const supabase = require('../config/supabase');

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

        const formatted = (products || []).map(p => ({
            ...p,
            design_number: p.design_number_ref?.code || null,
            design_number_ref: undefined
        }));

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
            main_fabric_id, button_id, thread_id
        } = req.body;
        
        if (!design_number || design_number.trim() === '') {
            design_number = await generateNextDesignNumberInternal();
        } else {
            design_number = design_number.trim();
        }

        const designNumberId = await findOrCreateProductDesignNumber(design_number);
        
        const { data, error } = await supabase
            .from('products')
            .insert([{ 
                name, 
                art_number, 
                gender, 
                measurements, 
                materials, 
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
                main_fabric_id: main_fabric_id || null,
                button_id: button_id || null,
                thread_id: thread_id || null,
                base_size: base_size || null,
                fit: fit || null,
                images: images || [],
                design_number_id: designNumberId
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
            main_fabric_id, button_id, thread_id
        } = req.body;
        
        const designNumberId = design_number ? await findOrCreateProductDesignNumber(design_number) : null;
        
        const { data, error } = await supabase
            .from('products')
            .update({ 
                name, 
                art_number, 
                gender, 
                measurements, 
                materials, 
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
                main_fabric_id: main_fabric_id || null,
                button_id: button_id || null,
                thread_id: thread_id || null,
                base_size: base_size || null,
                fit: fit || null,
                images: images || [],
                design_number_id: designNumberId,
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

