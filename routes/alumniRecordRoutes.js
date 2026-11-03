const express = require('express');
const auth = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');
const controller = require('../controllers/alumniRecordController');

const router = express.Router();
const admin = requireRole('admin', 'manager', 'super-admin');

router.get('/me', auth, requireRole('alumni'), controller.getMyProfile);
router.put('/me', auth, requireRole('alumni'), controller.saveMyProfile);
router.post('/me/photo', auth, requireRole('alumni'), controller.uploadMyPhoto);

router.get('/summary', auth, requireRole('alumni', 'admin', 'editor', 'manager', 'super-admin'), controller.getAdminSummary);
router.get('/admin/summary', auth, admin, controller.getAdminSummary);
router.get('/admin/export', auth, admin, controller.exportAdminRecords);
router.get('/admin', auth, admin, controller.searchAdminRecords);
router.put('/admin/:id', auth, admin, controller.updateAdminRecord);
router.delete('/admin/:id', auth, admin, controller.deleteAdminRecord);

module.exports = router;
