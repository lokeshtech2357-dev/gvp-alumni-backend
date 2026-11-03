const mongoose = require('mongoose');

const contentSectionSchema = new mongoose.Schema({
  sectionId: {
    type: String,
    required: true,
    unique: true,
  },
  title: {
    type: String,
    required: true,
  },
  body: {
    type: String,
    required: true,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('ContentSection', contentSectionSchema);
