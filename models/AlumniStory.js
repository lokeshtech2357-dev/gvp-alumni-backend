const mongoose = require('mongoose');

const alumniStorySchema = new mongoose.Schema({
  name: { type: String, required: true },
  batch: { type: String, required: false },
  branch: { type: String, required: false },
  currentRole: { type: String, required: false },
  company: { type: String, required: false },
  summary: { type: String, required: true },
  story: { type: String, required: true },
  imageUrl: { type: String, required: false },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('AlumniStory', alumniStorySchema);
