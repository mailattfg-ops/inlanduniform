const supabase = require('../config/supabase');

exports.getStats = async (req, res) => {
    try {
        const user = req.user;
        const role = (user?.role || '').toLowerCase();
        const userOrgId = user?.organizationId;
        const userMemberId = user?.memberId;

        // 1. Entity Member Isolation
        if (role === 'entity' || role === 'student' || role === 'member' || userMemberId) {
            let effectiveMemberId = userMemberId;
            let memberDetails = null;

            if (!effectiveMemberId && user?.id) {
                const { data: foundMember } = await supabase
                    .from('registry_members')
                    .select('id, full_name, admission_no, gender, organization_id, department_id, organizations(id, name, customer_code), departments(id, name)')
                    .eq('user_id', user.id)
                    .maybeSingle();
                if (foundMember) {
                    effectiveMemberId = foundMember.id;
                    memberDetails = foundMember;
                }
            } else if (effectiveMemberId) {
                const { data: foundMember } = await supabase
                    .from('registry_members')
                    .select('id, full_name, admission_no, gender, organization_id, department_id, organizations(id, name, customer_code), departments(id, name)')
                    .eq('id', effectiveMemberId)
                    .maybeSingle();
                if (foundMember) {
                    memberDetails = foundMember;
                }
            }

            let measureCount = 0;
            let latestMeasurement = null;

            if (effectiveMemberId) {
                const { count } = await supabase
                    .from('measurements')
                    .select('*', { count: 'exact', head: true })
                    .eq('member_id', effectiveMemberId);
                measureCount = count || 0;

                const { data: latest } = await supabase
                    .from('measurements')
                    .select('id, suggested_size, recorded_at, status, notes, dynamic_data')
                    .eq('member_id', effectiveMemberId)
                    .order('recorded_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();
                latestMeasurement = latest;
            }

            let uniformTemplates = [];
            const orgId = memberDetails?.organization_id || userOrgId;
            if (orgId) {
                const { data: templates } = await supabase
                    .from('industry_templates')
                    .select('id, name, department_ids, boys_config, girls_config')
                    .eq('organization_id', orgId);
                if (templates) {
                    uniformTemplates = templates;
                }
            }

            return res.json({
                isEntity: true,
                totalMembers: 1,
                totalOrganizations: 1,
                totalMeasurements: measureCount,
                totalInventory: 0,
                totalProducts: 0,
                newMembersThisMonth: 0,
                reach: 100,
                latestMeasurement: latestMeasurement || null,
                memberDetails: memberDetails || null,
                uniformTemplates: uniformTemplates || []
            });
        }

        // 2. Organization Isolation
        if (role === 'school' || role === 'organization' || role === 'organisation' || userOrgId) {
            let totalMembers = 0;
            let totalMeasurements = 0;
            let newMembersThisMonth = 0;

            if (userOrgId) {
                const { count: mCount } = await supabase
                    .from('registry_members')
                    .select('*', { count: 'exact', head: true })
                    .eq('organization_id', userOrgId);
                totalMembers = mCount || 0;

                const firstDayOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
                const { count: nmCount } = await supabase
                    .from('registry_members')
                    .select('*', { count: 'exact', head: true })
                    .eq('organization_id', userOrgId)
                    .gte('created_at', firstDayOfMonth);
                newMembersThisMonth = nmCount || 0;

                const { data: orgMembers } = await supabase
                    .from('registry_members')
                    .select('id')
                    .eq('organization_id', userOrgId);
                if (orgMembers && orgMembers.length > 0) {
                    const memberIds = orgMembers.map(m => m.id);
                    const { data: measurements } = await supabase
                        .from('measurements')
                        .select('member_id')
                        .in('member_id', memberIds);
                    const measuredSet = new Set((measurements || []).map(m => String(m.member_id)));
                    totalMeasurements = measuredSet.size;
                }
            }

            const pendingMeasurements = Math.max(0, totalMembers - totalMeasurements);

            return res.json({
                totalMembers,
                totalOrganizations: 1,
                totalMeasurements,
                pendingMeasurements,
                totalInventory: 0,
                totalProducts: 0,
                newMembersThisMonth,
                reach: 100
            });
        }

        // 3. Global Stats for Branch Managers & System Admins (Executed in parallel for lightning speed)
        const firstDayOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

        const [
            membersRes,
            orgsRes,
            measuresRes,
            productsRes,
            fabricsRes,
            buttonsRes,
            trimsRes,
            quotesRes,
            ordersRes,
            jobCardsRes,
            newMembersRes
        ] = await Promise.all([
            supabase.from('registry_members').select('*', { count: 'exact', head: true }),
            supabase.from('organizations').select('*', { count: 'exact', head: true }),
            supabase.from('measurements').select('*', { count: 'exact', head: true }),
            supabase.from('products').select('*', { count: 'exact', head: true }),
            supabase.from('fabrics').select('*', { count: 'exact', head: true }),
            supabase.from('buttons').select('*', { count: 'exact', head: true }),
            supabase.from('trims').select('*', { count: 'exact', head: true }),
            supabase.from('quotations').select('id, final_quote_value, paid_amount, payment_status, status'),
            supabase.from('orders').select('id, order_no, status, barcode, created_at, quotations(id, quotation_no, title, final_quote_value, paid_amount, payment_status, organizations(name))').order('created_at', { ascending: false }),
            supabase.from('job_cards').select('id, job_card_no, status, notes, created_at'),
            supabase.from('registry_members').select('*', { count: 'exact', head: true }).gte('created_at', firstDayOfMonth)
        ]);

        const totalMembers = membersRes.count || 0;
        const totalOrgs = orgsRes.count || 0;
        const totalMeasurements = measuresRes.count || 0;
        const totalProducts = productsRes.count || 0;
        const totalFabrics = fabricsRes.count || 0;
        const totalButtons = buttonsRes.count || 0;
        const totalTrims = (trimsRes && !trimsRes.error && trimsRes.count !== null) ? trimsRes.count : (totalButtons || 0);
        const quotations = quotesRes.data || [];
        const orders = ordersRes.data || [];
        const jobCards = jobCardsRes.data || [];
        const newMembersThisMonth = newMembersRes.count || 0;

        // Live Financial Stats from Quotations
        let totalContractValue = 0;
        let collectedRevenue = 0;
        let paidQuotationsCount = 0;
        let partialQuotationsCount = 0;
        let pendingQuotationsCount = 0;

        quotations.forEach(q => {
            const val = parseFloat(q.final_quote_value) || 0;
            const paid = parseFloat(q.paid_amount) || 0;
            totalContractValue += val;
            collectedRevenue += paid;
            if (q.payment_status === 'Paid') paidQuotationsCount++;
            else if (q.payment_status === 'Partially Paid') partialQuotationsCount++;
            else pendingQuotationsCount++;
        });
        const outstandingBalance = Math.max(0, totalContractValue - collectedRevenue);

        // Live Orders & Pipeline from Orders
        let activeOrdersCount = 0;
        let pendingOrdersCount = 0;
        let heldOrdersCount = 0;
        let completedOrdersCount = 0;

        orders.forEach(o => {
            const st = (o.status || '').toLowerCase();
            if (['corporate accepted', 'in production', 'placed', 'approved', 'active'].includes(st)) {
                activeOrdersCount++;
            } else if (['approval pending', 'corporate hold', 'pending'].includes(st)) {
                pendingOrdersCount++;
            } else if (['held at branch', 'held'].includes(st)) {
                heldOrdersCount++;
            } else if (['delivered', 'completed'].includes(st)) {
                completedOrdersCount++;
            }
        });

        const recentOrders = orders.slice(0, 5).map(o => ({
            id: o.id,
            order_no: o.order_no,
            status: o.status,
            barcode: o.barcode,
            created_at: o.created_at,
            client_name: o.quotations?.organizations?.name || 'Client',
            title: o.quotations?.title || 'Uniform Order',
            quotation_no: o.quotations?.quotation_no,
            quote_value: parseFloat(o.quotations?.final_quote_value || 0),
            paid_amount: parseFloat(o.quotations?.paid_amount || 0),
            payment_status: o.quotations?.payment_status || 'Pending'
        }));

        // Live Job Cards & Production Floor Status
        let totalJobCards = jobCards.length;
        let jobCardsInProduction = 0;
        let jobCardsHeld = 0;
        let jobCardsReady = 0;

        jobCards.forEach(jc => {
            const st = (jc.status || '').toLowerCase();
            if (st.includes('held') || st.includes('awaiting')) {
                jobCardsHeld++;
            } else if (st.includes('ready') || st.includes('completed')) {
                jobCardsReady++;
            } else {
                jobCardsInProduction++;
            }
        });

        const memberCount = totalMembers || 0;
        const measuredCount = totalMeasurements || 0;
        const pendingMeasureCount = Math.max(0, memberCount - measuredCount);
        const measurementCompletionRate = memberCount > 0 ? Math.min(100, Math.round((measuredCount / memberCount) * 100)) : 0;

        res.json({
            // Core Identity & Member Stats
            totalMembers: memberCount,
            totalOrganizations: totalOrgs || 0,
            totalMeasurements: measuredCount,
            pendingMeasurements: pendingMeasureCount,
            measurementCompletionRate,
            newMembersThisMonth: newMembersThisMonth || 0,

            // Financial & Commercial Pipeline (Real Values)
            totalContractValue: parseFloat(totalContractValue.toFixed(2)),
            collectedRevenue: parseFloat(collectedRevenue.toFixed(2)),
            outstandingBalance: parseFloat(outstandingBalance.toFixed(2)),
            paidQuotationsCount,
            partialQuotationsCount,
            pendingQuotationsCount,

            // Orders & Production
            totalOrders: (orders || []).length,
            activeOrdersCount,
            pendingOrdersCount,
            heldOrdersCount,
            completedOrdersCount,
            recentOrders,

            // Factory & Lots
            totalJobCards,
            jobCardsInProduction,
            jobCardsHeld,
            jobCardsReady,

            // Inventory & Catalog
            totalInventory: (totalFabrics || 0) + (totalTrims || 0),
            totalFabrics: totalFabrics || 0,
            totalTrims: totalTrims || 0,
            totalProducts: totalProducts || 0,
            reach: measurementCompletionRate || 50
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
