const mongoose = require('mongoose');

const subscriberSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  name: { type: String },
  source: { type: String },
  subscribedAt: { type: Date, default: Date.now },
  confirmed: { type: Boolean, default: false }
});

module.exports = mongoose.model('Subscriber', subscriberSchema);
