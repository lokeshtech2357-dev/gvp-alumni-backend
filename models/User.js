const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    unique: true
  },
  password: {
    type: String,
    required: true
  },
  passwordResetTokenHash: {
    type: String,
    select: false
  },
  passwordResetExpiresAt: {
    type: Date,
    select: false
  },
  officialAlumniRecordId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'OfficialAlumniRecord',
    unique: true,
    sparse: true,
  },
  tokenVersion: {
    type: Number,
    default: 0
  },
  role: {
    type: String,
    enum: ['alumni', 'editor', 'manager', 'super-admin', 'admin'],
    default: 'alumni'
  }
}, { timestamps: true });

module.exports = mongoose.model("User", userSchema);