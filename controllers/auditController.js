const supabase = require('../config/supabase');

exports.getAuditLogs = async (req, res) => {
    try {
        // Fetch logs and join with user_profiles to get the performer's name
        const { data: logs, error } = await supabase
            .from('audit_logs')
            .select(`
                *,
                performer:user_profiles (
                    full_name
                )
            `)
            .order('created_at', { ascending: false })
            .limit(100);

        if (error) {
            if (error.code === '42P01') { // Message: relation "public.audit_logs" does not exist
                console.warn('[AUDIT] Table missing. Please run migration.');
                return res.json({ error: 'SCHEMA_MISSING', message: 'The audit_logs table has not been created yet.' });
            }
            throw error;
        }

        // Flatten data for frontend
        const formattedLogs = (logs || []).map(l => ({
            id: l.id.slice(0, 8),
            action: l.action,
            entity_type: l.entity_type,
            user: l.performer?.full_name || 'System / External',
            details: JSON.stringify(l.details),
            time: new Date(l.created_at).toLocaleString(),
            created_at: l.created_at
        }));

        res.json(formattedLogs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
