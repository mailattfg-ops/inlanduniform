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

            if (error) {
                console.error('❌ [DATABASE ERROR] Table "leads" query failed:');
                console.error('  Code:', error.code, '| Message:', error.message);
                if (error.code === '42P01') {
                    console.error('  Hint: Table public.leads does not exist in database.');
                } else if (error.code === '42703') {
                    console.error('  Hint: A referenced column does not exist on leads or joined tables (industries, employees).');
                }
                return res.status(500).json({ error: error.message, code: error.code });
            }

            // Live data directly from database! If table is blank, return []
            res.json(data || []);
        } catch (err) {
            console.error('❌ [DATABASE ERROR] Leads controller catch:', err.message);
            res.status(500).json({ error: err.message });
        }
    },

    getDetails: async (req, res) => {
        const { id } = req.params;
        try {
            let { data, error } = await supabase
                .from('leads')
                .select(`
                    *,
                    industries ( id, name ),
                    employees ( id, full_name, employee_id )
                `)
                .eq('id', id)
                .single();

            if (error) {
                console.warn('Lead getDetails join query failed, falling back to plain select:', error.message);
                const fallbackRes = await supabase.from('leads').select('*').eq('id', id).single();
                if (fallbackRes.error) throw fallbackRes.error;
                data = fallbackRes.data;
            }
            res.json(data);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    },

    create: async (req, res) => {
        const { name, phone, email, industry_id, address, city, state, pincode, pin_code, country, assigned_staff_id, status, remarks, branch_id } = req.body;
        if (!name || name.trim() === '') {
            return res.status(400).json({ error: 'Lead name is required' });
        }
        if (!phone || String(phone).trim() === '') {
            return res.status(400).json({ error: 'Phone number is required' });
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

            // Automatically resolve assigned_staff_id from logged-in user if not explicitly provided
            let resolvedStaffId = assigned_staff_id || null;
            if (!resolvedStaffId && req.user?.id) {
                try {
                    let empQuery = supabase.from('employees').select('id');
                    if (req.user.employeeId) {
                        empQuery = empQuery.eq('employee_id', req.user.employeeId);
                    } else if (req.user.email) {
                        empQuery = empQuery.or(`user_id.eq.${req.user.id},email.eq.${req.user.email}`);
                    } else {
                        empQuery = empQuery.eq('user_id', req.user.id);
                    }
                    const { data: userEmp } = await empQuery.maybeSingle();
                    if (userEmp) {
                        resolvedStaffId = userEmp.id;
                    }
                } catch (empResErr) {
                    console.warn('[leadController.create] Could not auto-resolve employee ID:', empResErr.message);
                }
            }

            const resolvedPincode = (pincode !== undefined ? pincode : pin_code) ? String(pincode || pin_code).trim() : null;
            const lead_code = await generateNextLeadCodeLocal();
            const insertPayload = {
                lead_code,
                name: name.trim(),
                phone: String(phone).trim(),
                email: email && email.trim() ? email.trim().toLowerCase() : null,
                industry_id: industry_id || null,
                address: address ? String(address).trim() : null,
                city: city ? String(city).trim() : null,
                state: state ? String(state).trim() : null,
                pincode: resolvedPincode,
                pin_code: resolvedPincode,
                country: country ? String(country).trim() : 'India',
                assigned_staff_id: resolvedStaffId,
                branch_id: targetBranchId,
                status: status || 'New',
                remarks: remarksJson
            };

            let { data, error } = await supabase
                .from('leads')
                .insert([insertPayload])
                .select(`
                    *,
                    industries ( id, name ),
                    employees ( id, full_name, employee_id )
                `)
                .single();

            if (error && error.message) {
                let shouldRetry = false;
                const errLower = error.message.toLowerCase();
                ['email', 'city', 'state', 'pincode', 'pin_code', 'country'].forEach(col => {
                    if (errLower.includes(col)) {
                        delete insertPayload[col];
                        shouldRetry = true;
                    }
                });
                if (shouldRetry) {
                    const retry = await supabase
                        .from('leads')
                        .insert([insertPayload])
                        .select(`
                            *,
                            industries ( id, name ),
                            employees ( id, full_name, employee_id )
                        `)
                        .single();
                    data = retry.data;
                    error = retry.error;
                }
            }

            if (error) throw error;
            res.json(data);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    },

    update: async (req, res) => {
        const { id } = req.params;
        const { name, phone, email, industry_id, address, city, state, pincode, pin_code, country, assigned_staff_id, status, remarks, branch_id } = req.body;
        if (!name || name.trim() === '') {
            return res.status(400).json({ error: 'Lead name is required' });
        }
        try {
            const updateFields = {
                name,
                phone: phone || null,
                industry_id: industry_id || null,
                address: address !== undefined ? (address ? String(address).trim() : null) : undefined,
                assigned_staff_id: assigned_staff_id || null,
                status: status || 'New',
                updated_at: new Date()
            };

            if (city !== undefined) updateFields.city = city ? String(city).trim() : null;
            if (state !== undefined) updateFields.state = state ? String(state).trim() : null;
            if (pincode !== undefined || pin_code !== undefined) {
                const p = (pincode !== undefined ? pincode : pin_code) ? String(pincode || pin_code).trim() : null;
                updateFields.pincode = p;
                updateFields.pin_code = p;
            }
            if (country !== undefined) updateFields.country = country ? String(country).trim() : 'India';

            if (email !== undefined) {
                updateFields.email = email && email.trim() ? email.trim() : null;
            }

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

            let { data, error } = await supabase
                .from('leads')
                .update(updateFields)
                .eq('id', id)
                .select(`
                    *,
                    industries ( id, name ),
                    employees ( id, full_name, employee_id )
                `)
                .single();

            if (error && error.message) {
                let shouldRetry = false;
                const errLower = error.message.toLowerCase();
                ['email', 'city', 'state', 'pincode', 'pin_code', 'country'].forEach(col => {
                    if (errLower.includes(col)) {
                        delete updateFields[col];
                        shouldRetry = true;
                    }
                });
                if (shouldRetry) {
                    const retry = await supabase
                        .from('leads')
                        .update(updateFields)
                        .eq('id', id)
                        .select(`
                            *,
                            industries ( id, name ),
                            employees ( id, full_name, employee_id )
                        `)
                        .single();
                    data = retry.data;
                    error = retry.error;
                }
            }

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

            // 2. Generate Organization Admin credentials with uniqueness guarantee
            const cleanLeadCode = (lead.lead_code || `id${lead.id}`).toLowerCase().replace(/[^a-z0-9]/g, '');
            const baseUsername = `cust_${cleanLeadCode || Math.random().toString(36).substring(7)}`;
            let username = baseUsername;
            let email = (lead.email && lead.email.trim()) ? lead.email.trim().toLowerCase() : null;
            const password = crypto.randomBytes(4).toString('hex').toUpperCase();

            // Check if username/email already exists in user_profiles to avoid unique constraint violation
            let checkQuery = supabase.from('user_profiles').select('id');
            if (email) {
                checkQuery = checkQuery.or(`email.eq.${email},username.eq.${username}`);
            } else {
                checkQuery = checkQuery.eq('username', username);
            }
            let { data: existingUser } = await checkQuery.maybeSingle();

            if (existingUser) {
                // Check if this existing user is orphaned (not linked to any existing organization)
                const { data: linkedOrg } = await supabase
                    .from('organizations')
                    .select('id')
                    .eq('user_id', existingUser.id)
                    .maybeSingle();

                if (!linkedOrg) {
                    // Orphaned user profile from a previous failed lead conversion attempt - clean up
                    await supabase.from('user_profiles').delete().eq('id', existingUser.id);
                    existingUser = null;
                }
            }

            let userSuffix = 1;
            while (existingUser) {
                username = `${baseUsername}_${userSuffix}`;
                if (lead.email && lead.email.trim()) {
                    const parts = lead.email.trim().toLowerCase().split('@');
                    email = parts.length === 2 ? `${parts[0]}+${userSuffix}@${parts[1]}` : null;
                } else {
                    email = null;
                }
                let collisionQuery = supabase.from('user_profiles').select('id');
                if (email) {
                    collisionQuery = collisionQuery.or(`email.eq.${email},username.eq.${username}`);
                } else {
                    collisionQuery = collisionQuery.eq('username', username);
                }
                const { data: checkCollision } = await collisionQuery.maybeSingle();
                existingUser = checkCollision;
                userSuffix++;
            }

            // 3. Dynamically resolve valid user_type_id from user_types table to prevent foreign key violation
            let orgRoleId = null;
            const { data: roleRecords } = await supabase
                .from('user_types')
                .select('id, name')
                .or('name.ilike.%organis%,name.ilike.%customer%,name.ilike.%school%')
                .limit(1);

            if (roleRecords && roleRecords.length > 0) {
                orgRoleId = roleRecords[0].id;
            } else {
                const { data: anyRole } = await supabase
                    .from('user_types')
                    .select('id')
                    .limit(1);
                if (anyRole && anyRole.length > 0) {
                    orgRoleId = anyRole[0].id;
                } else {
                    const { data: newRole } = await supabase
                        .from('user_types')
                        .insert([{
                            name: 'Organisation',
                            permissions: ['view_schools', 'view_own_students', 'manage_classes', 'view_own_measurements']
                        }])
                        .select('id')
                        .single();
                    if (newRole) orgRoleId = newRole.id;
                }
            }

            const { data: userData, error: userError } = await supabase
                .from('user_profiles')
                .insert([{
                    full_name: lead.name,
                    username: username,
                    email: email || null,
                    password: password,
                    user_type_id: orgRoleId
                }])
                .select()
                .single();

            if (userError) {
                console.error('[convertLeadToCustomer] userError:', userError);
                throw userError;
            }

            // 4. Generate customer code with collision check
            let customerCode = 'CN001';
            const { data: customerCodes, error: codesError } = await supabase
                .from('organizations')
                .select('customer_code')
                .not('customer_code', 'is', null);

            let nextNum = 1;
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
                nextNum = maxNum + 1;
                customerCode = `CN${String(nextNum).padStart(3, '0')}`;
            }

            // Verify customer_code is strictly unique
            let { data: codeCollision } = await supabase
                .from('organizations')
                .select('id')
                .eq('customer_code', customerCode)
                .maybeSingle();

            while (codeCollision) {
                nextNum++;
                customerCode = `CN${String(nextNum).padStart(3, '0')}`;
                const { data: nextCodeCheck } = await supabase
                    .from('organizations')
                    .select('id')
                    .eq('customer_code', customerCode)
                    .maybeSingle();
                codeCollision = nextCodeCheck;
            }

            // 5. Create Organization / Customer
            const orgPayload = {
                name: lead.name,
                address: lead.address || null,
                city: lead.city || null,
                state: lead.state || null,
                pincode: lead.pincode || lead.pin_code || null,
                pin_code: lead.pincode || lead.pin_code || null,
                country: lead.country || 'India',
                phone: lead.phone || null,
                user_id: userData.id,
                industry_id: lead.industry_id || 1,
                customer_code: customerCode,
                relationship_manager_id: lead.assigned_staff_id || null
            };

            if (lead.branch_id) {
                orgPayload.branch_id = lead.branch_id;
            }

            let { data: orgData, error: orgError } = await supabase
                .from('organizations')
                .insert([orgPayload])
                .select()
                .single();

            // Graceful retry if optional columns are absent in local schema
            if (orgError && orgError.message) {
                let shouldRetry = false;
                ['relationship_manager_id', 'branch_id', 'phone', 'city', 'state', 'pincode', 'pin_code', 'country'].forEach(col => {
                    if (orgError.message.includes(col)) {
                        delete orgPayload[col];
                        shouldRetry = true;
                    }
                });
                if (shouldRetry) {
                    const retry = await supabase
                        .from('organizations')
                        .insert([orgPayload])
                        .select()
                        .single();
                    orgData = retry.data;
                    orgError = retry.error;
                }
            }

            if (orgError) {
                // Rollback user creation
                await supabase.from('user_profiles').delete().eq('id', userData.id);
                console.error('[convertLeadToCustomer] orgError:', orgError);
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
                    email,
                    password
                }
            });
        } catch (err) {
            console.error('[convertLeadToCustomer] Exception:', err);
            res.status(500).json({ error: err.message });
        }
    },

    addRemark: async (req, res) => {
        const { id } = req.params;
        const { text, response_type, author } = req.body;

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
                remarksList = [...lead.remarks];
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

            const authorName = author?.name || req.user?.fullName || req.user?.full_name || req.user?.username || 'Staff Member';
            const authorDesignation = author?.designation || req.user?.designation || req.user?.role || 'Staff';
            const authorDepartment = author?.department || req.user?.department || 'Operations';

            const remarkEntry = {
                date: dateStr,
                time: timeStr,
                text: text.trim(),
                author: {
                    name: authorName,
                    designation: authorDesignation,
                    department: authorDepartment
                }
            };

            if (response_type) {
                remarkEntry.response_type = response_type;
            }

            remarksList.push(remarkEntry);

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
    },

    logContactOutcome: async (req, res) => {
        const { id } = req.params;
        const { text, response_type, author } = req.body;

        if (!text || text.trim() === '') {
            return res.status(400).json({ error: 'Communication note text is required' });
        }

        const normalizedResponse = (response_type || 'hold').toLowerCase();
        if (normalizedResponse !== 'positive' && normalizedResponse !== 'hold') {
            return res.status(400).json({ error: 'response_type must be either "positive" or "hold"' });
        }

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

            // Resolve Author metadata
            const authorName = author?.name || req.user?.fullName || req.user?.full_name || req.user?.username || 'Staff Member';
            const authorDesignation = author?.designation || req.user?.designation || req.user?.role || 'Staff';
            const authorDepartment = author?.department || req.user?.department || 'Operations';

            const now = new Date();
            const dateStr = now.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
            const timeStr = now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

            let remarksList = [];
            if (Array.isArray(lead.remarks)) {
                remarksList = [...lead.remarks];
            } else if (typeof lead.remarks === 'string' && lead.remarks.trim() !== '') {
                remarksList = [{
                    date: 'Previous Entry',
                    time: '',
                    text: lead.remarks
                }];
            }

            // Case A: HOLD -> Status remains 'Contacted'
            if (normalizedResponse === 'hold') {
                const remarkEntry = {
                    date: dateStr,
                    time: timeStr,
                    text: text.trim(),
                    response_type: 'hold',
                    stage: 'Contacted',
                    author: {
                        name: authorName,
                        designation: authorDesignation,
                        department: authorDepartment
                    }
                };
                remarksList.push(remarkEntry);

                const { data: updatedLead, error: updateError } = await supabase
                    .from('leads')
                    .update({
                        status: 'Contacted',
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

                if (updateError) throw updateError;

                return res.json({
                    success: true,
                    status: 'Contacted',
                    lead: updatedLead,
                    message: 'Contact note recorded. Status maintained at Contacted (Hold).'
                });
            }

            // Case B: POSITIVE -> Status advances to 'Qualified' & Lead converts to Customer Organization
            // 2. Generate Organization Admin credentials with uniqueness guarantee
            const cleanLeadCode = (lead.lead_code || `id${lead.id}`).toLowerCase().replace(/[^a-z0-9]/g, '');
            const baseUsername = `cust_${cleanLeadCode || Math.random().toString(36).substring(7)}`;
            let username = baseUsername;
            let email = (lead.email && lead.email.trim()) ? lead.email.trim().toLowerCase() : null;
            const password = crypto.randomBytes(4).toString('hex').toUpperCase();

            // Check if username/email already exists in user_profiles to avoid collision
            let userCheckQuery = supabase.from('user_profiles').select('id');
            if (email) {
                userCheckQuery = userCheckQuery.or(`email.eq.${email},username.eq.${username}`);
            } else {
                userCheckQuery = userCheckQuery.eq('username', username);
            }
            let { data: existingUser } = await userCheckQuery.maybeSingle();

            if (existingUser) {
                const { data: linkedOrg } = await supabase
                    .from('organizations')
                    .select('id')
                    .eq('user_id', existingUser.id)
                    .maybeSingle();

                if (!linkedOrg) {
                    await supabase.from('user_profiles').delete().eq('id', existingUser.id);
                    existingUser = null;
                }
            }

            let userSuffix = 1;
            while (existingUser) {
                username = `${baseUsername}_${userSuffix}`;
                if (lead.email && lead.email.trim()) {
                    const parts = lead.email.trim().toLowerCase().split('@');
                    email = parts.length === 2 ? `${parts[0]}+${userSuffix}@${parts[1]}` : null;
                } else {
                    email = null;
                }
                let checkQuery = supabase.from('user_profiles').select('id');
                if (email) {
                    checkQuery = checkQuery.or(`email.eq.${email},username.eq.${username}`);
                } else {
                    checkQuery = checkQuery.eq('username', username);
                }
                const { data: checkCollision } = await checkQuery.maybeSingle();
                existingUser = checkCollision;
                userSuffix++;
            }

            // 3. Resolve user_type_id
            let orgRoleId = null;
            const { data: roleRecords } = await supabase
                .from('user_types')
                .select('id, name')
                .or('name.ilike.%organis%,name.ilike.%customer%,name.ilike.%school%')
                .limit(1);

            if (roleRecords && roleRecords.length > 0) {
                orgRoleId = roleRecords[0].id;
            } else {
                const { data: anyRole } = await supabase
                    .from('user_types')
                    .select('id')
                    .limit(1);
                if (anyRole && anyRole.length > 0) {
                    orgRoleId = anyRole[0].id;
                } else {
                    const { data: newRole } = await supabase
                        .from('user_types')
                        .insert([{
                            name: 'Organisation',
                            permissions: ['view_schools', 'view_own_students', 'manage_classes', 'view_own_measurements']
                        }])
                        .select('id')
                        .single();
                    if (newRole) orgRoleId = newRole.id;
                }
            }

            const { data: userData, error: userError } = await supabase
                .from('user_profiles')
                .insert([{
                    full_name: lead.name,
                    username: username,
                    email: email,
                    password: password,
                    user_type_id: orgRoleId
                }])
                .select()
                .single();

            if (userError) {
                console.error('[logContactOutcome] userError:', userError);
                throw userError;
            }

            // 4. Generate customer code with collision check
            let customerCode = 'CN001';
            const { data: customerCodes, error: codesError } = await supabase
                .from('organizations')
                .select('customer_code')
                .not('customer_code', 'is', null);

            let nextNum = 1;
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
                nextNum = maxNum + 1;
                customerCode = `CN${String(nextNum).padStart(3, '0')}`;
            }

            let { data: codeCollision } = await supabase
                .from('organizations')
                .select('id')
                .eq('customer_code', customerCode)
                .maybeSingle();

            while (codeCollision) {
                nextNum++;
                customerCode = `CN${String(nextNum).padStart(3, '0')}`;
                const { data: nextCodeCheck } = await supabase
                    .from('organizations')
                    .select('id')
                    .eq('customer_code', customerCode)
                    .maybeSingle();
                codeCollision = nextCodeCheck;
            }

            // 5. Create Organization / Customer
            const orgPayload = {
                name: lead.name,
                address: lead.address || null,
                city: lead.city || null,
                state: lead.state || null,
                pincode: lead.pincode || lead.pin_code || null,
                pin_code: lead.pincode || lead.pin_code || null,
                country: lead.country || 'India',
                phone: lead.phone || null,
                user_id: userData.id,
                industry_id: lead.industry_id || 1,
                customer_code: customerCode,
                relationship_manager_id: lead.assigned_staff_id || null
            };

            if (lead.branch_id) {
                orgPayload.branch_id = lead.branch_id;
            }

            let { data: orgData, error: orgError } = await supabase
                .from('organizations')
                .insert([orgPayload])
                .select()
                .single();

            if (orgError && orgError.message) {
                let shouldRetry = false;
                ['relationship_manager_id', 'branch_id', 'phone', 'city', 'state', 'pincode', 'pin_code', 'country'].forEach(col => {
                    if (orgError.message.includes(col)) {
                        delete orgPayload[col];
                        shouldRetry = true;
                    }
                });
                if (shouldRetry) {
                    const retry = await supabase
                        .from('organizations')
                        .insert([orgPayload])
                        .select()
                        .single();
                    orgData = retry.data;
                    orgError = retry.error;
                }
            }

            if (orgError) {
                await supabase.from('user_profiles').delete().eq('id', userData.id);
                throw orgError;
            }

            // Append remark with author, response, and converted organization
            const positiveRemark = {
                date: dateStr,
                time: timeStr,
                text: text.trim(),
                response_type: 'positive',
                stage: 'Qualified',
                author: {
                    name: authorName,
                    designation: authorDesignation,
                    department: authorDepartment
                },
                organization: {
                    id: orgData.id,
                    customer_code: customerCode,
                    name: orgData.name
                }
            };
            remarksList.push(positiveRemark);

            // 6. Update Lead status to 'Qualified'
            let updatePayload = {
                status: 'Qualified',
                organization_id: orgData.id,
                remarks: remarksList,
                updated_at: new Date()
            };

            let { data: updatedLead, error: leadUpdateError } = await supabase
                .from('leads')
                .update(updatePayload)
                .eq('id', id)
                .select(`
                    *,
                    industries ( id, name ),
                    employees ( id, full_name, employee_id )
                `)
                .single();

            if (leadUpdateError && leadUpdateError.message && leadUpdateError.message.includes('organization_id')) {
                delete updatePayload.organization_id;
                const retryUpdate = await supabase
                    .from('leads')
                    .update(updatePayload)
                    .eq('id', id)
                    .select(`
                        *,
                        industries ( id, name ),
                        employees ( id, full_name, employee_id )
                    `)
                    .single();
                updatedLead = retryUpdate.data;
                leadUpdateError = retryUpdate.error;
            }

            if (leadUpdateError) throw leadUpdateError;

            res.json({
                success: true,
                status: 'Qualified',
                lead: updatedLead,
                organization: orgData,
                credentials: {
                    username,
                    email,
                    password,
                    customerCode
                },
                message: 'Lead qualified and successfully converted to Customer Organization!'
            });

        } catch (err) {
            console.error('[logContactOutcome] Exception:', err);
            res.status(500).json({ error: err.message });
        }
    }
};
