const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const { authMiddleware } = require('../middleware/authMiddleware');

// The signed-in user's own in-app notifications (bell)
router.use(authMiddleware);
router.get('/', notificationController.list);
router.get('/unread-count', notificationController.unreadCount);
router.put('/read-all', notificationController.markAllRead);
router.put('/:id/read', notificationController.markRead);

module.exports = router;
