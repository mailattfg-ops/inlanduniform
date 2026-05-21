const express = require('express');
const router = express.Router();
const productTypeController = require('../controllers/productTypeController');
const { authMiddleware, checkPermission } = require('../middleware/authMiddleware');

router.get('/', productTypeController.listProductTypes);
router.post('/', authMiddleware, checkPermission(['manage_products']), productTypeController.createProductType);
router.put('/:id', authMiddleware, checkPermission(['manage_products']), productTypeController.updateProductType);
router.delete('/:id', authMiddleware, checkPermission(['manage_products']), productTypeController.deleteProductType);

module.exports = router;
