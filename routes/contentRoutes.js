const express = require('express');
const router = express.Router();
const contentController = require('../controllers/contentController');
const auth = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');

router.get('/', contentController.getAllSections);
router.get('/:sectionId', contentController.getSection);
router.put('/:sectionId', auth, requireRole('admin', 'editor', 'manager', 'super-admin'), contentController.updateSection);

module.exports = router;
