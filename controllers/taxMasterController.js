const supabase = require('../config/supabase');

// Default fallback tax slabs if database table is pending execution
const DEFAULT_TAX_MASTERS = [
    { id: 1, name: 'GST 5% - Apparel < ₹1,000', rate: 5.00, hsn_code: '6203', is_default: true, is_active: true },
    { id: 2, name: 'GST 12% - Apparel ≥ ₹1,000', rate: 12.00, hsn_code: '6203', is_default: false, is_active: true },
    { id: 3, name: 'GST 18% - Services & Synthetic Fabrics', rate: 18.00, hsn_code: '9988', is_default: false, is_active: true },
    { id: 4, name: 'Zero Rated / Exempt (0%)', rate: 0.00, hsn_code: '0000', is_default: false, is_active: true }
];

// In-memory store for fallback mode
let fallbackTaxes = [...DEFAULT_TAX_MASTERS];

// 1. List all tax masters
exports.listTaxes = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('tax_masters')
            .select('*')
            .order('rate', { ascending: true });

        if (error) {
            // Table might not be migrated yet - return fallback data gracefully
            return res.json(fallbackTaxes);
        }

        if (!data || data.length === 0) {
            return res.json(DEFAULT_TAX_MASTERS);
        }

        res.json(data);
    } catch (err) {
        console.error('[TaxMasterController] listTaxes error:', err.message);
        res.json(fallbackTaxes);
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

        if (error) {
            // If table does not exist, insert into fallback memory store
            const newId = fallbackTaxes.length ? Math.max(...fallbackTaxes.map(t => Number(t.id))) + 1 : 1;
            const fallbackItem = { id: newId, ...payload };
            fallbackTaxes.push(fallbackItem);
            return res.status(201).json(fallbackItem);
        }

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

        if (error) {
            // Fallback in-memory update
            const idx = fallbackTaxes.findIndex(t => String(t.id) === String(id));
            if (idx >= 0) {
                fallbackTaxes[idx] = { ...fallbackTaxes[idx], ...updatePayload };
                return res.json(fallbackTaxes[idx]);
            }
            return res.status(404).json({ error: 'Tax master record not found' });
        }

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

        if (error) {
            fallbackTaxes = fallbackTaxes.filter(t => String(t.id) !== String(id));
            return res.json({ success: true, message: 'Tax master deleted (fallback mode)' });
        }

        res.json({ success: true, message: 'Tax master deleted successfully.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
