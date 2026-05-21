const express = require('express');
const router = express.Router();
const quotationController = require('../controllers/quotationController');
const { authMiddleware, checkPermission } = require('../middleware/authMiddleware');

// List quotations (anyone logged in can view)
router.get('/', authMiddleware, quotationController.listQuotations);

// Get single quotation details
router.get('/:id', authMiddleware, quotationController.getQuotationDetails);

// Create quotation
router.post('/', authMiddleware, checkPermission(['manage_quotations']), quotationController.createQuotation);

// Delete quotation
router.delete('/:id', authMiddleware, checkPermission(['manage_quotations']), quotationController.deleteQuotation);

// Calculate metrics for organization members & sizing live
router.get('/calculate/:orgId', authMiddleware, checkPermission(['manage_quotations']), quotationController.calculateOrgMeasurements);

module.exports = router;
