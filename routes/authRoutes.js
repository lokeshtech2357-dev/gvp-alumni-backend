const express = require("express");
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');
const { register, login, loginUser, loginWithGoogleUser, loginWithGoogleAdmin, getDashboard, requestPasswordReset, resetPassword, logout } = require("../controllers/authController");
const { getCurrentUser } = require("../controllers/authController");

router.post("/register", register);
router.post("/login", login);
router.post("/user/login", loginUser);
router.post("/user/forgot-password", requestPasswordReset);
router.post("/user/reset-password", resetPassword);
router.post("/logout", auth, logout);
router.post("/google/user", loginWithGoogleUser);
router.post("/google/admin", loginWithGoogleAdmin);
router.get('/me', auth, getCurrentUser);
router.get('/dashboard', auth, requireRole('admin', 'editor', 'manager', 'super-admin'), getDashboard);

module.exports = router;