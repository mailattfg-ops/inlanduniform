const supabase = require('../config/supabase');

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
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.createDress = async (req, res) => {
    try {
        const { code, name } = req.body;
        if (!code || !name) {
            return res.status(400).json({ error: 'Code and name are required' });
        }

        const { data, error } = await supabase
            .from('art_dresses')
            .insert([{ code: code.trim().toUpperCase(), name: name.trim() }])
            .select()
            .single();

        if (error) {
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
        const { code, name } = req.body;
        if (!code || !name) {
            return res.status(400).json({ error: 'Code and name are required' });
        }

        const { data, error } = await supabase
            .from('art_dresses')
            .update({ code: code.trim().toUpperCase(), name: name.trim(), updated_at: new Date() })
            .eq('id', id)
            .select()
            .single();

        if (error) {
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

        if (error) throw error;
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
        res.json(data);
    } catch (err) {
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
// 3. PATTERN CODES CRUD
// ==========================================
exports.listPatterns = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('art_patterns')
            .select('*')
            .order('code', { ascending: true });

        if (error) throw error;
        res.json(data);
    } catch (err) {
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
// 4. COMBINED ART NUMBERS CRUD
// ==========================================
exports.listArtNumbers = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('art_numbers')
            .select('*, art_dresses(code, name), art_genders(code, name), art_patterns(code, name)')
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.createArtNumber = async (req, res) => {
    try {
        const { dress_id, gender_id, pattern_id, base_size, fit } = req.body;
        if (!dress_id || !gender_id || !pattern_id) {
            return res.status(400).json({ error: 'Dress, Gender, and Pattern links are required' });
        }

        // Fetch codes to build combined code
        const [dressRes, genderRes, patternRes] = await Promise.all([
            supabase.from('art_dresses').select('code').eq('id', dress_id).single(),
            supabase.from('art_genders').select('code').eq('id', gender_id).single(),
            supabase.from('art_patterns').select('code').eq('id', pattern_id).single()
        ]);

        if (dressRes.error || !dressRes.data) return res.status(400).json({ error: 'Selected Dress Prefix not found' });
        if (genderRes.error || !genderRes.data) return res.status(400).json({ error: 'Selected Gender Code not found' });
        if (patternRes.error || !patternRes.data) return res.status(400).json({ error: 'Selected Pattern Code not found' });

        const dressCode = dressRes.data.code;
        const genderCode = genderRes.data.code;
        const patternCode = patternRes.data.code;

        // Auto-generate code: [DressCode]-[GenderCode][PatternCode]
        const combinedCode = `${dressCode}-${genderCode}${patternCode}`;

        const { data, error } = await supabase
            .from('art_numbers')
            .insert([{ 
                dress_id, 
                gender_id, 
                pattern_id, 
                code: combinedCode,
                base_size: base_size || null,
                fit: fit || null
            }])
            .select('*, art_dresses(code, name), art_genders(code, name), art_patterns(code, name)')
            .single();

        if (error) {
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

        if (error) throw error;
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
