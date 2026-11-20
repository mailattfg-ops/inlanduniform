const express = require('express');
const router = express.Router();
const controller = require('../controllers/artNumberHubController');
const { authMiddleware, checkPermission } = require('../middleware/authMiddleware');

// --- ITEMS (MASTER GARMENT ITEMS) ---
router.get('/items', controller.listItems);
router.post('/items', authMiddleware, checkPermission(['manage_products']), controller.createItem);
router.put('/items/:id', authMiddleware, checkPermission(['manage_products']), controller.updateItem);
router.delete('/items/:id', authMiddleware, checkPermission(['manage_products']), controller.deleteItem);

// --- SPECIFICATIONS (ITEM SPECIFICATIONS) ---
router.get('/specifications', controller.listSpecifications);
router.post('/specifications', authMiddleware, checkPermission(['manage_products']), controller.createSpecification);
router.put('/specifications/:id', authMiddleware, checkPermission(['manage_products']), controller.updateSpecification);
router.delete('/specifications/:id', authMiddleware, checkPermission(['manage_products']), controller.deleteSpecification);

// Nested routes for Item Specifications
router.get('/items/:itemId/specifications', controller.listSpecifications);
router.post('/items/:itemId/specifications', authMiddleware, checkPermission(['manage_products']), controller.createSpecification);
router.put('/items/:itemId/specifications/:specId', authMiddleware, checkPermission(['manage_products']), controller.updateSpecification);
router.delete('/items/:itemId/specifications/:specId', authMiddleware, checkPermission(['manage_products']), controller.deleteSpecification);

// --- LEGACY DRESS PREFIXES (Backwards Compatibility) ---
router.get('/dresses', controller.listDresses);
router.post('/dresses', authMiddleware, checkPermission(['manage_products']), controller.createDress);
router.put('/dresses/:id', authMiddleware, checkPermission(['manage_products']), controller.updateDress);
router.delete('/dresses/:id', authMiddleware, checkPermission(['manage_products']), controller.deleteDress);

// --- GENDER CODES ---
router.get('/genders', controller.listGenders);
router.post('/genders', authMiddleware, checkPermission(['manage_products']), controller.createGender);
router.put('/genders/:id', authMiddleware, checkPermission(['manage_products']), controller.updateGender);
router.delete('/genders/:id', authMiddleware, checkPermission(['manage_products']), controller.deleteGender);

// --- PATTERN CODES ---
router.get('/patterns/next', controller.getNextPatternCode);
router.get('/patterns', controller.listPatterns);
router.post('/patterns', authMiddleware, checkPermission(['manage_products']), controller.createPattern);
router.put('/patterns/:id', authMiddleware, checkPermission(['manage_products']), controller.updatePattern);
router.delete('/patterns/:id', authMiddleware, checkPermission(['manage_products']), controller.deletePattern);

// --- FITS MASTER ---
router.get('/fits', controller.listFits);
router.post('/fits', authMiddleware, checkPermission(['manage_products']), controller.createFit);
router.put('/fits/:id', authMiddleware, checkPermission(['manage_products']), controller.updateFit);
router.delete('/fits/:id', authMiddleware, checkPermission(['manage_products']), controller.deleteFit);

// --- COMBINED MASTER DATA ---
router.get('/master-data', controller.getMasterData);

// --- COMBINED ART NUMBERS ---
router.get('/art-numbers', controller.listArtNumbers);
router.post('/art-numbers', authMiddleware, checkPermission(['manage_products']), controller.createArtNumber);
router.delete('/art-numbers/:id', authMiddleware, checkPermission(['manage_products']), controller.deleteArtNumber);

module.exports = router;
