const supabase = require('../config/supabase');

function isMissingTableError(error) {
    if (!error) return false;
    const msg = (error.message || '').toLowerCase();
    return error.code === 'PGRST205' || msg.includes('schema cache') || msg.includes('does not exist');
}

// ==========================================
// 1. DRESS PREFIXES CRUD
// ==========================================
exports.listDresses = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('art_dresses')
            .select('*')
            .order('code', { ascending: true });

        if (error) throw error;
        res.json(data || []);
    } catch (err) {
        console.error('[ArtNumberHub] listDresses error:', err.message);
        res.status(500).json({ error: err.message });
    }
};

exports.createDress = async (req, res) => {
    try {
        const { code, name, description } = req.body;
        if (!code || !name) {
            return res.status(400).json({ error: 'Code and name are required' });
        }

        const { data, error } = await supabase
            .from('art_dresses')
            .insert([{ code: code.trim().toUpperCase(), name: name.trim(), description: description ? description.trim() : null }])
            .select()
            .single();

        if (error) {
            if (isMissingTableError(error)) {
                return res.status(400).json({ error: "Table 'public.art_dresses' does not exist yet. Please run inlanduniform/migrations/create_art_number_hub_tables.sql in Supabase SQL editor." });
            }
            if (error.code === '23505') {
                return res.status(400).json({ error: 'A dress prefix with this code already exists' });
            }
            throw error;
        }
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.updateDress = async (req, res) => {
    try {
        const { id } = req.params;
        const { code, name, description } = req.body;
        if (!code || !name) {
            return res.status(400).json({ error: 'Code and name are required' });
        }

        const { data, error } = await supabase
            .from('art_dresses')
            .update({ code: code.trim().toUpperCase(), name: name.trim(), description: description ? description.trim() : null, updated_at: new Date() })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            if (isMissingTableError(error)) {
                return res.status(400).json({ error: "Table 'public.art_dresses' does not exist yet. Please run inlanduniform/migrations/create_art_number_hub_tables.sql in Supabase SQL editor." });
            }
            if (error.code === '23505') {
                return res.status(400).json({ error: 'A dress prefix with this code already exists' });
            }
            throw error;
        }
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.deleteDress = async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabase
            .from('art_dresses')
            .delete()
            .eq('id', id);

        if (error) {
            if (isMissingTableError(error)) {
                return res.json({ success: true });
            }
            throw error;
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ==========================================
// 2. GENDER CODES CRUD
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
                return res.status(400).json({ error: "Table 'public.art_genders' does not exist yet. Please run inlanduniform/migrations/create_art_number_hub_tables.sql in Supabase SQL editor." });
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
            if (isMissingTableError(error)) {
                return res.status(400).json({ error: "Table 'public.art_genders' does not exist yet. Please run inlanduniform/migrations/create_art_number_hub_tables.sql in Supabase SQL editor." });
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

exports.deleteGender = async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabase
            .from('art_genders')
            .delete()
            .eq('id', id);

        if (error) {
            if (isMissingTableError(error)) {
                return res.json({ success: true });
            }
            throw error;
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ==========================================
// 3. PATTERN CODES CRUD
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
            const num = parseInt(p.code, 10);
            if (!isNaN(num) && num > maxNum) maxNum = num;
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
            if (isMissingTableError(error)) {
                return res.status(400).json({ error: "Table 'public.art_patterns' does not exist yet. Please run inlanduniform/migrations/create_art_number_hub_tables.sql in Supabase SQL editor." });
            }
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
            if (isMissingTableError(error)) {
                return res.status(400).json({ error: "Table 'public.art_patterns' does not exist yet. Please run inlanduniform/migrations/create_art_number_hub_tables.sql in Supabase SQL editor." });
            }
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

        if (error) {
            if (isMissingTableError(error)) {
                return res.json({ success: true });
            }
            throw error;
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ==========================================
// 4. FITS MASTER CRUD
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
            if (isMissingTableError(error)) {
                return res.status(400).json({ error: "Table 'public.art_fits' does not exist yet. Please run migration script." });
            }
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
// 5. COMBINED MASTER DATA (SINGLE CALL)
// ==========================================
exports.getMasterData = async (req, res) => {
    try {
        const [dressesRes, gendersRes, patternsRes, fitsRes] = await Promise.all([
            supabase.from('art_dresses').select('*').order('code', { ascending: true }),
            supabase.from('art_genders').select('*').order('code', { ascending: true }),
            supabase.from('art_patterns').select('*').order('code', { ascending: true }),
            supabase.from('art_fits').select('*').order('code', { ascending: true })
        ]);

        res.json({
            dresses: dressesRes.data || [],
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
// 6. COMBINED ART NUMBERS CRUD
// ==========================================
exports.listArtNumbers = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('art_numbers')
            .select('*, art_dresses(code, name), art_genders(code, name), art_patterns(code, name), art_fits(code, name)')
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json(data || []);
    } catch (err) {
        console.error('[ArtNumberHub] listArtNumbers error:', err.message);
        res.status(500).json({ error: err.message });
    }
};

exports.createArtNumber = async (req, res) => {
    try {
        const { dress_id, gender_id, pattern_id, fit_id, base_size, fit } = req.body;
        if (!dress_id || !gender_id || !pattern_id) {
            return res.status(400).json({ error: 'Dress, Gender, and Pattern links are required' });
        }

        // Fetch codes to build combined code
        const queries = [
            supabase.from('art_dresses').select('code').eq('id', dress_id).single(),
            supabase.from('art_genders').select('code').eq('id', gender_id).single(),
            supabase.from('art_patterns').select('code').eq('id', pattern_id).single()
        ];
        if (fit_id) {
            queries.push(supabase.from('art_fits').select('id, code, name').eq('id', fit_id).single());
        }

        const results = await Promise.all(queries);
        const dressRes = results[0];
        const genderRes = results[1];
        const patternRes = results[2];
        const fitRes = fit_id ? results[3] : { data: null };

        if (dressRes.error || !dressRes.data) {
            if (isMissingTableError(dressRes.error)) {
                return res.status(400).json({ error: "Table 'public.art_dresses' does not exist yet. Please run migration script." });
            }
            return res.status(400).json({ error: 'Selected Dress Prefix not found' });
        }
        if (genderRes.error || !genderRes.data) return res.status(400).json({ error: 'Selected Gender Code not found' });
        if (patternRes.error || !patternRes.data) return res.status(400).json({ error: 'Selected Pattern Code not found' });

        const dressCode = dressRes.data.code;
        const genderCode = genderRes.data.code;
        const patternCode = patternRes.data.code;
        
        // Resolve Fit Code & Name
        let fitCode = fitRes.data?.code;
        let fitName = fitRes.data?.name;
        let resolvedFitId = fitRes.data?.id || null;

        if (!fitCode && fit) {
            // Find by name or code if passed as text
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

        // Auto-generate code Option 1: [DressPrefix]-[GenderCode][PatternCode]-[FitCode] (e.g. 4J-1012-R)
        const combinedCode = `${dressCode}-${genderCode}${patternCode}-${fitCode}`;

        const { data, error } = await supabase
            .from('art_numbers')
            .insert([{ 
                dress_id, 
                gender_id, 
                pattern_id,
                fit_id: resolvedFitId,
                code: combinedCode,
                art_number: combinedCode,
                base_size: base_size || null,
                fit: fitName || null
            }])
            .select('*, art_dresses(code, name), art_genders(code, name), art_patterns(code, name), art_fits(code, name)')
            .single();

        if (error) {
            if (isMissingTableError(error)) {
                return res.status(400).json({ error: "Table 'public.art_numbers' does not exist yet. Please run migration script." });
            }
            if (error.code === '23505') {
                return res.status(400).json({ error: `The combined Art Number code '${combinedCode}' is already registered` });
            }
            throw error;
        }

        res.json({ success: true, data });
    } catch (err) {
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

        if (error) {
            if (isMissingTableError(error)) {
                return res.json({ success: true });
            }
            throw error;
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
