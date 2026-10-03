const supabase = require('../config/supabase');

// 1. List all tax masters
exports.listTaxes = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('tax_masters')
            .select('*')
            .order('rate', { ascending: true });

        if (error) throw error;
        res.json(data || []);
    } catch (err) {
        console.error('[TaxMasterController] listTaxes error:', err.message);
        res.status(500).json({ error: err.message });
    }
};

// 2. Create new tax slab (Admin only)
exports.createTax = async (req, res) => {
    try {
        const { name, rate, hsn_code, is_default, is_active } = req.body;
        if (!name || rate === undefined) {
            return res.status(400).json({ error: 'Tax name and percentage rate are required.' });
        }

        const rateNum = parseFloat(rate);
        if (isNaN(rateNum) || rateNum < 0 || rateNum > 100) {
            return res.status(400).json({ error: 'Valid tax rate between 0 and 100 is required.' });
        }

        const payload = {
            name: name.trim(),
            rate: rateNum,
            hsn_code: hsn_code ? hsn_code.trim() : null,
            is_default: Boolean(is_default),
            is_active: is_active !== undefined ? Boolean(is_active) : true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        const { data, error } = await supabase
            .from('tax_masters')
            .insert([payload])
            .select()
            .single();

        if (error) throw error;
        res.status(201).json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 3. Update tax slab (Admin only)
exports.updateTax = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, rate, hsn_code, is_default, is_active } = req.body;

        const updatePayload = {
            updated_at: new Date().toISOString()
        };
        if (name) updatePayload.name = name.trim();
        if (rate !== undefined) updatePayload.rate = parseFloat(rate);
        if (hsn_code !== undefined) updatePayload.hsn_code = hsn_code ? hsn_code.trim() : null;
        if (is_default !== undefined) updatePayload.is_default = Boolean(is_default);
        if (is_active !== undefined) updatePayload.is_active = Boolean(is_active);

        const { data, error } = await supabase
            .from('tax_masters')
            .update(updatePayload)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 4. Delete tax slab (Admin only)
exports.deleteTax = async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabase
            .from('tax_masters')
            .delete()
            .eq('id', id);

        if (error) throw error;
        res.json({ success: true, message: 'Tax master deleted successfully.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
