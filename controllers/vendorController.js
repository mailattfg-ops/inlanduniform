const supabase = require('../config/supabase');

// Helper to generate next vendor code (VND-0001, VND-0002, etc.)
async function generateNextVendorCodeLocal() {
    try {
        const { data, error } = await supabase
            .from('vendors')
            .select('code')
            .not('code', 'is', null);

        if (error) {
            console.error('Error fetching vendors codes:', error.message);
            return 'VND-0001';
        }

        let maxNum = 0;
        if (data && data.length > 0) {
            data.forEach(item => {
                const c = item.code;
                if (c && c.startsWith('VND-')) {
                    const numPart = c.substring(4);
                    const num = parseInt(numPart, 10);
                    if (!isNaN(num) && num > maxNum) {
                        maxNum = num;
                    }
                }
            });
        }

        const nextNum = maxNum + 1;
        const padded = String(nextNum).padStart(4, '0');
        return `VND-${padded}`;
    } catch (err) {
        console.error('Exception in generateNextVendorCodeLocal:', err.message);
        return 'VND-0001';
    }
}

module.exports = {
    list: async (req, res) => {
        try {
            const { data, error } = await supabase
                .from('vendors')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            res.json(data);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    },

    getDetails: async (req, res) => {
        const { id } = req.params;
        try {
            const { data, error } = await supabase
                .from('vendors')
                .select('*')
                .eq('id', id)
                .single();

            if (error) throw error;
            res.json(data);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    },

    create: async (req, res) => {
        const { code, name, contact_person, phone, email, address, status } = req.body;
        if (!name || name.trim() === '') {
            return res.status(400).json({ error: 'Vendor name is required' });
        }
        try {
            let finalCode = code;
            if (!finalCode || finalCode.trim() === '') {
                finalCode = await generateNextVendorCodeLocal();
            }

            const { data, error } = await supabase
                .from('vendors')
                .insert([{
                    code: finalCode,
                    name,
                    contact_person: contact_person || null,
                    phone: phone || null,
                    email: email || null,
                    address: address || null,
                    status: status || 'active'
                }])
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
        const { code, name, contact_person, phone, email, address, status } = req.body;
        if (!name || name.trim() === '') {
            return res.status(400).json({ error: 'Vendor name is required' });
        }
        try {
            const { data, error } = await supabase
                .from('vendors')
                .update({
                    code,
                    name,
                    contact_person: contact_person || null,
                    phone: phone || null,
                    email: email || null,
                    address: address || null,
                    status: status || 'active'
                })
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
                .from('vendors')
                .delete()
                .eq('id', id);

            if (error) throw error;
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    }
};
