const express = require('express');
const router = express.Router();
const employeeController = require('../controllers/employeeController');
const { authMiddleware, checkPermission } = require('../middleware/authMiddleware');

// Authenticate all requests
router.use(authMiddleware);

// Define Granular Access
router.get('/', checkPermission('view_employees'), employeeController.listEmployees);
router.post('/register', checkPermission('manage_employees'), employeeController.createEmployee);
router.get('/:id/organizations', checkPermission('view_employees'), employeeController.getMyOrganizations);
router.put('/:id', checkPermission('manage_employees'), employeeController.updateEmployee);
router.delete('/:id', checkPermission('manage_employees'), employeeController.deleteEmployee);
router.post('/:id/reset-password', checkPermission('manage_employees'), employeeController.resetPassword);
router.post('/:id/sync-username', checkPermission('manage_employees'), employeeController.syncUsername);

module.exports = router;
