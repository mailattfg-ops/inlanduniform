const express = require('express');
const router = express.Router();
const jobCardController = require('../controllers/jobCardController');
const { authMiddleware } = require('../middleware/authMiddleware');

router.get('/', authMiddleware, jobCardController.listJobCards);
router.post('/raise', authMiddleware, jobCardController.createJobCardFromOrder);
router.put('/:id/po-handler-action', authMiddleware, jobCardController.poHandlerAction);
router.post('/sub-card', authMiddleware, jobCardController.createSubJobCard);
router.put('/sub-card/:id/stage', authMiddleware, jobCardController.updateSubJobCardStage);
router.post('/fabric-consumption', authMiddleware, jobCardController.logFabricConsumption);

module.exports = router;
