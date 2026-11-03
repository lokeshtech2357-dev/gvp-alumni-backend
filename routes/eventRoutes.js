const express = require('express');
const router = express.Router();
const eventController = require('../controllers/eventController');
const auth = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');

// Public routes
router.get('/', eventController.getAllEvents);
router.get('/:id', eventController.getEventById);
router.post('/:id/register', eventController.registerForEvent);

// Admin protected routes
router.get('/admin/all', auth, requireRole('admin', 'manager', 'super-admin'), eventController.getAllEventsAdmin);
router.get('/:id/registrations', auth, requireRole('admin', 'manager', 'super-admin'), eventController.getEventRegistrations);
router.post('/', auth, requireRole('admin', 'manager', 'super-admin'), eventController.createEvent);
router.put('/:id', auth, requireRole('admin', 'manager', 'super-admin'), eventController.updateEvent);
router.delete('/:id', auth, requireRole('admin', 'manager', 'super-admin'), eventController.deleteEvent);
router.delete('/:id/hard', auth, requireRole('admin', 'manager', 'super-admin'), eventController.hardDeleteEvent);

module.exports = router;
