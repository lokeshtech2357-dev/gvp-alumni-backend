const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  date: {
    type: Date,
    required: true
  },
  location: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['conference', 'workshop', 'seminar', 'cultural', 'sports', 'reunion', 'other'],
    default: 'other'
  },
  images: [{
    type: String
  }],
  galleryScrollDuration: {
    type: Number,
    default: 35
  },
  banner: {
    type: String,
    required: false
  },
  organizer: {
    type: String,
    required: true
  },
  registrationLink: {
    type: String,
    required: false
  },
  maxParticipants: {
    type: Number,
    required: false
  },
  noticeId: {
    type: String,
    required: false
  },
  registrations: [
    {
      name: { type: String, required: true },
      email: { type: String, required: true },
      phone: { type: String, required: false },
      organization: { type: String, required: false },
      message: { type: String, required: false },
      registeredAt: { type: Date, default: Date.now }
    }
  ],
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Event', eventSchema);
