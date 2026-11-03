const crypto = require('crypto');
const express = require('express');
const auth = require('../middleware/authMiddleware');
const cloudinary = require('../config/cloudinary');
const policies = require('../config/uploadPolicies');

const router = express.Router();
const adminRoles = ['admin', 'manager', 'super-admin'];

router.post('/signature', auth, (req, res) => {
  const { purpose } = req.body;
  const policy = policies[purpose];
  if (!policy) {
    return res.status(400).json({ success: false, message: 'Unsupported upload purpose.' });
  }

  const requestedResourceType = req.body.resourceType;
  if (
    requestedResourceType !== undefined &&
    requestedResourceType !== 'image' &&
    requestedResourceType !== 'video'
  ) {
    return res.status(400).json({ success: false, message: 'Unsupported upload resource type.' });
  }
  if (requestedResourceType === 'video' && purpose !== 'event') {
    return res.status(400).json({ success: false, message: 'Video uploads are only supported for events.' });
  }

  const role = String(req.user?.role || '').toLowerCase();
  const isProfileUpload = purpose === 'alumni-profile';
  if (isProfileUpload ? role !== 'alumni' : !adminRoles.includes(role)) {
    return res.status(403).json({ success: false, message: 'Insufficient permissions.' });
  }

  const resourceType = requestedResourceType || 'image';
  const allowedFormats = Array.isArray(policy.formats) ? policy.formats : policy.formats[resourceType];
  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    return res.status(503).json({ success: false, message: 'Cloudinary uploads are not configured.' });
  }

  const params = {
    timestamp: Math.floor(Date.now() / 1000),
    folder: policy.folder,
    public_id: `upload-${crypto.randomUUID()}`,
    allowed_formats: allowedFormats.join(','),
    transformation: 'q_auto',
    overwrite: false,
  };

  return res.json({
    success: true,
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    resourceType,
    allowedFormats,
    maxFileSize: policy.maxFileSize,
    params,
    signature: cloudinary.utils.api_sign_request(params, process.env.CLOUDINARY_API_SECRET),
  });
});

module.exports = router;
