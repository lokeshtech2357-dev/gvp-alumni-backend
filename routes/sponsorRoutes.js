const express = require('express');
const router = express.Router();
const cloudinary = require('../config/cloudinary');
const { verifyCloudinaryUpload } = require('../utils/cloudinaryUpload');

const Sponsor = require('../models/Sponsor');
const mongoose = require('mongoose');
const auth = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');
const protectRoute = typeof auth === 'function' ? auth : auth.protect || auth.verifyToken || auth;

// GET /api/sponsors - public list
router.get('/', async (req, res) => {
  try {
    if (!mongoose.connection || mongoose.connection.readyState !== 1) {
      return res.status(503).json({ success: false, message: 'Database unavailable' });
    }

    const sponsors = await Sponsor.find().sort({ order: 1, createdAt: 1 });
    return res.json({ success: true, data: sponsors });
  } catch (err) {
    console.error('DB error fetching sponsors', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/sponsors - upload new sponsor (protected)
router.post('/', protectRoute, requireRole('admin', 'manager', 'super-admin'), async (req, res) => {
  try {
    const { url, title, originalname } = req.body;
    const asset = await verifyCloudinaryUpload({
      imageUrl: req.body.imageUrl,
      filename: req.body.filename,
      expectedFolder: 'gvp/sponsors',
    });

    if (!mongoose.connection || mongoose.connection.readyState !== 1) {
      return res.status(503).json({ success: false, message: 'Database unavailable' });
    }

    const count = await Sponsor.countDocuments();
    const sponsor = await Sponsor.create({
      title: title || originalname,
      filename: asset.public_id,
      imageUrl: asset.secure_url,
      url: url || '',
      order: count + 1,
    });

    return res.status(201).json({ success: true, data: sponsor });
  } catch (err) {
    console.error('Sponsor upload error', err.message);
    return res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
});

// PUT /api/sponsors/:id - update sponsor name/url (protected)
router.put('/:id', protectRoute, requireRole('admin', 'manager', 'super-admin'), async (req, res) => {
  try {
    if (!mongoose.connection || mongoose.connection.readyState !== 1) {
      return res.status(503).json({ success: false, message: 'Database unavailable' });
    }

    const { title, url } = req.body;
    const sponsor = await Sponsor.findByIdAndUpdate(
      req.params.id,
      { ...(title !== undefined && { title }), ...(url !== undefined && { url }) },
      { new: true, runValidators: true }
    );

    if (!sponsor) return res.status(404).json({ success: false, message: 'Sponsor not found' });
    return res.json({ success: true, data: sponsor });
  } catch (err) {
    console.error('Sponsor update error', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/sponsors/:id - remove sponsor and Cloudinary asset (protected)
router.delete('/:id', protectRoute, requireRole('admin', 'manager', 'super-admin'), async (req, res) => {
  try {
    if (!mongoose.connection || mongoose.connection.readyState !== 1) {
      return res.status(503).json({ success: false, message: 'Database unavailable' });
    }

    const sponsor = await Sponsor.findById(req.params.id);
    if (!sponsor) return res.status(404).json({ success: false, message: 'Sponsor not found' });

    if (sponsor.filename) {
      await cloudinary.uploader.destroy(sponsor.filename).catch(() => {});
    }

    await Sponsor.deleteOne({ _id: req.params.id });
    return res.json({ success: true, data: {} });
  } catch (err) {
    console.error('Sponsor delete error', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
