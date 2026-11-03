const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');
const Entrepreneur = require('../models/Entrepreneur');
const cloudinary = require('../config/cloudinary');
const { verifyCloudinaryUpload } = require('../utils/cloudinaryUpload');

// ── GET /api/entrepreneurs  (public) ───────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const items = await Entrepreneur.find().sort({ order: 1, createdAt: 1 });
    res.json({ success: true, data: items });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /api/entrepreneurs  (admin – upload image) ────────────────────────
router.post('/', auth, requireRole('admin', 'manager', 'super-admin'), async (req, res) => {
  try {
    const { name, websiteUrl, gradient, order, originalname } = req.body;
    const asset = await verifyCloudinaryUpload({
      imageUrl: req.body.imageUrl,
      filename: req.body.filename,
      purpose: 'entrepreneur',
    });

    const item = await Entrepreneur.create({
      name: name || originalname,
      websiteUrl: websiteUrl || '',
      imageUrl: asset.secure_url,
      filename: asset.public_id,
      gradient: gradient || 'green',
      order: Number(order) || 0
    });

    res.status(201).json({ success: true, data: item });
  } catch (err) {
    res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
});

// ── PUT /api/entrepreneurs/:id  (admin – edit name/url/gradient) ───────────
router.put('/:id', auth, requireRole('admin', 'manager', 'super-admin'), async (req, res) => {
  try {
    const { name, websiteUrl, gradient, order } = req.body;
    const updated = await Entrepreneur.findByIdAndUpdate(
      req.params.id,
      { name, websiteUrl, gradient, order: Number(order) || 0 },
      { new: true, runValidators: true }
    );
    if (!updated) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── DELETE /api/entrepreneurs/:id  (admin) ─────────────────────────────────
router.delete('/:id', auth, requireRole('admin', 'manager', 'super-admin'), async (req, res) => {
  try {
    const item = await Entrepreneur.findById(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Not found' });

    if (item.filename) {
      await cloudinary.uploader.destroy(item.filename).catch(() => {});
    }

    await Entrepreneur.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
