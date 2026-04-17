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

// Classes
router.get('/classes', checkPermission('view_schools'), schoolController.getClasses);
router.post('/classes/create', checkPermission('manage_schools'), schoolController.createClass);
router.put('/classes/:id', checkPermission('manage_schools'), schoolController.updateClass);
router.delete('/classes/:id', checkPermission('manage_schools'), schoolController.deleteClass);

module.exports = router;
