const express = require('express');
const router = express.Router();
const measurementController = require('../controllers/measurementController');
const { authMiddleware, checkPermission } = require('../middleware/authMiddleware');

router.use(authMiddleware);

router.get('/', checkPermission('view_measurements'), measurementController.listMeasurements);
router.get('/config', (req, res, next) => {
    // Access configuration if they have permission OR if they are a student
    if (req.user.permissions.includes('view_measurements') || req.user.permissions.includes('all') || req.user.role === 'Student') {
        return next();
    }
    return res.status(403).json({ 
        error: "Access Denied", 
        message: "You do not have permission to perform this action (view_measurements)" 
    });
}, measurementController.listConfig);
router.post('/config', checkPermission('manage_measurements'), measurementController.addConfig);
router.delete('/config/:id', checkPermission('manage_measurements'), measurementController.deleteConfig);
router.post('/record', checkPermission('manage_measurements'), measurementController.saveMeasurement);

// Get measurement history for a specific student - Allowing staff OR the student themselves
router.get('/student/:studentId', async (req, res, next) => {
    try {
        const canViewAll = req.user.permissions.includes('view_measurements') || req.user.permissions.includes('all');
        
        // If they are staff/admin, let them through to the controller
        if (canViewAll) {
            return measurementController.getStudentHistory(req, res);
        }

        // If they are a student, we need to check if they are the OWNER of this history
        if (req.user.role === 'Student') {
            const supabase = require('../config/supabase');
            const { data: student } = await supabase
                .from('students')
                .select('id')
                .eq('user_id', req.user.id)
                .single();

            if (student && student.id.toString() === req.params.studentId) {
                return measurementController.getStudentHistory(req, res);
            }
        }

        return res.status(403).json({ 
            error: "Access Denied", 
            message: "You don't have permission to view these measurements" 
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
