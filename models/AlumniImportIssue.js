const mongoose = require('mongoose');

const alumniImportIssueSchema = new mongoose.Schema({
  importId: { type: mongoose.Schema.Types.ObjectId, ref: 'AlumniImport', required: true },
  rowNumber: { type: Number, required: true },
  messages: { type: [String], default: [] },
}, { timestamps: true });

alumniImportIssueSchema.index({ importId: 1, rowNumber: 1 });

module.exports = mongoose.model('AlumniImportIssue', alumniImportIssueSchema);
