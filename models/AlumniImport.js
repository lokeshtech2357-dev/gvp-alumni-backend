const mongoose = require('mongoose');

const alumniImportSchema = new mongoose.Schema({
  originalFileName: { type: String, required: true, maxlength: 255 },
  importName: { type: String, required: true, trim: true, maxlength: 120 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  metadata: {
    yearOfJoining: { type: Number, default: null },
    course: { type: String, trim: true, default: '' },
    department: { type: String, trim: true, default: '' },
    alumniGroup: { type: String, trim: true, default: '' },
    academicYearRange: { type: String, trim: true, default: '' },
  },
  headersDetected: { type: [String], default: [] },
  columnMapping: { type: mongoose.Schema.Types.Mixed, default: {} },
  status: { type: String, enum: ['processing', 'completed', 'partial', 'failed', 'archived'], default: 'processing', index: true },
  summary: {
    processed: { type: Number, default: 0 },
    inserted: { type: Number, default: 0 },
    updated: { type: Number, default: 0 },
    skipped: { type: Number, default: 0 },
    rejected: { type: Number, default: 0 },
  },
  validationErrors: [{ rowNumber: Number, messages: [String] }],
  startedAt: { type: Date, default: Date.now },
  completedAt: { type: Date, default: null },
  archivedAt: { type: Date, default: null },
  archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

alumniImportSchema.index({ createdAt: -1 });

module.exports = mongoose.model('AlumniImport', alumniImportSchema);