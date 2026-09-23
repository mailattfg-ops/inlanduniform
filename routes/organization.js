const express = require('express');
const router = express.Router();
const organizationController = require('../controllers/organizationController');
const { authMiddleware, checkPermission } = require('../middleware/authMiddleware');

router.use(authMiddleware);

// Organization management
router.get('/', (req, res, next) => {
  const role = (req.user?.role || '').toLowerCase();
  if (['organisation', 'organization', 'school', 'entity', 'student', 'member'].includes(role) || req.user?.organizationId) {
    return next();
  }
  return checkPermission(['manage_schools', 'view_schools'])(req, res, next);
}, organizationController.getOrganizations);

router.get('/:id/details', (req, res, next) => {
  if (req.user?.organizationId && String(req.user.organizationId) === String(req.params.id)) {
    return next();
  }
  return checkPermission(['manage_schools', 'view_schools'])(req, res, next);
}, organizationController.getOrganizationDetails);

router.get('/:id/ledger', (req, res, next) => {
  const role = (req.user?.role || '').toLowerCase();
  // Individual entity members are strictly blocked from financial ledgers
  if (req.user?.memberId || ['entity', 'student', 'member'].includes(role)) {
    return res.status(403).json({ error: 'Access Denied: Individual members cannot view organization financial ledgers.' });
  }

  if (req.user?.organizationId && String(req.user.organizationId) === String(req.params.id)) {
    return next();
  }
  return checkPermission(['manage_schools', 'view_schools', 'branch_sales'])(req, res, next);
}, organizationController.getOrganizationLedger);

router.get('/:id/staff', (req, res, next) => {
  if (req.user?.organizationId && String(req.user.organizationId) === String(req.params.id)) {
    return next();
  }
  return checkPermission(['manage_schools', 'view_schools'])(req, res, next);
}, organizationController.getAssignedStaff);
router.post('/:id/staff', checkPermission(['manage_schools']), organizationController.assignStaff);
router.post('/', checkPermission(['manage_schools']), organizationController.createOrganization);
router.put('/:id', checkPermission(['manage_schools']), organizationController.updateOrganization);
router.delete('/:id', checkPermission(['manage_schools']), organizationController.deleteOrganization);
router.post('/:id/reset-password', checkPermission(['manage_schools']), organizationController.resetPassword);

module.exports = router;
