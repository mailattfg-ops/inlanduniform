const express = require('express');
const router = express.Router();
const staffMeasurementController = require('../controllers/staffMeasurementController');
const { authMiddleware, checkPermission } = require('../middleware/authMiddleware');

router.use(authMiddleware);

// Fetch measurements by staff ID (employee_id) and organization_id
router.get('/:organization_id/staff/:employee_id', staffMeasurementController.getMeasurements);

// Create or Update measurements
router.put('/:organization_id/staff/:employee_id', checkPermission(['manage_schools', 'manage_staff_measurements']), staffMeasurementController.upsertMeasurements);

module.exports = router;
