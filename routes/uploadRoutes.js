const crypto = require('crypto');
const express = require('express');
const auth = require('../middleware/authMiddleware');
const cloudinary = require('../config/cloudinary');

const router = express.Router();
const adminRoles = ['admin', 'manager', 'super-admin'];
const policies = {
  gallery: {
    folder: 'gvp/gallery',
    formats: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
    maxFileSize: 20 * 1024 * 1024,
  },
  event: {
    folder: 'gvp/events',
    formats: {
      image: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
      video: ['mp4', 'mov', 'mkv'],
    },
    maxFileSize: 50 * 1024 * 1024,
  },
  sponsor: {
    folder: 'gvp/sponsors',
    formats: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
    maxFileSize: 6 * 1024 * 1024,
  },
  entrepreneur: {
    folder: 'gvp/entrepreneurs',
    formats: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
    maxFileSize: 5 * 1024 * 1024,
  },
  'alumni-profile': {
    folder: 'gvp/alumni-profiles',
    formats: ['jpg', 'jpeg', 'png', 'webp'],
    maxFileSize: 5 * 1024 * 1024,
  },
};

router.post('/signature', auth, (req, res) => {
  const { purpose } = req.body;
  const policy = policies[purpose];
  if (!policy) {
    return res.status(400).json({ success: false, message: 'Unsupported upload purpose.' });
  }

  const role = String(req.user?.role || '').toLowerCase();
  const isProfileUpload = purpose === 'alumni-profile';
  if (isProfileUpload ? role !== 'alumni' : !adminRoles.includes(role)) {
    return res.status(403).json({ success: false, message: 'Insufficient permissions.' });
  }

  const resourceType = purpose === 'event' && req.body.resourceType === 'video' ? 'video' : 'image';
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
