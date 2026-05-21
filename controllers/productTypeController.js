const supabase = require('../config/supabase');

exports.listProductTypes = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('product_types')
            .select('*')
            .order('name', { ascending: true });

        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.createProductType = async (req, res) => {
    try {
        const { name } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Product type name is required' });
        }

        const { data, error } = await supabase
            .from('product_types')
            .insert([{ name: name.trim() }])
            .select()
            .single();

        if (error) {
            if (error.code === '23505') {
                return res.status(400).json({ error: 'A product type with this name already exists' });
            }
            throw error;
        }

        // Log the action if logger is available
        try {
            const { logAction } = require('../utils/logger');
            await logAction(req.user.id, 'CREATE', 'product_type', data.id, { name: data.name });
        } catch (logErr) {
            console.error('Logging failed:', logErr.message);
        }

        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.updateProductType = async (req, res) => {
    try {
        const { id } = req.params;
        const { name } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Product type name is required' });
        }

        const { data, error } = await supabase
            .from('product_types')
            .update({ name: name.trim(), updated_at: new Date() })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            if (error.code === '23505') {
                return res.status(400).json({ error: 'A product type with this name already exists' });
            }
            throw error;
        }

        // Log the action if logger is available
        try {
            const { logAction } = require('../utils/logger');
            await logAction(req.user.id, 'UPDATE', 'product_type', id, { name: data.name });
        } catch (logErr) {
            console.error('Logging failed:', logErr.message);
        }

        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.deleteProductType = async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabase
            .from('product_types')
            .delete()
            .eq('id', id);

        if (error) throw error;

        // Log the action if logger is available
        try {
            const { logAction } = require('../utils/logger');
            await logAction(req.user.id, 'DELETE', 'product_type', id, { product_type_id: id });
        } catch (logErr) {
            console.error('Logging failed:', logErr.message);
        }

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
