const express = require('express');
const router = express.Router();
const samController = require('../controllers/samManagementController');
const { authMiddleware, checkPermission } = require('../middleware/authMiddleware');

// Configurations CRUD
router.get('/configurations', authMiddleware, samController.listConfigurations);
router.post('/configurations', authMiddleware, checkPermission(['manage_products', 'manage_system']), samController.createConfiguration);
router.put('/configurations/:id', authMiddleware, checkPermission(['manage_products', 'manage_system']), samController.updateConfiguration);
router.delete('/configurations/:id', authMiddleware, checkPermission(['manage_products', 'manage_system']), samController.deleteConfiguration);

// Calculation Engine
router.post('/calculate', authMiddleware, samController.calculateSAM);
router.get('/calculations/history', authMiddleware, samController.getHistory);

// Reports
router.get('/reports/product-wise', authMiddleware, samController.getProductWiseReport);
router.get('/reports/slab-analysis', authMiddleware, samController.getSlabAnalysis);
router.get('/reports/comparison', authMiddleware, samController.getComparisonReport);

// Audits
router.get('/audit-logs', authMiddleware, checkPermission(['view_audit_logs', 'manage_system']), samController.getAuditLogs);

// Fabric SAM - Inward Transportation
router.get('/fabric/inward-transportation', authMiddleware, samController.listInwardTransportation);
router.post('/fabric/inward-transportation', authMiddleware, checkPermission(['manage_products', 'manage_system']), samController.createInwardTransportation);
router.put('/fabric/inward-transportation/:id', authMiddleware, checkPermission(['manage_products', 'manage_system']), samController.updateInwardTransportation);
router.delete('/fabric/inward-transportation/:id', authMiddleware, checkPermission(['manage_products', 'manage_system']), samController.deleteInwardTransportation);

// Fabric SAM - Margin Calculations
router.get('/fabric/margins', authMiddleware, samController.listMargins);
router.post('/fabric/margins', authMiddleware, checkPermission(['manage_products', 'manage_system']), samController.createMargin);
router.put('/fabric/margins/:id', authMiddleware, checkPermission(['manage_products', 'manage_system']), samController.updateMargin);
router.delete('/fabric/margins/:id', authMiddleware, checkPermission(['manage_products', 'manage_system']), samController.deleteMargin);

module.exports = router;
