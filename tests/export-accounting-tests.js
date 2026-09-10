#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');

global.window = global;
require('../field-map.js');
require('../domain-school-swap.js');
require('../domain-billing.js');
require('../export-accounting.js');

const period = { start: '2026-07-01', end: '2026-07-31' };
const schedules = [
  { teacherEmail: 'bill@x', dayOfWeek: 1, period: 1, className: '701', attr: '一般', specialTags: '超鐘點' },
  { teacherEmail: 'bill@x', dayOfWeek: 1, period: 0, className: '702', attr: '一般', specialTags: '超鐘點' },
  { teacherEmail: 'bill@x', dayOfWeek: 1, period: 45, className: '703', attr: '一般', specialTags: '超鐘點' }
];

function build(records, baseHours, scheduleRows, schoolSwaps, teacherOptions) {
  return window.ExportAccounting.buildExportData({
    reportMonth: '2026-07',
    reportWeeksCount: 1,
    periods: { period: period },
    teachers: [Object.assign({ email: 'bill@x', name: 'Billing', baseHours: baseHours === undefined ? 2 : baseHours }, teacherOptions || {})],
    allSchedules: scheduleRows || schedules,
    schoolSwaps: schoolSwaps || [],
    substitutionRecords: records
  });
}

const coEmployed = build([], 0, schedules, [], { jobTitle: '共聘教師' });
assert.equal(coEmployed.sheets.adjunct.length, 0, '共聘教師不應列入兼課教師鐘點工作表');
assert.equal(coEmployed.sheets.overtime.length, 1, '共聘教師應列入預設超鐘點工作表');
assert.equal(coEmployed.sheets.overtime[0].title, '共聘教師', '預設超鐘點工作表應保留共聘職務名稱');
assert.equal(coEmployed.overtimePlans[0].plan, '預設', '共聘教師應使用預設經費計畫');

const noOvertime = build([], 3, schedules);
assert.equal(noOvertime.sheets.overtime.length, 0, '沒有超鐘點的教師不應列入超鐘點工作表');
assert.equal(noOvertime.overtimePlans.length, 0, '沒有超鐘點時不應建立超鐘點計畫工作表');

const teacherOrderPeriod = { start: '2026-07-01', end: '2026-07-31' };
const teacherOrder = window.ExportAccounting.buildExportData({
  reportMonth: '2026-07',
  reportWeeksCount: 1,
  periods: {
    overtime: teacherOrderPeriod,
    adjunct: teacherOrderPeriod,
    publicSub: teacherOrderPeriod,
    selfSub: teacherOrderPeriod,
    mentor: teacherOrderPeriod
  },
  teachers: [
    { email: 'z@x', name: 'Zeta', baseHours: 16 },
    { email: 'a@x', name: 'Alpha', baseHours: 16 }
  ],
  allSchedules: [],
  substitutionRecords: [
    { date: '2026-07-02', period: 1, className: '701', type: 'substitution', originalTeacherEmail: 'origin@x', actualTeacherEmail: 'z@x', subFee: '公費代課', status: 'approved' },
    { date: '2026-07-01', period: 1, className: '702', type: 'substitution', originalTeacherEmail: 'origin@x', actualTeacherEmail: 'a@x', subFee: '公費代課', status: 'approved' },
    { date: '2026-07-02', period: 2, className: '701', type: 'substitution', originalTeacherEmail: 'origin@x', actualTeacherEmail: 'z@x', subFee: '自費代課', status: 'approved' },
    { date: '2026-07-01', period: 2, className: '702', type: 'substitution', originalTeacherEmail: 'origin@x', actualTeacherEmail: 'a@x', subFee: '自費代課', status: 'approved' }
  ],
  homeroomRecords: [
    { date: '2026-07-02', actualTeacherEmail: 'z@x', actualTeacherName: 'Zeta', className: '701', status: 'approved' },
    { date: '2026-07-01', actualTeacherEmail: 'a@x', actualTeacherName: 'Alpha', className: '702', status: 'approved' }
  ]
});
assert.deepEqual(teacherOrder.sheets.publicSub.map(row => row.name), ['Zeta', 'Alpha'], '公付代課應依教師名單排序');
assert.deepEqual(teacherOrder.sheets.selfSub.map(row => row.actualName), ['Zeta', 'Alpha'], '自付代課應依教師名單排序');
assert.deepEqual(teacherOrder.sheets.mentor.map(row => row.actualName), ['Zeta', 'Alpha'], '代導明細應依教師名單排序');

const publicOvertime = build([{
  date: '2026-07-13', period: 1, className: '701', type: 'substitution',
  originalTeacherEmail: 'bill@x', actualTeacherEmail: 'cover@x', subFee: '公費代課', status: 'approved'
}]);
assert.equal(publicOvertime.sheets.overtime.length, 0, '實得超鐘點為零時不列入超鐘點工作表');

const substituteAttribute = build([{
  date: '2026-07-13', period: 1, className: '701', type: 'substitution',
  originalTeacherEmail: 'bill@x', actualTeacherEmail: 'cover@x', subFee: '公費代課', status: 'approved'
}], 0, [{
  teacherEmail: 'bill@x', dayOfWeek: 1, period: 1, className: '701', attr: '代課'
}]);
assert.equal(substituteAttribute.sheets.overtime.length, 0, '代課屬性請假且無超鐘點時不列入超鐘點工作表');
assert.equal(substituteAttribute.sheets.publicSub.find(row => row.name === 'Billing'), undefined, '課表代課不應混入一般公付代課工作表');
assert.equal(substituteAttribute.sheets.publicSub.find(row => row.name === 'cover@x').hours, 1, '實際代課教師仍應列入公付代課');
assert.equal(substituteAttribute.substituteAttributePlans.length, 1, '課表代課應建立獨立工作表資料');
assert.equal(substituteAttribute.substituteAttributePlans[0].plan, '預設');
assert.equal(substituteAttribute.substituteAttributePlans[0].rows[0].name, 'Billing');
assert.equal(substituteAttribute.substituteAttributePlans[0].rows[0].hours, 3);
assert.equal(substituteAttribute.substituteAttributePlans[0].rows[0].note, '代課3節');

const splitSubstituteAttribute = window.ExportAccounting.buildExportData({
  reportMonth: '2026-07',
  reportWeeksCount: 1,
  periods: { publicSub: period },
  teachers: [{
    email: 'bill@x', name: 'Billing', baseHours: 16,
    expensePlan: JSON.stringify([
      { day: 1, period: 1, className: '701', source: '計畫A' },
      { day: 1, period: 2, className: '702', source: '計畫B' }
    ])
  }],
  allSchedules: [
    { teacherEmail: 'bill@x', dayOfWeek: 1, period: 1, className: '701', attr: '代課' },
    { teacherEmail: 'bill@x', dayOfWeek: 1, period: 2, className: '702', attr: '代課' }
  ],
  substitutionRecords: []
});
assert.deepEqual(splitSubstituteAttribute.substituteAttributePlans.map(group => group.plan), ['計畫A', '計畫B'], '課表代課不同來源應分表');
assert.deepEqual(splitSubstituteAttribute.substituteAttributePlans.map(group => group.rows[0].hours), [4, 4]);

const fallbackClassNote = build([], 2, schedules);
assert.equal(fallbackClassNote.overtimePlans[0].rows[0].note, '1*1(701、702、703班)', 'legacy/default overtime rows must include class names in notes');

const multiDateLeave = build([
  {
    date: '2026-07-01', period: 1, className: '701', type: 'substitution',
    originalTeacherEmail: 'bill@x', actualTeacherEmail: 'cover@x', subFee: '自費代課', reason: '事假', status: 'approved'
  },
  {
    date: '2026-07-08', period: 2, className: '702', type: 'substitution',
    originalTeacherEmail: 'bill@x', actualTeacherEmail: 'cover@x', subFee: '自費代課', reason: '事假', status: 'approved'
  }
], 2, schedules);
const multiDateNote = multiDateLeave.overtimePlans[0].rows[0].note;
assert.ok(multiDateNote.includes('7/1事假扣1節'), 'leave deduction note must include the first date separately');
assert.ok(multiDateNote.includes('7/8事假扣1節'), 'leave deduction note must include the second date separately');
assert.equal(multiDateNote.includes('7/1、7/8事假'), false, 'leave deduction note must not combine multiple dates');

const publicSpecial = build([
  {
    date: '2026-07-13', period: 0, className: '702', type: 'substitution',
    originalTeacherEmail: 'bill@x', actualTeacherEmail: 'cover@x', subFee: '公費代課', status: 'approved'
  },
  {
    date: '2026-07-13', period: 45, className: '703', type: 'substitution',
    originalTeacherEmail: 'bill@x', actualTeacherEmail: 'cover@x', subFee: '公費代課', status: 'approved'
  }
], 1);
assert.equal(publicSpecial.sheets.overtime.length, 0, '實得超鐘點為零時不列入超鐘點工作表');

const selfSpecial = build([
  {
    date: '2026-07-13', period: 0, className: '702', type: 'substitution',
    originalTeacherEmail: 'bill@x', actualTeacherEmail: 'cover@x', subFee: '自費代課', status: 'approved'
  },
  {
    date: '2026-07-13', period: 45, className: '703', type: 'substitution',
    originalTeacherEmail: 'bill@x', actualTeacherEmail: 'cover@x', subFee: '自費代課', status: 'approved'
  }
]);
assert.equal(selfSpecial.sheets.overtime[0].deduction, 2);
assert.deepEqual(selfSpecial.sheets.selfSub.map(row => row.period), ['早自習', '午休']);

const mixedSchedules = [
  { teacherEmail: 'bill@x', dayOfWeek: 1, period: 1, className: '701', attr: '一般', specialTags: '超鐘點' },
  { teacherEmail: 'bill@x', dayOfWeek: 1, period: 2, className: '702', attr: '一般', specialTags: '超鐘點' },
  { teacherEmail: 'bill@x', dayOfWeek: 1, period: 3, className: '703', attr: '基本' }
];
const mixed = build([
  {
    date: '2026-07-13', period: 1, className: '701', type: 'substitution',
    originalTeacherEmail: 'bill@x', actualTeacherEmail: 'cover@x', subFee: '公費代課', status: 'approved'
  },
  {
    date: '2026-07-13', period: 2, className: '702', type: 'substitution',
    originalTeacherEmail: 'bill@x', actualTeacherEmail: 'cover@x', subFee: '公費代課', status: 'approved'
  },
  {
    date: '2026-07-13', period: 3, className: '703', type: 'substitution',
    originalTeacherEmail: 'bill@x', actualTeacherEmail: 'cover@x', subFee: '自費代課', status: 'approved'
  }
], 1, mixedSchedules);
assert.equal(mixed.sheets.overtime[0].deduction, 3);
assert.equal(mixed.sheets.overtime[0].actualHours, -1);

const publicRegular = build([{
  date: '2026-07-13', period: 3, className: '703', type: 'substitution',
  originalTeacherEmail: 'bill@x', actualTeacherEmail: 'cover@x', subFee: '公費代課', status: 'approved'
}], 1, mixedSchedules);
assert.equal(publicRegular.sheets.overtime[0].deduction, 0);
assert.equal(publicRegular.sheets.publicSub[0].hours, 1);

const combinedReturn = build([{
  date: '2026-07-13', period: 1, className: '701', type: 'substitution',
   originalTeacherEmail: 'bill@x', actualTeacherEmail: 'cover@x', subFee: '公費代課',
  specialFlow: 'combined_return', status: 'approved'
}], 1, [{
   teacherEmail: 'bill@x', dayOfWeek: 1, period: 1, className: '701', attr: '一般', specialTags: '超鐘點'
}]);
assert.equal(combinedReturn.sheets.overtime[0].deduction, 1);
assert.equal(combinedReturn.sheets.overtime[0].actualHours, -1, '超鐘不足仍保留提醒列');
assert.equal(combinedReturn.sheets.publicSub.length, 0);

const swappedPublic = build([{
  date: '2026-07-13', period: 1, className: '701', type: 'substitution',
  originalTeacherEmail: 'bill@x', actualTeacherEmail: 'cover@x', subFee: '公費代課', status: 'approved'
}], 0, [
  { teacherEmail: 'bill@x', dayOfWeek: 2, period: 3, className: '701', attr: '一般', specialTags: '超鐘點' }
], [{
  id: 'swap-billing', name: '補課', dateA: '2026-07-13', periodA: 1,
  dateB: '2026-07-14', periodB: 3, enabled: true
}]);
assert.equal(swappedPublic.sheets.overtime.length, 0, '實得超鐘點為零時不列入超鐘點工作表');

const configuredPlan = JSON.stringify([
  { day: 1, period: 1, className: '701', source: '計畫A' },
  { day: 1, period: 2, className: '702', source: '計畫B' }
]);
const configuredInput = {
  reportMonth: '2026-07',
  reportWeeksCount: 1,
  periods: { overtime: period },
  teachers: [
    { email: 'bill@x', name: 'Billing', baseHours: 0, expensePlan: configuredPlan },
    { email: 'cover@x', name: 'Cover', baseHours: 0 }
  ],
  allSchedules: [
    { teacherEmail: 'bill@x', dayOfWeek: 1, period: 1, className: '701', attr: '一般', specialTags: '超鐘點' },
    { teacherEmail: 'bill@x', dayOfWeek: 1, period: 2, className: '702', attr: '一般', specialTags: '超鐘點' }
  ],
  substitutionRecords: [
    {
      id: 'configured-a', date: '2026-07-13', period: 1, className: '701',
      originalTeacherEmail: 'bill@x', actualTeacherEmail: 'cover@x', subFee: '公費代課', status: 'approved'
    },
    {
      id: 'configured-b', date: '2026-07-13', period: 2, className: '702',
      originalTeacherEmail: 'bill@x', actualTeacherEmail: 'cover@x', subFee: '自費代課', status: 'approved'
    }
  ]
};
configuredInput.monthlyReportRows = window.DomainBilling.buildMonthlyReportRows(configuredInput);
const configured = window.ExportAccounting.buildExportData(configuredInput);
const configuredA = configured.overtimePlans.find(group => group.plan === '計畫A');
const configuredB = configured.overtimePlans.find(group => group.plan === '計畫B');
assert.ok(configuredA && configuredB, 'slot sources must create one overtime group per plan');
assert.deepEqual(configuredA.rows[0], {
  expensePlan: '計畫A', serial: 1, title: '教師', name: 'Cover', weeklyOvertime: 1,
  schedule: '一1(代)', weeks: '', grossHours: 1, deduction: 0, actualHours: 1,
  rate: 455, amount: 455, reduceNote: '', note: '7/13代超鐘Billing1節（701）'
});
assert.equal(configuredB.rows[0].expensePlan, '計畫B');
assert.equal(configuredB.rows[0].grossHours, 1);
assert.equal(configuredB.rows[0].deduction, 0);
assert.ok(configuredA.rows.some(row => row.name === 'Cover' && row.expensePlan === '計畫A'));
assert.ok(configuredB.rows.some(row => row.name === 'Cover' && row.expensePlan === '計畫B'));
assert.equal(configured.blocking.length, 0);
assert.equal(configured.summary.some(item => item.key === 'overtime'), false, 'split export must not include the aggregate overtime summary');

const scheduleFormatInput = Object.assign({}, configuredInput, {
  teachers: [{ email: 'bill@x', name: 'Billing', baseHours: 0, expensePlan: JSON.stringify([
    { day: 2, period: 6, className: '701', source: '計畫A' },
    { day: 3, period: 3, className: '702', source: '計畫A' }
  ])}],
  allSchedules: [
    { teacherEmail: 'bill@x', dayOfWeek: 2, period: 6, className: '701', attr: '一般', specialTags: '超鐘點' },
    { teacherEmail: 'bill@x', dayOfWeek: 3, period: 3, className: '702', attr: '一般', specialTags: '超鐘點' }
  ],
  substitutionRecords: []
});
scheduleFormatInput.monthlyReportRows = window.DomainBilling.buildMonthlyReportRows(scheduleFormatInput);
const scheduleFormat = window.ExportAccounting.buildExportData(scheduleFormatInput);
const scheduleFormatPlan = scheduleFormat.overtimePlans.find(group => group.plan === '計畫A');
assert.equal(scheduleFormatPlan.rows[0].schedule, '二6、三3');
assert.equal(scheduleFormatPlan.rows[0].schedule.includes('週'), false);
assert.equal(scheduleFormatPlan.rows[0].schedule.includes('（'), false);

const missingSourceInput = Object.assign({}, configuredInput, {
  teachers: [{ email: 'bill@x', name: 'Billing', baseHours: 0, expensePlan: JSON.stringify([
    { day: 1, period: 1, className: '701', source: '計畫A' }
  ])}],
  substitutionRecords: []
});
missingSourceInput.monthlyReportRows = window.DomainBilling.buildMonthlyReportRows(missingSourceInput);
const missingSource = window.ExportAccounting.buildExportData(missingSourceInput);
const defaultPlan = missingSource.overtimePlans.find(group => group.plan === '預設');
assert.ok(defaultPlan, 'missing slot source must be grouped into the default overtime plan');
assert.equal(missingSource.overtimePlans[0].plan, '預設', 'default overtime plan must be listed first');
assert.equal(defaultPlan.rows[0].expensePlan, '預設');
assert.equal(defaultPlan.rows[0].grossHours, 1);
assert.equal(defaultPlan.rows[0].actualHours, 1);
assert.equal(missingSource.blocking.length, 0, 'default overtime plan must not block accounting export');
assert.ok(missingSource.summary.some(item => item.key === 'overtime:預設' && item.hours === 1), 'default overtime plan must be included in export summary');

console.log('export accounting tests PASS');
