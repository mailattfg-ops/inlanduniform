const supabase = require('../config/supabase');
const crypto = require('crypto');
const { DORMANT_DAYS, daysSince, customerActivity, computeMonthGap, fetchAll, getLastInvoiceDates, getLastProformaDates } = require('../utils/customerActivity');
const { getOwnScope, canSeeLead, isOwnScopeUser } = require('../utils/ownScope');

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
    const role = (user.role || '').toLowerCase();
    const permissions = Array.isArray(user.permissions) ? user.permissions : [];
    return role === 'admin' || role === 'super admin' || role === 'superadmin' || role === 'corporate' || permissions.includes('all');
};

// Universal Permission Checker for CRM & Lead Pipeline Stages
const hasPermission = (user, requiredPerms) => {
    if (!user) return false;
    if (isGlobalAdmin(user)) return true;
    const userPerms = Array.isArray(user.permissions) ? user.permissions : [];
    if (userPerms.includes('all')) return true;
    const reqList = Array.isArray(requiredPerms) ? requiredPerms : [requiredPerms];
    return reqList.some(p => userPerms.includes(p));
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
        // employees has several FKs to branches (branch_id, temp_, deputed_): name the home-branch one
        let query = supabase.from('employees').select('id, employee_id, full_name, designation, department, branch_id, branches!employees_branch_id_fkey(id, name)');
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
                department: employee.department || 'Operations',
                branch_id: employee.branch_id || req.user?.branchId || null,
                branch_name: employee.branches?.name || req.user?.branchName || req.user?.branch || null
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
        department: req.user?.department || 'Operations',
        branch_id: req.user?.branchId || null,
        branch_name: req.user?.branchName || req.user?.branch || null
    };
}

// Normalize legacy status to canonical stages
function normalizeLeadStage(status, lead = {}) {
    if (!status) return STAGES.NEW_LEADS;
    const s = String(status).trim();
    if (s === 'Open Feeds') return STAGES.FEEDS;
    if (s === 'Contacted Leads' || s === 'Contacted Feeds') return 'Contacted Leads';
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

// Re-adds customers with no invoice for DORMANT_DAYS to Feeds, once per dormancy period.
// Skipped when the customer already has any lead created after its last invoice (auto or manual).
async function syncDormantCustomerFeeds({ dryRun = false } = {}) {
    const lastDates = await getLastInvoiceDates();
    const dormant = Object.entries(lastDates).filter(([, d]) => daysSince(d) >= DORMANT_DAYS);
    const summary = { dormant: dormant.length, toCreate: 0, created: 0, skipped: 0, failed: 0, names: [] };
    if (dormant.length === 0) return summary;

    const dormantIds = new Set(dormant.map(([id]) => Number(id)));
    const linkedLeads = await fetchAll(() => supabase
        .from('leads')
        .select('id, organization_id, created_at')
        .not('organization_id', 'is', null)
        .order('id', { ascending: true }));
    const alreadyFed = new Set(linkedLeads
        .filter(l => dormantIds.has(l.organization_id) && new Date(l.created_at) > new Date(lastDates[l.organization_id]))
        .map(l => l.organization_id));
    const toCreate = [...dormantIds].filter(id => !alreadyFed.has(id));
    summary.toCreate = toCreate.length;

    for (let i = 0; i < toCreate.length; i += 100) { // chunked to keep the .in() URL short
        const { data: orgs, error: orgErr } = await supabase.from('organizations').select('*').in('id', toCreate.slice(i, i + 100));
        if (orgErr) throw orgErr;

        for (const org of orgs || []) {
            summary.names.push(org.name);
            if (dryRun) continue;
            const phone = org.contact_number || org.contact_phone || org.phone || null;
            const { error } = await supabase.from('leads').insert([{
                lead_code: await generateNextLeadCodeLocal(),
                name: org.name,
                organization_id: org.id,
                is_returning_customer: true,
                dormant_since: lastDates[org.id],
                industry_id: org.industry_id || null,
                contact_title: org.contact_title || 'Mr.',
                contact_person: org.contact_person || null,
                contact_designation: org.contact_designation || null,
                contact_number: phone,
                phone,
                email: org.contact_email || org.email || null,
                address: org.address || null,
                city: org.city || null,
                state: org.state || null,
                pincode: org.pincode || null,
                country: org.country || 'India',
                branch_id: org.branch_id || null,
                zone_id: org.zone_id || null,
                origin: org.origin || (org.branch_id ? 'BRANCH' : 'HQ'),
                assigned_staff_id: org.relationship_manager_id || null,
                status: STAGES.FEEDS,
                is_cold: false,
                remarks: []
            }]);
            if (!error) summary.created++;
            else if (error.code === '23505') summary.skipped++; // unique index: already created by a parallel run
            else {
                summary.failed++;
                console.warn(`⚠️ Dormant feed for organization ${org.id} not created:`, error.message);
            }
        }
    }
    return summary;
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
        department: 'Operations',
        branch_name: null
    };

    const finalMetadata = {
        ...(metadata || {}),
        branch_name: safeStaff.branch_name || safeStaff.branch || (metadata && metadata.branch_name) || null
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
            metadata: finalMetadata
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
                    metadata: finalMetadata
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
            department: safeStaff.department,
            branch: safeStaff.branch_name || safeStaff.branch || (finalMetadata && finalMetadata.branch_name) || null
        },
        metadata: finalMetadata
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
        let username = customerCode.toUpperCase();
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
        alt_contact_title: lead.alt_contact_title || 'Mr.',
        alt_contact_person: lead.alt_contact_person || null,
        alt_contact_designation: lead.alt_contact_designation || null,
        alt_contact_number: lead.alt_contact_number || lead.alt_phone || null,
        alt_phone: lead.alt_contact_number || lead.alt_phone || null,
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
        ['contact_title', 'contact_designation', 'contact_person', 'contact_email', 'relationship_manager_id', 'branch_id', 'origin', 'city', 'state', 'pincode', 'country', 'alt_contact_title', 'alt_contact_person', 'alt_contact_designation', 'alt_contact_number', 'alt_phone'].forEach(col => {
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

    // Email the new portal login to the customer (never blocks the conversion)
    if (credentials) {
        if (credentials.email) {
            const { sendPortalCredentials } = require('../utils/mailer');
            const sent = await sendPortalCredentials({
                req, to: credentials.email, customerName: orgData.name,
                username: credentials.username, password: credentials.password
            });
            credentials.emailed = sent.ok;
            credentials.email_error = sent.ok ? null : sent.error;
            if (!sent.ok) console.warn(`[ensureOrganizationForLead] login email not sent to ${credentials.email}:`, sent.error);
        } else {
            credentials.emailed = false;
            credentials.email_error = 'No email address on the lead, so the login was not emailed.';
        }
    }

    return { organization: orgData, credentials };
}

module.exports = {
    // Daily Vercel cron: re-add dormant customers to Feeds. ?dry=1 only reports what would be created.
    runDormantCustomerCron: async (req, res) => {
        const secret = process.env.CRON_SECRET;
        if (!secret) return res.status(500).json({ error: 'CRON_SECRET is not configured' });
        if (req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ error: 'Unauthorized' });
        try {
            const summary = await syncDormantCustomerFeeds({ dryRun: req.query.dry === '1' });
            console.log('[dormant-customers]', JSON.stringify({ ...summary, names: summary.names.length }));
            res.json({ dryRun: req.query.dry === '1', ...summary });
        } catch (err) {
            console.error('❌ Dormant customer cron failed:', err.message);
            res.status(500).json({ error: err.message });
        }
    },

    // 1. List Leads with Stage & Cold Normalization
    list: async (req, res) => {
        try {
            const user = req.user;
            const staff = await resolveStaffIdentity(req);
            const userRole = (user?.role || '').toLowerCase();
            const staffDesig = (staff?.designation || '').toLowerCase();
            const staffDept = (staff?.department || '').toLowerCase();
            const userBranchId = user?.branchId || staff?.branch_id;

            // 1. Basic Read Permission Check
            const canViewAny = isGlobalAdmin(user) || hasPermission(user, [
                'view_all_leads',
                'view_leads',
                'manage_leads',
                'manage_schools',
                'view_schools',
                'branch_sales'
            ]);

            if (!canViewAny) {
                return res.status(403).json({ error: 'Access Denied: You do not have permission to view leads' });
            }

            const lastInvoiceDates = await getLastInvoiceDates().catch(err => {
                console.warn('⚠️ Last invoice lookup failed:', err.message);
                return {};
            });

            let selectFieldsWithZone = `
                *,
                industries ( id, name ),
                employees ( id, full_name, employee_id, branch_id ),
                zones ( id, name, code, branch_id ),
                organizations ( id, name, is_risk, is_special, client_tag )
            `;
            let selectFieldsFallback = `
                *,
                industries ( id, name ),
                employees ( id, full_name, employee_id, branch_id ),
                organizations ( id, name, is_risk, is_special, client_tag )
            `;

            let query = supabase
                .from('leads')
                .select(selectFieldsWithZone);

            // 2. Branch Isolation:
            // Only Global Admins or HQ users without branchId can view all leads across branches.
            // Branch Staff / Managers strictly see only leads, feeds, and deals belonging to their assigned branch.
            const isAdmin = isGlobalAdmin(user);
            const canViewAll = isAdmin || (!userBranchId && hasPermission(user, 'view_all_leads'));

            if (!canViewAll && userBranchId) {
                query = query.eq('branch_id', userBranchId);
            } else if (!canViewAll && staff?.id) {
                query = query.eq('assigned_staff_id', staff.id);
            }

            // Salespeople (Marketing / Sales Executive): only leads assigned to them
            const own = await getOwnScope(req);
            if (own && !own.empId) return res.json([]);
            if (own) query = query.eq('assigned_staff_id', own.empId);

            let { data, error } = await query.order('created_at', { ascending: false });

            if (error && (error.code === 'PGRST200' || error.message?.toLowerCase().includes('zone'))) {
                let fallbackQuery = supabase
                    .from('leads')
                    .select(selectFieldsFallback);

                if (!canViewAll && userBranchId) {
                    fallbackQuery = fallbackQuery.eq('branch_id', userBranchId);
                } else if (!canViewAll && staff?.id) {
                    fallbackQuery = fallbackQuery.eq('assigned_staff_id', staff.id);
                }
                if (own) fallbackQuery = fallbackQuery.eq('assigned_staff_id', own.empId);

                const fallbackRes = await fallbackQuery.order('created_at', { ascending: false });
                data = fallbackRes.data;
                error = fallbackRes.error;
            }

            if (error) {
                console.error('❌ Table "leads" query failed:', error.message);
                return res.status(500).json({ error: error.message, code: error.code });
            }

            // Fallback match organizations by name if organization_id is null
            const unlinkedLeads = (data || []).filter(l => !l.organizations && l.name);
            let orgsByName = {};
            if (unlinkedLeads.length > 0) {
                try {
                    const names = unlinkedLeads.map(l => l.name.trim()).filter(Boolean);
                    if (names.length > 0) {
                        const { data: matchedOrgs } = await supabase
                            .from('organizations')
                            .select('id, name, is_risk, is_special, client_tag')
                            .in('name', names);
                        if (matchedOrgs) {
                            matchedOrgs.forEach(o => {
                                orgsByName[o.name.toLowerCase().trim()] = o;
                            });
                        }
                    }
                } catch (_) {}
            }

            const mapped = (data || []).map(l => {
                const normalizedStatus = normalizeLeadStage(l.status, l);
                const matchedOrg = l.organizations || (l.name ? orgsByName[l.name.toLowerCase().trim()] : null);
                const altRemark = Array.isArray(l.remarks) ? l.remarks.find(r => r && r.type === 'alt_contact_profile') : null;
                const altPhone = l.alt_contact_number || l.alt_phone || altRemark?.alt_contact_number || altRemark?.alt_phone || null;
                const orgId = l.organization_id || matchedOrg?.id || null;
                const lastProforma = (orgId ? lastInvoiceDates[orgId] : null) || l.dormant_since || null;
                const gapInfo = computeMonthGap(lastProforma);
                return {
                    ...l,
                    organization_id: orgId,
                    last_proforma_date: lastProforma || null,
                    last_invoice_date: lastProforma || null,
                    customer_activity: customerActivity(lastProforma),
                    proforma_gap_months: gapInfo.months,
                    proforma_gap_label: gapInfo.label,
                    organizations: matchedOrg || null,
                    is_risk: Boolean(matchedOrg?.is_risk),
                    is_special: Boolean(matchedOrg?.is_special),
                    client_tag: matchedOrg?.client_tag || (matchedOrg?.is_special ? 'special' : matchedOrg?.is_risk ? 'risk' : 'standard'),
                    status: normalizedStatus,
                    phone: l.contact_number || l.phone || null,
                    contact_number: l.contact_number || l.phone || null,
                    alt_contact_title: l.alt_contact_title || altRemark?.alt_contact_title || (l.alt_contact_person || altRemark?.alt_contact_person ? 'Mr.' : null),
                    alt_contact_person: l.alt_contact_person || altRemark?.alt_contact_person || null,
                    alt_contact_designation: l.alt_contact_designation || altRemark?.alt_contact_designation || null,
                    alt_contact_number: altPhone,
                    alt_phone: altPhone,
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
                    employees ( id, full_name, employee_id, branch_id ),
                    zones ( id, name, code, branch_id )
                `)
                .eq('id', id)
                .single();

            if (error) {
                const fallbackRes = await supabase
                    .from('leads')
                    .select(`
                        *,
                        industries ( id, name ),
                        employees ( id, full_name, employee_id, branch_id )
                    `)
                    .eq('id', id)
                    .single();
                if (fallbackRes.error) {
                    const basicRes = await supabase.from('leads').select('*').eq('id', id).single();
                    if (basicRes.error) throw basicRes.error;
                    data = basicRes.data;
                } else {
                    data = fallbackRes.data;
                }
            }

            if (data && !(await canSeeLead(req, data))) {
                return res.status(403).json({ error: 'Access Denied: this lead is not assigned to you' });
            }

            if (data) {
                const altRemark = Array.isArray(data.remarks) ? data.remarks.find(r => r && r.type === 'alt_contact_profile') : null;
                const altPhone = data.alt_contact_number || data.alt_phone || altRemark?.alt_contact_number || altRemark?.alt_phone || null;
                data.phone = data.contact_number || data.phone || null;
                data.contact_number = data.contact_number || data.phone || null;
                data.alt_contact_title = data.alt_contact_title || altRemark?.alt_contact_title || (data.alt_contact_person || altRemark?.alt_contact_person ? 'Mr.' : null);
                data.alt_contact_person = data.alt_contact_person || altRemark?.alt_contact_person || null;
                data.alt_contact_designation = data.alt_contact_designation || altRemark?.alt_contact_designation || null;
                data.alt_contact_number = altPhone;
                data.alt_phone = altPhone;
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
            alt_contact_title,
            alt_contact_person,
            alt_contact_designation,
            alt_contact_number,
            alt_phone,
            source,
            requirements,
            area,
            google_maps_link,
            origin
        } = req.body;

        if (!name || name.trim() === '') {
            return res.status(400).json({ error: 'Customer name is required' });
        }
        if (!industry_id) {
            return res.status(400).json({ error: 'Industry sector is required' });
        }
        if (!phone || String(phone).trim() === '') {
            return res.status(400).json({ error: 'Phone number is required' });
        }
        if (!city || String(city).trim() === '') {
            return res.status(400).json({ error: 'City is required' });
        }
        if (!state || String(state).trim() === '') {
            return res.status(400).json({ error: 'State is required' });
        }

        try {
            if (!isGlobalAdmin(req.user) && !hasPermission(req.user, ['manage_leads', 'view_all_leads'])) {
                return res.status(403).json({ error: 'Access Denied: You do not have permission to register leads (requires manage_leads)' });
            }

            const isAdmin = isGlobalAdmin(req.user);
            const userBranchId = req.user?.branchId;
            const staff = await resolveStaffIdentity(req);

            // Determine if the creating user is a salesperson
            const isSalesperson = Boolean(
                staff?.id && (
                    isOwnScopeUser(req.user) ||
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
            const cleanAltPhone = (alt_contact_number || alt_phone) ? String(alt_contact_number || alt_phone).trim() : null;
            const resolvedPincode = pincode ? String(pincode).trim() : null;
            const lead_code = await generateNextLeadCodeLocal();

            const initialRemarks = [];
            if (alt_contact_person || cleanAltPhone) {
                initialRemarks.push({
                    type: 'alt_contact_profile',
                    alt_contact_title: alt_contact_title ? String(alt_contact_title).trim() : 'Mr.',
                    alt_contact_person: alt_contact_person ? String(alt_contact_person).trim() : null,
                    alt_contact_designation: alt_contact_designation ? String(alt_contact_designation).trim() : null,
                    alt_contact_number: cleanAltPhone,
                    alt_phone: cleanAltPhone
                });
            }

            const insertPayload = {
                lead_code,
                name: name.trim(),
                contact_title: contact_title ? String(contact_title).trim() : 'Mr.',
                contact_person: contact_person ? String(contact_person).trim() : null,
                contact_designation: contact_designation ? String(contact_designation).trim() : null,
                alt_contact_title: alt_contact_title ? String(alt_contact_title).trim() : (alt_contact_person ? 'Mr.' : null),
                alt_contact_person: alt_contact_person ? String(alt_contact_person).trim() : null,
                alt_contact_designation: alt_contact_designation ? String(alt_contact_designation).trim() : null,
                alt_contact_number: cleanAltPhone,
                alt_phone: cleanAltPhone,
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
                zone_id: req.body.zone_id ? parseInt(req.body.zone_id, 10) : null,
                status: determinedStatus,
                area: area ? String(area).trim() : null,
                google_maps_link: google_maps_link ? String(google_maps_link).trim() : null,
                origin: targetOrigin,
                is_cold: false,
                remarks: initialRemarks
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

                ['phone', 'contact_number', 'area', 'google_maps_link', 'origin', 'is_cold', 'organization_id', 'contact_title', 'contact_designation', 'contact_person', 'alt_contact_title', 'alt_contact_person', 'alt_contact_designation', 'alt_contact_number', 'alt_phone', 'city', 'state', 'pincode', 'country', 'branch_id', 'zone_id'].forEach(col => {
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
            alt_contact_title,
            alt_contact_person,
            alt_contact_designation,
            alt_contact_number,
            alt_phone,
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
            origin,
            industry_id,
            zone_id
        } = req.body;

        const clientPhone = contact_number || phone;
        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Customer name is required' });
        }
        if (!industry_id) {
            return res.status(400).json({ error: 'Industry sector is required' });
        }
        if (!city || !String(city).trim()) {
            return res.status(400).json({ error: 'City is required' });
        }
        if (!state || !String(state).trim()) {
            return res.status(400).json({ error: 'State is required' });
        }

        try {
            if (!isGlobalAdmin(req.user) && !hasPermission(req.user, ['manage_lead_stage_feeds', 'manage_leads'])) {
                return res.status(403).json({ error: 'Access Denied: You do not have permission to log field feeds (requires manage_lead_stage_feeds)' });
            }

            const isAdmin = isGlobalAdmin(req.user);
            const userBranchId = req.user?.branchId;
            const staff = await resolveStaffIdentity(req);

            const targetBranchId = (!isAdmin && userBranchId) ? userBranchId : (branch_id || userBranchId || null);
            const targetOrigin = (!isAdmin && userBranchId) ? 'BRANCH' : (origin || (targetBranchId ? 'BRANCH' : 'HQ'));
            const cleanPhone = clientPhone && String(clientPhone).trim() ? String(clientPhone).trim() : null;
            const cleanAltPhone = (alt_contact_number || alt_phone) ? String(alt_contact_number || alt_phone).trim() : null;
            const resolvedPincode = pincode ? String(pincode).trim() : null;
            const lead_code = await generateNextLeadCodeLocal();

            const initialFeedRemarks = [];
            if (alt_contact_person || cleanAltPhone) {
                initialFeedRemarks.push({
                    type: 'alt_contact_profile',
                    alt_contact_title: alt_contact_title ? String(alt_contact_title).trim() : 'Mr.',
                    alt_contact_person: alt_contact_person ? String(alt_contact_person).trim() : null,
                    alt_contact_designation: alt_contact_designation ? String(alt_contact_designation).trim() : null,
                    alt_contact_number: cleanAltPhone,
                    alt_phone: cleanAltPhone
                });
            }

            const feedPayload = {
                lead_code,
                name: name.trim(),
                industry_id: industry_id ? parseInt(industry_id, 10) : (req.body.industry_id ? parseInt(req.body.industry_id, 10) : null),
                contact_title: contact_title ? String(contact_title).trim() : 'Mr.',
                contact_person: contact_person ? String(contact_person).trim() : null,
                contact_designation: contact_designation ? String(contact_designation).trim() : null,
                alt_contact_title: alt_contact_title ? String(alt_contact_title).trim() : (alt_contact_person ? 'Mr.' : null),
                alt_contact_person: alt_contact_person ? String(alt_contact_person).trim() : null,
                alt_contact_designation: alt_contact_designation ? String(alt_contact_designation).trim() : null,
                alt_contact_number: cleanAltPhone,
                alt_phone: cleanAltPhone,
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
                zone_id: zone_id ? parseInt(zone_id, 10) : (req.body.zone_id ? parseInt(req.body.zone_id, 10) : null),
                origin: targetOrigin,
                status: STAGES.FEEDS,
                is_cold: false,
                remarks: initialFeedRemarks
            };
            // Salespeople on "own records only" see only leads assigned to them, so own the feed they log
            if (isOwnScopeUser(req.user) && staff?.id) feedPayload.assigned_staff_id = staff.id;

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

                ['phone', 'contact_number', 'area', 'google_maps_link', 'origin', 'is_cold', 'contact_title', 'contact_designation', 'contact_person', 'alt_contact_title', 'alt_contact_person', 'alt_contact_designation', 'alt_contact_number', 'alt_phone', 'city', 'state', 'pincode', 'country', 'branch_id', 'zone_id', 'industry_id'].forEach(col => {
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
                    activityType: 'initial_feed_note',
                    responseType: 'intake',
                    notes: String(remarks).trim(),
                    staff
                });
            }

            res.json({
                success: true,
                message: 'Field feed logged successfully',
                feed: data,
                lead: data
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
            alt_contact_title,
            alt_contact_person,
            alt_contact_designation,
            alt_contact_number,
            alt_phone,
            source,
            requirements,
            area,
            google_maps_link,
            is_cold
        } = req.body;

        if (!name || name.trim() === '') {
            return res.status(400).json({ error: 'Customer name is required' });
        }
        if (industry_id !== undefined && !industry_id && !req.body.industry_id) {
            return res.status(400).json({ error: 'Industry sector is required' });
        }
        if (city !== undefined && (!city || String(city).trim() === '')) {
            return res.status(400).json({ error: 'City is required' });
        }
        if (state !== undefined && (!state || String(state).trim() === '')) {
            return res.status(400).json({ error: 'State is required' });
        }
        if (phone !== undefined && req.body.status !== 'Feeds' && (!phone || String(phone).trim() === '')) {
            return res.status(400).json({ error: 'Phone number is required' });
        }

        try {
            if (!isGlobalAdmin(req.user) && !hasPermission(req.user, ['manage_leads', 'view_all_leads', 'manage_lead_stage_feeds'])) {
                return res.status(403).json({ error: 'Access Denied: You do not have permission to edit lead records (requires manage_leads or manage_lead_stage_feeds)' });
            }

            const cleanPhone = phone ? String(phone).trim() : (req.body.contact_number ? String(req.body.contact_number).trim() : undefined);
            const rawAltPhone = alt_contact_number !== undefined ? alt_contact_number : (alt_phone !== undefined ? alt_phone : (req.body.alt_contact_number || req.body.alt_phone));
            const cleanAltPhone = rawAltPhone !== undefined ? (rawAltPhone ? String(rawAltPhone).trim() : null) : undefined;
            const resolvedPincode = pincode !== undefined ? (pincode ? String(pincode).trim() : null) : undefined;

            const updateFields = {
                name: name.trim(),
                industry_id: req.body.industry_id !== undefined ? (req.body.industry_id ? parseInt(req.body.industry_id, 10) : null) : (industry_id ? parseInt(industry_id, 10) : null),
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
            if (cleanAltPhone !== undefined) {
                updateFields.alt_contact_number = cleanAltPhone;
                updateFields.alt_phone = cleanAltPhone;
            }
            if (alt_contact_title !== undefined) updateFields.alt_contact_title = alt_contact_title ? String(alt_contact_title).trim() : 'Mr.';
            if (alt_contact_person !== undefined) updateFields.alt_contact_person = alt_contact_person ? String(alt_contact_person).trim() : null;
            if (alt_contact_designation !== undefined) updateFields.alt_contact_designation = alt_contact_designation ? String(alt_contact_designation).trim() : null;
            if (resolvedPincode !== undefined) updateFields.pincode = resolvedPincode;
            if (email !== undefined) updateFields.email = email && email.trim() ? email.trim() : null;
            if (branch_id !== undefined) updateFields.branch_id = branch_id;
            if (req.body.origin !== undefined) updateFields.origin = req.body.origin;
            if (req.body.zone_id !== undefined) updateFields.zone_id = req.body.zone_id ? parseInt(req.body.zone_id, 10) : null;
            if (contact_title !== undefined) updateFields.contact_title = contact_title ? String(contact_title).trim() : 'Mr.';
            if (contact_person !== undefined) updateFields.contact_person = contact_person ? String(contact_person).trim() : null;
            if (contact_designation !== undefined) updateFields.contact_designation = contact_designation ? String(contact_designation).trim() : null;
            if (source !== undefined) updateFields.source = source ? String(source).trim() : null;
            // Once a requirement is saved, it shouldn't be editable.
            if (requirements !== undefined) {
                const { data: currentLead } = await supabase.from('leads').select('requirements').eq('id', id).maybeSingle();
                if (currentLead && currentLead.requirements && currentLead.requirements.trim()) {
                    // Already saved; cannot be overwritten or edited
                } else {
                    updateFields.requirements = requirements ? String(requirements).trim() : null;
                }
            }
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

                ['phone', 'contact_number', 'area', 'google_maps_link', 'origin', 'is_cold', 'organization_id', 'contact_title', 'contact_designation', 'contact_person', 'alt_contact_title', 'alt_contact_person', 'alt_contact_designation', 'alt_contact_number', 'alt_phone', 'city', 'state', 'pincode', 'country', 'branch_id', 'zone_id', 'industry_id'].forEach(col => {
                    if ((errLower.includes(`'${col.toLowerCase()}'`) || errLower.includes(`column '${col.toLowerCase()}'`)) && currentUpdate[col] !== undefined) {
                        delete currentUpdate[col];
                        pruned = true;
                    }
                });

                if (!pruned) break;
            }

            if (updateError) throw updateError;

            // Maintain fallback in remarks JSONB for resilience
            if (alt_contact_person !== undefined || cleanAltPhone !== undefined || alt_contact_designation !== undefined) {
                try {
                    const { data: leadRec } = await supabase.from('leads').select('remarks').eq('id', id).maybeSingle();
                    let existingRemarks = Array.isArray(leadRec?.remarks) ? [...leadRec.remarks] : [];
                    const filteredRemarks = existingRemarks.filter(r => !r || r.type !== 'alt_contact_profile');
                    if (alt_contact_person || cleanAltPhone) {
                        filteredRemarks.push({
                            type: 'alt_contact_profile',
                            alt_contact_title: alt_contact_title ? String(alt_contact_title).trim() : 'Mr.',
                            alt_contact_person: alt_contact_person ? String(alt_contact_person).trim() : null,
                            alt_contact_designation: alt_contact_designation ? String(alt_contact_designation).trim() : null,
                            alt_contact_number: cleanAltPhone || null,
                            alt_phone: cleanAltPhone || null
                        });
                    }
                    await supabase.from('leads').update({ remarks: filteredRemarks }).eq('id', id);
                } catch (_) {}
            }

            // Synchronize linked organization if this lead is converted/linked to one
            try {
                const { data: leadRow } = await supabase.from('leads').select('organization_id').eq('id', id).maybeSingle();
                if (leadRow?.organization_id) {
                    const orgSync = {};
                    if (name !== undefined) orgSync.name = name.trim();
                    if (contact_title !== undefined) orgSync.contact_title = contact_title ? String(contact_title).trim() : 'Mr.';
                    if (contact_person !== undefined) orgSync.contact_person = contact_person ? String(contact_person).trim() : null;
                    if (contact_designation !== undefined) orgSync.contact_designation = contact_designation ? String(contact_designation).trim() : null;
                    if (alt_contact_title !== undefined) orgSync.alt_contact_title = alt_contact_title ? String(alt_contact_title).trim() : 'Mr.';
                    if (alt_contact_person !== undefined) orgSync.alt_contact_person = alt_contact_person ? String(alt_contact_person).trim() : null;
                    if (alt_contact_designation !== undefined) orgSync.alt_contact_designation = alt_contact_designation ? String(alt_contact_designation).trim() : null;
                    if (cleanAltPhone !== undefined) {
                        orgSync.alt_contact_number = cleanAltPhone;
                        orgSync.alt_phone = cleanAltPhone;
                    }
                    if (cleanPhone !== undefined) {
                        orgSync.contact_number = cleanPhone;
                        orgSync.phone = cleanPhone;
                    }
                    if (email !== undefined) orgSync.contact_email = email && email.trim() ? email.trim() : null;
                    if (address !== undefined) orgSync.address = address ? String(address).trim() : null;
                    if (city !== undefined) orgSync.city = city ? String(city).trim() : null;
                    if (state !== undefined) orgSync.state = state ? String(state).trim() : null;
                    if (resolvedPincode !== undefined) orgSync.pincode = resolvedPincode;
                    if (country !== undefined) orgSync.country = country ? String(country).trim() : 'India';
                    if (industry_id !== undefined) orgSync.industry_id = req.body.industry_id !== undefined ? (req.body.industry_id ? parseInt(req.body.industry_id, 10) : null) : (industry_id ? parseInt(industry_id, 10) : null);
                    if (branch_id !== undefined) orgSync.branch_id = branch_id;
                    if (req.body.zone_id !== undefined) orgSync.zone_id = req.body.zone_id ? parseInt(req.body.zone_id, 10) : null;

                    if (Object.keys(orgSync).length > 0) {
                        await supabase.from('organizations').update(orgSync).eq('id', leadRow.organization_id);
                    }
                }
            } catch (orgSyncErr) {
                console.warn('[leadController.update] Org sync notice:', orgSyncErr.message);
            }

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
            if (!isGlobalAdmin(req.user) && !hasPermission(req.user, ['manage_leads', 'manage_system'])) {
                return res.status(403).json({ error: 'Access Denied: You do not have permission to delete leads (requires manage_leads)' });
            }

            await supabase.from('lead_activities').delete().eq('lead_id', id).then(() => {}, () => {});
            await supabase.from('lead_stage_history').delete().eq('lead_id', id).then(() => {}, () => {});
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
            if (!isGlobalAdmin(req.user) && !hasPermission(req.user, ['manage_lead_stage_assign_branch', 'manage_leads'])) {
                return res.status(403).json({ error: 'Access Denied: You do not have permission to assign branches to leads (requires manage_lead_stage_assign_branch)' });
            }

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
            if (!isGlobalAdmin(req.user) && !hasPermission(req.user, ['manage_lead_stage_assign_staff', 'manage_leads'])) {
                return res.status(403).json({ error: 'Access Denied: You do not have permission to assign sales executives to leads (requires manage_lead_stage_assign_staff)' });
            }

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

            // Stage-Specific Permission Control (Configured from User Roles & Permissions)
            if (!isGlobalAdmin(req.user) && !hasPermission(req.user, 'manage_leads')) {
                if (targetStage === STAGES.FEEDS && !hasPermission(req.user, 'manage_lead_stage_feeds')) {
                    return res.status(403).json({ error: 'Access Denied: You do not have permission to process field feeds (requires manage_lead_stage_feeds)' });
                }
                if (targetStage === STAGES.SALES_LEADS && !hasPermission(req.user, 'manage_lead_stage_sales_contact')) {
                    return res.status(403).json({ error: 'Access Denied: You do not have permission to initiate sales outreach (requires manage_lead_stage_sales_contact)' });
                }
                if (targetStage === STAGES.FOLLOW_UPS && !hasPermission(req.user, 'manage_lead_stage_followups')) {
                    return res.status(403).json({ error: 'Access Denied: You do not have permission to log follow-up notes (requires manage_lead_stage_followups)' });
                }
                if (targetStage === STAGES.MEETINGS && !hasPermission(req.user, 'manage_lead_stage_meetings')) {
                    return res.status(403).json({ error: 'Access Denied: You do not have permission to record meeting outcomes (requires manage_lead_stage_meetings)' });
                }
                if (targetStage === STAGES.HOT_LEADS && !hasPermission(req.user, ['manage_lead_stage_hot_leads', 'manage_lead_stage_meetings'])) {
                    return res.status(403).json({ error: 'Access Denied: You do not have permission to qualify hot leads (requires manage_lead_stage_hot_leads)' });
                }
            }

            let nextStatus = currentStatus;
            let nextIsCold = lead.is_cold || false;
            let transitionReason = '';
            let orgResult = null;

            // --- STAGE-SPECIFIC PROGRESSION RULES ---

            // A. FEEDS STAGE
            if (targetStage === STAGES.FEEDS || targetStage === 'Contacted Leads' || targetStage === 'Open Feeds') {
                if (normResponse === 'positive') {
                    nextIsCold = false; // clears cold flags
                    // Returning customer (already has branch from organization): directly goes to New Leads
                    if (lead.is_returning_customer || lead.branch_id || lead.origin === 'BRANCH') {
                        nextStatus = STAGES.NEW_LEADS;
                        transitionReason = lead.is_returning_customer
                            ? 'Positive response: Returning customer converted -> New Leads (pending sales person assignment)'
                            : 'Positive field feed response (Branch-created) -> New Leads';
                    } else {
                        nextStatus = STAGES.OPEN_LEADS;
                        transitionReason = 'Positive field feed response (HQ-created) -> Open Leads';
                    }
                } else if (normResponse === 'negative' || normResponse === 'not_interested' || normResponse === 'rejected') {
                    nextStatus = 'Contacted Leads';
                    nextIsCold = true; // Cold Feed badge near sector
                    transitionReason = 'Negative field feed response (Prospect declined / Cold Feed)';
                } else {
                    nextStatus = 'Contacted Leads';
                    nextIsCold = false;
                    transitionReason = 'Feed follow-up response recorded -> Contacted Leads (Hold / Pending)';
                }
            }

            // B. FOLLOW-UPS STAGE
            else if (targetStage === STAGES.FOLLOW_UPS) {
                if (normResponse === 'positive') {
                    nextStatus = STAGES.MEETINGS;
                    nextIsCold = false;
                    transitionReason = 'Positive follow-up response -> Advancing to Meetings';
                } else if (normResponse === 'negative' || normResponse === 'cold_lead' || normResponse === 'rejected') {
                    nextStatus = STAGES.FOLLOW_UPS;
                    nextIsCold = true; // Cold Lead in Follow-ups
                    transitionReason = 'Negative follow-up response (Prospect declined / Cold Lead)';
                } else {
                    // Hold: keeps any existing cold tag
                    nextStatus = STAGES.FOLLOW_UPS;
                    nextIsCold = lead.is_cold || false;
                    transitionReason = 'Follow-up on hold/pending (remains in Follow-ups)';
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
            if (await getOwnScope(req)) {
                const { data: leadRow } = await supabase.from('leads').select('id, assigned_staff_id').eq('id', id).maybeSingle();
                if (leadRow && !(await canSeeLead(req, leadRow))) {
                    return res.status(403).json({ error: 'Access Denied: this lead is not assigned to you' });
                }
            }

            let query = supabase
                .from('lead_activities')
                .select('*')
                .eq('lead_id', id);

            if (stage && stage !== 'ALL') {
                if (stage === 'Follow-ups' || stage === 'Cold Leads') {
                    query = query.or('stage.eq.Follow-ups,response_type.ilike.%cold%,outcome.ilike.%cold%');
                } else if (stage === 'Feeds' || stage === 'Open Feeds' || stage === 'Contacted Leads') {
                    query = query.or('stage.eq.Feeds,stage.eq.Open Feeds,stage.eq.Contacted Leads');
                } else if (stage === 'Leads') {
                    query = query.in('stage', ['Leads', 'Open Leads', 'New Leads', 'Sales Leads', 'Follow-ups', 'Meetings', 'Hot Leads']);
                } else if (stage === 'SO Converted' || stage === 'SO Converted Deals') {
                    query = query.or('stage.eq.SO Converted Deals,stage.eq.SO Converted');
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
                    staff_branch: act.metadata?.branch_name || act.metadata?.branch || null,
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
                        String(r.response_type || '').toLowerCase().includes('negative') || 
                        String(r.outcome || '').toLowerCase().includes('cold') ||
                        String(r.outcome || '').toLowerCase().includes('negative') ||
                        String(r.stage || '').toLowerCase().includes('cold')
                    );
                } else if (stage === 'Feeds' || stage === 'Open Feeds' || stage === 'Contacted Leads') {
                    remarks = remarks.filter(r => ['Feeds', 'Open Feeds', 'Contacted Leads'].includes(r.stage));
                } else if (stage === 'Leads') {
                    const leadStages = ['Leads', 'Open Leads', 'New Leads', 'Sales Leads', 'Follow-ups', 'Meetings', 'Hot Leads'];
                    remarks = remarks.filter(r => leadStages.includes(r.stage) || (!r.stage && !['Feeds', 'Open Feeds', 'Contacted Leads', 'Quotations', 'Deals', 'SO Converted Deals'].includes(r.stage)));
                } else if (stage === 'SO Converted' || stage === 'SO Converted Deals') {
                    remarks = remarks.filter(r => ['SO Converted Deals', 'SO Converted'].includes(r.stage));
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
                staff_branch: r.author?.branch || r.author?.branch_name || r.metadata?.branch_name || null,
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
            if (!isGlobalAdmin(req.user) && !hasPermission(req.user, ['manage_lead_stage_hot_leads', 'manage_leads'])) {
                return res.status(403).json({ error: 'Access Denied: You do not have permission to convert leads to customers (requires manage_lead_stage_hot_leads)' });
            }

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
    },

    // 15. Revert Lead / Prospect Pipeline Stage with Performer & Timestamp Audit
    revertStage: async (req, res) => {
        const { id } = req.params;
        const { reason, target_stage } = req.body;

        try {
            if (!reason || typeof reason !== 'string' || reason.trim().length < 3) {
                return res.status(400).json({ error: 'A mandatory reason (at least 3 characters) is required to revert a stage.' });
            }

            // Fetch lead
            const { data: lead, error: fetchErr } = await supabase
                .from('leads')
                .select('*')
                .eq('id', id)
                .single();

            if (fetchErr || !lead) {
                return res.status(404).json({ error: 'Lead record not found' });
            }

            const currentStatus = normalizeLeadStage(lead.status, lead);
            const staff = await resolveStaffIdentity(req);

            // Canonical Stage Progression hierarchy
            const STAGE_ORDER = [
                STAGES.FEEDS,
                'Contacted Leads',
                STAGES.OPEN_LEADS,
                STAGES.NEW_LEADS,
                STAGES.SALES_LEADS,
                STAGES.FOLLOW_UPS,
                STAGES.MEETINGS,
                STAGES.HOT_LEADS,
                STAGES.QUOTATIONS,
                STAGES.DEALS,
                STAGES.SO_CONVERTED
            ];

            const currentIndex = STAGE_ORDER.indexOf(currentStatus);

            let resolvedTargetStage = target_stage ? normalizeLeadStage(target_stage, lead) : null;

            if (!resolvedTargetStage) {
                // Determine prior stage from lead_stage_history
                const { data: history } = await supabase
                    .from('lead_stage_history')
                    .select('*')
                    .eq('lead_id', id)
                    .order('entered_at', { ascending: false });

                if (history && history.length > 0) {
                    // Find the most recent recorded stage that is NOT the current stage
                    const priorEntry = history.find(h => normalizeLeadStage(h.stage, lead) !== currentStatus);
                    if (priorEntry) {
                        resolvedTargetStage = normalizeLeadStage(priorEntry.stage, lead);
                    }
                }

                // Fallback to strict linear predecessor
                if (!resolvedTargetStage) {
                    if (currentIndex > 0) {
                        resolvedTargetStage = STAGE_ORDER[currentIndex - 1];
                    } else {
                        resolvedTargetStage = STAGES.FEEDS;
                    }
                }
            }

            if (resolvedTargetStage === currentStatus) {
                return res.status(400).json({ error: `Cannot revert to the same stage (${currentStatus}).` });
            }

            // Formatted date and time
            const now = new Date();
            const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
            const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
            const formattedDateTime = `${dateStr}, ${timeStr}`;

            const transitionNote = `Reverted from "${currentStatus}" to "${resolvedTargetStage}" by ${staff.full_name} (${staff.designation}) on ${formattedDateTime}.\nReason: ${reason.trim()}`;

            // 1. Exit current stage in lead_stage_history
            await supabase
                .from('lead_stage_history')
                .update({ 
                    exited_at: now.toISOString(),
                    transition_reason: `Exited via rollback to ${resolvedTargetStage}`
                })
                .eq('lead_id', id)
                .is('exited_at', null);

            // 2. Insert new record in lead_stage_history
            await supabase.from('lead_stage_history').insert([{
                lead_id: id,
                stage: resolvedTargetStage,
                entered_at: now.toISOString(),
                transition_reason: transitionNote,
                performed_by: staff.id || null,
                metadata: {
                    is_revert: true,
                    reverted_from: currentStatus,
                    reverted_to: resolvedTargetStage,
                    reverted_by: staff.full_name,
                    reverted_by_id: staff.id,
                    employee_id: staff.employee_id,
                    designation: staff.designation,
                    reason: reason.trim(),
                    reverted_at: now.toISOString()
                }
            }]);

            // 3. Record in lead_activities & sync to remarks JSONB
            const updatedRemarks = await recordLeadActivity(id, {
                stage: resolvedTargetStage,
                activityType: 'stage_revert',
                notes: `[STAGE REVERTED] Stage reverted from "${currentStatus}" back to "${resolvedTargetStage}" by ${staff.full_name} (${staff.designation}) on ${formattedDateTime}.\nReason: ${reason.trim()}`,
                responseType: 'revert',
                outcome: resolvedTargetStage,
                staff,
                currentRemarks: lead.remarks || []
            });

            // 4. Update leads table
            const updatePayload = {
                status: resolvedTargetStage,
                is_cold: false,
                remarks: updatedRemarks,
                updated_at: now.toISOString()
            };

            const { data: updatedLead, error: updateErr } = await supabase
                .from('leads')
                .update(updatePayload)
                .eq('id', id)
                .select(`
                    *,
                    industries ( id, name ),
                    branches ( id, name, branch_code ),
                    zones ( id, name, code ),
                    employees!leads_assigned_staff_id_fkey ( id, full_name, employee_id, designation, department ),
                    organizations ( id, name, is_risk, is_special, client_tag )
                `)
                .single();

            if (updateErr) {
                console.error('[revertStage] Update Error:', updateErr);
                // Fallback direct update
                await supabase.from('leads').update(updatePayload).eq('id', id);
            }

            return res.json({
                success: true,
                message: `Stage successfully reverted from ${currentStatus} to ${resolvedTargetStage}`,
                previous_stage: currentStatus,
                current_stage: resolvedTargetStage,
                reverted_by: staff.full_name,
                reverted_at: formattedDateTime,
                lead: updatedLead || { ...lead, ...updatePayload }
            });

        } catch (err) {
            console.error('[revertStage] Exception:', err);
            return res.status(500).json({ error: err.message });
        }
    }
};
