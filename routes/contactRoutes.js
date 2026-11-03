const express = require('express');
const router = express.Router();
const contactController = require('../controllers/contactController');
const auth = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');

// Public routes
router.get('/', contactController.getAllContacts);
router.get('/:id', contactController.getContactById);
router.post('/', contactController.createContact); // Public: anyone can submit

// Admin protected routes
router.get('/admin/all', auth, requireRole('admin', 'manager', 'super-admin'), contactController.getAllContactsAdmin);
router.put('/:id', auth, requireRole('admin', 'manager', 'super-admin'), contactController.updateContact);
router.delete('/:id', auth, requireRole('admin', 'manager', 'super-admin'), contactController.deleteContact);
router.delete('/:id/hard', auth, requireRole('admin', 'manager', 'super-admin'), contactController.hardDeleteContact);

module.exports = router;
