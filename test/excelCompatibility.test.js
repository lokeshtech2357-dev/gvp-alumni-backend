const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { PassThrough } = require('node:stream');
const ExcelJS = require('exceljs-community');

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

test('patched minimatch remains compatible with ExcelJS archive globbing', async (t) => {
  const packageDir = path.dirname(require.resolve('exceljs-community'));
  const readdirGlobPath = require.resolve('readdir-glob', { paths: [packageDir] });
  const readdirGlob = require(readdirGlobPath);
  const minimatchEntry = require.resolve('minimatch', { paths: [path.dirname(readdirGlobPath)] });
  const minimatchRoot = path.resolve(path.dirname(minimatchEntry), '..', '..');
  const minimatchVersion = JSON.parse(
    fs.readFileSync(path.join(minimatchRoot, 'package.json'), 'utf8')
  ).version;
  assert.ok(Number(minimatchVersion.split('.')[0]) >= 11);

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gvp-exceljs-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'nested'));
  fs.writeFileSync(path.join(root, 'nested', 'records.xlsx'), 'fixture');
  fs.writeFileSync(path.join(root, 'nested', 'notes.txt'), 'fixture');

  const matches = await new Promise((resolve, reject) => {
    const found = [];
    const globber = readdirGlob(root, { pattern: '**/*.xlsx' });
    globber.on('match', (match) => found.push(match.relative));
    globber.once('error', reject);
    globber.once('end', () => resolve(found));
  });

  assert.deepEqual(matches, ['nested/records.xlsx']);
});
