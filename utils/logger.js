const supabase = require('../config/supabase');

/**
 * Logs a system action to audit_logs and record_activity_logs tables
 * @param {string|number} userId - ID of the user performing the action
 * @param {string} action - Action type (CREATE, UPDATE, DELETE, etc.)
 * @param {string} entityType - Type of record (Quotation, Order, JobCard, member, etc.)
 * @param {string|number} entityId - ID of the record being changed
 * @param {object} details - JSON data about the change
 * @param {Array} attachments - Optional array of image/file attachments
 */
const logAction = async (userId, action, entityType, entityId, details, attachments) => {
    try {
        // 1. Audit logs table (general system audit)
        await supabase.from('audit_logs').insert([{
            user_id: userId,
            action: action.toUpperCase(),
            entity_type: entityType,
            entity_id: String(entityId),
            details: details || {}
        }]);

        // 2. Record activity logs table (PRD M1.7 entity timeline)
        const numericEntityId = /^\d+$/.test(String(entityId)) ? parseInt(entityId, 10) : null;
        const numericUserId = userId && /^\d+$/.test(String(userId)) ? parseInt(userId, 10) : null;

        if (numericEntityId) {
            const capitalizedType = entityType.charAt(0).toUpperCase() + entityType.slice(1);
            await supabase.from('record_activity_logs').insert([{
                entity_type: capitalizedType,
                entity_id: numericEntityId,
                action: action.toUpperCase(),
                performed_by: numericUserId,
                details: details || {},
                attachments: attachments || [],
                created_at: new Date().toISOString()
            }]);
        }
    } catch (err) {
        console.error('[LOGGER] Error logging action:', err.message);
    }
};

module.exports = { logAction };

