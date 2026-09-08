const supabase = require('../config/supabase');

// Helper to check if logged in user is global admin
const isGlobalAdmin = (user) => {
    if (!user) return false;
    const role = user.role || '';
    return role === 'Admin' || role === 'Super Admin' || role === 'SuperAdmin';
};

// 1. List branches (Strictly filtered by branch_id for Branch Accounts)
exports.listBranches = async (req, res) => {
    try {
        const isAdmin = isGlobalAdmin(req.user);
        const userBranchId = req.user?.branchId;

        let query = supabase.from('branches').select('*');

        // Non-admin branch accounts are strictly locked to their own branch profile
        if (!isAdmin && userBranchId) {
            query = query.eq('id', userBranchId);
        }

        const { data, error } = await query.order('created_at', { ascending: true });

        if (error) throw error;
        res.json(data || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 2. Create branch profile (Admin Only)
exports.createBranch = async (req, res) => {
    try {
        const isAdmin = isGlobalAdmin(req.user);
        if (!isAdmin) {
            return res.status(403).json({ error: 'Only System Administrators can register new branch outlets.' });
        }

        const { code, name, tier, address, contact_number, email, manager_name, manager_email, manager_password, operational_settings } = req.body;

        if (!code || !name) {
            return res.status(400).json({ error: 'Branch code and name are required.' });
        }

        const { data, error } = await supabase
            .from('branches')
            .insert([{
                code,
                name,
                tier: tier || 'Branch',
                address: address || '',
                contact_number: contact_number || '',
                email: email || '',
                operational_settings: operational_settings || {},
                is_active: true
            }])
            .select()
            .single();

        if (error) throw error;

        // Optionally create branch user account credentials if provided
        if (manager_email && manager_password) {
            await supabase
                .from('branch_users')
                .insert([{
                    branch_id: data.id,
                    name: manager_name || `${name} Manager`,
                    email: manager_email.trim().toLowerCase(),
                    password_plain: manager_password,
                    role: 'Branch Manager',
                    is_active: true
                }]);
        }

        res.status(201).json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 3. Update branch
exports.updateBranch = async (req, res) => {
    try {
        const { id } = req.params;
        const isAdmin = isGlobalAdmin(req.user);
        const userBranchId = req.user?.branchId;

        // Non-admin can only update their own branch
        if (!isAdmin && String(userBranchId) !== String(id)) {
            return res.status(403).json({ error: 'Access denied: You can only update your assigned branch details.' });
        }

        const { name, tier, address, contact_number, email, operational_settings, is_active } = req.body;

        const { data, error } = await supabase
            .from('branches')
            .update({
                name,
                tier,
                address,
                contact_number,
                email,
                operational_settings,
                is_active,
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 4. Branch User Credentials Management
exports.listBranchUsers = async (req, res) => {
    try {
        const { branchId } = req.params;
        const isAdmin = isGlobalAdmin(req.user);
        const userBranchId = req.user?.branchId;

        let query = supabase.from('branch_users').select('*, branches(name, code)');

        if (!isAdmin && userBranchId) {
            query = query.eq('branch_id', userBranchId);
        } else if (branchId && branchId !== 'all') {
            query = query.eq('branch_id', branchId);
        }

        const { data, error } = await query.order('created_at', { ascending: false });
        if (error && error.code !== 'PGRST116') throw error;
        res.json(data || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.createBranchUser = async (req, res) => {
    try {
        const { branch_id, name, email, password, role } = req.body;
        const isAdmin = isGlobalAdmin(req.user);
        const userBranchId = req.user?.branchId;

        const targetBranchId = (!isAdmin && userBranchId) ? userBranchId : Number(branch_id);

        if (!targetBranchId || !email || !password) {
            return res.status(400).json({ error: 'Branch, email, and password are required.' });
        }

        const { data, error } = await supabase
            .from('branch_users')
            .insert([{
                branch_id: targetBranchId,
                name: name || 'Branch User',
                email: email.trim().toLowerCase(),
                password_plain: password,
                role: role || 'Branch Staff',
                is_active: true
            }])
            .select()
            .single();

        if (error) throw error;
        res.status(201).json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 5. Separate Branch Stock & Inventory
exports.getBranchInventory = async (req, res) => {
    try {
        const { branchId } = req.params;
        const { item_type } = req.query;
        const isAdmin = isGlobalAdmin(req.user);
        const userBranchId = req.user?.branchId;

        let query = supabase.from('branch_inventory').select('*');

        const targetBranchId = (!isAdmin && userBranchId) ? userBranchId : (branchId !== 'all' ? branchId : null);

        if (targetBranchId) {
            query = query.eq('branch_id', targetBranchId);
        }
        if (item_type) {
            query = query.eq('item_type', item_type);
        }

        const { data, error } = await query.order('item_name', { ascending: true });
        if (error && error.code !== 'PGRST116') throw error;
        res.json(data || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.adjustBranchInventory = async (req, res) => {
    try {
        const { branch_id, item_type, item_name, item_code, quantity, type, notes } = req.body;
        const isAdmin = isGlobalAdmin(req.user);
        const userBranchId = req.user?.branchId;

        // Non-admin branch users can only adjust stock for their assigned branch
        const targetBranchId = (!isAdmin && userBranchId) ? userBranchId : Number(branch_id);

        if (!targetBranchId || !item_type || !item_name || quantity === undefined) {
            return res.status(400).json({ error: 'Branch ID, Item Type, Item Name, and Quantity are required.' });
        }

        const qtyNum = parseFloat(quantity);
        const change = type === 'OUT' ? -qtyNum : qtyNum;

        // Check if item exists in branch_inventory
        const { data: existing } = await supabase
            .from('branch_inventory')
            .select('*')
            .eq('branch_id', targetBranchId)
            .eq('item_type', item_type)
            .eq('item_name', item_name)
            .maybeSingle();

        let updated;
        if (existing) {
            const newQty = Math.max(0, parseFloat(existing.quantity || 0) + change);
            const { data, error } = await supabase
                .from('branch_inventory')
                .update({
                    quantity: newQty,
                    updated_at: new Date().toISOString()
                })
                .eq('id', existing.id)
                .select()
                .single();
            if (error) throw error;
            updated = data;
        } else {
            const { data, error } = await supabase
                .from('branch_inventory')
                .insert([{
                    branch_id: targetBranchId,
                    item_type,
                    item_name,
                    item_code: item_code || '',
                    quantity: Math.max(0, change),
                    unit: 'units',
                    updated_at: new Date().toISOString()
                }])
                .select()
                .single();
            if (error) throw error;
            updated = data;
        }

        res.json(updated);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 6. Inter-Branch Stock Transfers
exports.listStockTransfers = async (req, res) => {
    try {
        const isAdmin = isGlobalAdmin(req.user);
        const userBranchId = req.user?.branchId;

        let query = supabase
            .from('inter_branch_transfers')
            .select('*, from_branch:branches!from_branch_id(name, code), to_branch:branches!to_branch_id(name, code)');

        if (!isAdmin && userBranchId) {
            query = query.or(`from_branch_id.eq.${userBranchId},to_branch_id.eq.${userBranchId}`);
        }

        const { data, error } = await query.order('created_at', { ascending: false });
        if (error && error.code !== 'PGRST116') throw error;
        res.json(data || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.createStockTransfer = async (req, res) => {
    try {
        const { from_branch_id, to_branch_id, item_type, item_name, quantity, notes } = req.body;
        const isAdmin = isGlobalAdmin(req.user);
        const userBranchId = req.user?.branchId;

        const sourceBranchId = (!isAdmin && userBranchId) ? userBranchId : Number(from_branch_id);

        if (!sourceBranchId || !to_branch_id || !item_name || !quantity) {
            return res.status(400).json({ error: 'Source Branch, Destination Branch, Item, and Quantity are required.' });
        }

        const transfer_no = `TRF-${Date.now().toString().slice(-6)}`;

        const { data, error } = await supabase
            .from('inter_branch_transfers')
            .insert([{
                transfer_no,
                from_branch_id: sourceBranchId,
                to_branch_id: Number(to_branch_id),
                item_type: item_type || 'product',
                item_name,
                quantity: parseFloat(quantity),
                status: 'Dispatched',
                notes: notes || ''
            }])
            .select()
            .single();

        if (error) throw error;
        res.status(201).json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.updateTransferStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body; // 'Received' | 'Cancelled'

        const { data, error } = await supabase
            .from('inter_branch_transfers')
            .update({ status, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Legacy Stock Summary & Purchase Batch
exports.getBranchStockSummary = async (req, res) => {
    try {
        const { branchId } = req.params;
        const { data: movements } = await supabase.from('stock_movements').select('*').eq('branch_id', branchId);
        let totalInward = 0, totalOutward = 0;
        (movements || []).forEach(m => {
            const qty = parseFloat(m.quantity || 0);
            if (m.type === 'IN') totalInward += qty;
            else if (m.type === 'OUT') totalOutward += qty;
        });
        res.json({ branch_id: branchId, total_inward: totalInward, total_outward: totalOutward, closing_stock: totalInward - totalOutward });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.createPurchaseBatch = async (req, res) => {
    try {
        const { vendor_bill_no, lump_no, item_type, branch_id, quantity } = req.body;
        const batch_no = `${vendor_bill_no.trim().toUpperCase()}-${lump_no.trim().toUpperCase()}`;
        const { data, error } = await supabase
            .from('purchase_entry_batches')
            .insert([{ batch_no, vendor_bill_no, lump_no, item_type, branch_id: branch_id || null, quantity: parseFloat(quantity) }])
            .select().single();
        if (error) throw error;
        res.status(201).json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
