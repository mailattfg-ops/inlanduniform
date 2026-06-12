const express = require('express');
const router = express.Router();
const leadController = require('../controllers/leadController');
const { authMiddleware, checkPermission } = require('../middleware/authMiddleware');

// All leads routes require auth
router.use(authMiddleware);

// Permissive endpoints for staff/admin users
router.get('/', leadController.list);
router.get('/:id', leadController.getDetails);
router.post('/', leadController.create);
router.put('/:id', leadController.update);
router.delete('/:id', leadController.delete);
router.post('/:id/convert', leadController.convertLeadToCustomer);

module.exports = router;
