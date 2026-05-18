const express = require('express');
const router = express.Router();
const departmentController = require('../controllers/departmentController');
const { authMiddleware, checkPermission } = require('../middleware/authMiddleware');

router.use(authMiddleware);

// Department management (formerly classes)
router.get('/', departmentController.getDepartments);
router.post('/', checkPermission(['manage_classes', 'school']), departmentController.createDepartment);
router.put('/:id', checkPermission(['manage_classes', 'school']), departmentController.updateDepartment);
router.delete('/:id', checkPermission(['manage_classes', 'school']), departmentController.deleteDepartment);

module.exports = router;
