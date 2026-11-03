const mongoose = require('mongoose');

const employmentStatuses = [
  'Employed',
  'Self-Employed',
  'Entrepreneur',
  'Student',
  'Unemployed',
  'Other',
];

const professionalAreas = [
  'IT / Software',
  'Programming Languages',
  'Web Development',
  'Mobile App Development',
  'Data Analytics',
  'Business Analytics',
  'Artificial Intelligence / Machine Learning',
  'Data Engineering',
  'Database Management',
  'Cloud Computing',
  'DevOps',
  'Cybersecurity',
  'Electronics',
  'Embedded Systems',
  'Electrical Engineering',
  'Mechanical Engineering',
  'Civil Engineering',
  'Education / Research',
  'Banking / Finance',
  'Healthcare',
  'Healthcare Technology',
  'Government / Public Sector',
  'Entrepreneurship / Business',
  'Other',
];

const alumniRecordSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true,
  },
  fullName: { type: String, required: true, trim: true, maxlength: 120 },
  profilePhoto: { type: String, default: '' },
  graduationName: { type: String, default: '', trim: true, maxlength: 120 },
  degree: { type: String, required: true, trim: true, maxlength: 120 },
  branch: { type: String, required: true, trim: true, maxlength: 120 },
  graduationYear: { type: Number, required: true, min: 1989, max: new Date().getFullYear() },
  mobile: { type: String, required: true, trim: true, maxlength: 25 },
  email: { type: String, required: true, lowercase: true, trim: true, maxlength: 254, unique: true },
  linkedinUrl: { type: String, default: '', trim: true, maxlength: 500 },
  employmentStatus: { type: String, required: true, enum: employmentStatuses },
  companyName: { type: String, default: '', trim: true, maxlength: 160 },
  jobTitle: { type: String, default: '', trim: true, maxlength: 160 },
  industry: { type: String, default: '', trim: true, maxlength: 120 },
  workLocation: { type: String, default: '', trim: true, maxlength: 120 },
  country: { type: String, default: '', trim: true, maxlength: 120 },
  professionalAreas: {
    type: [{ type: String, enum: professionalAreas }],
    default: [],
  },
  professionalOther: { type: String, default: '', trim: true, maxlength: 1000 },
}, { timestamps: true });

alumniRecordSchema.index({ graduationYear: 1, branch: 1 });
alumniRecordSchema.index({ employmentStatus: 1, industry: 1 });
alumniRecordSchema.index({ country: 1, workLocation: 1 });

module.exports = mongoose.model('AlumniRecord', alumniRecordSchema);
