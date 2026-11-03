const mongoose = require('mongoose');

const officialAlumniAuditSchema = new mongoose.Schema({
  recordId: { type: mongoose.Schema.Types.ObjectId, ref: 'OfficialAlumniRecord', default: null, index: true },
  entityType: { type: String, enum: ['record', 'batch', 'import'], default: 'record', index: true },
  entityKey: { type: String, default: '', maxlength: 300 },
  action: { type: String, enum: ['created', 'updated', 'archived', 'restored', 'imported'], required: true },
  administratorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  importId: { type: mongoose.Schema.Types.ObjectId, ref: 'AlumniImport', default: null },
  changes: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

officialAlumniAuditSchema.index({ createdAt: -1 });

module.exports = mongoose.model('OfficialAlumniAudit', officialAlumniAuditSchema);