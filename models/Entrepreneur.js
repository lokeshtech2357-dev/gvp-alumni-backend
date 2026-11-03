const mongoose = require('mongoose');

const entrepreneurSchema = new mongoose.Schema({
  name:      { type: String, required: true, trim: true },
  websiteUrl: { type: String, trim: true },
  imageUrl:  { type: String, required: true },
  filename:  { type: String, required: true },
  gradient:  { type: String, default: 'green' }, // 'green' | 'purple' | 'blue' | 'orange'
  order:     { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Entrepreneur', entrepreneurSchema);
