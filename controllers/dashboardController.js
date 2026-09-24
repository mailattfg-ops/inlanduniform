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

        // 3. Global Stats for Branch Managers & System Admins
        const { count: totalMembers, error: memberError } = await supabase
            .from('registry_members')
            .select('*', { count: 'exact', head: true });
        
        const { count: totalOrgs, error: orgError } = await supabase
            .from('organizations')
            .select('*', { count: 'exact', head: true });

        const { count: totalMeasurements, error: measureError } = await supabase
            .from('measurements')
            .select('*', { count: 'exact', head: true });

        const { count: totalProducts } = await supabase.from('products').select('*', { count: 'exact', head: true });
        const { count: totalFabrics } = await supabase.from('fabrics').select('*', { count: 'exact', head: true });
        const { count: totalButtons } = await supabase.from('buttons').select('*', { count: 'exact', head: true });
        let totalTrims = 0;
        try {
            const { count: trimsCount, error: trimsErr } = await supabase.from('trims').select('*', { count: 'exact', head: true });
            if (!trimsErr && trimsCount !== null) {
                totalTrims = trimsCount;
            } else {
                totalTrims = totalButtons || 0;
            }
        } catch {
            totalTrims = totalButtons || 0;
        }

        const firstDayOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
        const { count: newMembersThisMonth, error: growthError } = await supabase
            .from('registry_members')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', firstDayOfMonth);

        const reach = totalOrgs > 0 ? Math.min(100, Math.round((totalMembers / (totalOrgs * 100)) * 100)) : 0;

        if (memberError || orgError || measureError) {
            throw new Error('Failed to fetch detailed stats');
        }

        res.json({
            totalMembers: totalMembers || 0,
            totalOrganizations: totalOrgs || 0,
            totalMeasurements: totalMeasurements || 0,
            totalInventory: (totalFabrics || 0) + (totalTrims || 0),
            totalProducts: totalProducts || 0,
            newMembersThisMonth: newMembersThisMonth || 0,
            reach: reach || 87 
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
