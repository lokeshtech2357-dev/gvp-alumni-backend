const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');
const controller = require('../controllers/userController');

router.get('/', auth, requireRole('admin', 'super-admin'), controller.getUsers);
router.post('/', auth, requireRole('admin', 'super-admin'), controller.createUser);
router.put('/:id', auth, requireRole('admin', 'super-admin'), controller.updateUser);
router.delete('/:id', auth, requireRole('admin', 'super-admin'), controller.deleteUser);
router.get('/password-accounts', auth, requireRole('admin', 'super-admin'), controller.getPasswordAccounts);
router.post('/password-accounts', auth, requireRole('admin', 'super-admin'), controller.createPasswordAccount);
router.put('/password-accounts/:id', auth, requireRole('admin', 'super-admin'), controller.updatePasswordAccount);
router.delete('/password-accounts/:id', auth, requireRole('admin', 'super-admin'), controller.deletePasswordAccount);

module.exports = router;
