const express = require('express');
const router = express.Router();
const inventoryController = require('../controllers/inventoryController');
const { authMiddleware, checkPermission } = require('../middleware/authMiddleware');

// All inventory routes require admin permissions
router.use(authMiddleware);
router.use(checkPermission(['manage_system']));

// Fabrics
router.get('/fabrics', inventoryController.fabrics.list);
router.post('/fabrics', inventoryController.fabrics.create);
router.put('/fabrics/:id', inventoryController.fabrics.update);
router.delete('/fabrics/:id', inventoryController.fabrics.delete);

// Buttons
router.get('/buttons', inventoryController.buttons.list);
router.post('/buttons', inventoryController.buttons.create);
router.put('/buttons/:id', inventoryController.buttons.update);
router.delete('/buttons/:id', inventoryController.buttons.delete);

// Threads
router.get('/threads', inventoryController.threads.list);
router.post('/threads', inventoryController.threads.create);
router.put('/threads/:id', inventoryController.threads.update);
router.delete('/threads/:id', inventoryController.threads.delete);

const designController = require('../controllers/designController');

// Designs
router.get('/designs', designController.listDesigns);
router.post('/designs', designController.createDesign);
router.put('/designs/:id', designController.updateDesign);
router.delete('/designs/:id', designController.deleteDesign);

module.exports = router;
