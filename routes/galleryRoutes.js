const express = require('express');
const router = express.Router();
const GalleryImage = require('../models/GalleryImage');
const cloudinary = require('../config/cloudinary');
const { verifyCloudinaryUpload } = require('../utils/cloudinaryUpload');

// Determine auth middleware
const auth = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');
const protectRoute = typeof auth === 'function' ? auth : auth.protect || auth.verifyToken || auth;

const mongoose = require('mongoose');
const dbOk = () => mongoose.connection.readyState === 1;

// ── GET all ────────────────────────────────────────────────────────────────
// @route GET /api/gallery
router.get('/', async (req, res) => {
  try {
    if (!dbOk()) {
      return res.status(503).json({ success: false, message: 'Database unavailable' });
    }

    const images = await GalleryImage.find().sort({ createdAt: -1 });
    return res.json({ success: true, count: images.length, data: images });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST upload ────────────────────────────────────────────────────────────
// @route POST /api/gallery
router.post('/', protectRoute, requireRole('admin', 'manager', 'super-admin'), async (req, res) => {
  try {
    if (!dbOk()) {
      return res.status(503).json({ success: false, message: 'Database unavailable' });
    }

    const { title, description, originalname } = req.body;
    const asset = await verifyCloudinaryUpload({
      imageUrl: req.body.imageUrl,
      filename: req.body.filename,
      expectedFolder: 'gvp/gallery',
    });

    const newImage = await GalleryImage.create({
      title: title || (originalname || '').replace(/\.[^/.]+$/, ''),
      description: description || '',
      imageUrl: asset.secure_url,
      filename: asset.public_id,
    });

    return res.status(201).json({ success: true, data: newImage });
  } catch (err) {
    console.error('Gallery upload error:', err.message);
    return res.status(err.statusCode || 400).json({ success: false, message: err.message });
  }
});

// ── PUT update title/description ───────────────────────────────────────────
// @route PUT /api/gallery/:id
router.put('/:id', protectRoute, requireRole('admin', 'manager', 'super-admin'), async (req, res) => {
  try {
    if (!dbOk()) {
      return res.status(503).json({ success: false, message: 'Database unavailable' });
    }

    const { title, description } = req.body;
    const image = await GalleryImage.findByIdAndUpdate(
      req.params.id,
      { title, description },
      { new: true, runValidators: true }
    );

    if (!image) return res.status(404).json({ success: false, message: 'Image not found' });
    return res.json({ success: true, data: image });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

// ── DELETE ─────────────────────────────────────────────────────────────────
// @route DELETE /api/gallery/:id
router.delete('/:id', protectRoute, requireRole('admin', 'manager', 'super-admin'), async (req, res) => {
  try {
    if (!dbOk()) {
      return res.status(503).json({ success: false, message: 'Database unavailable' });
    }

    const image = await GalleryImage.findById(req.params.id);
    if (!image) return res.status(404).json({ success: false, message: 'Image not found' });

    if (image.filename) {
      await cloudinary.uploader.destroy(image.filename).catch(() => {});
    }

    await GalleryImage.deleteOne({ _id: req.params.id });
    return res.json({ success: true, data: {} });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

module.exports = router;
