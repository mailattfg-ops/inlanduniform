const express = require('express');
const router = express.Router();
const organizationController = require('../controllers/organizationController');
const { authMiddleware, checkPermission } = require('../middleware/authMiddleware');

router.use(authMiddleware);

// Organization management
router.get('/', checkPermission(['manage_schools']), organizationController.getOrganizations);
router.post('/', checkPermission(['manage_schools']), organizationController.createOrganization);
router.put('/:id', checkPermission(['manage_schools']), organizationController.updateOrganization);
router.delete('/:id', checkPermission(['manage_schools']), organizationController.deleteOrganization);
router.post('/:id/reset-password', checkPermission(['manage_schools']), organizationController.resetPassword);

module.exports = router;
