const express = require('express');
const router = express.Router();
const alumniStackController = require('../controllers/alumniStackController');
const auth = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');

// Public routes
router.get('/', alumniStackController.getAllAlumniStack);
router.get('/:id', alumniStackController.getAlumniStackById);

// Admin protected routes
router.get('/admin/all', auth, requireRole('admin', 'manager', 'super-admin'), alumniStackController.getAllAlumniStackAdmin);
router.post('/', auth, requireRole('admin', 'manager', 'super-admin'), alumniStackController.createAlumniStack);
router.put('/:id', auth, requireRole('admin', 'manager', 'super-admin'), alumniStackController.updateAlumniStack);
router.delete('/:id', auth, requireRole('admin', 'manager', 'super-admin'), alumniStackController.deleteAlumniStack);
router.delete('/:id/hard', auth, requireRole('admin', 'manager', 'super-admin'), alumniStackController.hardDeleteAlumniStack);

module.exports = router;
