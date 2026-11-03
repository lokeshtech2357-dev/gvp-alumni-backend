const mongoose = require('mongoose');

const officialAlumniRecordSchema = new mongoose.Schema({
  recordId: { type: Number, min: 1, unique: true, sparse: true, index: true },
  registerNumber: { type: String, required: true, trim: true, maxlength: 64, unique: true },
  normalizedRegisterNumber: { type: String, required: true, unique: true },
  officialName: { type: String, required: true, trim: true, maxlength: 120 },
  normalizedName: { type: String, required: true, index: true },
  course: { type: String, default: '', trim: true, index: true },
  yearOfJoining: { type: Number, default: null, index: true },
  department: { type: String, default: '', trim: true, index: true },
  alumniGroup: { type: String, default: '', trim: true, index: true },
  academicYearRange: { type: String, default: '', trim: true },
  additionalData: { type: mongoose.Schema.Types.Mixed, default: {} },
  sourceImportId: { type: mongoose.Schema.Types.ObjectId, ref: 'AlumniImport', default: null, index: true },
  linkedUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  isArchived: { type: Boolean, default: false, index: true },
  archivedAt: { type: Date, default: null },
  archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

officialAlumniRecordSchema.index({ course: 1, yearOfJoining: 1, normalizedName: 1 });
officialAlumniRecordSchema.index({ course: 1, yearOfJoining: 1, department: 1, alumniGroup: 1, isArchived: 1 });

module.exports = mongoose.model('OfficialAlumniRecord', officialAlumniRecordSchema);