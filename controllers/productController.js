const supabase = require('../config/supabase');

exports.listProducts = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('products')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.createProduct = async (req, res) => {
    try {
        const { name, art_number, gender, measurements, materials, entry_methods, size_chart_id, category } = req.body;
        const { data, error } = await supabase
            .from('products')
            .insert([{ name, art_number, gender, measurements, materials, entry_methods, size_chart_id, category }])
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

        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.updateProduct = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, art_number, gender, measurements, materials, entry_methods, size_chart_id, category } = req.body;
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
