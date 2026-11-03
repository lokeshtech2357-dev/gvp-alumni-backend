const express = require('express');
const router = express.Router();
const alumniStoryController = require('../controllers/alumniStoryController');
const auth = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');

router.get('/', alumniStoryController.getAllStories);
router.get('/admin/all', auth, requireRole('admin', 'editor', 'manager', 'super-admin'), alumniStoryController.getAllStoriesAdmin);
router.post('/', auth, requireRole('admin', 'editor', 'manager', 'super-admin'), alumniStoryController.createStory);
router.put('/:id', auth, requireRole('admin', 'editor', 'manager', 'super-admin'), alumniStoryController.updateStory);
router.delete('/:id', auth, requireRole('admin', 'editor', 'manager', 'super-admin'), alumniStoryController.deleteStory);
router.delete('/:id/hard', auth, requireRole('admin', 'editor', 'manager', 'super-admin'), alumniStoryController.hardDeleteStory);

module.exports = router;
