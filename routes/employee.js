const express = require('express');
const router = express.Router();
const employeeController = require('../controllers/employeeController');
const { authMiddleware, checkPermission } = require('../middleware/authMiddleware');

// Authenticate all requests
router.use(authMiddleware);

// Define Granular Access
router.get('/', (req, res, next) => {
  const role = (req.user?.role || '').toLowerCase();
  if (['organisation', 'organization', 'school', 'entity', 'student', 'member'].includes(role) || req.user?.organizationId) {
    return employeeController.listEmployees(req, res);
  }
  return checkPermission('view_employees')(req, res, next);
}, employeeController.listEmployees);
router.post('/register', checkPermission('manage_employees'), employeeController.createEmployee);
router.get('/:id/organizations', checkPermission('view_employees'), employeeController.getMyOrganizations);
router.put('/:id', checkPermission('manage_employees'), employeeController.updateEmployee);
router.delete('/:id', checkPermission('manage_employees'), employeeController.deleteEmployee);
router.post('/:id/reset-password', checkPermission('manage_employees'), employeeController.resetPassword);
router.post('/:id/sync-username', checkPermission('manage_employees'), employeeController.syncUsername);

module.exports = router;
