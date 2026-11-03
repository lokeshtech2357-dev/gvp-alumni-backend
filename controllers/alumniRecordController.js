const ExcelJS = require('exceljs-community');
const mongoose = require('mongoose');
const AlumniRecord = require('../models/AlumniRecord');
const { verifyCloudinaryUpload } = require('../utils/cloudinaryUpload');

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

const degrees = [
  'BSc', 'BA', 'BCA', 'B.Com', 'BBM', 'BBA', 'B.Tech', 'MCA', 'MBA',
  'MSc (Computer Science)', 'MSc (Organic Chemistry)',
];
const engineeringBranches = [
  'Computer Science and Engineering',
  'Artificial Intelligence and Machine Learning',
  'Mechanical Engineering',
  'Electronics and Communication Engineering',
  'Civil Engineering',
];
const industries = ['Private Sector', 'Public Sector'];

const editableFields = [
  'fullName',
  'graduationName',
  'degree',
  'branch',
  'graduationYear',
  'mobile',
  'linkedinUrl',
  'employmentStatus',
  'companyName',
  'jobTitle',
  'industry',
  'workLocation',
  'country',
  'professionalAreas',
  'professionalOther',
];

const maxLengths = {
  fullName: 120,
  graduationName: 120,
  degree: 120,
  branch: 120,
  mobile: 25,
  linkedinUrl: 500,
  companyName: 160,
  jobTitle: 160,
  industry: 120,
  workLocation: 120,
  country: 120,
  professionalOther: 1000,
};

const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const validateProfile = (input, accountEmail) => {
  const data = {};
  for (const field of editableFields) {
    if (input[field] !== undefined) data[field] = input[field];
  }

  for (const field of [
    'fullName', 'graduationName', 'degree', 'branch', 'mobile',
    'linkedinUrl', 'companyName', 'jobTitle', 'industry', 'workLocation',
    'country', 'professionalOther',
  ]) {
    if (data[field] !== undefined) {
      if (typeof data[field] !== 'string') return { error: `${field} must be text.` };
      data[field] = data[field].trim();
      if (data[field].length > maxLengths[field]) return { error: `${field} must be no more than ${maxLengths[field]} characters.` };
    }
  }

  for (const field of ['fullName', 'degree', 'branch', 'mobile']) {
    if (!data[field]) return { error: `${field} is required.` };
  }

  if (!Number.isInteger(Number(data.graduationYear))
    || Number(data.graduationYear) < 1989
    || Number(data.graduationYear) > new Date().getFullYear()) {
    return { error: 'Enter a valid graduation year.' };
  }
  data.graduationYear = Number(data.graduationYear);

  if (!degrees.includes(data.degree)) return { error: 'Select a valid course or degree.' };
  if (data.degree === 'B.Tech' && !engineeringBranches.includes(data.branch)) {
    return { error: 'Select a valid B.Tech branch.' };
  }
  if (data.industry && !industries.includes(data.industry)) {
    return { error: 'Select Private Sector or Public Sector for industry.' };
  }

  if (!/^\+?[0-9\s().-]{7,25}$/.test(data.mobile) || data.mobile.replace(/\D/g, '').length < 7 || data.mobile.replace(/\D/g, '').length > 15) {
    return { error: 'Enter a valid mobile number with 7 to 15 digits.' };
  }

  if (!employmentStatuses.includes(data.employmentStatus)) {
    return { error: 'Select a valid employment status.' };
  }

  if (!Array.isArray(data.professionalAreas)
    || data.professionalAreas.some((area) => !professionalAreas.includes(area))) {
    return { error: 'Select valid professional areas.' };
  }
  data.professionalAreas = [...new Set(data.professionalAreas)];

  if (data.linkedinUrl) {
    try {
      const url = new URL(data.linkedinUrl);
      if (url.protocol !== 'https:' || !['linkedin.com', 'www.linkedin.com'].includes(url.hostname)) {
        return { error: 'Enter a valid HTTPS LinkedIn profile URL.' };
      }
    } catch {
      return { error: 'Enter a valid HTTPS LinkedIn profile URL.' };
    }
  }

  const email = String(accountEmail || '').trim().toLowerCase();
  if (!isValidEmail(email)) return { error: 'The signed-in account does not have a valid email address.' };
  data.email = email;
  return { data };
};

const makeFilter = (query) => {
  const filter = {};
  const textFields = {
    name: ['fullName', 'graduationName'],
    degree: ['degree'],
    branch: ['branch'],
    company: ['companyName'],
    jobTitle: ['jobTitle'],
    industry: ['industry'],
    country: ['country'],
    workLocation: ['workLocation'],
  };

  for (const [parameter, fields] of Object.entries(textFields)) {
    const value = typeof query[parameter] === 'string' ? query[parameter].trim().slice(0, 100) : '';
    if (value) {
      const expression = new RegExp(escapeRegex(value), 'i');
      filter[fields.length === 1 ? fields[0] : '$or'] = fields.length === 1
        ? expression
        : fields.map((field) => ({ [field]: expression }));
    }
  }

  if (query.employmentStatus) filter.employmentStatus = query.employmentStatus;
  if (query.graduationYear && /^\d{4}$/.test(String(query.graduationYear))) {
    filter.graduationYear = Number(query.graduationYear);
  }
  if (query.professionalArea) {
    const areas = String(query.professionalArea).split(',').map((area) => area.trim()).filter(Boolean);
    filter.professionalAreas = areas.length > 1 ? { $in: areas } : areas[0];
  }
  return filter;
};

const getFilterError = (query) => {
  if (query.employmentStatus && !employmentStatuses.includes(query.employmentStatus)) {
    return 'Select a valid employment status filter.';
  }
  if (query.graduationYear) {
    const year = String(query.graduationYear);
    if (!/^\d{4}$/.test(year) || Number(year) < 1989 || Number(year) > new Date().getFullYear()) {
      return 'Enter a valid graduation year filter.';
    }
  }
  const requestedAreas = typeof query.professionalArea === 'string'
    ? query.professionalArea.split(',').map((area) => area.trim()).filter(Boolean)
    : [];
  if (requestedAreas.some((area) => !professionalAreas.includes(area))) {
    return 'Select a valid professional area filter.';
  }
  return '';
};

const getRecords = async (filter, page, limit, sort) => {
  const [records, total] = await Promise.all([
    AlumniRecord.find(filter)
      .select('-alumniName -previousCompany')
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    AlumniRecord.countDocuments(filter),
  ]);
  return { records, total };
};

exports.getMyProfile = async (req, res) => {
  try {
    const profile = await AlumniRecord.findOne({ userId: req.user.id }).select('-alumniName -previousCompany').lean();
    return res.json({ profile });
  } catch (error) {
    console.error('Unable to load alumni profile:', error);
    return res.status(500).json({ message: 'Unable to load your alumni profile.' });
  }
};

exports.saveMyProfile = async (req, res) => {
  const { data, error } = validateProfile(req.body, req.user.email);
  if (error) return res.status(400).json({ message: error });

  try {
    const profile = await AlumniRecord.findOneAndUpdate(
      { userId: req.user.id },
      { $set: data, $setOnInsert: { userId: req.user.id } },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    ).select('-alumniName -previousCompany');
    return res.json({ message: 'Your alumni profile has been saved.', profile });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: 'An alumni profile already exists for this account.' });
    console.error('Unable to save alumni profile:', error);
    return res.status(500).json({ message: 'Unable to save your alumni profile.' });
  }
};

exports.uploadMyPhoto = async (req, res) => {
  try {
    const asset = await verifyCloudinaryUpload({
      imageUrl: req.body.imageUrl,
      filename: req.body.filename,
      purpose: 'alumni-profile',
    });
    const profile = await AlumniRecord.findOneAndUpdate(
      { userId: req.user.id },
      { $set: { profilePhoto: asset.secure_url } },
      { new: true }
    );
    if (!profile) return res.status(404).json({ message: 'Save your alumni profile before uploading a photo.' });
    return res.json({ profilePhoto: profile.profilePhoto });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
    console.error('Unable to save alumni profile photo:', error);
    return res.status(500).json({ message: 'Unable to save your profile photo.' });
  }
};

exports.getAdminSummary = async (req, res) => {
  try {
    const [total, statuses, byDegree, byBranch, byGraduationYear, byIndustry, byCountry, byLocation] = await Promise.all([
      AlumniRecord.countDocuments(),
      AlumniRecord.aggregate([{ $group: { _id: '$employmentStatus', count: { $sum: 1 } } }]),
      AlumniRecord.aggregate([{ $group: { _id: '$degree', count: { $sum: 1 } } }, { $sort: { count: -1, _id: 1 } }]),
      AlumniRecord.aggregate([{ $group: { _id: '$branch', count: { $sum: 1 } } }, { $sort: { count: -1, _id: 1 } }]),
      AlumniRecord.aggregate([{ $group: { _id: '$graduationYear', count: { $sum: 1 } } }, { $sort: { _id: -1 } }]),
      AlumniRecord.aggregate([{ $match: { industry: { $ne: '' } } }, { $group: { _id: '$industry', count: { $sum: 1 } } }, { $sort: { count: -1, _id: 1 } }]),
      AlumniRecord.aggregate([{ $match: { country: { $ne: '' } } }, { $group: { _id: '$country', count: { $sum: 1 } } }, { $sort: { count: -1, _id: 1 } }]),
      AlumniRecord.aggregate([{ $match: { workLocation: { $ne: '' } } }, { $group: { _id: '$workLocation', count: { $sum: 1 } } }, { $sort: { count: -1, _id: 1 } }]),
    ]);
    const countFor = (status) => statuses.find((item) => item._id === status)?.count || 0;
    return res.json({
      total,
      employed: countFor('Employed'),
      selfEmployed: countFor('Self-Employed'),
      entrepreneurs: countFor('Entrepreneur'),
      students: countFor('Student'),
      byDegree,
      byBranch,
      byGraduationYear,
      byIndustry,
      byCountry,
      byLocation,
    });
  } catch (error) {
    console.error('Unable to calculate alumni dashboard summary:', error);
    return res.status(500).json({ message: 'Unable to load the alumni dashboard summary.' });
  }
};

exports.searchAdminRecords = async (req, res) => {
  const filterError = getFilterError(req.query);
  if (filterError) return res.status(400).json({ message: filterError });
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
  const sortFields = { name: 'fullName', batch: 'graduationYear', graduationYear: 'graduationYear' };
  const sortField = sortFields[req.query.sort] || 'fullName';
  const direction = req.query.direction === 'desc' ? -1 : 1;
  try {
    const { records, total } = await getRecords(makeFilter(req.query), page, limit, { [sortField]: direction, _id: 1 });
    return res.json({ records, total, page, limit, pages: Math.ceil(total / limit) });
  } catch (error) {
    console.error('Unable to search alumni records:', error);
    return res.status(500).json({ message: 'Unable to search alumni records.' });
  }
};

exports.updateAdminRecord = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid alumni record ID.' });
  try {
    const existing = await AlumniRecord.findById(req.params.id).select('email');
    if (!existing) return res.status(404).json({ message: 'Alumni record not found.' });
    const { data, error } = validateProfile(req.body, existing.email);
    if (error) return res.status(400).json({ message: error });
    const record = await AlumniRecord.findByIdAndUpdate(
      req.params.id,
      { $set: data },
      { new: true, runValidators: true }
    ).select('-alumniName -previousCompany');
    if (!record) return res.status(404).json({ message: 'Alumni record not found.' });
    return res.json({ message: 'Alumni record updated.', record });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: 'That email is already linked to another alumni record.' });
    console.error('Unable to update alumni record:', error);
    return res.status(500).json({ message: 'Unable to update the alumni record.' });
  }
};

exports.deleteAdminRecord = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid alumni record ID.' });
  try {
    const record = await AlumniRecord.findByIdAndDelete(req.params.id);
    if (!record) return res.status(404).json({ message: 'Alumni record not found.' });
    return res.json({ message: 'Alumni record deleted.' });
  } catch (error) {
    console.error('Unable to delete alumni record:', error);
    return res.status(500).json({ message: 'Unable to delete the alumni record.' });
  }
};

exports.exportAdminRecords = async (req, res) => {
  const filterError = getFilterError(req.query);
  if (filterError) return res.status(400).json({ message: filterError });
  try {
    const records = await AlumniRecord.find(makeFilter(req.query)).select('-alumniName -previousCompany').sort({ fullName: 1, _id: 1 }).lean();
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Alumni Records');
    sheet.columns = [
      { header: 'Record ID', key: '_id', width: 26 },
      { header: 'Full Name', key: 'fullName', width: 24 },
      { header: 'Name at Graduation', key: 'graduationName', width: 24 },
      { header: 'Course / Degree', key: 'degree', width: 22 },
      { header: 'Branch / Department', key: 'branch', width: 24 },
      { header: 'Graduation Year', key: 'graduationYear', width: 16 },
      { header: 'Mobile Number', key: 'mobile', width: 20 },
      { header: 'Email Address', key: 'email', width: 30 },
      { header: 'LinkedIn Profile', key: 'linkedinUrl', width: 36 },
      { header: 'Employment Status', key: 'employmentStatus', width: 20 },
      { header: 'Company / Organization', key: 'companyName', width: 28 },
      { header: 'Job Title', key: 'jobTitle', width: 24 },
      { header: 'Industry', key: 'industry', width: 22 },
      { header: 'Work Location', key: 'workLocation', width: 22 },
      { header: 'Country', key: 'country', width: 18 },
      { header: 'Technologies You Have Knowledge Of', key: 'professionalAreas', width: 48 },
      { header: 'Additional Technologies / Skills', key: 'professionalOther', width: 40 },
      { header: 'Profile Photo URL', key: 'profilePhoto', width: 42 },
      { header: 'Created At', key: 'createdAt', width: 22 },
      { header: 'Updated At', key: 'updatedAt', width: 22 },
    ];
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4C111B' } };
    for (const record of records) {
      sheet.addRow({
        ...record,
        _id: String(record._id),
        professionalAreas: (record.professionalAreas || []).join(', '),
      });
    }
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.autoFilter = { from: 'A1', to: 'T1' };

    const file = await workbook.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="gvp-alumni-records.xlsx"');
    return res.send(Buffer.from(file));
  } catch (error) {
    console.error('Unable to export alumni records:', error);
    return res.status(500).json({ message: 'Unable to export alumni records.' });
  }
};
