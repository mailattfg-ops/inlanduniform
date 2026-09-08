const express = require('express');
const router = express.Router();
const branchController = require('../controllers/branchController');
const { authMiddleware } = require('../middleware/authMiddleware');

// Branch Outlets Registry
router.get('/', authMiddleware, branchController.listBranches);
router.post('/', authMiddleware, branchController.createBranch);
router.put('/:id', authMiddleware, branchController.updateBranch);

// Branch User Accounts & Login Credentials
router.get('/users/:branchId', authMiddleware, branchController.listBranchUsers);
router.post('/users', authMiddleware, branchController.createBranchUser);

// Branch-Specific Stock & Inventory
router.get('/inventory/:branchId', authMiddleware, branchController.getBranchInventory);
router.post('/inventory/adjust', authMiddleware, branchController.adjustBranchInventory);

// Inter-Branch Stock Transfers
router.get('/transfers', authMiddleware, branchController.listStockTransfers);
router.post('/transfers', authMiddleware, branchController.createStockTransfer);
router.put('/transfers/:id/status', authMiddleware, branchController.updateTransferStatus);

// Legacy Stock Summary & Purchase Batch
router.get('/:branchId/stock-summary', authMiddleware, branchController.getBranchStockSummary);
router.post('/purchase-batch', authMiddleware, branchController.createPurchaseBatch);

module.exports = router;
