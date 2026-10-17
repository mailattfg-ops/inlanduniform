const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { authMiddleware, checkPermission } = require('../middleware/authMiddleware');

router.use(authMiddleware);

// Roles management (alias to user_types)
router.get('/', checkPermission(['manage_system', 'manage_roles', 'manage_employees', 'view_employees']), userController.getUserTypes);
router.post('/', checkPermission(['manage_system', 'manage_roles']), userController.createUserType);
router.put('/:id', checkPermission(['manage_system', 'manage_roles']), userController.updateUserType);
router.delete('/:id', checkPermission(['manage_system', 'manage_roles']), userController.deleteUserType);

module.exports = router;
