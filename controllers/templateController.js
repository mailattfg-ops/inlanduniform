const supabase = require('../config/supabase');

exports.listTemplates = async (req, res) => {
    try {
        const { orgId } = req.query;
        let query = supabase
            .from('industry_templates')
            .select('*, organizations(name)');

        if (orgId) {
            query = query.eq('organization_id', orgId);
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
        const { organization_id, name, department_ids, boys_config, girls_config } = req.body;
        const { data, error } = await supabase
            .from('industry_templates')
            .insert([{ organization_id, name, department_ids, boys_config, girls_config }])
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
        const { organization_id, name, department_ids, boys_config, girls_config } = req.body;
        const { data, error } = await supabase
            .from('industry_templates')
            .update({ organization_id, name, department_ids, boys_config, girls_config, updated_at: new Date() })
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
            .from('industry_templates')
            .delete()
            .eq('id', id);

        if (error) throw error;
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getTemplateById = async (req, res) => {
    try {
        const { id } = req.params;
        const { data, error } = await supabase
            .from('industry_templates')
            .select('*, organizations(name)')
            .eq('id', id)
            .single();

        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
