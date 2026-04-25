const supabase = require('../config/supabase');

/**
 * Logs a system action to the audit_logs table
 * @param {string} userId - ID of the user performing the action
 * @param {string} action - Action type (CREATE, UPDATE, DELETE, etc.)
 * @param {string} entityType - Type of record (member, organization, etc.)
 * @param {string} entityId - ID of the record being changed
 * @param {object} details - JSON data about the change
 */
const logAction = async (userId, action, entityType, entityId, details) => {
    try {
        const { error } = await supabase.from('audit_logs').insert([{
            user_id: userId,
            action: action.toUpperCase(),
            entity_type: entityType,
            entity_id: String(entityId),
            details: details || {}
        }]);
        
        if (error) {
            if (error.code === '42P01') {
                console.warn('[LOGGER] Audit logs table is missing. Actions are not being recorded. Run the migration to fix.');
            } else {
                console.error('[LOGGER] Database Error:', error.message);
            }
        }
    } catch (err) {
        console.error('[LOGGER] Critical Failure:', err.message);
    }
};

module.exports = { logAction };
