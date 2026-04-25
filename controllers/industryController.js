const supabase = require('../config/supabase');

exports.listIndustries = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('industries')
            .select('*')
            .order('name');

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

        if (error) throw error;
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
