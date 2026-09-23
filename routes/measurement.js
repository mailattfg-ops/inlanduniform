const express = require('express');
const router = express.Router();
const measurementController = require('../controllers/measurementController');
const { authMiddleware, checkPermission } = require('../middleware/authMiddleware');

router.use(authMiddleware);

router.get('/', (req, res, next) => {
    const role = req.user.role?.toLowerCase();
    if (req.user.permissions?.includes('view_measurements') || 
        req.user.permissions?.includes('all') || 
        ['student', 'entity', 'member', 'school', 'organization', 'organisation'].includes(role) ||
        req.user.organizationId || req.user.memberId) {
        return next();
    }
    return res.status(403).json({ 
        error: "Access Denied", 
        message: "You do not have permission to view measurements" 
    });
}, measurementController.listMeasurements);

router.get('/config', (req, res, next) => {
    const role = req.user.role?.toLowerCase();
    // Access configuration if they have permission OR if they are a student/entity/organization
    if (req.user.permissions?.includes('view_measurements') || 
        req.user.permissions?.includes('all') || 
        ['student', 'entity', 'member', 'school', 'organization', 'organisation'].includes(role) ||
        req.user.organizationId || req.user.memberId) {
        return next();
    }
    return res.status(403).json({ 
        error: "Access Denied", 
        message: "You do not have permission to perform this action (view_measurements)" 
    });
}, measurementController.listConfig);
router.post('/config', checkPermission('manage_measurements'), measurementController.addConfig);
router.delete('/config/:id', checkPermission('manage_measurements'), measurementController.deleteConfig);
router.post('/record', (req, res, next) => {
    const role = req.user.role?.toLowerCase();
    if (req.user.permissions?.includes('manage_measurements') || 
        req.user.permissions?.includes('all') || 
        ['entity', 'member', 'school', 'organization', 'organisation'].includes(role)) {
        return next();
    }
    return res.status(403).json({ 
        error: "Access Denied", 
        message: "You do not have permission to perform this action (manage_measurements)" 
    });
}, measurementController.saveMeasurement);
router.post('/:id/status', checkPermission('all'), measurementController.updateStatus);

// Get measurement history for a specific member - Allowing staff, organization owner, OR the member themselves
const getMemberHistoryHandler = async (req, res, next) => {
    try {
        const canViewAll = req.user.permissions?.includes('view_measurements') || req.user.permissions?.includes('all') || req.user.role === 'Admin' || req.user.role === 'Branch Manager';
        const role = req.user.role?.toLowerCase();
        const targetMemberId = req.params.memberId;

        if (canViewAll) {
            return measurementController.getStudentHistory(req, res);
        }

        // Entity / Student / Member: strictly owner check
        if (role === 'entity' || role === 'student' || role === 'member' || req.user.memberId) {
            if (req.user.memberId && String(req.user.memberId) === String(targetMemberId)) {
                return measurementController.getStudentHistory(req, res);
            }
            return res.status(403).json({ 
                error: "Access Denied", 
                message: "You can only view your own measurements" 
            });
        }

        // Organization: verify target member belongs to this organization
        if (role === 'school' || role === 'organization' || role === 'organisation' || req.user.organizationId) {
            const supabase = require('../config/supabase');
            const { data: member } = await supabase
                .from('registry_members')
                .select('organization_id')
                .eq('id', targetMemberId)
                .maybeSingle();

            if (member && String(member.organization_id) === String(req.user.organizationId)) {
                return measurementController.getStudentHistory(req, res);
            }
            return res.status(403).json({ 
                error: "Access Denied", 
                message: "You can only view measurements of members belonging to your organization" 
            });
        }

        return res.status(403).json({ 
            error: "Access Denied", 
            message: "You don't have permission to view these measurements" 
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

router.get('/history/:memberId', getMemberHistoryHandler);
router.get('/member/:memberId', getMemberHistoryHandler);

module.exports = router;
