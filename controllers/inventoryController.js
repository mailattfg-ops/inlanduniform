const supabase = require('../config/supabase');

const createInventoryHandler = (tableName) => {
    return {
        list: async (req, res) => {
            try {
                const { data, error } = await supabase
                    .from(tableName)
                    .select('*')
                    .order('code', { ascending: true });
                if (error) throw error;
                res.json(data);
            } catch (err) {
                res.status(500).json({ error: err.message });
            }
        },
        create: async (req, res) => {
            const { code, name } = req.body;
            try {
                const { data, error } = await supabase
                    .from(tableName)
                    .insert([{ code, name }])
                    .select()
                    .single();
                if (error) throw error;
                res.json(data);
            } catch (err) {
                res.status(500).json({ error: err.message });
            }
        },
        update: async (req, res) => {
            const { id } = req.params;
            const { code, name } = req.body;
            try {
                const { data, error } = await supabase
                    .from(tableName)
                    .update({ code, name })
                    .eq('id', id)
                    .select()
                    .single();
                if (error) throw error;
                res.json(data);
            } catch (err) {
                res.status(500).json({ error: err.message });
            }
        },
        delete: async (req, res) => {
            const { id } = req.params;
            try {
                const { error } = await supabase
                    .from(tableName)
                    .delete()
                    .eq('id', id);
                if (error) throw error;
                res.json({ success: true });
            } catch (err) {
                res.status(500).json({ error: err.message });
            }
        }
    };
};

exports.fabrics = createInventoryHandler('fabrics');
exports.buttons = createInventoryHandler('buttons');
exports.threads = createInventoryHandler('threads');
