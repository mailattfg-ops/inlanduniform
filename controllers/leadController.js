const supabase = require('../config/supabase');
const crypto = require('crypto');

// Canonical CRM Lead Pipeline Stages (10 Stages)
const STAGES = {
    FEEDS: 'Feeds',
    OPEN_LEADS: 'Open Leads',
    NEW_LEADS: 'New Leads',
    SALES_LEADS: 'Sales Leads',
    FOLLOW_UPS: 'Follow-ups',
    MEETINGS: 'Meetings',
    HOT_LEADS: 'Hot Leads',
    QUOTATIONS: 'Quotations',
    DEALS: 'Deals',
    SO_CONVERTED: 'SO Converted Deals'
};

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

// Helper to generate next customer code (CN001, CN002, etc.)
async function generateNextCustomerCodeLocal() {
    try {
        const { data, error } = await supabase
            .from('organizations')
            .select('customer_code')
            .not('customer_code', 'is', null);

        let maxNum = 0;
        if (!error && data && data.length > 0) {
            data.forEach(item => {
                const c = item.customer_code;
                if (c && c.toUpperCase().startsWith('CN')) {
                    const numPart = c.substring(2);
                    const num = parseInt(numPart, 10);
                    if (!isNaN(num) && num > maxNum) {
                        maxNum = num;
                    }
                }
            });
        }

        let nextNum = maxNum + 1;
        let customerCode = `CN${String(nextNum).padStart(3, '0')}`;

        // Verify strictly unique
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

        return customerCode;
    } catch (err) {
        console.error('Exception in generateNextCustomerCodeLocal:', err.message);
        return 'CN001';
    }
}

// Derive authenticated staff member strictly from session (never client payload)
async function resolveStaffIdentity(req) {
    const userId = req.user?.id;
    const empRecordId = req.user?.employeeRecordId;
    const empCode = req.user?.employeeId;
    const email = req.user?.email;

    try {
        let query = supabase.from('employees').select('id, employee_id, full_name, designation, department');
        if (empRecordId) query = query.eq('id', empRecordId);
        else if (empCode) query = query.eq('employee_id', empCode);
        else if (email) query = query.eq('email', email);
        else if (userId && !String(userId).startsWith('branch_user_')) query = query.eq('user_id', userId);

        const { data: employee } = await query.maybeSingle();
        if (employee) {
            return {
                id: employee.id,
                employee_id: employee.employee_id,
                full_name: employee.full_name,
                designation: employee.designation || 'Staff',
                department: employee.department || 'Operations'
            };
        }
    } catch (err) {
        console.warn('[resolveStaffIdentity] Error:', err.message);
    }

    return {
        id: null,
        employee_id: req.user?.employeeId || 'STAFF',
        full_name: req.user?.fullName || req.user?.username || 'Staff Member',
        designation: req.user?.role || 'Staff',
        department: req.user?.department || 'Operations'
    };
}

// Normalize legacy status to canonical stages
function normalizeLeadStage(status, lead = {}) {
    if (!status) return STAGES.NEW_LEADS;
    const s = String(status).trim();
    if (s === 'New') {
        return lead.branch_id ? STAGES.NEW_LEADS : STAGES.OPEN_LEADS;
    }
    if (s === 'Contacted') return STAGES.FOLLOW_UPS;
    if (s === 'Qualified') return STAGES.HOT_LEADS;
    if (s === 'Proposal Sent') return STAGES.QUOTATIONS;
    if (s === 'Converted') return STAGES.SO_CONVERTED;
    if (s === 'Lost') return STAGES.FOLLOW_UPS; // with is_cold = true
    if (s === 'Cold Leads' || s === 'Cold') return STAGES.FOLLOW_UPS;
    return s;
}

// Record an activity in lead_activities with backward-compatible remarks synchronization
async function recordLeadActivity(leadId, {
    stage,
    activityType = 'contact_note',
    activity_type = null,
    notes = '',
    text = '',
    remarks = '',
    responseType = 'hold',
    response_type = null,
    outcome = null,
    metadata = {},
    staff = null,
    currentRemarks = []
}) {
    const finalActivityType = activityType || activity_type || 'contact_note';
    const finalNotes = (notes || text || remarks || '').toString().trim();
    const finalResponseType = responseType || response_type || 'hold';

    const now = new Date();
    const dateStr = now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

    const safeStaff = staff || {
        id: null,
        employee_id: 'STAFF',
        full_name: 'Staff Member',
        designation: 'Staff',
        department: 'Operations'
    };

    // 1. Relational Table Insertion
    try {
        const staffEmpId = (safeStaff.id && !isNaN(Number(safeStaff.id))) ? Number(safeStaff.id) : null;
        const { error: actErr } = await supabase.from('lead_activities').insert([{
            lead_id: leadId,
            stage,
            activity_type: finalActivityType,
            performed_by: staffEmpId,
            performed_by_name: safeStaff.full_name,
            performed_by_emp_id: safeStaff.employee_id,
            performed_by_designation: safeStaff.designation,
            performed_by_dept: safeStaff.department,
            notes: finalNotes,
            response_type: finalResponseType,
            outcome: outcome || finalResponseType,
            metadata: metadata || {}
        }]);

        if (actErr) {
            console.warn('[recordLeadActivity] lead_activities table write:', actErr.message);
            if (actErr.message && actErr.message.toLowerCase().includes('foreign key') && staffEmpId) {
                await supabase.from('lead_activities').insert([{
                    lead_id: leadId,
                    stage,
                    activity_type: finalActivityType,
                    performed_by: null,
                    performed_by_name: safeStaff.full_name,
                    performed_by_emp_id: safeStaff.employee_id,
                    performed_by_designation: safeStaff.designation,
                    performed_by_dept: safeStaff.department,
                    notes: finalNotes,
                    response_type: finalResponseType,
                    outcome: outcome || finalResponseType,
                    metadata: metadata || {}
                }]);
            }
        }
    } catch (actErr) {
        console.warn('[recordLeadActivity] lead_activities table write exception:', actErr.message);
    }

    // 2. Remarks JSONB Synchronization (Guarantees backward compatibility)
    const newEntry = {
        id: `act_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        stage,
        activity_type: finalActivityType,
        date: dateStr,
        time: timeStr,
        text: finalNotes,
        remarks: finalNotes,
        notes: finalNotes,
        response: finalResponseType,
        response_type: finalResponseType,
        outcome: outcome || finalResponseType,
        author: {
            name: safeStaff.full_name,
            employee_id: safeStaff.employee_id,
            designation: safeStaff.designation,
            department: safeStaff.department
        },
        metadata: metadata || {}
    };

    let updatedRemarks = Array.isArray(currentRemarks) ? [...currentRemarks] : [];
    updatedRemarks.push(newEntry);
    return updatedRemarks;
}

// Record stage entry and transition in lead_stage_history
async function recordStageTransition(leadId, stage, reason = '', staff = null) {
    try {
        // Exit any open previous stage
        await supabase
            .from('lead_stage_history')
            .update({ exited_at: new Date().toISOString() })
            .eq('lead_id', leadId)
            .is('exited_at', null);

        // Record new stage entry
        await supabase.from('lead_stage_history').insert([{
            lead_id: leadId,
            stage,
            entered_at: new Date().toISOString(),
            transition_reason: reason || `Transitioned to ${stage}`,
            performed_by: staff?.id || null
        }]);
    } catch (histErr) {
        console.warn('[recordStageTransition] lead_stage_history write:', histErr.message);
    }
}

// Reusable Organization Creator on Meeting / Conversion
async function ensureOrganizationForLead(lead, req, { createPortalCredentials = false } = {}) {
    if (lead.organization_id) {
        const { data: existingOrg } = await supabase
            .from('organizations')
            .select('*')
            .eq('id', lead.organization_id)
            .maybeSingle();
        if (existingOrg) {
            return { organization: existingOrg, credentials: null };
        }
    }

    const customerCode = await generateNextCustomerCodeLocal();
    const staff = await resolveStaffIdentity(req);
    const resolvedRmId = lead.assigned_staff_id || staff.id || null;
    const leadPhone = lead.contact_number || lead.phone || null;

    let userData = null;
    let credentials = null;

    if (createPortalCredentials) {
        const cleanLeadCode = (lead.lead_code || `id${lead.id}`).toLowerCase().replace(/[^a-z0-9]/g, '');
        const baseUsername = `cust_${cleanLeadCode || Math.random().toString(36).substring(7)}`;
        let username = baseUsername;
        let email = (lead.email && lead.email.trim()) ? lead.email.trim().toLowerCase() : null;
        const password = crypto.randomBytes(4).toString('hex').toUpperCase();

        // Resolve valid user_type_id
        let orgRoleId = null;
        const { data: roleRecords } = await supabase
            .from('user_types')
            .select('id, name')
            .or('name.ilike.%organis%,name.ilike.%customer%,name.ilike.%school%')
            .limit(1);

        if (roleRecords && roleRecords.length > 0) {
            orgRoleId = roleRecords[0].id;
        }

        const { data: newProfile, error: profileErr } = await supabase
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

        if (!profileErr && newProfile) {
            userData = newProfile;
            credentials = { username, email, password };
        }
    }

    const orgPayload = {
        name: lead.name,
        contact_title: lead.contact_title || 'Mr.',
        contact_person: lead.contact_person || null,
        contact_designation: lead.contact_designation || null,
        contact_email: (lead.email && lead.email.trim()) ? lead.email.trim().toLowerCase() : null,
        contact_number: leadPhone,
        address: lead.address || null,
        city: lead.city || null,
        state: lead.state || null,
        pincode: lead.pincode || null,
        country: lead.country || 'India',
        user_id: userData ? userData.id : null,
        industry_id: lead.industry_id || 1,
        customer_code: customerCode,
        relationship_manager_id: resolvedRmId,
        branch_id: lead.branch_id || null,
        origin: lead.origin || (lead.branch_id ? 'BRANCH' : 'HQ')
    };

    let { data: orgData, error: orgError } = await supabase
        .from('organizations')
        .insert([orgPayload])
        .select()
        .single();

    if (orgError && orgError.message) {
        // Safe retry without optional fields if schema differences exist
        const errLower = orgError.message.toLowerCase();
        if (errLower.includes('contact_number') && leadPhone) {
            delete orgPayload.contact_number;
            orgPayload.contact_phone = leadPhone;
        }
        ['contact_title', 'contact_designation', 'contact_person', 'contact_email', 'relationship_manager_id', 'branch_id', 'origin', 'city', 'state', 'pincode', 'country'].forEach(col => {
            if (errLower.includes(col)) {
                delete orgPayload[col];
            }
        });
        const retry = await supabase.from('organizations').insert([orgPayload]).select().single();
        orgData = retry.data;
        orgError = retry.error;
    }

    if (orgError) {
        if (userData) {
            await supabase.from('user_profiles').delete().eq('id', userData.id);
        }
        throw orgError;
    }

    // Link organization to lead
    await supabase.from('leads').update({ organization_id: orgData.id }).eq('id', lead.id);

    return { organization: orgData, credentials };
}

module.exports = {
    // 1. List Leads with Stage & Cold Normalization
    list: async (req, res) => {
        try {
            const isAdmin = isGlobalAdmin(req.user);
            const userBranchId = req.user?.branchId;

            let query = supabase
                .from('leads')
                .select(`
                    *,
                    industries ( id, name ),
                    employees ( id, full_name, employee_id, branch_id )
                `);

            if (!isAdmin && userBranchId) {
                query = query.eq('branch_id', userBranchId);
            }

            const { data, error } = await query.order('created_at', { ascending: false });

            if (error) {
                console.error('❌ Table "leads" query failed:', error.message);
                return res.status(500).json({ error: error.message, code: error.code });
            }

            const mapped = (data || []).map(l => {
                const normalizedStatus = normalizeLeadStage(l.status, l);
                return {
                    ...l,
                    status: normalizedStatus,
                    phone: l.contact_number || l.phone || null,
                    contact_number: l.contact_number || l.phone || null,
                    is_cold: Boolean(l.is_cold || l.status === 'Lost' || l.status === 'Cold Leads'),
                    area: l.area || null,
                    google_maps_link: l.google_maps_link || null,
                    origin: l.origin || (l.branch_id ? 'BRANCH' : 'HQ')
                };
            });

            res.json(mapped);
        } catch (err) {
            console.error('❌ Leads controller catch:', err.message);
            res.status(500).json({ error: err.message });
        }
    },

    // 2. Lead Details
    getDetails: async (req, res) => {
        const { id } = req.params;
        try {
            let { data, error } = await supabase
                .from('leads')
                .select(`
                    *,
                    industries ( id, name ),
                    employees ( id, full_name, employee_id, branch_id )
                `)
                .eq('id', id)
                .single();

            if (error) {
                const fallbackRes = await supabase.from('leads').select('*').eq('id', id).single();
                if (fallbackRes.error) throw fallbackRes.error;
                data = fallbackRes.data;
            }

            if (data) {
                data.phone = data.contact_number || data.phone || null;
                data.contact_number = data.contact_number || data.phone || null;
                data.status = normalizeLeadStage(data.status, data);
                data.is_cold = Boolean(data.is_cold || data.status === 'Lost' || data.status === 'Cold Leads');
            }

            res.json(data);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    },

    // 3. Create Lead (Full Lead Registration)
    create: async (req, res) => {
        const {
            name,
            phone,
            email,
            industry_id,
            address,
            city,
            state,
            pincode,
            country,
            assigned_staff_id,
            status,
            remarks,
            branch_id,
            contact_title,
            contact_person,
            contact_designation,
            source,
            requirements,
            area,
            google_maps_link,
            origin
        } = req.body;

        if (!name || name.trim() === '') {
            return res.status(400).json({ error: 'Lead name is required' });
        }
        if (!phone || String(phone).trim() === '') {
            return res.status(400).json({ error: 'Phone number is required' });
        }

        try {
            const isAdmin = isGlobalAdmin(req.user);
            const userBranchId = req.user?.branchId;
            const staff = await resolveStaffIdentity(req);

            // Determine if the creating user is a salesperson
            const isSalesperson = Boolean(
                staff?.id && (
                    String(staff.designation || '').toLowerCase().includes('sales') ||
                    String(req.user?.role || '').toLowerCase().includes('sales') ||
                    String(staff.department || '').toLowerCase().includes('sales')
                )
            );

            let targetBranchId = null;
            let resolvedStaffId = null;

            if (isSalesperson) {
                // 1. Salesperson: auto-assigned to salesperson's branch and self as rep
                targetBranchId = userBranchId || (staff ? staff.branch_id : null) || null;
                resolvedStaffId = staff.id;
            } else if (!isAdmin && userBranchId) {
                // 2. Branch staff: locked to branch, allow rep selection or unassigned
                targetBranchId = userBranchId;
                resolvedStaffId = assigned_staff_id ? parseInt(assigned_staff_id, 10) : null;
            } else {
                // 3. HQ staff: allow branch routing, no rep assigned at intake
                targetBranchId = branch_id ? parseInt(branch_id, 10) : null;
                resolvedStaffId = null;
            }

            const targetOrigin = (!isAdmin && userBranchId) ? 'BRANCH' : (targetBranchId ? 'BRANCH' : 'HQ');

            // Deterministic Initial Stage Categorization:
            // - If branch & sales rep assigned -> Sales Leads
            // - If branch assigned, no rep -> New Leads
            // - If no branch assigned -> Open Leads
            let determinedStatus = STAGES.OPEN_LEADS;
            if (targetBranchId && resolvedStaffId) {
                determinedStatus = STAGES.SALES_LEADS;
            } else if (targetBranchId) {
                determinedStatus = STAGES.NEW_LEADS;
            } else {
                determinedStatus = STAGES.OPEN_LEADS;
            }

            const cleanPhone = phone ? String(phone).trim() : null;
            const resolvedPincode = pincode ? String(pincode).trim() : null;
            const lead_code = await generateNextLeadCodeLocal();

            const insertPayload = {
                lead_code,
                name: name.trim(),
                contact_title: contact_title ? String(contact_title).trim() : 'Mr.',
                contact_person: contact_person ? String(contact_person).trim() : null,
                contact_designation: contact_designation ? String(contact_designation).trim() : null,
                source: source ? String(source).trim() : null,
                requirements: requirements ? String(requirements).trim() : null,
                contact_number: cleanPhone,
                phone: cleanPhone,
                email: email && email.trim() ? email.trim().toLowerCase() : null,
                industry_id: industry_id || null,
                address: address ? String(address).trim() : null,
                city: city ? String(city).trim() : null,
                state: state ? String(state).trim() : null,
                pincode: resolvedPincode,
                country: country ? String(country).trim() : 'India',
                assigned_staff_id: resolvedStaffId,
                branch_id: targetBranchId,
                status: determinedStatus,
                area: area ? String(area).trim() : null,
                google_maps_link: google_maps_link ? String(google_maps_link).trim() : null,
                origin: targetOrigin,
                is_cold: false,
                remarks: []
            };

            let currentInsert = { ...insertPayload };
            let insertResult = null;
            let insertError = null;

            for (let attempt = 0; attempt <= 12; attempt++) {
                const { data: resData, error: resErr } = await supabase
                    .from('leads')
                    .insert([currentInsert])
                    .select(`
                        *,
                        industries ( id, name ),
                        employees ( id, full_name, employee_id )
                    `)
                    .maybeSingle();

                if (!resErr) {
                    insertResult = resData;
                    insertError = null;
                    break;
                }

                insertError = resErr;
                const errMsg = resErr.message || '';
                const errLower = errMsg.toLowerCase();
                let pruned = false;

                const colMatch = errMsg.match(/could not find the '([^']+)' column/i);
                if (colMatch && colMatch[1] && currentInsert[colMatch[1]] !== undefined) {
                    delete currentInsert[colMatch[1]];
                    pruned = true;
                }

                ['phone', 'contact_number', 'area', 'google_maps_link', 'origin', 'is_cold', 'organization_id', 'contact_title', 'contact_designation', 'contact_person', 'city', 'state', 'pincode', 'country', 'branch_id'].forEach(col => {
                    if ((errLower.includes(`'${col.toLowerCase()}'`) || errLower.includes(`column '${col.toLowerCase()}'`)) && currentInsert[col] !== undefined) {
                        delete currentInsert[col];
                        pruned = true;
                    }
                });

                if (!pruned) break;
            }

            if (insertError) throw insertError;
            const data = insertResult;

            // Record initial stage history and creation activity
            let transitionNote = 'Lead registered (Open Leads)';
            if (determinedStatus === STAGES.SALES_LEADS) {
                transitionNote = `Lead registered by salesperson (${staff.full_name || 'Staff'}) -> Direct to Sales Leads queue`;
            } else if (determinedStatus === STAGES.NEW_LEADS) {
                transitionNote = 'Lead registered for branch -> Awaiting salesperson assignment';
            }
            await recordStageTransition(data.id, determinedStatus, transitionNote, staff);
            if (remarks && typeof remarks === 'string' && remarks.trim()) {
                await recordLeadActivity(data.id, {
                    stage: determinedStatus,
                    activityType: 'contact_note',
                    notes: remarks.trim(),
                    staff
                });
            }

            res.json(data);
        } catch (err) {
            console.error('[leadController.create] Exception:', err);
            res.status(500).json({ error: err.message });
        }
    },

    // 4. Create Field Agent Feed
    createFeed: async (req, res) => {
        const {
            name,
            contact_title,
            contact_person,
            contact_designation,
            contact_number,
            phone,
            address,
            area,
            google_maps_link,
            city,
            state,
            pincode,
            country,
            remarks,
            branch_id,
            origin
        } = req.body;

        const clientPhone = contact_number || phone;
        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Customer name is required' });
        }
        if (!clientPhone || !String(clientPhone).trim()) {
            return res.status(400).json({ error: 'Contact number is required' });
        }

        try {
            const isAdmin = isGlobalAdmin(req.user);
            const userBranchId = req.user?.branchId;
            const staff = await resolveStaffIdentity(req);

            const targetBranchId = (!isAdmin && userBranchId) ? userBranchId : (branch_id || userBranchId || null);
            const targetOrigin = (!isAdmin && userBranchId) ? 'BRANCH' : (origin || (targetBranchId ? 'BRANCH' : 'HQ'));
            const cleanPhone = String(clientPhone).trim();
            const resolvedPincode = pincode ? String(pincode).trim() : null;
            const lead_code = await generateNextLeadCodeLocal();

            const feedPayload = {
                lead_code,
                name: name.trim(),
                contact_title: contact_title ? String(contact_title).trim() : 'Mr.',
                contact_person: contact_person ? String(contact_person).trim() : null,
                contact_designation: contact_designation ? String(contact_designation).trim() : null,
                contact_number: cleanPhone,
                phone: cleanPhone,
                address: address ? String(address).trim() : null,
                area: area ? String(area).trim() : null,
                google_maps_link: google_maps_link ? String(google_maps_link).trim() : null,
                city: city ? String(city).trim() : null,
                state: state ? String(state).trim() : null,
                pincode: resolvedPincode,
                country: country ? String(country).trim() : 'India',
                branch_id: targetBranchId,
                origin: targetOrigin,
                status: STAGES.FEEDS,
                is_cold: false,
                remarks: []
            };

            let currentInsert = { ...feedPayload };
            let insertResult = null;
            let insertError = null;

            for (let attempt = 0; attempt <= 12; attempt++) {
                const { data: resData, error: resErr } = await supabase
                    .from('leads')
                    .insert([currentInsert])
                    .select('*')
                    .maybeSingle();

                if (!resErr) {
                    insertResult = resData;
                    insertError = null;
                    break;
                }

                insertError = resErr;
                const errMsg = resErr.message || '';
                const errLower = errMsg.toLowerCase();
                let pruned = false;

                const colMatch = errMsg.match(/could not find the '([^']+)' column/i);
                if (colMatch && colMatch[1] && currentInsert[colMatch[1]] !== undefined) {
                    delete currentInsert[colMatch[1]];
                    pruned = true;
                }

                ['phone', 'contact_number', 'area', 'google_maps_link', 'origin', 'is_cold', 'contact_title', 'contact_designation', 'contact_person', 'city', 'state', 'pincode', 'country', 'branch_id'].forEach(col => {
                    if ((errLower.includes(`'${col.toLowerCase()}'`) || errLower.includes(`column '${col.toLowerCase()}'`)) && currentInsert[col] !== undefined) {
                        delete currentInsert[col];
                        pruned = true;
                    }
                });

                if (!pruned) break;
            }

            if (insertError) throw insertError;
            const data = insertResult;

            // Log Feed Entry
            await recordStageTransition(data.id, STAGES.FEEDS, 'Raw feed collected by field agent', staff);
            if (remarks && String(remarks).trim()) {
                await recordLeadActivity(data.id, {
                    stage: STAGES.FEEDS,
                    activityType: 'feed_note',
                    notes: String(remarks).trim(),
                    staff
                });
            }

            res.json({
                success: true,
                message: 'Field feed logged successfully',
                feed: data
            });
        } catch (err) {
            console.error('[leadController.createFeed] Exception:', err);
            res.status(500).json({ error: err.message });
        }
    },

    // 5. Update Lead
    update: async (req, res) => {
        const { id } = req.params;
        const {
            name,
            phone,
            email,
            industry_id,
            address,
            city,
            state,
            pincode,
            country,
            assigned_staff_id,
            status,
            branch_id,
            contact_title,
            contact_person,
            contact_designation,
            source,
            requirements,
            area,
            google_maps_link,
            is_cold
        } = req.body;

        if (!name || name.trim() === '') {
            return res.status(400).json({ error: 'Lead name is required' });
        }

        try {
            const cleanPhone = phone ? String(phone).trim() : (req.body.contact_number ? String(req.body.contact_number).trim() : undefined);
            const resolvedPincode = pincode !== undefined ? (pincode ? String(pincode).trim() : null) : undefined;

            const updateFields = {
                name: name.trim(),
                industry_id: industry_id || null,
                address: address !== undefined ? (address ? String(address).trim() : null) : undefined,
                assigned_staff_id: assigned_staff_id || null,
                city: city !== undefined ? (city ? String(city).trim() : null) : undefined,
                state: state !== undefined ? (state ? String(state).trim() : null) : undefined,
                country: country !== undefined ? (country ? String(country).trim() : 'India') : undefined,
                updated_at: new Date()
            };

            if (cleanPhone !== undefined) {
                updateFields.contact_number = cleanPhone;
                updateFields.phone = cleanPhone;
            }
            if (resolvedPincode !== undefined) updateFields.pincode = resolvedPincode;
            if (email !== undefined) updateFields.email = email && email.trim() ? email.trim() : null;
            if (branch_id !== undefined) updateFields.branch_id = branch_id;
            if (contact_title !== undefined) updateFields.contact_title = contact_title ? String(contact_title).trim() : 'Mr.';
            if (contact_person !== undefined) updateFields.contact_person = contact_person ? String(contact_person).trim() : null;
            if (contact_designation !== undefined) updateFields.contact_designation = contact_designation ? String(contact_designation).trim() : null;
            if (source !== undefined) updateFields.source = source ? String(source).trim() : null;
            if (requirements !== undefined) updateFields.requirements = requirements ? String(requirements).trim() : null;
            if (area !== undefined) updateFields.area = area ? String(area).trim() : null;
            if (google_maps_link !== undefined) updateFields.google_maps_link = google_maps_link ? String(google_maps_link).trim() : null;
            if (is_cold !== undefined) updateFields.is_cold = Boolean(is_cold);

            if (status !== undefined) {
                updateFields.status = normalizeLeadStage(status, { branch_id: branch_id });
            }

            let currentUpdate = { ...updateFields };
            let updateResult = null;
            let updateError = null;

            for (let attempt = 0; attempt <= 12; attempt++) {
                const { data: resData, error: resErr } = await supabase
                    .from('leads')
                    .update(currentUpdate)
                    .eq('id', id)
                    .select(`
                        *,
                        industries ( id, name ),
                        employees ( id, full_name, employee_id )
                    `)
                    .maybeSingle();

                if (!resErr) {
                    updateResult = resData;
                    updateError = null;
                    break;
                }

                updateError = resErr;
                const errMsg = resErr.message || '';
                const errLower = errMsg.toLowerCase();
                let pruned = false;

                const colMatch = errMsg.match(/could not find the '([^']+)' column/i);
                if (colMatch && colMatch[1] && currentUpdate[colMatch[1]] !== undefined) {
                    delete currentUpdate[colMatch[1]];
                    pruned = true;
                }

                ['phone', 'contact_number', 'area', 'google_maps_link', 'origin', 'is_cold', 'organization_id', 'contact_title', 'contact_designation', 'contact_person', 'city', 'state', 'pincode', 'country', 'branch_id'].forEach(col => {
                    if ((errLower.includes(`'${col.toLowerCase()}'`) || errLower.includes(`column '${col.toLowerCase()}'`)) && currentUpdate[col] !== undefined) {
                        delete currentUpdate[col];
                        pruned = true;
                    }
                });

                if (!pruned) break;
            }

            if (updateError) throw updateError;
            res.json(updateResult);
        } catch (err) {
            console.error('[leadController.update] Exception:', err);
            res.status(500).json({ error: err.message });
        }
    },

    // 6. Delete Lead
    delete: async (req, res) => {
        const { id } = req.params;
        try {
            await supabase.from('lead_activities').delete().eq('lead_id', id).catch(() => {});
            await supabase.from('lead_stage_history').delete().eq('lead_id', id).catch(() => {});
            const { error } = await supabase.from('leads').delete().eq('id', id);
            if (error) throw error;
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    },

    // 7. Assign Branch (HQ: Open Leads -> New Leads)
    assignBranch: async (req, res) => {
        const { id } = req.params;
        const { branch_id } = req.body;

        if (!branch_id) {
            return res.status(400).json({ error: 'branch_id is required' });
        }

        try {
            const staff = await resolveStaffIdentity(req);
            const { data: lead, error: fetchErr } = await supabase.from('leads').select('*').eq('id', id).single();
            if (fetchErr || !lead) return res.status(404).json({ error: 'Lead not found' });

            // Next stage: New Leads
            const nextStage = STAGES.NEW_LEADS;
            const updatePayload = {
                branch_id: branch_id,
                status: nextStage,
                updated_at: new Date()
            };

            const updatedRemarks = await recordLeadActivity(id, {
                stage: nextStage,
                activityType: 'branch_assigned',
                notes: `Assigned to branch #${branch_id}`,
                staff,
                currentRemarks: lead.remarks
            });
            updatePayload.remarks = updatedRemarks;

            const { data: updatedLead, error: updateErr } = await supabase
                .from('leads')
                .update(updatePayload)
                .eq('id', id)
                .select('*, industries ( id, name ), employees ( id, full_name, employee_id )')
                .single();

            if (updateErr) throw updateErr;

            await recordStageTransition(id, nextStage, `Branch assigned by ${staff.full_name}`, staff);

            res.json({
                success: true,
                message: 'Branch assigned successfully; lead moved to New Leads',
                lead: updatedLead
            });
        } catch (err) {
            console.error('[leadController.assignBranch] Error:', err);
            res.status(500).json({ error: err.message });
        }
    },

    // 8. Assign Staff (Branch/HQ: New Leads -> Sales Leads)
    assignStaff: async (req, res) => {
        const { id } = req.params;
        const { assigned_staff_id } = req.body;

        if (!assigned_staff_id) {
            return res.status(400).json({ error: 'assigned_staff_id is required' });
        }

        try {
            const staff = await resolveStaffIdentity(req);
            const { data: lead, error: fetchErr } = await supabase.from('leads').select('*').eq('id', id).single();
            if (fetchErr || !lead) return res.status(404).json({ error: 'Lead not found' });

            const nextStage = STAGES.SALES_LEADS;
            const updatePayload = {
                assigned_staff_id: assigned_staff_id,
                status: nextStage,
                updated_at: new Date()
            };

            const updatedRemarks = await recordLeadActivity(id, {
                stage: nextStage,
                activityType: 'salesperson_assigned',
                notes: `Salesperson assigned (Staff ID #${assigned_staff_id})`,
                staff,
                currentRemarks: lead.remarks
            });
            updatePayload.remarks = updatedRemarks;

            const { data: updatedLead, error: updateErr } = await supabase
                .from('leads')
                .update(updatePayload)
                .eq('id', id)
                .select('*, industries ( id, name ), employees ( id, full_name, employee_id )')
                .single();

            if (updateErr) throw updateErr;

            await recordStageTransition(id, nextStage, `Sales staff assigned by ${staff.full_name}`, staff);

            res.json({
                success: true,
                message: 'Salesperson assigned; lead moved to Sales Leads',
                lead: updatedLead
            });
        } catch (err) {
            console.error('[leadController.assignStaff] Error:', err);
            res.status(500).json({ error: err.message });
        }
    },

    // 9. Universal Activity & Stage Outcome Logger
    logActivity: async (req, res) => {
        const { id } = req.params;
        const {
            stage,
            text,
            remarks,
            notes,
            remark,
            activity_type,
            activityType,
            response_type,
            responseType,
            outcome,
            metadata
        } = req.body;

        const logNotes = (text || remarks || notes || remark || '').toString().trim();

        if (!logNotes) {
            return res.status(400).json({ error: 'Log notes/remarks are required' });
        }

        try {
            const staff = await resolveStaffIdentity(req);
            const { data: lead, error: fetchErr } = await supabase.from('leads').select('*').eq('id', id).single();
            if (fetchErr || !lead) return res.status(404).json({ error: 'Lead not found' });

            const currentStatus = normalizeLeadStage(lead.status, lead);
            const targetStage = stage ? normalizeLeadStage(stage, lead) : currentStatus;
            const rawResponse = response_type || responseType || outcome || 'hold';
            const normResponse = String(rawResponse).toLowerCase();

            let nextStatus = currentStatus;
            let nextIsCold = lead.is_cold || false;
            let transitionReason = '';
            let orgResult = null;

            // --- STAGE-SPECIFIC PROGRESSION RULES ---

            // A. FEEDS STAGE
            if (targetStage === STAGES.FEEDS) {
                if (normResponse === 'positive') {
                    // Branch feed -> New Leads; HQ feed -> Open Leads
                    if (lead.branch_id || lead.origin === 'BRANCH') {
                        nextStatus = STAGES.NEW_LEADS;
                        transitionReason = 'Positive field feed response (Branch-created) -> New Leads';
                    } else {
                        nextStatus = STAGES.OPEN_LEADS;
                        transitionReason = 'Positive field feed response (HQ-created) -> Open Leads';
                    }
                } else {
                    nextStatus = STAGES.FEEDS;
                    transitionReason = 'Negative field feed response (remains in Feeds)';
                }
            }

            // B. FOLLOW-UPS STAGE
            else if (targetStage === STAGES.FOLLOW_UPS) {
                const isColdChoice = ['cold', 'cold_lead', 'cold lead', 'rejected', 'drop', 'dropped'].includes(normResponse) ||
                                     ['cold', 'cold_lead', 'cold lead', 'rejected', 'drop', 'dropped'].includes(String(outcome || '').toLowerCase());

                if (normResponse === 'positive') {
                    nextStatus = STAGES.MEETINGS;
                    nextIsCold = false;
                    transitionReason = 'Positive follow-up response -> Advancing to Meetings';
                } else if (isColdChoice) {
                    nextStatus = STAGES.FOLLOW_UPS;
                    nextIsCold = true;
                    transitionReason = 'Follow-up marked as Cold Lead (remains in Follow-ups with cold tag)';
                    await recordStageTransition(id, STAGES.COLD_LEADS, 'Marked cold during follow-up', staff);
                } else {
                    nextStatus = STAGES.FOLLOW_UPS;
                    nextIsCold = lead.is_cold || false;
                    transitionReason = 'Follow-up on hold/negative (remains in Follow-ups)';
                }
            }

            // C. MEETINGS STAGE (Creates Customer in organizations)
            else if (targetStage === STAGES.MEETINGS) {
                const isApproved = ['positive', 'approved', 'hot', 'hot_lead', 'hot lead'].includes(normResponse) ||
                                   ['positive', 'approved', 'hot', 'hot_lead', 'hot lead'].includes(String(outcome || '').toLowerCase());

                try {
                    orgResult = await ensureOrganizationForLead(lead, req, { createPortalCredentials: isApproved });
                } catch (orgErr) {
                    console.warn('[logActivity] ensureOrganizationForLead warning:', orgErr.message);
                }

                if (isApproved) {
                    nextStatus = STAGES.HOT_LEADS;
                    nextIsCold = false;
                    transitionReason = 'Meeting outcome approved -> Hot Lead';
                } else {
                    // Rejected: Route back to Follow-ups queue with is_cold = true
                    nextStatus = STAGES.FOLLOW_UPS;
                    nextIsCold = true;
                    transitionReason = 'Meeting rejected -> Lead marked Cold Lead and returned to Follow-ups queue';

                    // Audit transition to Follow-ups (Cold Lead tag)
                    await recordStageTransition(id, STAGES.FOLLOW_UPS, 'Meeting rejected by prospect (Marked Cold Lead under Follow-ups)', staff);
                }
            }

            // D. SALES LEADS -> Outbound contact initiated
            else if (targetStage === STAGES.SALES_LEADS && normResponse !== 'hold') {
                nextStatus = STAGES.FOLLOW_UPS;
                transitionReason = 'Outreach initiated -> Moved to Follow-ups';
            }

            // Record relational activity and sync remarks
            const resolvedActivityType = activity_type || activityType || `${targetStage.toLowerCase().replace(/[^a-z0-9]/g, '_')}_log`;
            const updatedRemarks = await recordLeadActivity(id, {
                stage: targetStage,
                activityType: resolvedActivityType,
                notes: logNotes,
                responseType: normResponse,
                response_type: normResponse,
                outcome: outcome || normResponse,
                metadata: metadata || {},
                staff,
                currentRemarks: lead.remarks
            });

            // Update lead record with safe fallback for optional columns
            let currentUpdate = {
                status: nextStatus,
                is_cold: nextIsCold,
                remarks: updatedRemarks,
                response: normResponse,
                response_type: normResponse,
                updated_at: new Date()
            };

            let updatedLead = null;
            let updateErr = null;

            for (let attempt = 0; attempt <= 4; attempt++) {
                const { data, error } = await supabase
                    .from('leads')
                    .update(currentUpdate)
                    .eq('id', id)
                    .select(`
                        *,
                        industries ( id, name ),
                        employees ( id, full_name, employee_id )
                    `)
                    .single();

                if (!error) {
                    updatedLead = data;
                    updateErr = null;
                    break;
                }

                updateErr = error;
                const errLower = (error.message || '').toLowerCase();
                let pruned = false;

                ['response_type', 'response', 'is_cold'].forEach(col => {
                    if (errLower.includes(col) && currentUpdate[col] !== undefined) {
                        delete currentUpdate[col];
                        pruned = true;
                    }
                });

                if (!pruned) break;
            }

            if (updateErr) throw updateErr;

            if (nextStatus !== currentStatus) {
                await recordStageTransition(id, nextStatus, transitionReason, staff);
            }

            res.json({
                success: true,
                message: transitionReason || 'Activity recorded successfully',
                status: nextStatus,
                is_cold: nextIsCold,
                lead: updatedLead,
                organization: orgResult?.organization || null,
                credentials: orgResult?.credentials || null
            });
        } catch (err) {
            console.error('[leadController.logActivity] Exception:', err);
            res.status(500).json({ error: err.message });
        }
    },

    // 10. Get Stage-Specific Activities (Historical isolation)
    getActivities: async (req, res) => {
        const { id } = req.params;
        const { stage } = req.query;

        try {
            let query = supabase
                .from('lead_activities')
                .select('*')
                .eq('lead_id', id);

            if (stage && stage !== 'ALL') {
                if (stage === 'Follow-ups' || stage === 'Cold Leads') {
                    query = query.or('stage.eq.Follow-ups,response_type.ilike.%cold%,outcome.ilike.%cold%');
                } else {
                    query = query.eq('stage', stage);
                }
            }

            const { data, error } = await query.order('created_at', { ascending: false });

            // If relational table query succeeds, return rows formatted
            if (!error && data && data.length > 0) {
                const formatted = data.map(act => ({
                    id: act.id,
                    lead_id: act.lead_id,
                    stage: act.stage,
                    activity_type: act.activity_type,
                    response_type: act.response_type,
                    response: act.response_type,
                    outcome: act.outcome || act.response_type,
                    remarks: act.notes,
                    notes: act.notes,
                    text: act.notes,
                    staff_name: act.performed_by_name || 'Staff Member',
                    staff_employee_id: act.performed_by_emp_id || 'STAFF',
                    staff_designation: act.performed_by_designation || 'Staff',
                    staff_department: act.performed_by_dept || 'Operations',
                    created_at: act.created_at
                }));
                return res.json({ success: true, activities: formatted });
            }

            // Fallback: parse remarks JSONB from lead
            const { data: lead } = await supabase.from('leads').select('remarks').eq('id', id).maybeSingle();
            let remarks = Array.isArray(lead?.remarks) ? lead.remarks : [];

            if (stage && stage !== 'ALL') {
                if (stage === 'Follow-ups' || stage === 'Cold Leads') {
                    remarks = remarks.filter(r => 
                        r.stage === STAGES.FOLLOW_UPS || 
                        !r.stage ||
                        String(r.response_type || '').toLowerCase().includes('cold') || 
                        String(r.outcome || '').toLowerCase().includes('cold') ||
                        String(r.stage || '').toLowerCase().includes('cold')
                    );
                } else {
                    remarks = remarks.filter(r => r.stage === stage);
                }
            }

            const formatted = remarks.map((r, i) => ({
                id: r.id || i,
                lead_id: id,
                stage: r.stage || (stage && stage !== 'ALL' ? stage : 'Follow-ups'),
                activity_type: r.activity_type || r.response_type || 'Note',
                response_type: r.response_type || r.response || r.outcome,
                response: r.response || r.response_type || r.outcome,
                outcome: r.outcome || r.response_type,
                remarks: r.text || r.remarks || r.notes || '',
                notes: r.text || r.remarks || r.notes || '',
                text: r.text || r.remarks || r.notes || '',
                staff_name: r.author?.name || 'Staff Member',
                staff_employee_id: r.author?.employee_id || 'STAFF',
                staff_designation: r.author?.designation || 'Staff',
                staff_department: r.author?.department || 'Operations',
                created_at: r.date ? `${r.date} ${r.time || ''}` : new Date().toISOString()
            })).reverse();

            res.json({ success: true, activities: formatted });
        } catch (err) {
            console.error('[leadController.getActivities] Error:', err);
            res.status(500).json({ error: err.message });
        }
    },

    // 11. Get Stage Transition History
    getStageHistory: async (req, res) => {
        const { id } = req.params;
        try {
            const { data, error } = await supabase
                .from('lead_stage_history')
                .select('*')
                .eq('lead_id', id)
                .order('entered_at', { ascending: true });

            if (!error && data) {
                return res.json(data);
            }

            res.json([]);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    },

    // 12. Explicit Customer Conversion & Portal Credentials Generation
    convertLeadToCustomer: async (req, res) => {
        const { id } = req.params;
        try {
            const { data: lead, error: fetchError } = await supabase.from('leads').select('*').eq('id', id).single();
            if (fetchError || !lead) return res.status(404).json({ error: 'Lead not found' });

            const staff = await resolveStaffIdentity(req);
            const { organization, credentials } = await ensureOrganizationForLead(lead, req, { createPortalCredentials: true });

            const nextStatus = STAGES.HOT_LEADS;
            await supabase.from('leads').update({ status: nextStatus, is_cold: false }).eq('id', id);
            await recordStageTransition(id, nextStatus, 'Explicit customer conversion', staff);

            res.json({
                success: true,
                message: 'Lead converted to customer and portal credentials generated',
                organization,
                credentials
            });
        } catch (err) {
            console.error('[convertLeadToCustomer] Exception:', err);
            res.status(500).json({ error: err.message });
        }
    },

    // 13. Backward-Compatible Add Remark (delegates to logActivity)
    addRemark: async (req, res) => {
        req.body.stage = req.body.stage || STAGES.FOLLOW_UPS;
        return module.exports.logActivity(req, res);
    },

    // 14. Backward-Compatible Contact Log (delegates to logActivity)
    logContactOutcome: async (req, res) => {
        req.body.stage = req.body.stage || STAGES.FOLLOW_UPS;
        return module.exports.logActivity(req, res);
    }
};
