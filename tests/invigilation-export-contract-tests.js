#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'export-invigilation-recovered.js'), 'utf8');
const context = { window: {}, console, Date, Math, Object, Number, String, Array, RegExp, JSON, parseInt };
vm.createContext(context);
vm.runInContext(source, context, { filename: 'export-invigilation-recovered.js' });

const linkMasterRange = context.window.ExportInvigilation.linkMasterRange;
const buildTeacherMatrix = context.window.ExportInvigilation.buildTeacherMatrix;
const validateClassCoverage = context.window.ExportInvigilation.validateClassCoverage;
const isSpecialEducationTeacher = context.window.ExportInvigilation.isSpecialEducationTeacher;
const applySpecialEducationRows = context.window.ExportInvigilation.applySpecialEducationRows;
const highlightRecipientRow = context.window.ExportInvigilation.highlightRecipientRow;
assert.equal(typeof linkMasterRange, 'function');
assert.equal(typeof buildTeacherMatrix, 'function');
assert.equal(typeof validateClassCoverage, 'function');
assert.equal(typeof isSpecialEducationTeacher, 'function');
assert.equal(typeof applySpecialEducationRows, 'function');
assert.equal(typeof highlightRecipientRow, 'function');

function columnName(number) {
  let value = number;
  let result = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}

function parseAddress(address) {
  const match = /^([A-Z]+)(\d+)$/.exec(address);
  let column = 0;
  for (const letter of match[1]) column = column * 26 + letter.charCodeAt(0) - 64;
  return { row: Number(match[2]), column };
}

function makeWorksheet() {
  const cells = new Map();
  const mergedRanges = [
    ['A1', 'X1'],
    ['B2', 'H2'],
    ['I2', 'L2'],
    ['N2', 'T2'],
    ['U2', 'X2'],
    ['A47', 'X47']
  ];

  function getCell(row, column) {
    const address = columnName(column) + row;
    if (!cells.has(address)) {
      cells.set(address, {
        address,
        value: 'original:' + address,
        style: { font: { bold: address === 'B9', underline: address === 'B9' } },
        isMerged: false,
        master: null
      });
    }
    return cells.get(address);
  }

  mergedRanges.forEach(([start, end]) => {
    const first = parseAddress(start);
    const last = parseAddress(end);
    const master = getCell(first.row, first.column);
    master.isMerged = true;
    master.master = master;
    for (let row = first.row; row <= last.row; row += 1) {
      for (let column = first.column; column <= last.column; column += 1) {
        const cell = getCell(row, column);
        cell.isMerged = true;
        cell.master = master;
      }
    }
  });

  const outsideRange = getCell(48, 1);
  outsideRange.value = 'personal note';
  const outsideColumn = getCell(1, 25);
  outsideColumn.value = 'distribution label';

  return {
    model: { merges: mergedRanges.map(([start, end]) => start + ':' + end) },
    getCell,
    cells
  };
}

const worksheet = makeWorksheet();
worksheet.getCell(9, 2);
const beforeStyles = new Map([
  ['A1', JSON.stringify(worksheet.cells.get('A1').style)],
  ['B9', JSON.stringify(worksheet.cells.get('B9').style)]
]);
const linkedCount = linkMasterRange(worksheet, '監考表');

assert.equal(linkedCount, 1064, 'A1:X47 should link every non-merged cell');
assert.equal(
  worksheet.cells.get('A1').value.formula,
  'IF(\'監考表\'!A1="","",\'監考表\'!A1)'
);
assert.equal(
  worksheet.cells.get('B4').value.formula,
  'IF(\'監考表\'!B4="","",\'監考表\'!B4)'
);
assert.equal(
  worksheet.cells.get('X46').value.formula,
  'IF(\'監考表\'!X46="","",\'監考表\'!X46)'
);

assert.equal(worksheet.cells.get('B1').value, 'original:B1', 'merged follower must not receive a formula');
assert.equal(worksheet.cells.get('C2').value, 'original:C2', 'merged follower must remain untouched');
assert.equal(worksheet.cells.get('X47').value, 'original:X47', 'merged reminder follower must remain untouched');
assert.equal(worksheet.cells.get('A48').value, 'personal note', 'personal quota note is outside the linked range');
assert.equal(worksheet.cells.get('Y1').value, 'distribution label', 'distribution label is outside the linked range');
assert.equal(JSON.stringify(worksheet.cells.get('A1').style), beforeStyles.get('A1'));
assert.equal(JSON.stringify(worksheet.cells.get('B9').style), beforeStyles.get('B9'));

const highlightedWorksheet = makeWorksheet();
const untouchedRowStyle = JSON.stringify(highlightedWorksheet.getCell(10, 1).style);
assert.equal(
  highlightRecipientRow(
    highlightedWorksheet,
    { left: [{ email: 'target@example.com', name: '目標教師' }], right: [] },
    { teacherRowStart: 9, teacherRowEnd: 46 },
    { email: 'target@example.com', name: '目標教師' }
  ),
  true
);
assert.equal(highlightedWorksheet.cells.get('A9').style.border.top.style, 'thick');
assert.equal(highlightedWorksheet.cells.get('A9').style.border.left.style, 'thick');
assert.equal(highlightedWorksheet.cells.get('L9').style.border.right.style, 'thick');
assert.equal(highlightedWorksheet.cells.get('A9').style.fill.fgColor.argb, 'FFE6E6E6');
assert.equal(highlightedWorksheet.cells.get('A9').style.font.bold, true);
assert.equal(highlightedWorksheet.cells.get('A9').style.font.size, 16);
assert.equal(JSON.stringify(highlightedWorksheet.getCell(10, 1).style), untouchedRowStyle);

assert.equal(isSpecialEducationTeacher({ jobTitle: '特教教師' }), true);
assert.equal(isSpecialEducationTeacher({ subject: '特教' }), true);
assert.equal(isSpecialEducationTeacher({ jobTitle: '國文教師', subject: '國文' }), false);

let specialScheduleLookups = 0;
const specialMatrix = buildTeacherMatrix(
  [{ email: 'special@example.com', name: '特教老師', jobTitle: '特教教師' }],
  context.window.ExportInvigilation.buildPeriodSpec(['2026-09-21']),
  () => { specialScheduleLookups += 1; return { className: '901' }; },
  38,
  null,
  []
);
assert.equal(specialScheduleLookups, 0, '特教教師不應逐節讀取一般課表');
assert.equal(specialMatrix.left[0].specialEducation, true);
assert.equal(specialMatrix.left[0].slots[0].text, '特教監考');
assert.ok(specialMatrix.left[0].slots.slice(1).every(slot => slot.text === '' && slot.changed === false));

const specialWorksheet = makeWorksheet();
const specialMergeCalls = [];
specialWorksheet.mergeCellsWithoutStyle = range => specialMergeCalls.push(range);
const specialMerged = applySpecialEducationRows(
  specialWorksheet,
  {
    left: [{ specialEducation: true }],
    right: [{ specialEducation: true }]
  },
  { teacherRowStart: 9, teacherRowEnd: 46 }
);
assert.equal(specialMerged, 2);
assert.deepEqual(specialMergeCalls, ['B9:L9', 'N9:X9']);
assert.equal(specialWorksheet.cells.get('B9').value, '特教監考');
assert.equal(specialWorksheet.cells.get('N9').value, '特教監考');

const courseMatrix = buildTeacherMatrix(
  [
    { email: 'empty@example.com', name: '完全沒課老師' },
    { email: 'course@example.com', name: '有課老師' }
  ],
  context.window.ExportInvigilation.buildPeriodSpec(['2026-09-21']),
  email => email === 'course@example.com' ? { className: '901', subject: '國文' } : null,
  38,
  null,
  []
);
assert.deepEqual(
  courseMatrix.left.concat(courseMatrix.right).map(teacher => teacher.name),
  ['有課老師'],
  '完全沒有課務的教師不應出現在監考表'
);

const endedCourseMatrix = buildTeacherMatrix(
  [{ email: 'ended@example.com', name: '已終止課程教師' }],
  context.window.ExportInvigilation.buildPeriodSpec(['2026-09-21']),
  () => ({ className: '901', subject: '國文', activeTo: '2026-09-20' }),
  38,
  null,
  []
);
assert.equal(endedCourseMatrix.total, 0, '選取區段外已終止的課程不可出現在監考表');

const endedPatrolMatrix = buildTeacherMatrix(
  [{ email: 'ended-patrol@example.com', name: '已終止巡堂教師' }],
  context.window.ExportInvigilation.buildPeriodSpec(['2026-09-21']),
  () => null,
  38,
  null,
  [{ teacherEmail: 'ended-patrol@example.com', dayOfWeek: 1, period: 1, attr: '巡堂', activeTo: '2026-09-20' }]
);
assert.equal(endedPatrolMatrix.total, 0, '選取區段外已終止的巡堂不可透過備援出現在監考表');

function coverageTeacher(name, text) {
  return {
    name,
    slots: new Array(11).fill(null).map(() => ({ text, changed: false }))
  };
}

const examPeriodSpec = context.window.ExportInvigilation.buildPeriodSpec(['2026-09-21']);
const validCoverage = validateClassCoverage(
  { left: [coverageTeacher('甲', '701、702')], right: [] },
  examPeriodSpec,
  ['701', '702']
);
assert.equal(validCoverage.ok, true, '併班文字拆成實體班級後應視為完整且不重複');

const invalidCoverage = validateClassCoverage(
  { left: [coverageTeacher('甲', '701')], right: [coverageTeacher('乙', '701')] },
  examPeriodSpec,
  ['701', '702']
);
assert.equal(invalidCoverage.ok, false, '缺班或重複班級應阻止監考表匯出');
assert.equal(invalidCoverage.missing[0].classNames.includes('702'), true);
assert.equal(invalidCoverage.duplicates[0].classes[0].className, '701');

console.log('invigilation export contract tests PASS');
