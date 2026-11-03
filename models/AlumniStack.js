const mongoose = require('mongoose');

const alumniStackSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  iappudu: {
    type: String,
    required: true
  },
  batch: {
    type: String,
    required: true
  },
  year: {
    type: String,
    required: true
  },
  company: {
    type: String,
    required: true
  },
  position: {
    type: String,
    required: true
  },
  location: {
    type: String,
    required: true
  },
  linkedinProfile: {
    type: String,
    required: false
  },
  image: {
    type: String,
    required: false
  },
  achievements: [{
    type: String
  }],
  buildingRelationships: {
    type: String,
    required: false
  },
  description: {
    type: String,
    required: false,
    default: "We gather\n\nThe building of relationships is a critical part of what it means to be a GVP. From the first day on the Hill to a 60th Decades, GVP is an integral part of maintaining relationships for alumni and friends of the College.\n\nWe Connect\n\nA connection to GVP and the resources offered by the College and College Alumni is a critical part of navigating the world after time on the Hill. GVP is committed to connecting graduates old and new so that they may fully utilize the College and the resources it offers.\n\nWe Give\n\nThe gift of a GVP experience is made possible through the time, talents, and resources of the Gayatrians community. Financial gifts ensure student access to the finest faculty and opportunities the College can provide."
  },
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

module.exports = mongoose.model('AlumniStack', alumniStackSchema);
