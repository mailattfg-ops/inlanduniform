const express = require('express');
const router = express.Router();
const sizeChartController = require('../controllers/sizeChartController');
const { authMiddleware } = require('../middleware/authMiddleware');

router.get('/', authMiddleware, sizeChartController.listSizeCharts);
router.post('/', authMiddleware, sizeChartController.createSizeChart);
router.put('/:id', authMiddleware, sizeChartController.updateSizeChart);
router.delete('/:id', authMiddleware, sizeChartController.deleteSizeChart);

module.exports = router;
