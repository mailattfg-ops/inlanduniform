const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { authMiddleware, checkPermission } = require('../middleware/authMiddleware');

// All administrative routes require authentication
router.use(authMiddleware);

// Current user profile
router.get('/profile', userController.getProfile);
router.put('/profile', userController.updateProfile);

// Admin only routes
router.get('/types', checkPermission('manage_system'), userController.getUserTypes);
router.post('/create', checkPermission('manage_system'), userController.createUser);

module.exports = router;
