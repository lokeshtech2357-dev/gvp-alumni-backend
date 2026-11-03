const mongoose = require('mongoose');

const heritageEventSchema = new mongoose.Schema({
  campusName: {
    type: String,
    required: true
  },
  location: {
    type: String,
    required: true
  },
  documentUrl: {
    type: String,
    default: '/images/invetation/GVP-SriRama-Intivation-1.pdf'
  },
  subEvents: [{
    title: {
      type: String,
      required: true
    },
    dateString: {
      type: String,
      required: true
    }
  }],
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

module.exports = mongoose.model('HeritageEvent', heritageEventSchema);
