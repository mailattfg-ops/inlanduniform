const express = require('express');
const router = express.Router();
const taxController = require('../controllers/taxMasterController');
const { authMiddleware, checkPermission } = require('../middleware/authMiddleware');

// Authenticated read access
router.get('/', authMiddleware, taxController.listTaxes);

// Admin-only management routes
router.post('/', authMiddleware, checkPermission(['manage_system']), taxController.createTax);
router.put('/:id', authMiddleware, checkPermission(['manage_system']), taxController.updateTax);
router.delete('/:id', authMiddleware, checkPermission(['manage_system']), taxController.deleteTax);

module.exports = router;
