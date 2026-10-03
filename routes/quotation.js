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

// Preview or resolve design number based on product + fabrics + trims combination
router.post('/resolve-design-number', authMiddleware, quotationController.resolveDesignNumber);


// Get single quotation details
router.get('/:id', authMiddleware, quotationController.getQuotationDetails);

// Create quotation (Branch Staff with branch_sales, Branch Manager with manage_quotations, Admin)
router.post('/', authMiddleware, checkPermission(['manage_quotations', 'branch_sales']), quotationController.createQuotation);

// Update quotation (if not locked, allowed for staff and managers)
router.put('/:id', authMiddleware, checkPermission(['manage_quotations', 'branch_sales']), quotationController.updateQuotation);

// Submit quotation to Branch Manager for approval (Marketing & Sales staff)
router.put('/:id/submit-to-bm', authMiddleware, checkPermission(['submit_quotations_bm', 'manage_quotations']), quotationController.submitToBranchManager);

// Branch Manager approves quotation and submits to Operations
router.put('/:id/bm-approve', authMiddleware, checkPermission(['submit_quotations_ops', 'corporate_approver']), quotationController.bmApproveAndSubmitToOps);

// Branch Manager rejects quotation back to Draft for revisions
router.put('/:id/bm-reject', authMiddleware, checkPermission(['submit_quotations_ops', 'corporate_approver']), quotationController.bmRejectQuotation);

// Submit quotation directly to operations team (Branch Managers with Ops Submission authority)
router.put('/:id/submit-to-ops', authMiddleware, checkPermission(['submit_quotations_ops', 'corporate_approver']), quotationController.submitToOps);

// Delete quotation (Restricted strictly to managers/admins)
router.delete('/:id', authMiddleware, checkPermission(['manage_quotations']), quotationController.deleteQuotation);

// Calculate metrics for organization members & sizing live
router.get('/calculate/:orgId', authMiddleware, checkPermission(['manage_quotations', 'branch_sales', 'view_quotations']), quotationController.calculateOrgMeasurements);

module.exports = router;
