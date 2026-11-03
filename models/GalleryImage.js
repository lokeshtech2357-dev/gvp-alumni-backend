const mongoose = require('mongoose');

const galleryImageSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Please add a title for the image'],
    trim: true,
  },
  description: {
    type: String,
    trim: true,
  },
  filename: {
    type: String,
    required: [true, 'Image filename is required'],
  },
  imageUrl: {
    type: String,
    required: [true, 'Image URL is required']
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('GalleryImage', galleryImageSchema);
