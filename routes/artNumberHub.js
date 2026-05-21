const express = require('express');
const router = express.Router();
const controller = require('../controllers/artNumberHubController');
const { authMiddleware, checkPermission } = require('../middleware/authMiddleware');

// --- DRESS PREFIXES ---
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
router.get('/patterns', controller.listPatterns);
router.post('/patterns', authMiddleware, checkPermission(['manage_products']), controller.createPattern);
router.put('/patterns/:id', authMiddleware, checkPermission(['manage_products']), controller.updatePattern);
router.delete('/patterns/:id', authMiddleware, checkPermission(['manage_products']), controller.deletePattern);

// --- COMBINED ART NUMBERS ---
router.get('/art-numbers', controller.listArtNumbers);
router.post('/art-numbers', authMiddleware, checkPermission(['manage_products']), controller.createArtNumber);
router.delete('/art-numbers/:id', authMiddleware, checkPermission(['manage_products']), controller.deleteArtNumber);

module.exports = router;
