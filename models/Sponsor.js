const mongoose = require('mongoose');

const sponsorSchema = new mongoose.Schema({
  title: { type: String, trim: true },
  filename: { type: String, required: true },
  imageUrl: { type: String, required: true },
  url: { type: String, trim: true },
  order: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Sponsor', sponsorSchema);
