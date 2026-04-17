const express = require('express');
const router = express.Router();
const studentController = require('../controllers/studentController');
const { authMiddleware, checkPermission } = require('../middleware/authMiddleware');

// All student routes require basic authentication
router.use(authMiddleware);

// Specific permission checks
router.get('/', checkPermission('view_students'), studentController.listStudents);
router.post('/register', checkPermission('register_students'), studentController.createStudent);
router.post('/bulk-register', checkPermission('register_students'), studentController.bulkCreateStudents);
router.put('/:id', checkPermission('register_students'), studentController.updateStudent);

// Strict management permissions
router.delete('/:id', checkPermission('manage_students'), studentController.deleteStudent);
router.post('/:id/reset-password', checkPermission('manage_students'), studentController.resetPassword);
router.post('/:id/sync-username', checkPermission('manage_students'), studentController.syncUsername);

module.exports = router;
