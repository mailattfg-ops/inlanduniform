const express = require('express');
const router = express.Router();
const mailController = require('../controllers/mailController');
const { authMiddleware, checkPermission } = require('../middleware/authMiddleware');

// Email a tax / proforma invoice PDF to the customer
router.post('/document', authMiddleware, checkPermission(['manage_invoices', 'view_invoices', 'manage_quotations', 'branch_sales']), mailController.sendDocument);

module.exports = router;
