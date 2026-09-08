const supabase = require('../config/supabase');
const crypto = require('crypto');

// Helper to check global admin
const isGlobalAdmin = (user) => {
    if (!user) return false;
    const role = user.role || '';
    return role === 'Admin' || role === 'Super Admin' || role === 'SuperAdmin';
};

// Helper to generate next lead code (LN001, LN002, etc.)
async function generateNextLeadCodeLocal() {
    try {
        const { data, error } = await supabase
            .from('leads')
            .select('lead_code')
            .not('lead_code', 'is', null);

        if (error) {
            console.error('Error fetching leads codes:', error.message);
            return 'LN001';
        }

        let maxNum = 0;
        if (data && data.length > 0) {
            data.forEach(item => {
                const c = item.lead_code;
                if (c && c.startsWith('LN')) {
                    const numPart = c.substring(2);
                    const num = parseInt(numPart, 10);
                    if (!isNaN(num) && num > maxNum) {
                        maxNum = num;
                    }
                }
            });
        }

        const nextNum = maxNum + 1;
        const padded = String(nextNum).padStart(3, '0');
        return `LN${padded}`;
    } catch (err) {
        console.error('Exception in generateNextLeadCodeLocal:', err.message);
        return 'LN001';
    }
}

module.exports = {
    list: async (req, res) => {
        try {
            const isAdmin = isGlobalAdmin(req.user);
            const userBranchId = req.user?.branchId;

            let query = supabase
                .from('leads')
                .select(`
                    *,
                    industries ( id, name ),
                    employees ( id, full_name, employee_id )
                `);

            // Non-admin branch accounts ONLY see leads strictly belonging to their branch
            if (!isAdmin && userBranchId) {
                query = query.eq('branch_id', userBranchId);
            }

            const { data, error } = await query.order('created_at', { ascending: false });

            if (error) throw error;
            res.json(data || []);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    },

    getDetails: async (req, res) => {
        const { id } = req.params;
        try {
            const { data, error } = await supabase
                .from('leads')
                .select(`
                    *,
                    industries ( id, name ),
                    employees ( id, full_name, employee_id )
                `)
                .eq('id', id)
                .single();

            if (error) throw error;
            res.json(data);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    },

    create: async (req, res) => {
        const { name, phone, industry_id, address, assigned_staff_id, status, remarks, branch_id } = req.body;
        if (!name || name.trim() === '') {
            return res.status(400).json({ error: 'Lead name is required' });
        }
        try {
            const isAdmin = isGlobalAdmin(req.user);
            const userBranchId = req.user?.branchId;

            // Automatically associate lead with the branch user's branch
            const targetBranchId = (!isAdmin && userBranchId) ? userBranchId : (branch_id || null);

            let remarksJson = [];
            if (remarks && typeof remarks === 'string' && remarks.trim() !== '') {
                const now = new Date();
                const dateStr = now.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
                const timeStr = now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
                remarksJson = [{
                    date: dateStr,
                    time: timeStr,
                    text: remarks.trim()
                }];
            } else if (Array.isArray(remarks)) {
                remarksJson = remarks;
            }

            const lead_code = await generateNextLeadCodeLocal();
            const { data, error } = await supabase
                .from('leads')
                .insert([{
                    lead_code,
                    name,
                    phone: phone || null,
                    industry_id: industry_id || null,
                    address: address || null,
                    assigned_staff_id: assigned_staff_id || null,
                    branch_id: targetBranchId,
                    status: status || 'New',
                    remarks: remarksJson
                }])
                .select(`
                    *,
                    industries ( id, name ),
                    employees ( id, full_name, employee_id )
                `)
                .single();

            if (error) throw error;
            res.json(data);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    },

    update: async (req, res) => {
        const { id } = req.params;
        const { name, phone, industry_id, address, assigned_staff_id, status, remarks, branch_id } = req.body;
        if (!name || name.trim() === '') {
            return res.status(400).json({ error: 'Lead name is required' });
        }
        try {
            const updateFields = {
                name,
                phone: phone || null,
                industry_id: industry_id || null,
                address: address || null,
                assigned_staff_id: assigned_staff_id || null,
                status: status || 'New',
                updated_at: new Date()
            };

            if (branch_id !== undefined) {
                updateFields.branch_id = branch_id;
            }

            if (remarks !== undefined) {
                if (remarks && typeof remarks === 'string' && remarks.trim() !== '') {
                    const now = new Date();
                    const dateStr = now.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
                    const timeStr = now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
                    updateFields.remarks = [{
                        date: dateStr,
                        time: timeStr,
                        text: remarks.trim()
                    }];
                } else {
                    updateFields.remarks = remarks;
                }
            }

            const { data, error } = await supabase
                .from('leads')
                .update(updateFields)
                .eq('id', id)
                .select(`
                    *,
                    industries ( id, name ),
                    employees ( id, full_name, employee_id )
                `)
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
                .from('leads')
                .delete()
                .eq('id', id);

            if (error) throw error;
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    },

    convertLeadToCustomer: async (req, res) => {
        const { id } = req.params;
        try {
            // 1. Fetch Lead
            const { data: lead, error: fetchError } = await supabase
                .from('leads')
                .select('*')
                .eq('id', id)
                .single();

            if (fetchError || !lead) {
                return res.status(404).json({ error: 'Lead not found' });
            }

            if (lead.status === 'Converted') {
                return res.status(400).json({ error: 'Lead is already converted to a customer' });
            }

            // 2. Generate Organization Admin credentials
            const username = `cust_${lead.lead_code.toLowerCase().replace(/[^a-z0-9]/g, '') || Math.random().toString(36).substring(7)}`;
            const password = crypto.randomBytes(4).toString('hex').toUpperCase();

            // 3. Create User Profile
            const ORG_ROLE_ID = '3e8ef077-f264-44b3-b37e-74e98fb6c0e7'; 
            const { data: userData, error: userError } = await supabase
                .from('user_profiles')
                .insert([{
                    full_name: lead.name,
                    username: username,
                    email: username,
                    password: password,
                    user_type_id: ORG_ROLE_ID
                }])
                .select()
                .single();

            if (userError) throw userError;

            // 4. Generate customer code
            let customerCode = 'CN001';
            const { data: customerCodes, error: codesError } = await supabase
                .from('organizations')
                .select('customer_code')
                .not('customer_code', 'is', null);

            if (!codesError && customerCodes && customerCodes.length > 0) {
                let maxNum = 0;
                customerCodes.forEach(item => {
                    const c = item.customer_code;
                    if (c && c.startsWith('CN')) {
                        const numPart = c.substring(2);
                        const num = parseInt(numPart, 10);
                        if (!isNaN(num) && num > maxNum) {
                            maxNum = num;
                        }
                    }
                });
                const nextNum = maxNum + 1;
                customerCode = `CN${String(nextNum).padStart(3, '0')}`;
            }

            // 5. Create Organization / Customer
            const { data: orgData, error: orgError } = await supabase
                .from('organizations')
                .insert([{
                    name: lead.name,
                    address: lead.address || null,
                    user_id: userData.id,
                    industry_id: lead.industry_id || 1,
                    customer_code: customerCode,
                    relationship_manager_id: null,
                    assigned_operator_id: lead.assigned_staff_id || null,
                    branch_id: lead.branch_id || null
                }])
                .select()
                .single();

            if (orgError) {
                // Rollback user creation
                await supabase.from('user_profiles').delete().eq('id', userData.id);
                throw orgError;
            }

            // 6. Update Lead status to Converted
            await supabase
                .from('leads')
                .update({ status: 'Converted', updated_at: new Date() })
                .eq('id', id);

            res.json({
                success: true,
                message: 'Lead successfully converted to customer',
                organization: orgData,
                credentials: {
                    username,
                    password
                }
            });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    },

    addRemark: async (req, res) => {
        const { id } = req.params;
        const { text } = req.body;

        if (!text || text.trim() === '') {
            return res.status(400).json({ error: 'Remark text is required' });
        }

        try {
            const { data: lead, error: fetchError } = await supabase
                .from('leads')
                .select('remarks')
                .eq('id', id)
                .single();

            if (fetchError || !lead) {
                return res.status(404).json({ error: 'Lead not found' });
            }

            let remarksList = [];
            if (Array.isArray(lead.remarks)) {
                remarksList = lead.remarks;
            } else if (typeof lead.remarks === 'string' && lead.remarks.trim() !== '') {
                remarksList = [{
                    date: 'Previous Entry',
                    time: '',
                    text: lead.remarks
                }];
            }

            const now = new Date();
            const dateStr = now.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
            const timeStr = now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

            remarksList.push({
                date: dateStr,
                time: timeStr,
                text: text.trim()
            });

            const { data, error } = await supabase
                .from('leads')
                .update({
                    remarks: remarksList,
                    updated_at: new Date()
                })
                .eq('id', id)
                .select(`
                    *,
                    industries ( id, name ),
                    employees ( id, full_name, employee_id )
                `)
                .single();

            if (error) throw error;
            res.json(data);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    }
};
