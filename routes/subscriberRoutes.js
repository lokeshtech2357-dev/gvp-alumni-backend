const express = require('express');
const router = express.Router();
const controller = require('../controllers/subscriberController');
const auth = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');

// public subscription endpoint
router.post('/', controller.createSubscriber);

// admin endpoints
router.get('/admin/all', auth, requireRole('admin', 'manager', 'super-admin'), controller.getAllSubscribers);
router.delete('/:id', auth, requireRole('admin', 'manager', 'super-admin'), controller.deleteSubscriber);

module.exports = router;
