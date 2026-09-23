const express = require('express');
const router = express.Router();
const memberController = require('../controllers/memberController');
const { authMiddleware, checkPermission } = require('../middleware/authMiddleware');

// All student routes require basic authentication
router.use(authMiddleware);

// Specific permission checks
router.get('/', (req, res, next) => {
  const role = (req.user?.role || '').toLowerCase();
  if (req.user?.memberId || req.user?.organizationId || ['entity', 'student', 'member', 'organisation', 'organization', 'school'].includes(role)) {
    return next();
  }
  return checkPermission(['view_students', 'view_own_students'])(req, res, next);
}, memberController.listStudents);

// Mutation blocker for individual entity members
const blockEntityMutations = (req, res, next) => {
  const role = (req.user?.role || '').toLowerCase();
  if (req.user?.memberId || ['entity', 'student', 'member'].includes(role)) {
    return res.status(403).json({ error: 'Access Denied: Individual members cannot modify registry data.' });
  }
  next();
};

router.post('/register', blockEntityMutations, checkPermission(['register_students', 'view_own_students']), memberController.createStudent);
router.post('/bulk-register', blockEntityMutations, checkPermission(['register_students', 'view_own_students']), memberController.bulkCreateStudents);
router.put('/:id', blockEntityMutations, checkPermission(['register_students', 'view_own_students']), memberController.updateStudent);

// Strict management permissions
router.delete('/:id', blockEntityMutations, checkPermission(['manage_students', 'view_own_students']), memberController.deleteStudent);
router.post('/:id/reset-password', blockEntityMutations, checkPermission(['manage_students', 'view_own_students']), memberController.resetPassword);
router.post('/:id/sync-username', blockEntityMutations, checkPermission(['manage_students', 'view_own_students']), memberController.syncUsername);

module.exports = router;
