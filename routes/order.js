const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const { authMiddleware, checkPermission } = require('../middleware/authMiddleware');

// List all orders
router.get('/', authMiddleware, orderController.listOrders);

// Get single order details
router.get('/:id', authMiddleware, orderController.getOrderDetails);

// Create order from a paid quotation
router.post('/', authMiddleware, checkPermission(['manage_quotations']), orderController.createOrder);

// Branch Manager submits Sales Order to Corporate HQ
router.put('/:id/submit-to-corporate', authMiddleware, orderController.submitToCorporate);

// Corporate Approver triage action (Accept, Reject with reason, Hold with reason)
router.put('/:id/corporate-action', authMiddleware, checkPermission(['manage_system', 'corporate_approver']), orderController.corporateAction);

// PRD M5.7 & Section 5 Item 2: Notify Customer of SO
router.post('/:id/notify-customer', authMiddleware, orderController.notifyCustomer);

// Update general order status
router.put('/:id', authMiddleware, checkPermission(['manage_quotations']), orderController.updateOrderStatus);

module.exports = router;
