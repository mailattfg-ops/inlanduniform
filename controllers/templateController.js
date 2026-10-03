const supabase = require('../config/supabase');

exports.listTemplates = async (req, res) => {
    try {
        const { orgId, deptId } = req.query;
        let query = supabase
            .from('industry_templates')
            .select('*, organizations(name)');

        if (orgId) {
            query = query.eq('organization_id', orgId);
        }

        let { data, error } = await query.order('name');
        
        // If joined query failed (e.g. relation not found or column missing)
        if (error) {
            console.warn('industry_templates joined query failed, attempting simple select:', error.message);
            let simpleQuery = supabase.from('industry_templates').select('*');
            if (orgId) simpleQuery = simpleQuery.eq('organization_id', orgId);
            const simpleRes = await simpleQuery.order('name');
            if (simpleRes.error) {
                console.warn('industry_templates table may not exist yet:', simpleRes.error.message);
                return res.json([]);
            }
            data = simpleRes.data;
        }

        let results = data || [];
        if (deptId && results.length > 0) {
            results = results.filter(t => {
                if (!t.department_ids) return false;
                if (Array.isArray(t.department_ids)) {
                    return t.department_ids.map(String).includes(String(deptId));
                }
                return String(t.department_ids).includes(String(deptId));
            });
        }

        res.json(results);
    } catch (err) {
        console.error('templateController.listTemplates error:', err);
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
        let { data, error } = await supabase
            .from('industry_templates')
            .select('*, organizations(name)')
            .eq('id', id)
            .maybeSingle();

        if (error) {
            const fallback = await supabase
                .from('industry_templates')
                .select('*')
                .eq('id', id)
                .maybeSingle();
            if (fallback.error) throw fallback.error;
            data = fallback.data;
        }

        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
