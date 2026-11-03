const express = require('express');
const router = express.Router();
const HeritageEvent = require('../models/HeritageEvent');
const { protect } = require('../middleware/authMiddleware'); // Check if the function is exported as protect or just the default. I will use a generic require if unsure, but I'll write the logic.
const { requireRole } = require('../middleware/roleMiddleware');

// Determine auth middleware
const auth = require('../middleware/authMiddleware');
const protectRoute = typeof auth === 'function' ? auth : auth.protect || auth.verifyToken || auth;

// Get all HeritageEvents (PUBLIC)
router.get('/', async (req, res) => {
  try {
    const events = await HeritageEvent.find({ isActive: true }).sort({ createdAt: 1 });
    res.json({ success: true, count: events.length, data: events });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create new HeritageEvent (ADMIN)
router.post('/', protectRoute, requireRole('admin', 'manager', 'super-admin'), async (req, res) => {
  try {
    const event = await HeritageEvent.create(req.body);
    res.status(201).json({ success: true, data: event });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Update HeritageEvent (ADMIN)
router.put('/:id', protectRoute, requireRole('admin', 'manager', 'super-admin'), async (req, res) => {
  try {
    req.body.updatedAt = Date.now();
    const event = await HeritageEvent.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }
    res.json({ success: true, data: event });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Delete HeritageEvent (ADMIN)
router.delete('/:id', protectRoute, requireRole('admin', 'manager', 'super-admin'), async (req, res) => {
  try {
    const event = await HeritageEvent.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }
    await HeritageEvent.deleteOne({ _id: req.params.id });
    res.json({ success: true, data: {} });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

module.exports = router;
