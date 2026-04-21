const express = require('express');
const router = express.Router();
const schoolController = require('../controllers/schoolController');
const { authMiddleware, checkPermission } = require('../middleware/authMiddleware');

router.use(authMiddleware);

// Schools
router.get('/', checkPermission('view_schools'), schoolController.getSchools);
router.post('/create', checkPermission('manage_schools'), schoolController.createSchool);
router.put('/:id', checkPermission('manage_schools'), schoolController.updateSchool);
router.delete('/:id', checkPermission('manage_schools'), schoolController.deleteSchool);
router.post('/:id/reset-password', checkPermission('manage_schools'), schoolController.resetPassword);

// Classes
router.get('/classes', checkPermission(['view_schools', 'manage_classes']), schoolController.getClasses);
router.post('/classes/create', checkPermission(['manage_schools', 'manage_classes']), schoolController.createClass);
router.put('/classes/:id', checkPermission(['manage_schools', 'manage_classes']), schoolController.updateClass);
router.delete('/classes/:id', checkPermission(['manage_schools', 'manage_classes']), schoolController.deleteClass);

module.exports = router;
