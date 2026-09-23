const express = require('express');
const router = express.Router();
const branchController = require('../controllers/branchController');
const { authMiddleware, checkPermission } = require('../middleware/authMiddleware');

// Branch Outlets Registry
router.get('/', authMiddleware, branchController.listBranches);
router.post('/', authMiddleware, checkPermission(['manage_system']), branchController.createBranch);
router.put('/:id', authMiddleware, checkPermission(['manage_system']), branchController.updateBranch);

// Branch User Accounts & Login Credentials
router.get('/users/:branchId', authMiddleware, branchController.listBranchUsers);
router.post('/users', authMiddleware, checkPermission(['manage_system']), branchController.createBranchUser);

// Branch-Specific Stock & Inventory
router.get('/inventory/:branchId', authMiddleware, branchController.getBranchInventory);
router.post('/inventory/adjust', authMiddleware, branchController.adjustBranchInventory);

// Inter-Branch Stock Transfers (Restricted to Branch Manager with branch_transfers & Admin)
router.get('/transfers', authMiddleware, checkPermission(['branch_transfers', 'manage_system']), branchController.listStockTransfers);
router.post('/transfers', authMiddleware, checkPermission(['branch_transfers', 'manage_system']), branchController.createStockTransfer);
router.put('/transfers/:id/status', authMiddleware, checkPermission(['branch_transfers', 'manage_system']), branchController.updateTransferStatus);

// Legacy Stock Summary & Purchase Batch
router.get('/:branchId/stock-summary', authMiddleware, branchController.getBranchStockSummary);
router.post('/purchase-batch', authMiddleware, branchController.createPurchaseBatch);

module.exports = router;
