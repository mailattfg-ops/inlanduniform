const express = require('express');
const router = express.Router();
const vendorController = require('../controllers/vendorController');
const { authMiddleware, checkPermission } = require('../middleware/authMiddleware');

// All vendor routes require authentication
router.use(authMiddleware);

// Admin-only permission check helper for mutations
const requireAdmin = checkPermission(['manage_system']);

router.get('/', vendorController.list);
router.get('/:id', vendorController.getDetails);
router.post('/', requireAdmin, vendorController.create);
router.put('/:id', requireAdmin, vendorController.update);
router.delete('/:id', requireAdmin, vendorController.delete);

module.exports = router;
