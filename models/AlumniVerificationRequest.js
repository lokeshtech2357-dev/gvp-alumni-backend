const mongoose = require('mongoose');

const alumniVerificationRequestSchema = new mongoose.Schema({
  sessionTokenHash: { type: String, required: true, unique: true },
  candidateRecordIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'OfficialAlumniRecord' }],
  status: { type: String, enum: ['pending', 'unmatched', 'approved', 'rejected', 'consumed'], required: true },
  requestedName: { type: String, required: true, maxlength: 120 },
  requestedEmail: { type: String, required: true, maxlength: 254 },
  course: { type: String, required: true, maxlength: 120 },
  yearOfJoining: { type: Number, required: true },
  approvedRecordId: { type: mongoose.Schema.Types.ObjectId, ref: 'OfficialAlumniRecord', default: null },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  identityConfirmedAt: { type: Date, default: null },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
  approvedAt: { type: Date, default: null },
}, { timestamps: true });

module.exports = mongoose.model('AlumniVerificationRequest', alumniVerificationRequestSchema);