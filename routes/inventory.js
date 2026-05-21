const express = require('express');
const router = express.Router();
const inventoryController = require('../controllers/inventoryController');
const { authMiddleware, checkPermission } = require('../middleware/authMiddleware');

// All inventory routes require auth
router.use(authMiddleware);

// Admin-only permission check helper for mutations
const requireAdmin = checkPermission(['manage_system']);

// Fabrics
router.get('/fabrics', inventoryController.fabrics.list);
router.post('/fabrics', requireAdmin, inventoryController.fabrics.create);
router.put('/fabrics/:id', requireAdmin, inventoryController.fabrics.update);
router.delete('/fabrics/:id', requireAdmin, inventoryController.fabrics.delete);

// Buttons
router.get('/buttons', inventoryController.buttons.list);
router.post('/buttons', requireAdmin, inventoryController.buttons.create);
router.put('/buttons/:id', requireAdmin, inventoryController.buttons.update);
router.delete('/buttons/:id', requireAdmin, inventoryController.buttons.delete);

// Threads
router.get('/threads', inventoryController.threads.list);
router.post('/threads', requireAdmin, inventoryController.threads.create);
router.put('/threads/:id', requireAdmin, inventoryController.threads.update);
router.delete('/threads/:id', requireAdmin, inventoryController.threads.delete);

const designController = require('../controllers/designController');

// Designs
router.get('/designs/next-code', designController.getNextCode);
router.get('/designs', designController.listDesigns);
router.post('/designs', requireAdmin, designController.createDesign);
router.put('/designs/:id', requireAdmin, designController.updateDesign);
router.delete('/designs/:id', requireAdmin, designController.deleteDesign);

module.exports = router;
