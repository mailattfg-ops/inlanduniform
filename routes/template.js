const express = require('express');
const router = express.Router();
const templateController = require('../controllers/templateController');
const { authMiddleware, checkPermission } = require('../middleware/authMiddleware');

router.use(authMiddleware);

router.get('/', templateController.listTemplates);
router.post('/', checkPermission('manage_measurements'), templateController.createTemplate);
router.put('/:id', checkPermission('manage_measurements'), templateController.updateTemplate);
router.delete('/:id', checkPermission('manage_measurements'), templateController.deleteTemplate);

module.exports = router;
