const express = require('express');
const router = express.Router();
const zoneController = require('../controllers/zoneController');
const { authMiddleware, checkPermission } = require('../middleware/authMiddleware');

// Public/authenticated zones listing
router.get('/', zoneController.listZones);
router.post('/', authMiddleware, zoneController.createZone);
router.put('/:id', authMiddleware, zoneController.updateZone);
router.delete('/:id', authMiddleware, zoneController.deleteZone);

// Migration helper endpoint
router.post('/migrate', authMiddleware, zoneController.applyMigration);

module.exports = router;
