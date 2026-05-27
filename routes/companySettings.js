const express = require('express');
const router = express.Router();
const companySettingsController = require('../controllers/companySettingsController');
const { authMiddleware, checkPermission } = require('../middleware/authMiddleware');

router.use(authMiddleware);

router.get('/', companySettingsController.getSettings);
router.put('/', checkPermission(['manage_schools']), companySettingsController.updateSettings);

module.exports = router;
