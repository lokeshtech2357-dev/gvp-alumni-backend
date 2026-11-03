const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  link: { type: String, required: false, trim: true },
  important: { type: Boolean, default: false },
  visible: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('Notification', NotificationSchema);
