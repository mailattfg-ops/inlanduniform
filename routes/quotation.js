const express = require('express');
const router = express.Router();
const quotationController = require('../controllers/quotationController');
const { authMiddleware, checkPermission } = require('../middleware/authMiddleware');

// Public route to view/download proposal PDF
router.get('/:id/share', quotationController.getSharePDF);

// List quotations (anyone logged in can view)
router.get('/', authMiddleware, quotationController.listQuotations);

// Get group design combinations
router.get('/group-designs', authMiddleware, quotationController.listGroupDesignCombinations);

// Update group design combination
router.put('/group-designs/:id', authMiddleware, checkPermission(['manage_products']), quotationController.updateGroupDesignCombination);

// Get individual design numbers catalog
router.get('/design-numbers', authMiddleware, quotationController.listDesignNumbers);

// Update individual design number details
router.put('/design-numbers/:id', authMiddleware, checkPermission(['manage_products']), quotationController.updateDesignNumber);


// Get single quotation details
router.get('/:id', authMiddleware, quotationController.getQuotationDetails);

// Create quotation
router.post('/', authMiddleware, checkPermission(['manage_quotations']), quotationController.createQuotation);

// Update quotation
router.put('/:id', authMiddleware, checkPermission(['manage_quotations']), quotationController.updateQuotation);

// Delete quotation
router.delete('/:id', authMiddleware, checkPermission(['manage_quotations']), quotationController.deleteQuotation);

// Calculate metrics for organization members & sizing live
router.get('/calculate/:orgId', authMiddleware, checkPermission(['manage_quotations']), quotationController.calculateOrgMeasurements);

module.exports = router;
