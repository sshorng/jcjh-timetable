#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const context = {
  window: { DomainSchedule: {} },
  console,
  Date,
  Math,
  Number,
  Object,
  String,
  Array,
  RegExp,
  JSON,
  parseInt,
  parseFloat,
  isNaN,
  setTimeout,
  Blob,
  URL
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, 'domain-activity-cover.js'), 'utf8'), context, {
  filename: 'domain-activity-cover.js'
});
context.window.DomainActivityCover = context.window.DomainActivityCover;
vm.runInContext(fs.readFileSync(path.join(root, 'export-activity-cover.js'), 'utf8'), context, {
  filename: 'export-activity-cover.js'
});
vm.runInContext(fs.readFileSync(path.join(root, 'export-invigilation-recovered.js'), 'utf8'), context, {
  filename: 'export-invigilation-recovered.js'
});

const domain = context.window.DomainActivityCover;
const exporter = context.window.ExportActivityCover;
const invigilation = context.window.ExportInvigilation;
const ledgerRows = [
  {
    name: '甲老師', time: '2026-10-05 09:00:00', delta: 3, balanceAfter: 3,
    type: 'earn', packageId: 'pkg-trip-甲', eventId: 'trip-1', eventName: '九年級畢旅',
    startDate: '2026-10-05'
  },
  {
    name: '甲老師', time: '2026-10-10 09:00:00', delta: -1, balanceAfter: 2,
    type: 'spend', packageId: 'pkg-trip-甲', eventId: 'evt_sub', eventName: '代課',
    requestId: 'legacy-exam-row'
  },
  {
    name: '甲老師', time: '2026-10-20 09:00:00', delta: -1, balanceAfter: 1,
    type: 'spend', packageId: 'pkg-trip-甲', eventId: 'trip-1', eventName: '九年級畢旅',
    requestId: 'trip-1-request'
  },
  {
    name: '乙老師', time: '2026-10-05 09:00:00', delta: 1, balanceAfter: 1,
    type: 'earn', packageId: 'pkg-trip-乙', eventId: 'trip-1', eventName: '九年級畢旅',
    startDate: '2026-10-05'
  }
];

const exam = domain.buildLedgerExamStats({
  ledgerRows,
  teacher: { name: '甲老師' },
  requests: [],
  rangeDates: ['2026-10-10'],
  startDate: '2026-10-10',
  endDate: '2026-10-10'
});
assert.equal(exam.before, 3, '段考前餘額應為 3');
assert.equal(exam.used, 1, '段考應扣 1');
assert.equal(exam.remaining, 2, '段考後餘額應為 2，不應被後續畢旅扣用污染');

const requests = [
  {
    id: 'trip-1-request', status: 'approved', requestDate: '2026-10-20', requestPeriod: 1,
    subFee: '扣額度', requesterName: '帶隊老師', targetTeacherName: '甲老師',
    className: '901', subject: '國文', note: '九年級畢旅 2026-10-05～2026-10-20'
  },
  {
    id: 'trip-2-request', status: 'approved', requestDate: '2026-10-20', requestPeriod: 2,
    subFee: '活動公費', requesterName: '帶隊老師', targetTeacherEmail: 'b@example.test',
    className: '902', subject: '數學', note: '九年級畢旅 2026-10-05～2026-10-20'
  }
];
const pages = exporter.buildTeacherPages({
  startDate: '2026-10-20',
  endDate: '2026-10-20',
  activityName: '九年級畢旅',
  eventId: 'trip-1',
  requests,
  teachers: [
    { email: 'a@example.test', name: '甲老師' },
    { email: 'b@example.test', name: '乙老師' }
  ],
  teacherDemands: [
    { email: 'a@example.test', name: '甲老師', releasedSlots: 3 },
    { email: 'b@example.test', name: '乙老師', releasedSlots: 1 }
  ],
  ledgerRows,
  requireActivityHint: true
});
assert.equal(pages.length, 2, '應依實際代課教師產生兩頁');
assert.equal(pages[0].name, '甲老師');
assert.equal(pages[1].name, '乙老師');
assert.equal(pages[0].matrix.demand, 3);
assert.equal(pages[0].matrix.arranged, 1, '活動頁只應計選定日期內的活動包扣用');
assert.equal(pages[0].matrix.remaining, 2);
assert.equal(pages[1].matrix.demand, 1);
assert.equal(pages[1].matrix.arranged, 0);
assert.equal(pages[0].matrix.grid['2026-10-20'][1].length, 1);
assert.equal(pages[0].matrix.grid['2026-10-20'][2].length, 0, '不同教師的申請不可串頁');
assert.equal(pages[1].matrix.grid['2026-10-20'][2].length, 1);
const activityDateStats = domain.buildLedgerActivityStats({
  ledgerRows,
  teacher: { name: '甲老師' },
  eventId: 'trip-1',
  rangeDates: ['2026-10-20'],
  demand: 3
});
assert.deepEqual(
  { demand: activityDateStats.demand, arranged: activityDateStats.arranged, remaining: activityDateStats.remaining },
  { demand: 3, arranged: 1, remaining: 2 },
  '活動額度只應計選定日期內的扣用，不能把段考日期扣用帶入'
);

const pageXml = '<w:document><w:body><w:p><w:r><w:t>page</w:t></w:r></w:p>'
  + '<w:sectPr><w:pgSz w:w="11906"/></w:sectPr></w:body></w:document>';
const joinedXml = exporter.joinPageDocuments(pageXml, [pageXml, pageXml]);
assert.equal((joinedXml.match(/w:type="page"/g) || []).length, 1, '教師頁之間應只有一個分頁符');
assert.equal((joinedXml.match(/<w:sectPr/g) || []).length, 1, '合併後只能保留最後一個 section 設定');

const invigExam = invigilation.buildExamQuotaStats({
  ledgerRows,
  teacher: { name: '甲老師', mutualQuota: 0 },
  requests: [],
  rangeDates: ['2026-10-10'],
  startDate: '2026-10-10',
  endDate: '2026-10-10'
});
assert.deepEqual(
  { before: invigExam.before, used: invigExam.used, remaining: invigExam.remaining },
  { before: 3, used: 1, remaining: 2 },
  '監考表應使用帳本歷程的段考三欄'
);
const invigFallback = invigilation.buildExamQuotaStats({
  ledgerRows: [],
  teacher: { name: '乙老師', mutualQuota: 2 },
  requests: [{ status: 'approved', subFee: '扣額度', targetTeacherName: '乙老師', reason: '空堂排班', requestDate: '2026-10-10' }],
  startDate: '2026-10-10',
  endDate: '2026-10-10'
});
assert.deepEqual(
  { before: invigFallback.before, used: invigFallback.used, remaining: invigFallback.remaining },
  { before: 3, used: 1, remaining: 2 },
  '無帳本歷程時應能用教師姓名回退計算空堂扣額度'
);

const printTarget = {};
invigilation.copyPrintSettings({
  pageSetup: {
    printArea: "'114-1-1'!$A$1:$X$48",
    orientation: 'portrait',
    paperSize: 12,
    scale: 60
  }
}, printTarget);
assert.equal(printTarget.pageSetup.printArea, '$A$1:$X$48');
assert.equal(printTarget.pageSetup.fitToPage, true);
assert.equal(printTarget.pageSetup.fitToWidth, 1);
assert.equal(printTarget.pageSetup.fitToHeight, 1);
assert.equal(printTarget.pageSetup.orientation, 'portrait');

console.log('quota ledger tests PASS');

(async function () {
  const cells = Array.from({ length: 9 }, (_, index) => {
    const token = index === 0 ? '{{DATE}}' : (index === 1 ? '{{DOW}}' : '');
    return '<w:tc><w:p><w:r><w:t>' + token + '</w:t></w:r></w:p></w:tc>';
  }).join('');
  const templateXml = '<w:document><w:body>'
    + '<w:p><w:r><w:t>{{GRADE}}年級{{ACTIVITY}} 教師代理遺留課務 輪值通知單</w:t></w:r></w:p>'
    + '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>header</w:t></w:r></w:p></w:tc></w:tr>'
    + '<w:tr>' + cells + '</w:tr></w:tbl>'
    + '<w:p><w:r><w:t>{{DEMAND}}/{{ARRANGED}}/{{REMAINING}} {{NOTE_P8}}</w:t></w:r></w:p>'
    + '<w:sectPr><w:pgSz w:w="11906"/></w:sectPr></w:body></w:document>';
  let generatedXml = '';
  const fakeZip = {
    loadAsync: async function () {
      return {
        file: function (name, value) {
          if (arguments.length === 1) return { async: async function () { return templateXml; } };
          if (name === 'word/document.xml') generatedXml = value;
        },
        generateAsync: async function () { return new ArrayBuffer(0); }
      };
    }
  };
  context.window.JSZip = fakeZip;
  context.fetch = async function () {
    return { ok: true, arrayBuffer: async function () { return new ArrayBuffer(0); } };
  };
  const anchor = { click: function () {} };
  context.document = {
    createElement: function () { return anchor; },
    body: { appendChild: function () {}, removeChild: function () {} }
  };
  context.URL = { createObjectURL: function () { return 'blob:test'; }, revokeObjectURL: function () {} };
  const result = await exporter.exportWord({
    startDate: '2026-10-05',
    endDate: '2026-10-20',
    activityName: '九年級畢旅',
    eventId: 'trip-1',
    requests,
    demand: 4,
    teachers: [
      { email: 'a@example.test', name: '甲老師' },
      { email: 'b@example.test', name: '乙老師' }
    ],
    teacherDemands: [
      { email: 'a@example.test', name: '甲老師', releasedSlots: 3 },
      { email: 'b@example.test', name: '乙老師', releasedSlots: 1 }
    ],
    ledgerRows,
    requireActivityHint: true
  });
  assert.equal(result.ok, true);
  assert.equal(result.pageCount, 2);
  assert.equal((generatedXml.match(/w:type="page"/g) || []).length, 1);
  assert.equal((generatedXml.match(/<w:tbl>/g) || []).length, 2);
  assert.equal((generatedXml.match(/<w:sectPr/g) || []).length, 1);
  assert.match(generatedXml, /輪值：甲老師/);
  assert.match(generatedXml, /輪值：乙老師/);
  assert.doesNotMatch(generatedXml, /\{\{[A-Z0-9_]+\}\}/);
  console.log('quota ledger DOCX export test PASS');
})().catch(function (error) {
  console.error(error);
  process.exitCode = 1;
});
