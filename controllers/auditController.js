const supabase = require('../config/supabase');

exports.getAuditLogs = async (req, res) => {
    try {
        // Fetch logs and join with user_profiles to get the performer's name
        const { data: logs, error } = await supabase
            .from('audit_logs')
            .select(`
                *,
                performer:user_profiles (
                    id,
                    full_name,
                    email
                )
            `)
            .order('created_at', { ascending: false })
            .limit(250);

        if (error) {
            if (error.code === '42P01') { // Message: relation "public.audit_logs" does not exist
                console.warn('[AUDIT] Table missing. Please run migration.');
                return res.json({ error: 'SCHEMA_MISSING', message: 'The audit_logs table has not been created yet.' });
            }
            throw error;
        }

        // Flatten data for frontend with Indian Standard Time
        const formattedLogs = (logs || []).map(l => {
            const performerName = l.performer?.full_name 
                || l.details?.performed_by_name 
                || l.details?.performed_by?.name 
                || (l.user_id ? `User #${l.user_id}` : 'System / External');

            // Format in Indian Standard Time (Asia/Kolkata)
            let istTime = l.details?.timestamp_ist;
            if (!istTime && l.created_at) {
                try {
                    istTime = new Date(l.created_at).toLocaleString('en-IN', {
                        timeZone: 'Asia/Kolkata',
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                        hour12: true
                    });
                } catch (e) {
                    istTime = l.created_at;
                }
            }

            return {
                id: (l.id || '').slice(0, 8),
                action: l.action,
                entity_type: l.entity_type,
                user: performerName,
                user_email: l.performer?.email || l.details?.email || null,
                details: typeof l.details === 'object' ? JSON.stringify(l.details) : String(l.details || '{}'),
                time: l.created_at,
                created_at: l.created_at,
                ist_time: istTime
            };
        });

        res.json(formattedLogs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
