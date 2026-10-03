const express = require('express');
const router = express.Router();
const invoiceController = require('../controllers/invoiceController');
const { authMiddleware } = require('../middleware/authMiddleware');

router.get('/', authMiddleware, invoiceController.listInvoices);
router.post('/', authMiddleware, invoiceController.createInvoice);
router.put('/:id', authMiddleware, invoiceController.updateInvoice);
router.delete('/:id', authMiddleware, invoiceController.deleteInvoice);

module.exports = router;
