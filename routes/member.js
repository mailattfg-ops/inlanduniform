const express = require('express');
const router = express.Router();
const memberController = require('../controllers/memberController');
const { authMiddleware, checkPermission } = require('../middleware/authMiddleware');

// All student routes require basic authentication
router.use(authMiddleware);

// Specific permission checks
router.get('/', checkPermission(['view_students', 'view_own_students']), memberController.listStudents);
router.post('/register', checkPermission(['register_students', 'view_own_students']), memberController.createStudent);
router.post('/bulk-register', checkPermission(['register_students', 'view_own_students']), memberController.bulkCreateStudents);
router.put('/:id', checkPermission(['register_students', 'view_own_students']), memberController.updateStudent);

// Strict management permissions
router.delete('/:id', checkPermission(['manage_students', 'view_own_students']), memberController.deleteStudent);
router.post('/:id/reset-password', checkPermission(['manage_students', 'view_own_students']), memberController.resetPassword);
router.post('/:id/sync-username', checkPermission(['manage_students', 'view_own_students']), memberController.syncUsername);

module.exports = router;
