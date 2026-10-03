const express = require('express');
const router = express.Router();
const jobCardController = require('../controllers/jobCardController');
const { authMiddleware, checkPermission } = require('../middleware/authMiddleware');

// Broader read permissions: Admin, PO Handler, Factory Floor, Branch Manager, Production Coordinator
const readPerms = ['manage_system', 'factory_po_handler', 'factory_floor', 'manage_products', 'branch_sales', 'branch_inventory'];
// Write permissions: Admin and factory roles
const writePerms = ['manage_system', 'factory_po_handler', 'factory_floor', 'manage_products'];

router.get('/eligible-orders', authMiddleware, checkPermission(readPerms), jobCardController.getEligibleOrdersForJobCards);
router.get('/sub-cards', authMiddleware, checkPermission(readPerms), jobCardController.listSubJobCards);

// Piece-level Child Job Cards & Barcode routes
router.get('/child/scan/:barcode', authMiddleware, checkPermission(readPerms), jobCardController.scanChildBarcode);
router.put('/child/:id/status', authMiddleware, checkPermission(writePerms), jobCardController.updateChildCardStatus);
router.get('/:id/child-cards', authMiddleware, checkPermission(readPerms), jobCardController.getChildJobCards);
router.post('/:id/generate-child-cards', authMiddleware, checkPermission(writePerms), jobCardController.generateChildCardsEndpoint);
router.get('/:id/required-fabrics', authMiddleware, checkPermission(readPerms), jobCardController.getRequiredFabricsForJobCard);

router.get('/', authMiddleware, checkPermission(readPerms), jobCardController.listJobCards);
router.post('/raise', authMiddleware, checkPermission(['manage_system', 'factory_po_handler']), jobCardController.createJobCardFromOrder);
router.put('/:id/po-handler-action', authMiddleware, checkPermission(['manage_system', 'factory_po_handler']), jobCardController.poHandlerAction);
router.post('/sub-card', authMiddleware, checkPermission(writePerms), jobCardController.createSubJobCard);
router.put('/sub-card/:id/stage', authMiddleware, checkPermission(writePerms), jobCardController.updateSubJobCardStage);
router.delete('/sub-card/:id', authMiddleware, checkPermission(writePerms), jobCardController.deleteSubJobCard);
router.post('/fabric-consumption', authMiddleware, checkPermission(writePerms), jobCardController.logFabricConsumption);

module.exports = router;
