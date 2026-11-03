const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { PassThrough } = require('node:stream');
const ExcelJS = require('exceljs');

test('ExcelJS-compatible workbook APIs preserve cell data', async () => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Alumni');
  worksheet.addRow(['Name', 'Year']);
  worksheet.addRow(['Test Alum', 2020]);

  const buffer = await workbook.xlsx.writeBuffer();
  const imported = new ExcelJS.Workbook();
  await imported.xlsx.load(Buffer.from(buffer));

  assert.deepEqual(imported.getWorksheet('Alumni').getRow(2).values.slice(1), ['Test Alum', 2020]);
});

test('streaming workbook writer remains available and produces a readable workbook', async () => {
  const chunks = [];
  const stream = new PassThrough();
  stream.on('data', (chunk) => chunks.push(chunk));

  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
    stream,
    useSharedStrings: false,
    useStyles: true,
  });
  const worksheet = workbook.addWorksheet('Official Alumni');
  worksheet.addRow(['Name', 'Year']).commit();
  worksheet.addRow(['Test Alum', 2020]).commit();
  await worksheet.commit();
  await workbook.commit();

  const imported = new ExcelJS.Workbook();
  await imported.xlsx.load(Buffer.concat(chunks));
  assert.deepEqual(imported.getWorksheet('Official Alumni').getRow(2).values.slice(1), ['Test Alum', 2020]);
});

test('ExcelJS archive dependency remains CommonJS-loadable', () => {
  const packageDir = path.dirname(require.resolve('exceljs'));
  const archiver = require(require.resolve('archiver', { paths: [packageDir] }));
  assert.equal(typeof archiver, 'function');
});
