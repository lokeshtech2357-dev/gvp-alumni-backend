const mongoose = require('mongoose');
const ExcelJS = require('exceljs');
const OfficialAlumniRecord = require('../models/OfficialAlumniRecord');
const AlumniImport = require('../models/AlumniImport');
const AlumniImportIssue = require('../models/AlumniImportIssue');
const OfficialAlumniAudit = require('../models/OfficialAlumniAudit');
const reserveRecordIds = require('../utils/officialAlumniSequence');

const normalizeName = (value) => String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en');
const normalizeRegisterNumber = (value) => String(value || '').trim().replace(/\s+/g, '').toLocaleUpperCase('en');
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isObjectId = (value) => mongoose.Types.ObjectId.isValid(value);
const editableFields = ['registerNumber', 'officialName', 'course', 'yearOfJoining', 'department', 'alumniGroup', 'academicYearRange', 'additionalData'];
const fail = (statusCode, message) => Object.assign(new Error(message), { statusCode });
const normalizedStaticHeaders = new Set([
  'registernumber', 'registerno', 'registrationnumber', 'registrationno', 'regnumber', 'regno', 'rollnumber', 'rollno', 'hallticketnumber',
  'nameaspercollegerecords', 'nameasperthecollegerecords', 'nameasperrecords', 'officialname', 'studentname', 'alumniname', 'name',
  'course', 'coursename', 'program', 'programname', 'programme', 'degree', 'degreename',
  'yearofjoining', 'yearofadmission', 'joiningyear', 'yearjoined', 'admissionyear',
  'department', 'dept', 'branch', 'specialization',
  'alumnigroup', 'group', 'association', 'chapter',
  'academicyearrange', 'batchrange', 'yearrange', 'academicyear',
]);
const normalizeHeader = (value) => String(value || '').toLocaleLowerCase('en').replace(/[^a-z0-9]/g, '');
const getDynamicFields = async (filter = { isArchived: false }) => {
  const [recordFields, imports] = await Promise.all([
    OfficialAlumniRecord.aggregate([
      { $match: { ...filter, additionalData: { $type: 'object' } } },
      { $project: { fields: { $objectToArray: '$additionalData' } } },
      { $unwind: '$fields' },
      { $group: { _id: '$fields.k' } },
      { $sort: { _id: 1 } },
      { $limit: 16376 },
    ]),
    AlumniImport.find({ headersDetected: { $exists: true, $ne: [] } }).select('headersDetected columnMapping').lean(),
  ]);
  const fields = new Set(recordFields.map(({ _id }) => _id));
  for (const job of imports) {
    const mappedHeaders = new Set(Object.values(job.columnMapping || {}));
    for (const header of job.headersDetected || []) {
      if (mappedHeaders.has(header) || normalizedStaticHeaders.has(normalizeHeader(header))) continue;
      fields.add(header);
    }
  }
  return [...fields].sort((a, b) => a.localeCompare(b)).slice(0, 16376);
};
const withTransaction = async (callback) => {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => { result = await callback(session); });
    return result;
  } finally {
    await session.endSession();
  }
};

const validateRecord = (input, partial = false) => {
  const record = {};
  for (const field of editableFields) {
    if (input[field] !== undefined) record[field] = input[field];
  }
  for (const field of ['registerNumber', 'officialName', 'course', 'department', 'alumniGroup', 'academicYearRange']) {
    if (record[field] === undefined && partial) continue;
    if (record[field] === undefined) record[field] = '';
    if (typeof record[field] !== 'string') return { error: `${field} must be text.` };
    record[field] = record[field].trim();
  }
  if ((!partial || record.registerNumber !== undefined) && (!record.registerNumber || record.registerNumber.length > 64)) return { error: 'Enter a register number of up to 64 characters.' };
  if ((!partial || record.officialName !== undefined) && (!record.officialName || record.officialName.length > 120)) return { error: 'Enter an official name of up to 120 characters.' };
  if ((!partial || record.course !== undefined) && (!record.course || record.course.length > 120)) return { error: 'Enter a course of up to 120 characters.' };
  if (record.department?.length > 120 || record.alumniGroup?.length > 120 || record.academicYearRange?.length > 80) return { error: 'Department, group, or academic-year range exceeds its allowed length.' };
  if (record.yearOfJoining !== undefined || !partial) {
    const year = Number(record.yearOfJoining);
    if (!Number.isInteger(year) || year < 1989 || year > 2100) return { error: 'Year of joining must be between 1989 and 2100.' };
    record.yearOfJoining = year;
  }
  if (record.additionalData !== undefined && (!record.additionalData || typeof record.additionalData !== 'object' || Array.isArray(record.additionalData))) {
    return { error: 'Additional data must be an object.' };
  }
  if (record.registerNumber !== undefined) record.normalizedRegisterNumber = normalizeRegisterNumber(record.registerNumber);
  if (record.officialName !== undefined) record.normalizedName = normalizeName(record.officialName);
  return { record };
};

const getPagination = (query) => {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit, 10) || 25));
  return { page, limit };
};

const buildRecordFilter = (query) => {
  const filter = { isArchived: query.includeArchived === 'true' };
  const conditions = [];
  const keyword = typeof query.keyword === 'string' ? query.keyword.trim().slice(0, 100) : '';
  if (keyword) {
    const expression = new RegExp(escapeRegex(keyword), 'i');
    conditions.push({
      $or: [
        { normalizedName: new RegExp(escapeRegex(normalizeName(keyword)), 'i') },
        { normalizedRegisterNumber: new RegExp(escapeRegex(normalizeRegisterNumber(keyword)), 'i') },
        { course: expression },
        { department: expression },
        { alumniGroup: expression },
        { academicYearRange: expression },
        {
          $expr: {
            $anyElementTrue: {
              $map: {
                input: {
                  $objectToArray: {
                    $cond: [{ $eq: [{ $type: '$additionalData' }, 'object'] }, '$additionalData', {}],
                  },
                },
                as: 'field',
                in: {
                  $regexMatch: {
                    input: { $convert: { input: '$$field.v', to: 'string', onNull: '', onError: '' } },
                    regex: escapeRegex(keyword),
                    options: 'i',
                  },
                },
              },
            },
          },
        },
      ],
    });
  }

  let filters = [];
  if (query.filters) {
    try {
      filters = JSON.parse(query.filters);
    } catch (error) {
      return { error: 'Filter settings are invalid.' };
    }
    if (!Array.isArray(filters) || filters.length > 30) return { error: 'Use no more than 30 filters.' };
  }
  const allowedFields = new Set([
    'recordId', 'registerNumber', 'officialName', 'course', 'department', 'alumniGroup',
    'yearOfJoining', 'academicYearRange', 'accountStatus',
  ]);
  for (const item of filters) {
    if (!item || typeof item.field !== 'string') return { error: 'A filter field is invalid.' };
    const value = item.value;
    if (Array.isArray(value)) {
      const values = value.filter((entry) => typeof entry === 'string' && entry.trim()).slice(0, 100).map((entry) => entry.trim().slice(0, 120));
      if (!values.length) continue;
      if (!allowedFields.has(item.field)) return { error: 'A filter field is not supported.' };
      if (item.field === 'accountStatus') {
        if (values.length === 1) conditions.push({ linkedUserId: values[0] === 'linked' ? { $ne: null } : null });
      } else {
        conditions.push({ [item.field]: { $in: values } });
      }
      continue;
    }
    if (typeof value !== 'string' || !value.trim()) continue;
    const text = value.trim().slice(0, 120);
    if (item.field.startsWith('additionalData:')) {
      const key = item.field.slice('additionalData:'.length);
      if (!key || key.length > 120 || key.startsWith('$')) return { error: 'A dynamic filter field is invalid.' };
      const expression = new RegExp(escapeRegex(text), 'i');
      if (/^[A-Za-z0-9 _-]{1,120}$/.test(key)) {
        const alternatives = [{ [`additionalData.${key}`]: expression }];
        if (/^-?\d+(?:\.\d+)?$/.test(text)) alternatives.push({ [`additionalData.${key}`]: Number(text) });
        if (['true', 'false'].includes(text.toLowerCase())) alternatives.push({ [`additionalData.${key}`]: text.toLowerCase() === 'true' });
        conditions.push({ $or: alternatives });
      } else {
        conditions.push({
          $expr: {
            $regexMatch: {
              input: {
                $convert: {
                  input: {
                    $getField: {
                      field: { $literal: key },
                      input: { $cond: [{ $eq: [{ $type: '$additionalData' }, 'object'] }, '$additionalData', {}] },
                    },
                  },
                  to: 'string',
                  onNull: '',
                  onError: '',
                },
              },
              regex: escapeRegex(text),
              options: 'i',
            },
          },
        });
      }
    } else {
      if (!allowedFields.has(item.field)) return { error: 'A filter field is not supported.' };
      if (item.field === 'accountStatus') {
        if (!['linked', 'unlinked'].includes(text)) return { error: 'Account status filter is invalid.' };
        conditions.push({ linkedUserId: text === 'linked' ? { $ne: null } : null });
      } else if (item.field === 'recordId' || item.field === 'yearOfJoining') {
        const number = Number(text);
        if (!Number.isInteger(number)) return { error: 'Enter a valid numeric filter.' };
        conditions.push({ [item.field]: number });
      } else if (item.field === 'officialName') {
        conditions.push({ normalizedName: new RegExp(escapeRegex(normalizeName(text)), 'i') });
      } else if (item.field === 'registerNumber') {
        conditions.push({ normalizedRegisterNumber: new RegExp(escapeRegex(normalizeRegisterNumber(text)), 'i') });
      } else {
        conditions.push({ [item.field]: new RegExp(escapeRegex(text), 'i') });
      }
    }
  }

  for (const [param, field, operator] of [
    ['joiningYearFrom', 'yearOfJoining', '$gte'],
    ['joiningYearTo', 'yearOfJoining', '$lte'],
  ]) {
    if (query[param] === undefined || query[param] === '') continue;
    const year = Number(query[param]);
    if (!Number.isInteger(year) || year < 1989 || year > 2100) return { error: 'Enter a valid joining-year range.' };
    conditions.push({ [field]: { [operator]: year } });
  }
  const passingYearFrom = query.passingYearFrom === undefined || query.passingYearFrom === '' ? null : Number(query.passingYearFrom);
  const passingYearTo = query.passingYearTo === undefined || query.passingYearTo === '' ? null : Number(query.passingYearTo);
  if (passingYearFrom !== null || passingYearTo !== null) {
    const passingYearField = typeof query.passingYearField === 'string' ? query.passingYearField.trim() : '';
    if (!passingYearField || passingYearField.length > 120 || passingYearField.startsWith('$')) return { error: 'Select a valid passing-year field.' };
    if ([passingYearFrom, passingYearTo].some((year) => year !== null && (!Number.isInteger(year) || year < 1950 || year > 2100))) {
      return { error: 'Enter a valid passing-year range.' };
    }
    const yearValue = { $convert: { input: { $getField: { field: { $literal: passingYearField }, input: '$additionalData' } }, to: 'int', onError: null, onNull: null } };
    const rangeConditions = [];
    if (passingYearFrom !== null) rangeConditions.push({ $gte: [yearValue, passingYearFrom] });
    if (passingYearTo !== null) rangeConditions.push({ $lte: [yearValue, passingYearTo] });
    conditions.push({ $expr: { $and: rangeConditions } });
  }
  if (conditions.length) filter.$and = conditions;
  return { filter };
};

const batchFilterFromBody = (body) => {
  const course = typeof body.course === 'string' ? body.course.trim() : '';
  const department = typeof body.department === 'string' ? body.department.trim() : '';
  const alumniGroup = typeof body.alumniGroup === 'string' ? body.alumniGroup.trim() : '';
  const yearOfJoining = Number(body.yearOfJoining);
  if (!course || course.length > 120 || department.length > 120 || alumniGroup.length > 120 || !Number.isInteger(yearOfJoining) || yearOfJoining < 1989 || yearOfJoining > 2100) return null;
  return { course, department, alumniGroup, yearOfJoining, isArchived: false };
};

const archiveImpact = async (filter, session) => {
  const recordsQuery = OfficialAlumniRecord.countDocuments(filter);
  const linkedQuery = OfficialAlumniRecord.countDocuments({ ...filter, linkedUserId: { $ne: null } });
  if (session) {
    recordsQuery.session(session);
    linkedQuery.session(session);
  }
  const [records, linkedRecords] = await Promise.all([
    recordsQuery,
    linkedQuery,
  ]);
  return { records, linkedRecords, unlinkedRecords: records - linkedRecords };
};

exports.listRecords = async (req, res) => {
  const { filter, error } = buildRecordFilter(req.query);
  if (error) return res.status(400).json({ message: error });
  const { page, limit } = getPagination(req.query);
  const direction = req.query.direction === 'asc' ? 1 : -1;
  const sortField = typeof req.query.sort === 'string' ? req.query.sort : 'recordId';
  const fixedSortFields = new Set(['recordId', 'registerNumber', 'officialName', 'course', 'department', 'alumniGroup', 'yearOfJoining', 'academicYearRange', 'createdAt']);
  const dynamicSortField = sortField.startsWith('additionalData:') ? sortField.slice('additionalData:'.length) : '';
  if (!fixedSortFields.has(sortField) && (!dynamicSortField || dynamicSortField.length > 120 || dynamicSortField.startsWith('$'))) {
    return res.status(400).json({ message: 'Select a valid sort field.' });
  }
  try {
    const pipeline = [{ $match: filter }];
    const sortKey = dynamicSortField ? '__dynamicSort' : sortField;
    if (dynamicSortField) {
      pipeline.push({
        $addFields: {
          __dynamicSort: {
            $getField: {
              field: { $literal: dynamicSortField },
              input: { $cond: [{ $eq: [{ $type: '$additionalData' }, 'object'] }, '$additionalData', {}] },
            },
          },
        },
      });
    }
    pipeline.push({ $sort: { [sortKey]: direction, _id: 1 } }, { $skip: (page - 1) * limit }, { $limit: limit });
    if (dynamicSortField) pipeline.push({ $project: { __dynamicSort: 0 } });
    const [records, total] = await Promise.all([
      OfficialAlumniRecord.aggregate(pipeline),
      OfficialAlumniRecord.countDocuments(filter),
    ]);
    return res.json({ records, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to load official alumni records.' });
  }
};

exports.listAvailableFields = async (req, res) => {
  try {
    const activeFilter = { isArchived: false };
    const [courses, departments, alumniGroups, dynamicFields] = await Promise.all([
      OfficialAlumniRecord.distinct('course', activeFilter),
      OfficialAlumniRecord.distinct('department', activeFilter),
      OfficialAlumniRecord.distinct('alumniGroup', activeFilter),
      getDynamicFields(activeFilter),
    ]);
    return res.json({
      courses: courses.filter(Boolean).sort(),
      departments: departments.filter(Boolean).sort(),
      alumniGroups: alumniGroups.filter(Boolean).sort(),
      dynamicFields,
    });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to load available alumni fields.' });
  }
};

exports.exportRecords = async (req, res) => {
  const { filter, error } = buildRecordFilter(req.query);
  if (error) return res.status(400).json({ message: error });
  const direction = req.query.direction === 'asc' ? 1 : -1;
  const sortField = typeof req.query.sort === 'string' ? req.query.sort : 'recordId';
  const fixedSortFields = new Set(['recordId', 'registerNumber', 'officialName', 'course', 'department', 'alumniGroup', 'yearOfJoining', 'academicYearRange', 'createdAt']);
  const dynamicSortField = sortField.startsWith('additionalData:') ? sortField.slice('additionalData:'.length) : '';
  if (!fixedSortFields.has(sortField) && (!dynamicSortField || dynamicSortField.length > 120 || dynamicSortField.startsWith('$'))) {
    return res.status(400).json({ message: 'Select a valid sort field.' });
  }
  if (req.query.ids) {
    let ids;
    try {
      ids = JSON.parse(req.query.ids);
    } catch (parseError) {
      return res.status(400).json({ message: 'Selected record IDs are invalid.' });
    }
    if (!Array.isArray(ids) || ids.length > 5000 || ids.some((id) => !isObjectId(id))) {
      return res.status(400).json({ message: 'Select no more than 5,000 valid records to export.' });
    }
    filter._id = { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) };
  }
  try {
    const [recordCount, extraFields] = await Promise.all([
      OfficialAlumniRecord.countDocuments(filter),
      getDynamicFields(),
    ]);
    if (recordCount > 1048575) return res.status(413).json({ message: 'Excel supports up to 1,048,575 alumni records per export.' });
    if (extraFields.length > 16375) return res.status(413).json({ message: 'The records contain too many distinct additional columns for an Excel worksheet.' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="official-alumni-records.xlsx"');
    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res, useSharedStrings: false, useStyles: true });
    const worksheet = workbook.addWorksheet('Official Alumni');
    worksheet.views = [{ state: 'frozen', ySplit: 1 }];
    const fields = [
      ['Record ID', 'recordId'],
      ['Registration Number', 'registerNumber'],
      ['Official Name', 'officialName'],
      ['Course', 'course'],
      ['Department', 'department'],
      ['Year of Joining', 'yearOfJoining'],
      ['Alumni Group', 'alumniGroup'],
      ['Academic Year / Batch', 'academicYearRange'],
      ['Account Status', 'linkedUserId'],
      ...extraFields.map((field) => [field, `additionalData:${field}`]),
    ];
    worksheet.autoFilter = { from: 'A1', to: `${worksheet.getColumn(fields.length).letter}1` };
    const header = worksheet.addRow(fields.map(([label]) => label));
    header.font = { bold: true };
    header.commit();
    let recordCursor;
    if (dynamicSortField) {
      recordCursor = OfficialAlumniRecord.aggregate([
        { $match: filter },
        {
          $addFields: {
            __dynamicSort: {
              $getField: {
                field: { $literal: dynamicSortField },
                input: { $cond: [{ $eq: [{ $type: '$additionalData' }, 'object'] }, '$additionalData', {}] },
              },
            },
          },
        },
        { $sort: { __dynamicSort: direction, _id: 1 } },
        { $project: { __dynamicSort: 0 } },
      ]).cursor({ batchSize: 500 });
    } else {
      recordCursor = OfficialAlumniRecord.find(filter).sort({ [sortField]: direction, _id: 1 }).lean().cursor({ batchSize: 500 });
    }
    for await (const record of recordCursor) {
      worksheet.addRow(fields.map(([, key]) => {
        if (key.startsWith('additionalData:')) return record.additionalData?.[key.slice('additionalData:'.length)] ?? '';
        if (key === 'linkedUserId') return record.linkedUserId ? 'Linked' : 'Not linked';
        return record[key] ?? '';
      })).commit();
    }
    await workbook.commit();
    return undefined;
  } catch (error) {
    if (res.headersSent) return res.destroy(error);
    return res.status(500).json({ message: 'Unable to export official alumni records.' });
  }
};

exports.getRecord = async (req, res) => {
  if (!isObjectId(req.params.id)) return res.status(400).json({ message: 'Select a valid alumni record.' });
  try {
    const record = await OfficialAlumniRecord.findOne({ _id: req.params.id, isArchived: false }).lean();
    if (!record) return res.status(404).json({ message: 'Alumni record not found.' });
    return res.json({ record });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to load this alumni record.' });
  }
};

exports.createRecord = async (req, res) => {
  const { record, error } = validateRecord(req.body);
  if (error) return res.status(400).json({ message: error });
  try {
    const created = await withTransaction(async (session) => {
      const [recordId] = await reserveRecordIds(1);
      const [createdRecord] = await OfficialAlumniRecord.create([{ ...record, recordId }], { session });
      await OfficialAlumniAudit.create([{ recordId: createdRecord._id, action: 'created', administratorId: req.user.id, changes: { ...record, recordId } }], { session });
      return createdRecord;
    });
    return res.status(201).json({ record: created });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: 'This register number already belongs to an alumni record.' });
    return res.status(500).json({ message: 'Unable to create the alumni record.' });
  }
};

exports.updateRecord = async (req, res) => {
  if (!isObjectId(req.params.id)) return res.status(400).json({ message: 'Select a valid alumni record.' });
  const { record, error } = validateRecord(req.body, true);
  if (error) return res.status(400).json({ message: error });
  delete record.normalizedName;
  delete record.normalizedRegisterNumber;
  try {
    const updated = await withTransaction(async (session) => {
      const current = await OfficialAlumniRecord.findOne({ _id: req.params.id, isArchived: false }).session(session);
      if (!current) throw fail(404, 'Alumni record not found.');
      const changes = {};
      for (const [field, value] of Object.entries(record)) {
        if (JSON.stringify(current[field]) !== JSON.stringify(value)) changes[field] = { from: current[field], to: value };
      }
      if (!Object.keys(changes).length) return current;
      Object.assign(current, record);
      if (record.registerNumber !== undefined) current.normalizedRegisterNumber = normalizeRegisterNumber(record.registerNumber);
      if (record.officialName !== undefined) current.normalizedName = normalizeName(record.officialName);
      await current.save({ session });
      await OfficialAlumniAudit.create([{ recordId: current._id, action: 'updated', administratorId: req.user.id, changes }], { session });
      return current;
    });
    return res.json({ record: updated });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
    if (error.code === 11000) return res.status(409).json({ message: 'This register number already belongs to another alumni record.' });
    return res.status(500).json({ message: 'Unable to update the alumni record.' });
  }
};

exports.archiveRecord = async (req, res) => {
  if (!isObjectId(req.params.id) || req.body.confirm !== true) return res.status(400).json({ message: 'Confirm the record archive action.' });
  try {
    await withTransaction(async (session) => {
      const record = await OfficialAlumniRecord.findOne({ _id: req.params.id, isArchived: false }).session(session);
      if (!record) throw fail(404, 'Alumni record not found.');
      if (record.linkedUserId) throw fail(409, 'This record is linked to an alumni account. Review or reassign that account before archiving.');
      record.isArchived = true;
      record.archivedAt = new Date();
      record.archivedBy = req.user.id;
      await record.save({ session });
      await OfficialAlumniAudit.create([{ recordId: record._id, action: 'archived', administratorId: req.user.id, changes: { reason: 'administrator-requested archive' } }], { session });
    });
    return res.json({ message: 'Alumni record archived. The historical data remains available to administrators.' });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
    return res.status(500).json({ message: 'Unable to archive the alumni record.' });
  }
};

exports.listBatches = async (req, res) => {
  const { page, limit } = getPagination(req.query);
  try {
    const [batches, countResult] = await Promise.all([
      OfficialAlumniRecord.aggregate([
        { $match: { isArchived: false } },
        { $group: { _id: { course: '$course', yearOfJoining: '$yearOfJoining', department: '$department', alumniGroup: '$alumniGroup' }, records: { $sum: 1 }, linkedAccounts: { $sum: { $cond: [{ $ne: ['$linkedUserId', null] }, 1, 0] } } } },
        { $sort: { '_id.yearOfJoining': -1, '_id.course': 1 } },
        { $skip: (page - 1) * limit },
        { $limit: limit },
      ]),
      OfficialAlumniRecord.aggregate([{ $match: { isArchived: false } }, { $group: { _id: { course: '$course', yearOfJoining: '$yearOfJoining', department: '$department', alumniGroup: '$alumniGroup' } } }, { $count: 'total' }]),
    ]);
    const total = countResult[0]?.total || 0;
    return res.json({ batches: batches.map((item) => ({ ...item._id, records: item.records, linkedAccounts: item.linkedAccounts })), pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to load alumni batches.' });
  }
};

exports.getBatchArchiveImpact = async (req, res) => {
  const filter = batchFilterFromBody(req.body);
  if (!filter) return res.status(400).json({ message: 'Provide a valid course, joining year, department, and alumni group.' });
  try {
    return res.json(await archiveImpact(filter));
  } catch (error) {
    return res.status(500).json({ message: 'Unable to calculate batch archive impact.' });
  }
};

exports.archiveBatch = async (req, res) => {
  const filter = batchFilterFromBody(req.body);
  if (!filter || req.body.confirm !== 'ARCHIVE BATCH') return res.status(400).json({ message: 'Confirm the batch archive action.' });
  try {
    const impact = await archiveImpact(filter);
    if (impact.linkedRecords) return res.status(409).json({ ...impact, message: 'Review or reassign linked accounts before archiving this batch.' });
    const now = new Date();
    const archived = await withTransaction(async (session) => {
      const currentImpact = await archiveImpact(filter, session);
      if (currentImpact.linkedRecords) throw fail(409, 'Review or reassign linked accounts before archiving this batch.');
      const result = await OfficialAlumniRecord.updateMany({ ...filter, linkedUserId: null }, { $set: { isArchived: true, archivedAt: now, archivedBy: req.user.id } }, { session });
      if (result.modifiedCount !== currentImpact.records) throw fail(409, 'The batch changed during archival. Refresh and review its impact.');
      await OfficialAlumniAudit.create([{ entityType: 'batch', entityKey: JSON.stringify(filter), action: 'archived', administratorId: req.user.id, changes: { recordsArchived: result.modifiedCount } }], { session });
      return result.modifiedCount;
    });
    return res.json({ ...impact, archived });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
    return res.status(500).json({ message: 'Unable to archive this batch.' });
  }
};

exports.listImports = async (req, res) => {
  const { page, limit } = getPagination(req.query);
  try {
    const filter = req.query.status ? { status: req.query.status } : {};
    const [imports, total] = await Promise.all([
      AlumniImport.find(filter).populate('createdBy', 'name email').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      AlumniImport.countDocuments(filter),
    ]);
    return res.json({ imports, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to load import history.' });
  }
};

exports.downloadImportErrors = async (req, res) => {
  if (!isObjectId(req.params.id)) return res.status(400).json({ message: 'Select a valid import.' });
  try {
    const job = await AlumniImport.findById(req.params.id).select('originalFileName validationErrors').lean();
    if (!job) return res.status(404).json({ message: 'Import not found.' });
    const escapeCsv = (value) => {
      const safe = String(value ?? '').replace(/^[=+\-@]/, "'$&");
      return `"${safe.replace(/"/g, '""')}"`;
    };
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="official-alumni-import-errors.csv"');
    res.write(`\uFEFF${['Row', 'Errors'].map(escapeCsv).join(',')}\r\n`);
    const issueCount = await AlumniImportIssue.countDocuments({ importId: job._id });
    if (issueCount) {
      const cursor = AlumniImportIssue.find({ importId: job._id }).sort({ rowNumber: 1 }).lean().cursor();
      for await (const issue of cursor) {
        res.write([issue.rowNumber, (issue.messages || []).join('; ')].map(escapeCsv).join(',') + '\r\n');
      }
      for (const item of job.validationErrors || []) {
        if (item.rowNumber === 0) res.write([item.rowNumber, (item.messages || []).join('; ')].map(escapeCsv).join(',') + '\r\n');
      }
    } else {
      for (const item of job.validationErrors || []) {
        res.write([item.rowNumber, (item.messages || []).join('; ')].map(escapeCsv).join(',') + '\r\n');
      }
    }
    return res.end();
  } catch (error) {
    if (res.headersSent) return res.destroy(error);
    return res.status(500).json({ message: 'Unable to download import errors.' });
  }
};

exports.getImportArchiveImpact = async (req, res) => {
  if (!isObjectId(req.params.id)) return res.status(400).json({ message: 'Select a valid import.' });
  try {
    const job = await AlumniImport.findById(req.params.id).lean();
    if (!job) return res.status(404).json({ message: 'Import not found.' });
    const impact = await archiveImpact({ sourceImportId: job._id, isArchived: false });
    return res.json({ ...impact, importName: job.importName, originalFileName: job.originalFileName });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to calculate import archive impact.' });
  }
};

exports.archiveImport = async (req, res) => {
  if (!isObjectId(req.params.id)) return res.status(400).json({ message: 'Select a valid import.' });
  try {
    const archived = await withTransaction(async (session) => {
      const job = await AlumniImport.findById(req.params.id).session(session);
      if (!job || job.status === 'archived') throw fail(404, 'Active import not found.');
      if (req.body.confirm !== job.importName) throw fail(400, 'Enter the import name exactly to confirm archive.');
      const filter = { sourceImportId: job._id, isArchived: false };
      const impact = await archiveImpact(filter, session);
      if (impact.linkedRecords) {
        const error = fail(409, 'Review or reassign linked accounts before archiving this import.');
        error.details = impact;
        throw error;
      }
      const now = new Date();
      const result = await OfficialAlumniRecord.updateMany({ ...filter, linkedUserId: null }, { $set: { isArchived: true, archivedAt: now, archivedBy: req.user.id } }, { session });
      if (result.modifiedCount !== impact.records) throw fail(409, 'The import changed during archival. Refresh and review its impact.');
      job.status = 'archived';
      job.archivedAt = now;
      job.archivedBy = req.user.id;
      await job.save({ session });
      await OfficialAlumniAudit.create([{ entityType: 'import', entityKey: String(job._id), importId: job._id, action: 'archived', administratorId: req.user.id, changes: { recordsArchived: result.modifiedCount } }], { session });
      return { ...impact, archived: result.modifiedCount };
    });
    return res.json({ ...archived, message: 'Import archived; historical records were preserved.' });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ ...error.details, message: error.message });
    return res.status(500).json({ message: 'Unable to archive this import.' });
  }
};

exports.listRecordAudits = async (req, res) => {
  if (!isObjectId(req.params.id)) return res.status(400).json({ message: 'Select a valid alumni record.' });
  const { page, limit } = getPagination(req.query);
  try {
    const [audits, total] = await Promise.all([
      OfficialAlumniAudit.find({ recordId: req.params.id }).populate('administratorId', 'name email').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      OfficialAlumniAudit.countDocuments({ recordId: req.params.id }),
    ]);
    return res.json({ audits, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to load the record audit history.' });
  }
};