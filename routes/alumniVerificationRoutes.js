const express = require('express');
const multer = require('multer');
const auth = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');
const rateLimit = require('../middleware/verificationRateLimit');
const { adminImportRateLimit } = rateLimit;
const controller = require('../controllers/alumniVerificationController');
const adminController = require('../controllers/officialAlumniAdminController');

const router = express.Router();
const admin = [auth, requireRole('admin', 'manager', 'super-admin')];
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, callback) => {
    if (!/\.(xlsx|xls|csv)$/i.test(file.originalname)) return callback(new Error('Only .xlsx, .xls, and .csv files are supported.'));
    callback(null, true);
  },
});

router.get('/courses', controller.listCourses);
router.get('/years', controller.listYears);
router.post('/requests', rateLimit, controller.requestVerification);
router.post('/requests/status', controller.getVerificationStatus);
router.post('/requests/cancel', controller.cancelVerificationRequest);
router.post('/register', rateLimit, controller.registerVerifiedAlumni);
router.get('/me', auth, requireRole('alumni'), controller.getMyOfficialRecord);
router.get('/admin/requests', ...admin, controller.listVerificationRequests);
router.post('/admin/requests/:id/approve', ...admin, controller.approveVerificationRequest);
router.post('/admin/requests/:id/reject', ...admin, controller.rejectVerificationRequest);
router.post('/admin/import/preview', ...admin, adminImportRateLimit, upload.single('file'), controller.previewImport);
router.post('/admin/import', ...admin, adminImportRateLimit, upload.single('file'), controller.importWorkbook);
router.get('/admin/records/fields', ...admin, adminController.listAvailableFields);
router.get('/admin/records/export', ...admin, adminController.exportRecords);
router.get('/admin/records', ...admin, adminController.listRecords);
router.post('/admin/records', ...admin, adminController.createRecord);
router.get('/admin/records/:id/audit', ...admin, adminController.listRecordAudits);
router.get('/admin/records/:id', ...admin, adminController.getRecord);
router.put('/admin/records/:id', ...admin, adminController.updateRecord);
router.delete('/admin/records/:id', ...admin, adminController.archiveRecord);
router.get('/admin/batches', ...admin, adminController.listBatches);
router.post('/admin/batches/archive-impact', ...admin, adminController.getBatchArchiveImpact);
router.post('/admin/batches/archive', ...admin, adminController.archiveBatch);
router.get('/admin/imports', ...admin, adminController.listImports);
router.get('/admin/imports/:id/errors', ...admin, adminController.downloadImportErrors);
router.get('/admin/imports/:id/archive-impact', ...admin, adminController.getImportArchiveImpact);
router.post('/admin/imports/:id/archive', ...admin, adminController.archiveImport);

router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) return res.status(400).json({ message: 'The workbook must be no larger than 4 MB.' });
  if (error) return res.status(400).json({ message: error.message || 'Unable to process the upload.' });
  return next();
});

module.exports = router;