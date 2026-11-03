const crypto = require('crypto');
const XLSX = require('@e965/xlsx');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const path = require('path');
const OfficialAlumniRecord = require('../models/OfficialAlumniRecord');
const AlumniVerificationRequest = require('../models/AlumniVerificationRequest');
const AlumniImport = require('../models/AlumniImport');
const AlumniImportIssue = require('../models/AlumniImportIssue');
const OfficialAlumniAudit = require('../models/OfficialAlumniAudit');
const reserveRecordIds = require('../utils/officialAlumniSequence');
const User = require('../models/User');

const normalizeName = (value) => String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en');
const normalizeRegisterNumber = (value) => String(value || '').trim().replace(/\s+/g, '').toLocaleUpperCase('en');
const normalizeHeader = (value) => String(value || '').toLocaleLowerCase('en').replace(/[^a-z0-9]/g, '');
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
const fail = (statusCode, message) => Object.assign(new Error(message), { statusCode });
const metadataAliases = {
  registerNumber: ['registernumber', 'registerno', 'registrationnumber', 'registrationno', 'regnumber', 'regno', 'rollnumber', 'rollno', 'hallticketnumber'],
  officialName: ['nameaspercollegerecords', 'nameasperthecollegerecords', 'nameasperrecords', 'officialname', 'studentname', 'alumniname', 'name'],
  course: ['course', 'coursename', 'program', 'programname', 'programme', 'degree', 'degreename'],
  yearOfJoining: ['yearofjoining', 'yearofadmission', 'joiningyear', 'yearjoined', 'admissionyear', 'validjoiningyear'],
  department: ['department', 'dept', 'branch', 'specialization'],
  alumniGroup: ['alumnigroup', 'group', 'association', 'chapter'],
  academicYearRange: ['academicyearrange', 'batchrange', 'yearrange', 'academicyear'],
};

const textValue = (value) => value === null || value === undefined ? '' : String(value).trim();
const uniqueHeaders = (headers) => {
  const counts = new Map();
  const used = new Set();
  return headers.map((header, index) => {
    if (!header) return '';
    const count = (counts.get(header) || 0) + 1;
    counts.set(header, count);
    let uniqueHeader = count === 1 ? header : `${header} (column ${index + 1})`;
    while (used.has(uniqueHeader)) uniqueHeader = `${header} (column ${index + 1}-${count++})`;
    used.add(uniqueHeader);
    return uniqueHeader;
  });
};
const cellValue = (worksheet, row, column) => {
  const cell = worksheet[XLSX.utils.encode_cell({ r: row, c: column })];
  if (!cell) return '';
  if (typeof cell.v === 'number' && typeof cell.z === 'string' && /^0+$/.test(cell.z)) {
    return String(Math.trunc(cell.v)).padStart(cell.z.length, '0');
  }
  if (cell.t === 'd' && cell.v instanceof Date) return cell.v.toISOString();
  return cell.v ?? '';
};

const parseWorkbook = async (buffer, metadata, mapping = {}, allowUnmapped = false, originalFileName = '') => {
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new Error('The uploaded file is empty.');
  const extension = path.extname(originalFileName).toLocaleLowerCase('en');
  if (!['.xlsx', '.xls', '.csv'].includes(extension)) throw new Error('Upload an .xlsx, .xls, or .csv file.');
  const workbook = XLSX.read(buffer, { type: 'buffer', raw: true, cellDates: true, dense: false });
  const sheetName = workbook.SheetNames[0];
  const worksheet = sheetName && workbook.Sheets[sheetName];
  if (!worksheet || !worksheet['!ref']) throw new Error('The uploaded file does not contain a worksheet.');
  const range = XLSX.utils.decode_range(worksheet['!ref']);
  if (range.e.r - range.s.r + 1 > 50000 || range.e.c - range.s.c + 1 > 100) {
    throw new Error('The workbook exceeds the 50,000-row or 100-column import limit.');
  }
  const rowCount = range.e.r + 1;
  const columnCount = range.e.c + 1;
  let headerRowIndex = -1;
  let headers = [];
  let indexes = {};
  let fallbackIndex = -1;
  let fallbackHeaders = [];
  let fallbackIndexes = {};
  for (let rowIndex = range.s.r; rowIndex < Math.min(rowCount, range.s.r + 10); rowIndex += 1) {
    const candidateHeaders = uniqueHeaders(Array.from({ length: columnCount }, (_, column) => textValue(cellValue(worksheet, rowIndex, column))));
    if (candidateHeaders.some((header) => Buffer.byteLength(header, 'utf8') > 255)) {
      throw new Error('Column names must be no longer than 255 bytes.');
    }
    const candidateIndexes = {};
    for (const [field, aliases] of Object.entries(metadataAliases)) {
      candidateIndexes[field] = candidateHeaders.findIndex((header) => aliases.includes(normalizeHeader(header)));
    }
    if (candidateIndexes.registerNumber >= 0 && candidateIndexes.officialName >= 0) {
      headerRowIndex = rowIndex;
      headers = candidateHeaders;
      indexes = candidateIndexes;
      break;
    }
    if (fallbackIndex < 0 && candidateHeaders.filter(Boolean).length >= 2) {
      fallbackIndex = rowIndex;
      fallbackHeaders = candidateHeaders;
      fallbackIndexes = candidateIndexes;
    }
  }
  if (headerRowIndex < 0 && fallbackIndex >= 0) {
    headerRowIndex = fallbackIndex;
    headers = fallbackHeaders;
    indexes = fallbackIndexes;
  }
  if (headerRowIndex < 0) throw new Error('Could not detect a header row in the first 10 rows.');
  for (const [field, header] of Object.entries(mapping)) {
    if (!metadataAliases[field] || typeof header !== 'string' || !header.trim()) continue;
    const columnIndex = headers.findIndex((value) => normalizeHeader(value) === normalizeHeader(header));
    if (columnIndex < 0) throw new Error(`Mapped ${field} column was not found in this workbook.`);
    indexes[field] = columnIndex;
  }
  const suggestedMapping = Object.fromEntries(Object.entries(indexes)
    .filter(([, index]) => index >= 0)
    .map(([field, index]) => [field, headers[index]]));
  if (indexes.registerNumber < 0 || indexes.officialName < 0) {
    if (allowUnmapped) {
      let totalRows = 0;
      const sampleRecords = [];
      for (let rowIndex = headerRowIndex + 1; rowIndex < rowCount; rowIndex += 1) {
        const values = Array.from({ length: columnCount }, (_, column) => cellValue(worksheet, rowIndex, column));
        if (!values.some((value) => value !== '' && value !== null && value !== undefined)) continue;
        totalRows += 1;
        if (sampleRecords.length < 20) {
          sampleRecords.push({
            rowNumber: rowIndex + 1,
            values: Object.fromEntries(headers.map((header, index) => [header, values[index]]).filter(([header, value]) => header && value !== '' && value !== null && value !== undefined)),
          });
        }
      }
      return { headersDetected: headers.filter(Boolean), suggestedMapping, records: [], totalRows, sampleRecords, warnings: [], needsMapping: true };
    }
    throw new Error('Map the registration number and official name columns before importing.');
  }

  const records = [];
  const seenNumbers = new Set();
  const warnings = [];
  const mappedColumns = new Set(Object.values(indexes));
  const valueFor = (row, field) => indexes[field] >= 0 ? cellValue(worksheet, row, indexes[field]) : '';
  for (let rowIndex = headerRowIndex + 1; rowIndex < rowCount; rowIndex += 1) {
    const rowValues = Array.from({ length: columnCount }, (_, column) => cellValue(worksheet, rowIndex, column));
    if (!rowValues.some((value) => value !== '' && value !== null && value !== undefined)) continue;

    const registerNumber = textValue(valueFor(rowIndex, 'registerNumber'));
    const officialName = textValue(valueFor(rowIndex, 'officialName')).replace(/\s+/g, ' ');
    const fileCourse = textValue(valueFor(rowIndex, 'course'));
    const fileYear = textValue(valueFor(rowIndex, 'yearOfJoining'));
    const fileDepartment = textValue(valueFor(rowIndex, 'department'));
    const fileGroup = textValue(valueFor(rowIndex, 'alumniGroup'));
    const fileAcademicRange = textValue(valueFor(rowIndex, 'academicYearRange'));
    const errors = [];
    if (!registerNumber) errors.push('Missing register number.');
    if (registerNumber.length > 64) errors.push('Register number exceeds 64 characters.');
    if (!officialName) errors.push('Missing official name.');
    if (officialName.length > 120) errors.push('Official name exceeds 120 characters.');
    const normalizedNumber = normalizeRegisterNumber(registerNumber);
    if (normalizedNumber && seenNumbers.has(normalizedNumber)) errors.push('Duplicate register number in this workbook.');
    if (normalizedNumber) seenNumbers.add(normalizedNumber);

    const rawYear = fileYear || metadata.yearOfJoining;
    const parsedYear = rawYear === '' || rawYear === null || rawYear === undefined ? null : Number(rawYear);
    const parsedFileYear = Number.isSafeInteger(parsedYear) ? parsedYear : null;
    const assignedCourse = fileCourse || metadata.course;
    const assignedDepartment = fileDepartment || metadata.department;
    const assignedGroup = fileGroup || metadata.alumniGroup;
    const assignedAcademicRange = fileAcademicRange || metadata.academicYearRange;

    const additionalData = {};
    headers.forEach((header, index) => {
      if (!header || mappedColumns.has(index)) return;
      const value = rowValues[index];
      if (value === '' || value === null || value === undefined) return;
      additionalData[header] = value;
    });
    if (fileYear && parsedFileYear === null && indexes.yearOfJoining >= 0) {
      additionalData[headers[indexes.yearOfJoining]] = valueFor(rowIndex, 'yearOfJoining');
    }
    records.push({
      rowNumber: rowIndex + 1,
      registerNumber,
      officialName,
      course: assignedCourse,
      yearOfJoining: parsedFileYear,
      department: assignedDepartment,
      alumniGroup: assignedGroup,
      academicYearRange: assignedAcademicRange,
      additionalData,
      errors,
    });
  }

  const validRecords = records.filter((record) => record.errors.length === 0);
  const existingByNumber = new Map();
  for (let offset = 0; offset < validRecords.length; offset += 5000) {
    const batch = validRecords.slice(offset, offset + 5000);
    const existing = await OfficialAlumniRecord.find({
      normalizedRegisterNumber: { $in: batch.map((record) => normalizeRegisterNumber(record.registerNumber)) },
    }).select('normalizedRegisterNumber officialName course yearOfJoining department alumniGroup academicYearRange additionalData').lean();
    for (const record of existing) existingByNumber.set(record.normalizedRegisterNumber, record);
  }
  for (const record of validRecords) {
    const current = existingByNumber.get(normalizeRegisterNumber(record.registerNumber));
    if (!current) continue;
    const same = normalizeName(current.officialName) === normalizeName(record.officialName)
      && normalizeName(current.course) === normalizeName(record.course)
      && Number(current.yearOfJoining) === record.yearOfJoining
      && normalizeName(current.department) === normalizeName(record.department)
      && normalizeName(current.alumniGroup) === normalizeName(record.alumniGroup)
      && normalizeName(current.academicYearRange) === normalizeName(record.academicYearRange)
      && JSON.stringify(current.additionalData || {}) === JSON.stringify(record.additionalData || {});
    record.errors.push(same ? 'Already imported; this row will be skipped.' : 'Register number already exists with different details; row will be rejected.');
    record.existingDisposition = same ? 'skipped' : 'rejected';
  }
  return {
    headersDetected: headers.filter(Boolean),
    suggestedMapping,
    records,
    totalRows: records.length,
    warnings: [...new Set(warnings)],
    needsMapping: false,
  };
};

const validateMetadata = (body) => {
  const course = typeof body.course === 'string' ? body.course.trim() : '';
  const department = typeof body.department === 'string' ? body.department.trim() : '';
  const alumniGroup = typeof body.alumniGroup === 'string' ? body.alumniGroup.trim() : '';
  const academicYearRange = typeof body.academicYearRange === 'string' ? body.academicYearRange.trim() : '';
  const rawYear = body.yearOfJoining === undefined || body.yearOfJoining === '' ? null : Number(body.yearOfJoining);
  return {
    course,
    department,
    alumniGroup,
    academicYearRange,
    yearOfJoining: Number.isSafeInteger(rawYear) ? rawYear : null,
  };
};

const parseColumnMapping = (input) => {
  if (!input) return {};
  try {
    const mapping = typeof input === 'string' ? JSON.parse(input) : input;
    if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) return null;
    const fields = ['registerNumber', 'officialName', 'course', 'yearOfJoining', 'department', 'alumniGroup', 'academicYearRange'];
    const result = {};
    for (const field of fields) {
      if (mapping[field] === undefined || mapping[field] === '') continue;
      if (typeof mapping[field] !== 'string' || mapping[field].length > 120) return null;
      result[field] = mapping[field];
    }
    return result;
  } catch (error) {
    return null;
  }
};

exports.listCourses = async (req, res) => {
  try {
    const courses = await OfficialAlumniRecord.distinct('course', { isArchived: false });
    res.json({ courses: courses.sort((a, b) => a.localeCompare(b)) });
  } catch (error) {
    res.status(500).json({ message: 'Unable to load available courses.' });
  }
};

exports.getMyOfficialRecord = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('officialAlumniRecordId').lean();
    if (!user?.officialAlumniRecordId) return res.status(404).json({ message: 'No verified alumni record is linked to this account.' });
    const record = await OfficialAlumniRecord.findById(user.officialAlumniRecordId)
      .select('officialName registerNumber course yearOfJoining department').lean();
    if (!record) return res.status(404).json({ message: 'No verified alumni record is linked to this account.' });
    return res.json({ alumni: record });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to load your alumni record.' });
  }
};

exports.listYears = async (req, res) => {
  const course = typeof req.query.course === 'string' ? req.query.course.trim() : '';
  if (!course || course.length > 120) return res.status(400).json({ message: 'Select a valid course.' });
  try {
    const years = await OfficialAlumniRecord.distinct('yearOfJoining', { course, isArchived: false });
    res.json({ years: years.sort((a, b) => a - b) });
  } catch (error) {
    res.status(500).json({ message: 'Unable to load available joining years.' });
  }
};

exports.requestVerification = async (req, res) => {
  const course = typeof req.body.course === 'string' ? req.body.course.trim() : '';
  const yearOfJoining = Number(req.body.yearOfJoining);
  const requestedName = typeof req.body.name === 'string' ? req.body.name.trim().replace(/\s+/g, ' ') : '';
  const requestedEmail = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  if (!course || course.length > 120 || !Number.isInteger(yearOfJoining) || yearOfJoining < 1950 || yearOfJoining > 2100
    || !requestedName || requestedName.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(requestedEmail) || requestedEmail.length > 254) {
    return res.status(400).json({ message: 'Check the course, joining year, name, and email address.' });
  }

  try {
    const matchingRecords = await OfficialAlumniRecord.find({ course, yearOfJoining, normalizedName: normalizeName(requestedName), linkedUserId: null, isArchived: false })
      .select('_id').lean();
    const sessionToken = crypto.randomBytes(32).toString('hex');
    await AlumniVerificationRequest.create({
      sessionTokenHash: hashToken(sessionToken),
      candidateRecordIds: matchingRecords.map((record) => record._id),
      status: matchingRecords.length ? 'pending' : 'unmatched',
      requestedName,
      requestedEmail,
      course,
      yearOfJoining,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    });
    return res.status(202).json({
      sessionToken,
      message: 'If your details match an available record, an administrator will review your request. Please check back shortly.',
    });
  } catch (error) {
    console.error('Unable to create alumni verification request.');
    return res.status(503).json({ message: 'Unable to submit the verification request. Please try again later.' });
  }
};

exports.getVerificationStatus = async (req, res) => {
  const token = typeof req.body.sessionToken === 'string' ? req.body.sessionToken : '';
  if (!/^[a-f0-9]{64}$/.test(token)) return res.status(400).json({ message: 'Restart the verification request.' });
  try {
    const request = await AlumniVerificationRequest.findOne({ sessionTokenHash: hashToken(token) }).lean();
    if (!request || request.expiresAt <= new Date()) {
      return res.json({ status: 'restart' });
    }
    if (request.status !== 'approved' || !request.approvedRecordId) return res.json({ status: 'pending' });

    const secret = process.env.JWT_SECRET;
    if (!secret) return res.status(503).json({ message: 'Registration verification is not configured.' });
    const signature = crypto.createHmac('sha256', secret).update(`${token}:${request._id}:${request.approvedRecordId}`).digest('hex');
    const registrationToken = Buffer.from(`${token}.${signature}`).toString('base64url');
    const record = await OfficialAlumniRecord.findById(request.approvedRecordId)
      .select('officialName registerNumber course yearOfJoining department linkedUserId isArchived').lean();
    if (!record || record.linkedUserId || record.isArchived) return res.status(409).json({ status: 'pending' });
    return res.json({
      status: 'approved',
      registrationToken,
      alumni: {
        officialName: record.officialName,
        registerNumber: record.registerNumber,
        course: record.course,
        yearOfJoining: record.yearOfJoining,
        department: record.department,
      },
      message: 'Your alumni details have been verified successfully. Welcome to the GVPIHLR Alumni Community!',
    });
  } catch (error) {
    return res.status(503).json({ message: 'Unable to check verification status right now.' });
  }
};

exports.cancelVerificationRequest = async (req, res) => {
  const token = typeof req.body.sessionToken === 'string' ? req.body.sessionToken : '';
  if (!/^[a-f0-9]{64}$/.test(token)) return res.status(400).json({ message: 'Invalid verification request.' });
  try {
    await AlumniVerificationRequest.updateOne({ sessionTokenHash: hashToken(token), status: { $in: ['pending', 'approved'] } }, { $set: { status: 'rejected' } });
    return res.json({ message: 'Verification request invalidated.' });
  } catch (error) {
    return res.status(503).json({ message: 'Unable to invalidate the verification request.' });
  }
};

exports.previewImport = async (req, res) => {
  const metadata = validateMetadata(req.body);
  if (!metadata || !req.file) return res.status(400).json({ message: 'Select an .xlsx, .xls, or .csv file. Course, department, and joining year are read from workbook columns when available; fallback values are optional.' });
  const mapping = parseColumnMapping(req.body.columnMapping);
  if (!mapping) return res.status(400).json({ message: 'Column mapping is invalid.' });
  try {
    const parsed = await parseWorkbook(req.file.buffer, metadata, mapping, true, req.file.originalname);
    return res.json({
      headersDetected: parsed.headersDetected,
      suggestedMapping: parsed.suggestedMapping,
      needsMapping: parsed.needsMapping,
      warnings: parsed.warnings,
      summary: {
        processed: parsed.totalRows,
        valid: parsed.records.filter((record) => !record.errors.length).length,
        skipped: parsed.records.filter((record) => record.existingDisposition === 'skipped').length,
        rejected: parsed.records.filter((record) => record.errors.length && record.existingDisposition !== 'skipped').length,
        duplicates: parsed.records.filter((record) => record.existingDisposition || record.errors.some((item) => item.includes('Duplicate register number'))).length,
      },
      rows: parsed.records.slice(0, 20).map(({ rowNumber, registerNumber, officialName, course, yearOfJoining, department, alumniGroup, additionalData, errors }) => ({ rowNumber, registerNumber, officialName, course, yearOfJoining, department, alumniGroup, additionalData, errors })),
      sampleRecords: parsed.sampleRecords || [],
      mapping: Object.keys(mapping).length ? mapping : parsed.suggestedMapping,
    });
  } catch (error) {
    return res.status(400).json({ message: error.message || 'Unable to read this workbook.' });
  }
};

exports.importWorkbook = async (req, res) => {
  const metadata = validateMetadata(req.body);
  if (!metadata || !req.file) return res.status(400).json({ message: 'Select an .xlsx, .xls, or .csv file. Course, department, and joining year are read from workbook columns when available; fallback values are optional.' });
  const mapping = parseColumnMapping(req.body.columnMapping);
  if (!mapping) return res.status(400).json({ message: 'Column mapping is invalid.' });
  const originalFileName = path.basename(req.file.originalname || 'alumni.xlsx').slice(0, 255);
  const importName = (typeof req.body.importName === 'string' ? req.body.importName.trim() : originalFileName).slice(0, 120);
  if (!importName) return res.status(400).json({ message: 'Enter an import name.' });
  const summary = { processed: 0, inserted: 0, skipped: 0, updated: 0, rejected: 0 };
  const errors = [];
  let job;
  try {
    job = await AlumniImport.create({
      originalFileName,
      importName,
      createdBy: req.user.id,
      metadata,
      columnMapping: mapping,
      status: 'processing',
    });
    const parsed = await parseWorkbook(req.file.buffer, metadata, mapping, false, req.file.originalname);
    summary.processed = parsed.records.length;
    job.headersDetected = parsed.headersDetected;
    job.columnMapping = parsed.suggestedMapping;
    for (const record of parsed.records) {
      if (record.existingDisposition === 'skipped') {
        summary.skipped += 1;
        errors.push({ rowNumber: record.rowNumber, errors: record.errors });
        continue;
      }
      if (record.errors.length) {
        summary.rejected += 1;
        errors.push({ rowNumber: record.rowNumber, errors: record.errors });
        continue;
      }
    }
    for (let offset = 0; offset < errors.length; offset += 500) {
      await AlumniImportIssue.insertMany(errors.slice(offset, offset + 500).map((item) => ({
        importId: job._id,
        rowNumber: item.rowNumber,
        messages: item.errors,
      })), { ordered: true });
    }

    const validRecords = parsed.records.filter((record) => !record.errors.length && record.existingDisposition !== 'skipped');
    const recordIds = await reserveRecordIds(validRecords.length);
    validRecords.forEach((record, index) => { record.recordId = recordIds[index]; });
    for (let offset = 0; offset < validRecords.length; offset += 500) {
      const batch = validRecords.slice(offset, offset + 500);
      const operations = batch.map((record) => ({
        updateOne: {
          filter: { normalizedRegisterNumber: normalizeRegisterNumber(record.registerNumber) },
          update: { $setOnInsert: {
            registerNumber: record.registerNumber,
            normalizedRegisterNumber: normalizeRegisterNumber(record.registerNumber),
            recordId: record.recordId,
            officialName: record.officialName,
            normalizedName: normalizeName(record.officialName),
            course: record.course,
            yearOfJoining: record.yearOfJoining,
            department: record.department,
            alumniGroup: record.alumniGroup,
            academicYearRange: record.academicYearRange,
            additionalData: record.additionalData,
            sourceImportId: job._id,
          } },
          upsert: true,
        },
      }));
      const result = await OfficialAlumniRecord.bulkWrite(operations, { ordered: false });
      summary.inserted += result.upsertedCount;
      summary.skipped += result.matchedCount;
      const insertedAudits = Object.entries(result.upsertedIds || {}).map(([operationIndex, recordId]) => ({
        recordId,
        action: 'imported',
        administratorId: req.user.id,
        importId: job._id,
        changes: { recordId: batch[Number(operationIndex)]?.recordId, sourceImportId: job._id },
      }));
      if (insertedAudits.length) await OfficialAlumniAudit.insertMany(insertedAudits, { ordered: true });
      job.summary = summary;
      await job.save();
    }

    job.summary = summary;
    job.validationErrors = errors.slice(0, 1000).map((item) => ({ rowNumber: item.rowNumber, messages: item.errors }));
    job.status = summary.rejected ? (summary.inserted ? 'partial' : 'failed') : 'completed';
    job.completedAt = new Date();
    await job.save();
    return res.json({ importId: job._id, summary, errors: errors.slice(0, 100), headersDetected: parsed.headersDetected, warnings: parsed.warnings });
  } catch (error) {
    if (job) {
      try {
        summary.inserted = await OfficialAlumniRecord.countDocuments({ sourceImportId: job._id });
        job.summary = summary;
        job.status = summary.inserted ? 'partial' : 'failed';
        job.completedAt = new Date();
        job.validationErrors = [...errors.slice(0, 999).map((item) => ({ rowNumber: item.rowNumber, messages: item.errors })), { rowNumber: 0, messages: ['Import stopped before completion. A retry is safe.'] }];
        await job.save();
      } catch (historyError) {
        console.error('Unable to finalize alumni import history.');
      }
    }
    return res.status(500).json({ message: error.message || 'Unable to import this workbook.', importId: job?._id });
  }
};

exports.listVerificationRequests = async (req, res) => {
  try {
    const requests = await AlumniVerificationRequest.find({ status: 'pending', candidateRecordIds: { $ne: [] }, expiresAt: { $gt: new Date() } })
      .sort({ createdAt: 1 }).limit(100).lean();
    const ids = [...new Set(requests.flatMap((request) => request.candidateRecordIds.map(String)))];
    const records = await OfficialAlumniRecord.find({ _id: { $in: ids }, isArchived: false }).select('officialName registerNumber course yearOfJoining department linkedUserId').lean();
    const byId = new Map(records.map((record) => [String(record._id), record]));
    return res.json({ requests: requests.map((request) => ({
      id: request._id,
      requestedName: request.requestedName,
      requestedEmail: request.requestedEmail,
      course: request.course,
      yearOfJoining: request.yearOfJoining,
      candidates: request.candidateRecordIds.map((id) => byId.get(String(id))).filter((record) => record && !record.linkedUserId),
      createdAt: request.createdAt,
    })) });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to load verification requests.' });
  }
};

exports.approveVerificationRequest = async (req, res) => {
  const recordId = typeof req.body.recordId === 'string' ? req.body.recordId : '';
  if (!/^[a-f\d]{24}$/i.test(recordId) || req.body.identityConfirmed !== true) return res.status(400).json({ message: 'Confirm that the applicant and contact were checked through approved college records.' });
  try {
    const updated = await AlumniVerificationRequest.findOneAndUpdate({
      _id: req.params.id,
      status: 'pending',
      expiresAt: { $gt: new Date() },
      candidateRecordIds: recordId,
    }, { $set: { status: 'approved', approvedRecordId: recordId, approvedAt: new Date(), reviewedBy: req.user.id, identityConfirmedAt: new Date() } }, { new: true });
    if (!updated) return res.status(409).json({ message: 'This request is no longer available for approval.' });
    return res.json({ message: 'Approved. The applicant can now continue to account registration.' });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to approve this request.' });
  }
};

exports.rejectVerificationRequest = async (req, res) => {
  try {
    const updated = await AlumniVerificationRequest.findOneAndUpdate(
      { _id: req.params.id, status: 'pending', expiresAt: { $gt: new Date() } },
      { $set: { status: 'rejected', reviewedBy: req.user.id } },
    );
    if (!updated) return res.status(409).json({ message: 'This request is no longer available.' });
    return res.json({ message: 'Verification request rejected.' });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to reject this request.' });
  }
};

exports.registerVerifiedAlumni = async (req, res) => {
  const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const confirmPassword = typeof req.body.confirmPassword === 'string' ? req.body.confirmPassword : '';
  const registrationToken = typeof req.body.verificationToken === 'string' ? req.body.verificationToken : '';
  if (!name || name.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return res.status(400).json({ message: 'Enter a valid name and email address.' });
  if (password.length < 8 || Buffer.byteLength(password, 'utf8') > 72) return res.status(400).json({ message: 'Password must be at least 8 characters and no more than 72 bytes.' });
  if (!confirmPassword || password !== confirmPassword) return res.status(400).json({ message: 'Passwords do not match.' });

  let session;
  try {
    const decoded = Buffer.from(registrationToken, 'base64url').toString('utf8').split('.');
    const sessionToken = decoded[0] || '';
    const signature = decoded[1] || '';
    if (!/^[a-f0-9]{64}$/.test(sessionToken) || !/^[a-f0-9]{64}$/.test(signature) || !process.env.JWT_SECRET) {
      return res.status(403).json({ message: 'Complete alumni verification before creating an account.' });
    }
    const request = await AlumniVerificationRequest.findOne({ sessionTokenHash: hashToken(sessionToken), status: 'approved', expiresAt: { $gt: new Date() } }).lean();
    if (!request?.approvedRecordId) return res.status(403).json({ message: 'Complete alumni verification before creating an account.' });
    const expectedSignature = crypto.createHmac('sha256', process.env.JWT_SECRET).update(`${sessionToken}:${request._id}:${request.approvedRecordId}`).digest('hex');
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) return res.status(403).json({ message: 'The verification grant is invalid.' });
    if (request.requestedEmail !== email) return res.status(403).json({ message: 'Use the email address reviewed by the administrator.' });

    const record = await OfficialAlumniRecord.findOne({ _id: request.approvedRecordId, isArchived: false }).select('officialName linkedUserId').lean();
    if (!record || record.linkedUserId || normalizeName(name) !== normalizeName(record.officialName)) {
      return res.status(403).json({ message: 'The verified alumni details do not match this registration.' });
    }
    const escapedEmail = email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const emailQuery = { email: { $regex: `^${escapedEmail}$`, $options: 'i' } };
    if (await User.findOne(emailQuery).select('_id').lean()) return res.status(409).json({ message: 'An account with this email already exists. Please sign in instead.' });

    const hashedPassword = await bcrypt.hash(password, 12);
    session = await mongoose.startSession();
    let officialName = record.officialName;
    await session.withTransaction(async () => {
      const currentRequest = await AlumniVerificationRequest.findOne({
        _id: request._id,
        status: 'approved',
        expiresAt: { $gt: new Date() },
        approvedRecordId: request.approvedRecordId,
      }).session(session);
      if (!currentRequest || currentRequest.requestedEmail !== email) throw fail(403, 'The verification grant is no longer available.');

      const currentRecord = await OfficialAlumniRecord.findOne({ _id: request.approvedRecordId, isArchived: false }).session(session);
      if (!currentRecord || currentRecord.linkedUserId || normalizeName(name) !== normalizeName(currentRecord.officialName)) {
        throw fail(409, 'This alumni record is already linked or no longer matches.');
      }
      officialName = currentRecord.officialName;
      const existingUser = await User.findOne(emailQuery).select('_id').session(session).lean();
      if (existingUser) throw fail(409, 'An account with this email already exists. Please sign in instead.');

      const user = new User({ name: officialName, email, password: hashedPassword, role: 'alumni', officialAlumniRecordId: currentRecord._id });
      await user.save({ session });
      const linked = await OfficialAlumniRecord.updateOne({ _id: currentRecord._id, linkedUserId: null }, { $set: { linkedUserId: user._id } }, { session });
      if (linked.modifiedCount !== 1) throw fail(409, 'This alumni record is already linked to an account.');
      const consumed = await AlumniVerificationRequest.updateOne({ _id: currentRequest._id, status: 'approved' }, { $set: { status: 'consumed' } }, { session });
      if (consumed.modifiedCount !== 1) throw fail(409, 'This verification grant has already been used.');
    });
    return res.status(201).json({ message: `Welcome to the GVPIHLR Alumni Community, ${officialName}. Please sign in.` });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: 'This account or alumni record is already registered.' });
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
    console.error('Verified alumni registration failed.');
    return res.status(500).json({ message: 'Unable to create your account right now.' });
  } finally {
    if (session) await session.endSession();
  }
};