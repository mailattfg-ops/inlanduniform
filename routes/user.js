const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { authMiddleware, checkPermission } = require('../middleware/authMiddleware');

// All administrative routes require authentication
router.use(authMiddleware);

// Current user profile
router.get('/profile', userController.getProfile);
router.put('/profile', userController.updateProfile);

// Admin only routes - Role Management
router.get('/types', checkPermission('manage_system'), userController.getUserTypes);
router.post('/types', checkPermission('manage_system'), userController.createUserType);
router.put('/types/:id', checkPermission('manage_system'), userController.updateUserType);
router.delete('/types/:id', checkPermission('manage_system'), userController.deleteUserType);

router.post('/create', checkPermission('manage_system'), userController.createUser);

module.exports = router;
