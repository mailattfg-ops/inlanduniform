const supabase = require('../config/supabase');

exports.listIndustries = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('industries')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.createIndustry = async (req, res) => {
    try {
        const { name, type } = req.body;
        const { data, error } = await supabase
            .from('industries')
            .insert([{ name, type }])
            .select()
            .single();

        if (error) {
            if (error.code === '23505') {
                return res.status(400).json({ error: 'A sector registry with this name already exists' });
            }
            throw error;
        }
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.updateIndustry = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, type } = req.body;
        
        const { data, error } = await supabase
            .from('industries')
            .update({ name, type })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            if (error.code === '23505') {
                return res.status(400).json({ error: 'A sector registry with this name already exists' });
            }
            throw error;
        }
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.deleteIndustry = async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabase
            .from('industries')
            .delete()
            .eq('id', id);

        if (error) throw error;
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
