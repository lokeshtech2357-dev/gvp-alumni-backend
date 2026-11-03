const AccessGrant = require('../models/AccessGrant');
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

const validRoles = ['editor', 'manager', 'super-admin', 'admin'];
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const isSuperAdmin = (user) => user?.role === 'super-admin';
const isSelfAccount = (req, id) => String(req.user?.id || '') === String(id);
const isSelfGrant = (req, id) => req.user?.id === `grant:${id}`;

const canManageRole = (req, role) => isSuperAdmin(req.user) || role !== 'super-admin';

const lastSuperAdmin = async (role) => {
  if (role !== 'super-admin') return false;
  const [userCount, grantCount] = await Promise.all([
    User.countDocuments({ role: 'super-admin' }),
    AccessGrant.countDocuments({ role: 'super-admin' })
  ]);
  return userCount + grantCount <= 1;
};

exports.getUsers = async (req, res) => {
  try {
    const grants = await AccessGrant.find().sort({ email: 1 }).lean();
    res.json({ success: true, data: grants });
  } catch (error) {
    console.error('Unable to load role access grants:', error);
    res.status(500).json({ success: false, message: 'Unable to load approved accounts.' });
  }
};

exports.createUser = async (req, res) => {
  try {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const { role } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, message: 'Enter the account name.' });
    }
    if (!emailPattern.test(email)) {
      return res.status(400).json({ success: false, message: 'Enter a valid email address.' });
    }
    if (!validRoles.includes(role)) {
      return res.status(400).json({ success: false, message: 'Select a valid role.' });
    }
    if (!canManageRole(req, role)) {
      return res.status(403).json({ success: false, message: 'Only a super-admin can create another super-admin account.' });
    }

    const grant = await AccessGrant.create({ name, email, role });
    res.status(201).json({
      success: true,
      data: { _id: grant._id, name: grant.name, email: grant.email, role: grant.role }
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'This email already has an approved role.' });
    }
    console.error('Unable to grant account access:', error);
    res.status(500).json({ success: false, message: 'Unable to grant account access.' });
  }
};

exports.updateUser = async (req, res) => {
  try {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const { role } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, message: 'Enter the account name.' });
    }
    if (!emailPattern.test(email)) {
      return res.status(400).json({ success: false, message: 'Enter a valid email address.' });
    }
    if (!validRoles.includes(role)) {
      return res.status(400).json({ success: false, message: 'Select a valid role.' });
    }

    const grant = await AccessGrant.findById(req.params.id);
    if (!grant) return res.status(404).json({ success: false, message: 'Approved account not found.' });
    if (!canManageRole(req, grant.role) || !canManageRole(req, role)) {
      return res.status(403).json({ success: false, message: 'Only a super-admin can manage super-admin accounts.' });
    }
    if (isSelfGrant(req, grant._id) && grant.role !== role) {
      return res.status(403).json({ success: false, message: 'You cannot change your own administrator role.' });
    }
    if (grant.role === 'super-admin' && role !== 'super-admin' && await lastSuperAdmin(grant.role)) {
      return res.status(409).json({ success: false, message: 'The last super-admin account cannot be demoted.' });
    }

    const duplicate = await AccessGrant.findOne({ email, _id: { $ne: grant._id } });
    if (duplicate) {
      return res.status(409).json({ success: false, message: 'This email already has an approved role.' });
    }

    grant.name = name;
    grant.email = email;
    grant.role = role;
    await grant.save();
    res.json({ success: true, data: { _id: grant._id, name: grant.name, email: grant.email, role: grant.role } });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'This email already has an approved role.' });
    }
    console.error('Unable to update account access:', error);
    res.status(500).json({ success: false, message: 'Unable to update account access.' });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid approved account ID.' });
    }
    if (isSelfGrant(req, req.params.id)) {
      return res.status(403).json({ success: false, message: 'You cannot remove your own administrator access.' });
    }
    const existing = await AccessGrant.findById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: 'Approved account not found.' });
    if (!canManageRole(req, existing.role)) {
      return res.status(403).json({ success: false, message: 'Only a super-admin can remove a super-admin account.' });
    }
    if (await lastSuperAdmin(existing.role)) {
      return res.status(409).json({ success: false, message: 'The last super-admin account cannot be removed.' });
    }
    const grant = await AccessGrant.findByIdAndDelete(req.params.id);
    if (!grant) return res.status(404).json({ success: false, message: 'Approved account not found.' });
    res.json({ success: true, message: 'Approved access removed.' });
  } catch (error) {
    console.error('Unable to remove account access:', error);
    res.status(500).json({ success: false, message: 'Unable to remove account access.' });
  }
};

exports.getPasswordAccounts = async (req, res) => {
  try {
    const accounts = await User.find({ role: { $in: validRoles } })
      .select('_id name email role createdAt')
      .sort({ email: 1 })
      .lean();
    return res.json({ success: true, data: accounts });
  } catch (error) {
    console.error('Unable to load password-based admin accounts:', error);
    return res.status(500).json({ success: false, message: 'Unable to load password-based admin accounts.' });
  }
};

exports.createPasswordAccount = async (req, res) => {
  try {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const confirmPassword = typeof req.body.confirmPassword === 'string' ? req.body.confirmPassword : '';
    const { role } = req.body;

    if (!name || name.length > 100) {
      return res.status(400).json({ success: false, message: 'Enter the account name (up to 100 characters).' });
    }
    if (!emailPattern.test(email) || email.length > 254) {
      return res.status(400).json({ success: false, message: 'Enter a valid email address.' });
    }
    if (password.length < 8 || Buffer.byteLength(password, 'utf8') > 72) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters and no more than 72 bytes.' });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'Passwords do not match.' });
    }
    if (!validRoles.includes(role)) {
      return res.status(400).json({ success: false, message: 'Select a valid role.' });
    }
    if (!canManageRole(req, role)) {
      return res.status(403).json({ success: false, message: 'Only a super-admin can create another super-admin account.' });
    }

    const escapedEmail = email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const existingAccount = await User.findOne({
      email: { $regex: `^${escapedEmail}$`, $options: 'i' }
    }).select('_id');
    if (existingAccount) {
      return res.status(409).json({ success: false, message: 'An account with this email already exists.' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const account = await User.create({ name, email, password: hashedPassword, role });
    return res.status(201).json({
      success: true,
      data: {
        _id: account._id,
        name: account.name,
        email: account.email,
        role: account.role,
        createdAt: account.createdAt
      }
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'An account with this email already exists.' });
    }
    console.error('Unable to create password-based admin account:', error);
    return res.status(500).json({ success: false, message: 'Unable to create password-based admin account.' });
  }
};

exports.updatePasswordAccount = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid password account ID.' });
    }
    if (isSelfAccount(req, req.params.id)) {
      return res.status(403).json({ success: false, message: 'You cannot edit your own administrator account here.' });
    }

    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const confirmPassword = typeof req.body.confirmPassword === 'string' ? req.body.confirmPassword : '';
    const { role } = req.body;

    if (!name || name.length > 100) {
      return res.status(400).json({ success: false, message: 'Enter the account name (up to 100 characters).' });
    }
    if (!emailPattern.test(email) || email.length > 254) {
      return res.status(400).json({ success: false, message: 'Enter a valid email address.' });
    }
    if (!validRoles.includes(role)) {
      return res.status(400).json({ success: false, message: 'Select a valid role.' });
    }
    if (password || confirmPassword) {
      if (password.length < 8 || Buffer.byteLength(password, 'utf8') > 72) {
        return res.status(400).json({ success: false, message: 'New password must be at least 8 characters and no more than 72 bytes.' });
      }
      if (password !== confirmPassword) {
        return res.status(400).json({ success: false, message: 'Passwords do not match.' });
      }
    }

    const account = await User.findById(req.params.id);
    if (!account || !validRoles.includes(account.role)) {
      return res.status(404).json({ success: false, message: 'Password-based admin account not found.' });
    }
    if (!canManageRole(req, account.role) || !canManageRole(req, role)) {
      return res.status(403).json({ success: false, message: 'Only a super-admin can manage super-admin accounts.' });
    }
    if (account.role === 'super-admin' && role !== 'super-admin' && await lastSuperAdmin(account.role)) {
      return res.status(409).json({ success: false, message: 'The last super-admin account cannot be demoted.' });
    }

    const escapedEmail = email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const duplicate = await User.findOne({
      email: { $regex: `^${escapedEmail}$`, $options: 'i' },
      _id: { $ne: account._id }
    }).select('_id');
    if (duplicate) {
      return res.status(409).json({ success: false, message: 'An account with this email already exists.' });
    }

    account.name = name;
    account.email = email;
    account.role = role;
    if (password) account.password = await bcrypt.hash(password, 12);
    account.tokenVersion = (account.tokenVersion || 0) + 1;
    await account.save();

    return res.json({
      success: true,
      data: {
        _id: account._id,
        name: account.name,
        email: account.email,
        role: account.role,
        createdAt: account.createdAt
      }
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'An account with this email already exists.' });
    }
    console.error('Unable to update password-based admin account:', error);
    return res.status(500).json({ success: false, message: 'Unable to update password-based admin account.' });
  }
};

exports.deletePasswordAccount = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid password account ID.' });
    }
    if (isSelfAccount(req, req.params.id)) {
      return res.status(403).json({ success: false, message: 'You cannot remove your own administrator account.' });
    }

    const account = await User.findById(req.params.id);
    if (!account || !validRoles.includes(account.role)) {
      return res.status(404).json({ success: false, message: 'Password-based admin account not found.' });
    }
    if (!canManageRole(req, account.role)) {
      return res.status(403).json({ success: false, message: 'Only a super-admin can remove a super-admin account.' });
    }
    if (await lastSuperAdmin(account.role)) {
      return res.status(409).json({ success: false, message: 'The last super-admin account cannot be removed.' });
    }

    await User.findByIdAndDelete(req.params.id);
    return res.json({ success: true, message: 'Password-based admin account removed.' });
  } catch (error) {
    console.error('Unable to remove password-based admin account:', error);
    return res.status(500).json({ success: false, message: 'Unable to remove password-based admin account.' });
  }
};
