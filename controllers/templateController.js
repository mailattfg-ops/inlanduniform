const supabase = require('../config/supabase');

exports.listTemplates = async (req, res) => {
    try {
        const { schoolId } = req.query;
        let query = supabase
            .from('uniform_templates')
            .select('*, schools(name)');

        if (schoolId) {
            query = query.eq('school_id', schoolId);
        }

        const { data, error } = await query.order('name');
        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.createTemplate = async (req, res) => {
    try {
        const { school_id, name, classes, boys_config, girls_config } = req.body;
        const { data, error } = await supabase
            .from('uniform_templates')
            .insert([{ school_id, name, classes, boys_config, girls_config }])
            .select()
            .single();

        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.updateTemplate = async (req, res) => {
    try {
        const { id } = req.params;
        const { school_id, name, classes, boys_config, girls_config } = req.body;
        const { data, error } = await supabase
            .from('uniform_templates')
            .update({ school_id, name, classes, boys_config, girls_config, updated_at: new Date() })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.deleteTemplate = async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabase
            .from('uniform_templates')
            .delete()
            .eq('id', id);

        if (error) throw error;
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
