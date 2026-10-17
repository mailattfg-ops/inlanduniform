const express = require('express');
const router = express.Router();
const measurementController = require('../controllers/measurementController');
const { authMiddleware, checkPermission } = require('../middleware/authMiddleware');

router.use(authMiddleware);

// Measures configuration (alias to measurement config)
router.get('/', (req, res, next) => {
    const role = req.user.role?.toLowerCase();
    if (req.user.permissions?.includes('view_measurements') || 
        req.user.permissions?.includes('manage_measurement_config') ||
        req.user.permissions?.includes('all') || 
        ['student', 'entity', 'member', 'school', 'organization', 'organisation', 'admin'].includes(role) ||
        req.user.organizationId || req.user.memberId) {
        return next();
    }
    return res.status(403).json({ 
        error: "Access Denied", 
        message: "You do not have permission to view measurements configuration" 
    });
}, measurementController.listConfig);

router.get('/config', (req, res, next) => {
    const role = req.user.role?.toLowerCase();
    if (req.user.permissions?.includes('view_measurements') || 
        req.user.permissions?.includes('manage_measurement_config') ||
        req.user.permissions?.includes('all') || 
        ['student', 'entity', 'member', 'school', 'organization', 'organisation', 'admin'].includes(role) ||
        req.user.organizationId || req.user.memberId) {
        return next();
    }
    return res.status(403).json({ 
        error: "Access Denied", 
        message: "You do not have permission to view measurements configuration" 
    });
}, measurementController.listConfig);

router.post('/', checkPermission(['manage_measurements', 'manage_measurement_config']), measurementController.addConfig);
router.put('/:id', checkPermission(['manage_measurements', 'manage_measurement_config']), measurementController.updateConfig);
router.delete('/:id', checkPermission(['manage_measurements', 'manage_measurement_config']), measurementController.deleteConfig);

module.exports = router;
