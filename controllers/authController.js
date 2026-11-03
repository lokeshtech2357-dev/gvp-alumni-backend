const User = require("../models/User");
const AccessGrant = require("../models/AccessGrant");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { OAuth2Client } = require("google-auth-library");
const { isEmailConfigured, sendMail } = require("../utils/mail");

const allowedRoles = ['admin', 'editor', 'manager', 'super-admin'];

const createAuthResponse = (user) => {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured.');
  }

  const authenticatedUser = {
    id: String(user._id || user.id),
    name: user.name,
    email: user.email,
    role: user.role
  };
  const token = jwt.sign(
    { ...authenticatedUser, version: user.tokenVersion || 0 },
    process.env.JWT_SECRET,
    { expiresIn: "1d" }
  );

  return { token, user: authenticatedUser };
};

const createGrantAuthResponse = (grant, googleProfile) => {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured.');
  }

  const id = `grant:${grant._id}`;
  const token = jwt.sign(
    { id, role: grant.role, version: grant.tokenVersion || 0 },
    process.env.JWT_SECRET,
    { expiresIn: "12h" }
  );

  return {
    token,
    sessionOnly: true,
    user: {
      id,
      name: grant.name,
      email: grant.email,
      role: grant.role
    }
  };
};

exports.register = async (req, res) => {
  return res.status(403).json({ message: 'Alumni verification is required before creating an account.' });
};

const verifyGoogleProfile = async (req, res) => {
  const googleClientId = process.env.GOOGLE_CLIENT_ID;
  if (!googleClientId) {
    res.status(503).json({ message: 'Google sign-in is not configured on this server.' });
    return null;
  }

  const credential = typeof req.body.credential === 'string' ? req.body.credential : '';
  if (!credential) {
    res.status(400).json({ message: 'A Google credential is required.' });
    return null;
  }

  try {
    const ticket = await new OAuth2Client(googleClientId).verifyIdToken({
      idToken: credential,
      audience: googleClientId
    });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email || payload.email_verified !== true) {
      res.status(401).json({ message: 'Use a Google account with a verified email address.' });
      return null;
    }
    return {
      id: `google:${payload.sub}`,
      name: payload.name?.trim() || payload.email,
      email: payload.email.trim().toLowerCase()
    };
  } catch (error) {
    res.status(401).json({ message: 'Google sign-in could not verify your account. Please try again.' });
    return null;
  }
};

exports.loginWithGoogleUser = async (req, res) => {
  const googleProfile = await verifyGoogleProfile(req, res);
  if (!googleProfile) return;

  return res.json({
    user: {
      ...googleProfile,
      role: 'guest'
    },
    temporary: true
  });
};

exports.loginWithGoogleAdmin = async (req, res) => {
  const googleProfile = await verifyGoogleProfile(req, res);
  if (!googleProfile) return;

  try {
    const grant = await AccessGrant.findOne({ email: googleProfile.email });
    if (grant) {
      return res.json(createGrantAuthResponse(grant, googleProfile));
    }

    const escapedEmail = googleProfile.email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const existingUser = await User.findOne({ email: { $regex: `^${escapedEmail}$`, $options: 'i' } });
    if (existingUser && allowedRoles.includes(existingUser.role)) {
      return res.json(createAuthResponse(existingUser));
    }

    return res.status(403).json({ message: 'This Google account has not been approved for admin access.' });
  } catch (error) {
    console.error('Admin Google sign-in failed:', error);
    return res.status(500).json({ message: 'Unable to sign in to the admin portal right now.' });
  }
};

// LOGIN
exports.login = async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = typeof req.body.password === 'string' ? req.body.password : '';

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    const escapedEmail = email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const user = await User.findOne({ email: { $regex: `^${escapedEmail}$`, $options: 'i' } });
    if (!user) return res.status(401).json({ message: 'Invalid email or password.' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: 'Invalid email or password.' });
    if (!allowedRoles.includes(user.role)) {
      return res.status(403).json({ message: 'This account is not authorized. Contact an administrator to request access.' });
    }

    res.json(createAuthResponse(user));

  } catch (err) {
    console.error('User login failed:', err);
    res.status(500).json({ error: err.message });
  }
};

exports.loginUser = async (req, res) => {
  try {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    const escapedEmail = email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const user = await User.findOne({ email: { $regex: `^${escapedEmail}$`, $options: 'i' } });
    if (!user || user.role !== 'alumni') {
      return res.status(401).json({ message: 'Invalid user email or password.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: 'Invalid user email or password.' });

    return res.json(createAuthResponse(user));
  } catch (error) {
    console.error('User account login failed:', error);
    return res.status(500).json({ message: 'Unable to sign in right now.' });
  }
};

exports.requestPasswordReset = async (req, res) => {
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return res.status(400).json({ message: 'Enter a valid email address.' });
  }
  if (!isEmailConfigured()) {
    return res.status(503).json({ message: 'Password reset email is not configured. Please contact the site administrator.' });
  }

  const frontendUrl = process.env.FRONTEND_URL || process.env.CLIENT_URL;
  if (!frontendUrl) {
    return res.status(503).json({ message: 'Password reset is not configured. Please contact the site administrator.' });
  }

  try {
    const escapedEmail = email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const user = await User.findOne({
      email: { $regex: `^${escapedEmail}$`, $options: 'i' },
      role: 'alumni'
    });

    if (user) {
      const resetToken = crypto.randomBytes(32).toString('hex');
      user.passwordResetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
      user.passwordResetExpiresAt = new Date(Date.now() + 60 * 60 * 1000);
      await user.save();

      const resetUrl = new URL('/reset-password', frontendUrl);
      resetUrl.searchParams.set('token', resetToken);
      try {
        await sendMail({
          to: user.email,
          subject: 'Reset your GVP account password',
          text: `Use this link within one hour to reset your password: ${resetUrl.toString()}`,
          html: `<p>Use the link below within one hour to reset your GVP account password.</p><p><a href="${resetUrl.toString()}">Reset password</a></p><p>If you did not request this, you can ignore this email.</p>`
        });
      } catch (deliveryError) {
        user.passwordResetTokenHash = undefined;
        user.passwordResetExpiresAt = undefined;
        try {
          await user.save();
        } catch (cleanupError) {
          console.error('Unable to clear an unsent password reset token:', cleanupError);
        }
        throw deliveryError;
      }
    }

    return res.json({ message: 'If an account exists for that email, a password reset link has been sent.' });
  } catch (error) {
    console.error('Password reset request failed:', error);
    return res.status(500).json({ message: 'Unable to send a password reset email right now.' });
  }
};

exports.resetPassword = async (req, res) => {
  const token = typeof req.body.token === 'string' ? req.body.token : '';
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const confirmPassword = typeof req.body.confirmPassword === 'string' ? req.body.confirmPassword : '';

  if (!/^[a-f0-9]{64}$/i.test(token)) {
    return res.status(400).json({ message: 'This password reset link is invalid or expired.' });
  }
  if (password.length < 8 || Buffer.byteLength(password, 'utf8') > 72) {
    return res.status(400).json({ message: 'Password must be at least 8 characters and no more than 72 bytes.' });
  }
  if (password !== confirmPassword) {
    return res.status(400).json({ message: 'Passwords do not match.' });
  }

  try {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const user = await User.findOne({
      passwordResetTokenHash: tokenHash,
      passwordResetExpiresAt: { $gt: new Date() },
      role: 'alumni'
    }).select('+passwordResetTokenHash +passwordResetExpiresAt');

    if (!user) {
      return res.status(400).json({ message: 'This password reset link is invalid or expired.' });
    }

    user.password = await bcrypt.hash(password, 12);
    user.passwordResetTokenHash = undefined;
    user.passwordResetExpiresAt = undefined;
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();

    return res.json({ message: 'Your password has been reset. You can now sign in.' });
  } catch (error) {
    console.error('Password reset failed:', error);
    return res.status(500).json({ message: 'Unable to reset your password right now.' });
  }
};

exports.logout = async (req, res) => {
  try {
    if (req.user.id.startsWith('grant:')) {
      const grant = await AccessGrant.findByIdAndUpdate(
        req.user.id.slice('grant:'.length),
        { $inc: { tokenVersion: 1 } },
        { new: true }
      );
      if (!grant) return res.status(401).json({ message: 'This account is no longer available.' });
    } else {
      const user = await User.findByIdAndUpdate(
        req.user.id,
        { $inc: { tokenVersion: 1 } },
        { new: true }
      );
      if (!user) return res.status(401).json({ message: 'This account is no longer available.' });
    }

    return res.json({ message: 'Signed out successfully.' });
  } catch (error) {
    console.error('Sign-out token revocation failed:', error);
    return res.status(500).json({ message: 'Unable to end your server session right now.' });
  }
};

exports.getCurrentUser = async (req, res) => {
  try {
    if (req.user.id.startsWith('grant:')) {
      const grant = await AccessGrant.findById(req.user.id.slice('grant:'.length)).lean();
      if (!grant || grant.role !== req.user.role) {
        return res.status(403).json({ msg: 'This account is not authorized.' });
      }
      return res.json({
        id: req.user.id,
        name: grant.name || grant.email,
        email: grant.email,
        role: grant.role
      });
    }

    const user = await User.findById(req.user.id).select('-password');
    if (!user) return res.status(404).json({ msg: 'User not found' });
    if (!allowedRoles.includes(user.role) && user.role !== 'alumni') {
      return res.status(403).json({ msg: 'This account is not authorized.' });
    }
    res.json(user);
  } catch (err) {
    res.status(500).send('Server error');
  }
};

exports.getDashboard = async (req, res) => {
  try {
    if (req.user.id.startsWith('grant:')) {
      const grant = await AccessGrant.findById(req.user.id.slice('grant:'.length)).lean();
      if (!grant || grant.role !== req.user.role) {
        return res.status(403).json({ message: 'This account is not authorized.' });
      }
      return res.json({
        message: 'Welcome to the dashboard',
        user: { id: req.user.id, email: grant.email, role: grant.role }
      });
    }

    const user = await User.findById(req.user.id).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });

    res.json({
      message: 'Welcome to the dashboard',
      user: user
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};