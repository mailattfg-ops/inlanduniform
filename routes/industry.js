const express = require('express');
const router = express.Router();
const industryController = require('../controllers/industryController');
const { authMiddleware, checkPermission } = require('../middleware/authMiddleware');

router.get('/', industryController.listIndustries);
router.post('/', authMiddleware, checkPermission(['manage_schools']), industryController.createIndustry);
router.put('/:id', authMiddleware, checkPermission(['manage_schools']), industryController.updateIndustry);
router.delete('/:id', authMiddleware, checkPermission(['manage_schools']), industryController.deleteIndustry);

module.exports = router;
