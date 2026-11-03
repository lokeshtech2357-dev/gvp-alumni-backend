const express = require('express');
const router = express.Router();
const controller = require('../controllers/notificationController');
const auth = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');

router.get('/', controller.getNotifications);
router.post('/', auth, requireRole('admin', 'manager', 'super-admin'), controller.createNotification);
router.put('/:id', auth, requireRole('admin', 'manager', 'super-admin'), controller.updateNotification);
router.delete('/:id', auth, requireRole('admin', 'manager', 'super-admin'), controller.deleteNotification);

module.exports = router;
