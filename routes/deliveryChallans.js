const express = require('express');
const router = express.Router();
const deliveryChallanController = require('../controllers/deliveryChallanController');
const { authMiddleware } = require('../middleware/authMiddleware');

router.post('/', authMiddleware, deliveryChallanController.createDeliveryChallan);
router.get('/:id', authMiddleware, deliveryChallanController.getDeliveryChallanDetails);

module.exports = router;
