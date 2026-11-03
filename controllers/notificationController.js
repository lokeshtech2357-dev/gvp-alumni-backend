const Notification = require('../models/Notification');
const mongoose = require('mongoose');

// ── In-memory store (used when MongoDB is unavailable) ──────────────────────
let memStore = [
  { _id: '1', title: 'Examinations April 2026 Notification', important: true,  visible: true, createdAt: new Date() },
  { _id: '2', title: 'Results Declared for B.Tech I Semester', important: true,  visible: true, createdAt: new Date() },
  { _id: '3', title: 'Last Date for Revaluation Applications', important: false, visible: true, createdAt: new Date() },
  { _id: '4', title: 'Alumni Meet Registration Open',          important: false, visible: true, createdAt: new Date() },
  { _id: '5', title: 'Campus Placement Drive Updates',         important: true,  visible: true, createdAt: new Date() },
];
let memIdCounter = 100;
const dbOk = () => mongoose.connection.readyState === 1;

// ── GET all ─────────────────────────────────────────────────────────────────
const getNotifications = async (req, res) => {
  try {
    if (!dbOk()) return res.json([...memStore].reverse());
    const notifications = await Notification.find().sort({ createdAt: -1 });
    return res.json(notifications);
  } catch (err) {
    return res.json([...memStore].reverse());
  }
};

// ── GET one ─────────────────────────────────────────────────────────────────
const getNotification = async (req, res) => {
  try {
    if (!dbOk()) {
      const item = memStore.find(n => n._id === req.params.id);
      if (!item) return res.status(404).json({ message: 'Not found' });
      return res.json(item);
    }
    const item = await Notification.findById(req.params.id);
    if (!item) return res.status(404).json({ message: 'Not found' });
    return res.json(item);
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ── CREATE ───────────────────────────────────────────────────────────────────
const createNotification = async (req, res) => {
  try {
    const { title, important = false, visible = true } = req.body;
    if (!title) return res.status(400).json({ message: 'Title is required' });

    if (!dbOk()) {
      // Save to in-memory store
      const newItem = {
        _id: String(++memIdCounter),
        title, important, visible,
        createdAt: new Date(),
      };
      memStore.unshift(newItem);
      return res.status(201).json(newItem);
    }

    const item = new Notification({ title, important, visible });
    await item.save();
    return res.status(201).json(item);
  } catch (err) {
    return res.status(400).json({ message: 'Invalid data', error: err.message });
  }
};

// ── UPDATE ───────────────────────────────────────────────────────────────────
const updateNotification = async (req, res) => {
  try {
    if (!dbOk()) {
      const idx = memStore.findIndex(n => n._id === req.params.id);
      if (idx === -1) return res.status(404).json({ message: 'Not found' });
      memStore[idx] = { ...memStore[idx], ...req.body };
      return res.json(memStore[idx]);
    }

    const item = await Notification.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!item) return res.status(404).json({ message: 'Not found' });
    return res.json(item);
  } catch (err) {
    return res.status(400).json({ message: 'Invalid data', error: err.message });
  }
};

// ── DELETE ───────────────────────────────────────────────────────────────────
const deleteNotification = async (req, res) => {
  try {
    if (!dbOk()) {
      const idx = memStore.findIndex(n => n._id === req.params.id);
      if (idx === -1) return res.status(404).json({ message: 'Not found' });
      memStore.splice(idx, 1);
      return res.json({ message: 'Deleted' });
    }

    const item = await Notification.findByIdAndDelete(req.params.id);
    if (!item) return res.status(404).json({ message: 'Not found' });
    return res.json({ message: 'Deleted' });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};

module.exports = {
  getNotifications,
  getNotification,
  createNotification,
  updateNotification,
  deleteNotification,
};
