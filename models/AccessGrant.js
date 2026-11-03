const mongoose = require('mongoose');

const accessGrantSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  },
  role: {
    type: String,
    required: true,
    enum: ['editor', 'manager', 'super-admin', 'admin']
  },
  tokenVersion: {
    type: Number,
    default: 0
  }
}, { timestamps: false });

module.exports = mongoose.model('AccessGrant', accessGrantSchema);
