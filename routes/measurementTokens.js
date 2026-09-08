const express = require('express');
const router = express.Router();
const measurementTokenController = require('../controllers/measurementTokenController');
const { authMiddleware } = require('../middleware/authMiddleware');

router.post('/', authMiddleware, measurementTokenController.createToken);
router.get('/', authMiddleware, measurementTokenController.lookupTokens);

module.exports = router;
