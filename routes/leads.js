const express = require('express');
const router = express.Router();
const leadController = require('../controllers/leadController');
const { authMiddleware } = require('../middleware/authMiddleware');

// All leads routes require auth
router.use(authMiddleware);

// Permissive endpoints for staff/admin users
router.get('/', leadController.list);
router.post('/feed', leadController.createFeed);
router.get('/:id', leadController.getDetails);
router.post('/', leadController.create);
router.put('/:id', leadController.update);
router.delete('/:id', leadController.delete);

// Stage and Assignment Workflow Endpoints
router.post('/:id/assign-branch', leadController.assignBranch);
router.post('/:id/assign-staff', leadController.assignStaff);
router.post('/:id/activity', leadController.logActivity);
router.get('/:id/activities', leadController.getActivities);
router.get('/:id/stage-history', leadController.getStageHistory);

// Conversion & Legacy Endpoints
router.post('/:id/convert', leadController.convertLeadToCustomer);
router.post('/:id/remarks', leadController.addRemark);
router.post('/:id/contact-log', leadController.logContactOutcome);

module.exports = router;
