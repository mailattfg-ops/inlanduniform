const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const { authMiddleware, checkPermission } = require('../middleware/authMiddleware');

// List all payments
router.get('/', authMiddleware, paymentController.listPayments);

// Get payments for a specific quotation
router.get('/quotation/:quotationId', authMiddleware, paymentController.getQuotationPayments);

// Record a new payment
router.post('/', authMiddleware, checkPermission(['manage_quotations']), paymentController.recordPayment);

// Cancel/Delete a payment
router.delete('/:id', authMiddleware, checkPermission(['manage_quotations']), paymentController.cancelPayment);

module.exports = router;
