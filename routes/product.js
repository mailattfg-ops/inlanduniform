const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const { authMiddleware, checkPermission } = require('../middleware/authMiddleware');

router.use(authMiddleware);

router.get('/', productController.listProducts);
router.get('/next-design-number', productController.getNextDesignNumber);
router.post('/', checkPermission('manage_system'), productController.createProduct);
router.put('/:id', checkPermission('manage_system'), productController.updateProduct);
router.delete('/:id', checkPermission('manage_system'), productController.deleteProduct);

module.exports = router;
