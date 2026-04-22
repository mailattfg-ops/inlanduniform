const supabase = require('../config/supabase');

exports.listSizeCharts = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('size_charts')
            .select('*')
            .order('created_at');
        
        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.createSizeChart = async (req, res) => {
    try {
        const { name, category, unit, chart_data, metric_groups, fit_types } = req.body;
        const { data, error } = await supabase
            .from('size_charts')
            .insert([{ name, category, unit, chart_data, metric_groups, fit_types }])
            .select()
            .single();
        
        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.updateSizeChart = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, category, unit, chart_data, metric_groups, fit_types } = req.body;
        const { data, error } = await supabase
            .from('size_charts')
            .update({ name, category, unit, chart_data, metric_groups, fit_types, updated_at: new Date() })
            .eq('id', id)
            .select()
            .single();
        
        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.deleteSizeChart = async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabase
            .from('size_charts')
            .delete()
            .eq('id', id);
        
        if (error) throw error;
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
