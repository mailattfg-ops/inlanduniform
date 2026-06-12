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

// Update order status
router.put('/:id', authMiddleware, checkPermission(['manage_quotations']), orderController.updateOrderStatus);

module.exports = router;
