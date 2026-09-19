#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');

global.window = global;
require('../field-map.js');
require('../domain-school-swap.js');
require('../date-utils.js');
require('../domain-schedule.js');
require('../domain-class-away.js');
require('../domain-billing.js');
require('../export-accounting.js');

const period = { start: '2026-07-01', end: '2026-07-31' };
assert.equal(
  window.ExportAccounting.dateRangeFileLabel({ start: '2026-09-01', end: '2026-09-30' }, '2026-09'),
  '0901-0930',
  '會計 Excel 檔名應使用 MMDD-MMDD 日期區間'
);
assert.equal(
  window.ExportAccounting.dateRangeFileLabel({ start: '2026-07-31', end: '2026-08-03' }, '2026-07'),
  '0731-0803',
  '跨月會計 Excel 檔名應保留完整日期區間'
);
assert.equal(
  window.ExportAccounting.titleFor(
    { key: 'substituteAttribute', titleSuffix: '' },
    '2026-08',
    { start: '2026-08-31', end: '2026-10-02' },
    '國教'
  ),
  '臺北市立建成國中115年8月(8/31-10/2)代課鐘點費（國教）印領清冊',
  '小鐘點工作表標題應包含代課鐘點費與計畫名稱'
);
[
  ['國教', '補助調整教師授課鐘點費(國教)印領清冊'],
  ['雙語', '雙語實驗課程學校教師減課鐘點費印領清冊'],
  ['特教', '補助調整教師授課鐘點費(特教)印領清冊'],
  ['資優', '補助調整教師授課鐘點費(特教)印領清冊'],
  ['閱推', '國中閱讀推動教師鐘點費印領清冊'],
  ['藝才', '補助調整教師授課鐘點費(藝才)印領清冊'],
  ['無人機', '無人機教育中心種子教師減授鐘點費印領清冊'],
  ['輔導團', '國教輔導團印領清冊'],
  ['本土語', '國中本土語開課經費印領清冊']
].forEach(([plan, suffix]) => {
  assert.equal(
    window.ExportAccounting.titleFor(
      { key: 'overtime', titleSuffix: '' },
      '2026-08',
      { start: '2026-08-31', end: '2026-10-02' },
      plan
    ),
    '臺北市立建成國中115年8月(8/31-10/2)' + suffix,
    plan + '超鐘點工作表應使用正式標題'
  );
});
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
assert.equal(coEmployed.overtimePlans[0].plan, '國教', '共聘教師空白經費應輸出為國教經費');

const noOvertime = build([], 3, schedules);
assert.equal(noOvertime.sheets.overtime.length, 0, '沒有超鐘點的教師不應列入超鐘點工作表');
assert.equal(noOvertime.overtimePlans.length, 0, '沒有超鐘點時不應建立超鐘點計畫工作表');
const noOvertimeWithLeave = build([{
  date: '2026-07-13', period: 1, className: '701', type: 'substitution',
  originalTeacherEmail: 'bill@x', actualTeacherEmail: 'cover@x', subFee: '公費代課', status: 'approved'
}], 3, schedules);
assert.equal(noOvertimeWithLeave.sheets.overtime.length, 0, '沒有超鐘點時即使有代課紀錄也不應建立超鐘點列');
assert.equal(noOvertimeWithLeave.sheets.publicSub.length, 0, '沒有超鐘點的代課不應被重複列入公付代課表');
const noAdjunctHours = build([], 16, [{
  teacherEmail: 'bill@x', dayOfWeek: 1, period: 1, className: '701', attr: '一般'
}], [], { jobTitle: '兼課教師' });
assert.equal(noAdjunctHours.sheets.adjunct.length, 0, '沒有可計鐘點的兼課教師不應列入兼課鐘點表');

const fixedSnapshotExport = build([{
  date: '2026-07-06', period: 2, className: '702', type: 'substitution',
  originalTeacherEmail: 'bill@x', actualTeacherEmail: 'cover@x', subFee: '公費代課', status: 'approved'
}], 0, [
  { teacherEmail: 'bill@x', dayOfWeek: 1, period: 1, className: '701', attr: '一般' },
  { teacherEmail: 'bill@x', dayOfWeek: 1, period: 2, className: '702', attr: '一般', specialTags: '超鐘點' }
], [], { fixedOvertimeHours: 1, fixedOvertimeSlots: '一1' });
assert.equal(fixedSnapshotExport.sheets.overtime.length, 1, '固定超鐘點仍應產生超鐘點列');
assert.deepEqual([
  fixedSnapshotExport.sheets.overtime[0].weeklyOvertime,
  fixedSnapshotExport.sheets.overtime[0].schedule,
  fixedSnapshotExport.sheets.overtime[0].deduction,
  fixedSnapshotExport.sheets.overtime[0].actualHours
], [1, '一1', 0, 1], '會計匯出只應將固定節次視為超鐘點扣除來源');
assert.equal(fixedSnapshotExport.sheets.publicSub.length, 1, '非固定節次公費代課應留在公付代課表');

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

const mergedOvertime = window.ExportAccounting.buildExportData({
  reportMonth: '2026-09',
  reportStartDate: '2026-09-01',
  reportEndDate: '2026-09-30',
  reportWeeksCount: 5,
  periods: { overtime: { start: '2026-09-01', end: '2026-09-30' } },
  teachers: [
    { email: 'original@x', name: '黃美蘭', baseHours: 0, expensePlan: '計畫A' },
    { email: 'cover-a@x', name: '莊英勝', jobTitle: '706導師', baseHours: 16 },
    { email: 'cover-b@x', name: '洪筱仙', jobTitle: '教學組長', baseHours: 16 },
    { email: 'lv@x', name: '呂哲瑜', baseHours: 0, expensePlan: '計畫A' }
  ],
  allSchedules: [
    { teacherEmail: 'original@x', dayOfWeek: 2, period: 5, className: '905', attr: '一般', specialTags: '超鐘點' },
    { teacherEmail: 'original@x', dayOfWeek: 2, period: 6, className: '906', attr: '一般', specialTags: '超鐘點' },
    { teacherEmail: 'lv@x', dayOfWeek: 5, period: 6, className: '906', attr: '一般', specialTags: '超鐘點' }
  ],
  substitutionRecords: [
    { date: '2026-09-22', period: 5, className: '905', type: 'substitution', originalTeacherEmail: 'original@x', actualTeacherEmail: 'cover-a@x', subFee: '公費代課', status: 'approved' },
    { date: '2026-09-22', period: 6, className: '906', type: 'substitution', originalTeacherEmail: 'original@x', actualTeacherEmail: 'cover-b@x', subFee: '公費代課', status: 'approved' },
    { date: '2026-09-29', period: 5, className: '905', type: 'substitution', originalTeacherEmail: 'original@x', actualTeacherEmail: 'cover-a@x', subFee: '公費代課', status: 'approved' },
    { date: '2026-09-29', period: 6, className: '906', type: 'substitution', originalTeacherEmail: 'original@x', actualTeacherEmail: 'cover-b@x', subFee: '公費代課', status: 'approved' },
    { date: '2026-09-11', period: 6, className: '906', type: 'substitution', originalTeacherEmail: 'lv@x', actualTeacherEmail: 'cover-b@x', subFee: '公費代課', status: 'approved' }
  ]
});
const mergedOvertimePlan = mergedOvertime.overtimePlans.find(group => group.plan === '計畫A');
assert.ok(mergedOvertimePlan, '專案來源應建立超鐘點計畫工作表');
const mergedOvertimeRows = mergedOvertimePlan.rows.filter(row => row.weeks === '');
assert.deepEqual(mergedOvertimeRows.map(row => [row.name, row.grossHours, row.amount]), [
  ['莊英勝', '', 910],
  ['洪筱仙', '', 1365]
], '同一實際代課教師的超鐘點明細應合併且清空黃底欄位');
assert.deepEqual(mergedOvertimeRows.map(row => row.actualHours), [2, 3], '代課明細應保留合計時數');
mergedOvertimeRows.forEach(row => {
  assert.deepEqual([
    row.weeklyOvertime, row.schedule, row.weeks,
    row.grossHours, row.deduction
  ], ['', '', '', '', ''], '超鐘點代課明細除合計時數外的黃底欄位應留白');
});
assert.equal(mergedOvertimeRows.length, 2, '相同代課人跨日期不應重複列出');
assert.equal(
  mergedOvertimeRows.find(row => row.name === '莊英勝').note,
  '9/22、9/29代黃美蘭公費代課2節',
  '相同原教師與假別的代課備註應跨日期合併並合計節數'
);
assert.ok(mergedOvertimeRows.find(row => row.name === '莊英勝').note.includes('9/22')
  && mergedOvertimeRows.find(row => row.name === '莊英勝').note.includes('9/29'), '合併列仍應保留各日期備註');
assert.ok(mergedOvertimeRows.find(row => row.name === '洪筱仙').note.includes('9/11'), '跨原教師的代課備註仍應保留');

const adjunctSubstitute = window.ExportAccounting.buildExportData({
  reportMonth: '2026-09',
  reportStartDate: '2026-09-01',
  reportEndDate: '2026-09-30',
  reportWeeksCount: 5,
  periods: {
    overtime: { start: '2026-09-01', end: '2026-09-30' },
    adjunct: { start: '2026-09-01', end: '2026-09-30' },
    publicSub: { start: '2026-09-01', end: '2026-09-30' }
  },
  teachers: [
    { email: 'adjunct-origin@x', name: '兼課原教師', jobTitle: '兼課教師', baseHours: 0 },
    { email: 'adjunct-cover@x', name: '公付代課人', jobTitle: '教學組長', baseHours: 16 },
    { email: 'adjunct-self-cover@x', name: '自付代課人', jobTitle: '教學組長', baseHours: 16 }
  ],
  allSchedules: [
    { teacherEmail: 'adjunct-origin@x', dayOfWeek: 5, period: 1, className: '901', attr: '一般', specialTags: '超鐘點' },
    { teacherEmail: 'adjunct-origin@x', dayOfWeek: 5, period: 2, className: '902', attr: '一般', specialTags: '超鐘點' }
  ],
  substitutionRecords: [
    {
      date: '2026-09-11', period: 1, className: '901', type: 'substitution',
      originalTeacherEmail: 'adjunct-origin@x', actualTeacherEmail: 'adjunct-cover@x',
      subFee: '公費代課', status: 'approved'
    },
    {
      date: '2026-09-11', period: 2, className: '902', type: 'substitution',
      originalTeacherEmail: 'adjunct-origin@x', actualTeacherEmail: 'adjunct-self-cover@x',
      subFee: '自費代課', status: 'approved'
    }
  ]
});
assert.equal(adjunctSubstitute.sheets.publicSub.length, 0, '兼課教師代課不應移到公付代課表');
assert.equal(adjunctSubstitute.sheets.selfSub.length, 0, '兼課教師代課不應移到自付代課表');
assert.deepEqual(adjunctSubstitute.sheets.adjunct.map(row => row.name), [
  '兼課原教師', '公付代課人', '自付代課人'
], '兼課代課明細應接在兼課教師下方並列出實際代課教師');
assert.deepEqual([
  adjunctSubstitute.sheets.adjunct[1].weeklyOvertime,
  adjunctSubstitute.sheets.adjunct[1].schedule,
  adjunctSubstitute.sheets.adjunct[1].weeks,
  adjunctSubstitute.sheets.adjunct[1].grossHours,
  adjunctSubstitute.sheets.adjunct[1].deduction
], ['', '', '', '', ''], '兼課代課明細除合計時數外的黃底欄位應留白');
assert.equal(adjunctSubstitute.sheets.adjunct[1].actualHours, 1, '兼課代課明細應保留合計時數');
assert.deepEqual([
  adjunctSubstitute.sheets.adjunct[2].weeklyOvertime,
  adjunctSubstitute.sheets.adjunct[2].schedule,
  adjunctSubstitute.sheets.adjunct[2].weeks,
  adjunctSubstitute.sheets.adjunct[2].grossHours,
  adjunctSubstitute.sheets.adjunct[2].deduction
], ['', '', '', '', ''], '兼課自付代課明細除合計時數外的黃底欄位應留白');
assert.equal(adjunctSubstitute.sheets.adjunct[2].actualHours, 1, '兼課自付代課明細應保留合計時數');
assert.equal(adjunctSubstitute.sheets.adjunct[0].deduction, 2, '兼課教師原課被代時仍應扣除公付與自付節數');
assert.equal(adjunctSubstitute.sheets.overtime.length, 0, '兼課教師不應混入超鐘點代課明細');

const crossMonthRange = window.ExportAccounting.buildExportData({
  reportMonth: '2026-07',
  reportStartDate: '2026-07-31',
  reportEndDate: '2026-08-03',
  reportWeeksCount: 2,
  periods: { start: '2026-07-31', end: '2026-08-03' },
  teachers: [{ email: 'cover@x', name: 'Cover', baseHours: 16 }],
  allSchedules: [],
  substitutionRecords: [],
  homeroomRecords: [
    { date: '2026-07-30', actualTeacherEmail: 'cover@x', actualTeacherName: 'Cover', className: '701', status: 'assigned' },
    { date: '2026-08-03', actualTeacherEmail: 'cover@x', actualTeacherName: 'Cover', className: '702', status: 'assigned' },
    { date: '2026-08-04', actualTeacherEmail: 'cover@x', actualTeacherName: 'Cover', className: '703', status: 'assigned' }
  ]
});
assert.deepEqual(crossMonthRange.periods, { start: '2026-07-31', end: '2026-08-03' }, '會計匯出應沿用統一日期區間');
assert.equal(crossMonthRange.sheets.mentor.length, 1, '會計代導明細應只取跨月份區間內資料');
assert.equal(crossMonthRange.sheets.mentor[0].date, '115.08.03(一)', '會計代導明細應保留迄日資料');

const courseAdjustmentMentor = window.ExportAccounting.buildExportData({
  reportMonth: '2026-07',
  periods: { mentor: period },
  teachers: [
    { email: 'cover@x', name: 'Cover', baseHours: 16 },
    { email: 'cover2@x', name: 'Cover2', baseHours: 16 },
    { email: 'cover3@x', name: 'Cover3', baseHours: 16 },
    { email: 'cover4@x', name: 'Cover4', baseHours: 16 }
  ],
  allSchedules: [],
  substitutionRecords: [
    { requestId: 'req-course-only', date: '2026-07-03', reason: '課務調整', status: 'approved' },
    { requestId: 'req-normal', date: '2026-07-04', reason: '事假', status: 'approved' },
    { requestId: 'req-am', date: '2026-07-05', reason: '事假', leaveTimeType: '上午', leaveTime: '08:00~12:00', status: 'approved' },
    { requestId: 'req-short', date: '2026-07-06', reason: '事假', leaveTimeType: '自訂', leaveTime: '08:00~15:00', status: 'approved' },
    { requestId: 'req-custom-full', date: '2026-07-07', reason: '事假', leaveTimeType: '自訂', leaveTime: '08:00~16:00', status: 'approved' }
  ],
  homeroomRecords: [
    { sourceRequestId: 'req-course-only', date: '2026-07-03', actualTeacherEmail: 'cover@x', actualTeacherName: 'Cover', className: '701', status: 'assigned' },
    { sourceRequestId: 'req-normal', date: '2026-07-04', actualTeacherEmail: 'cover2@x', actualTeacherName: 'Cover2', className: '702', status: 'assigned' },
    { sourceRequestId: 'req-am', date: '2026-07-05', actualTeacherEmail: 'cover3@x', actualTeacherName: 'Cover3', className: '703', status: 'assigned' },
    { sourceRequestId: 'req-short', date: '2026-07-06', actualTeacherEmail: 'cover3@x', actualTeacherName: 'Cover3', className: '704', status: 'assigned' },
    { sourceRequestId: 'req-custom-full', date: '2026-07-07', actualTeacherEmail: 'cover4@x', actualTeacherName: 'Cover4', className: '705', status: 'assigned' }
  ]
});
assert.equal(courseAdjustmentMentor.sheets.mentor.length, 2, '僅課務調整與非整日請假不應列入代導鐘點費');
assert.equal(courseAdjustmentMentor.sheets.mentor[0].actualName, 'Cover2', '一般代導仍應列入代導鐘點費');
assert.equal(courseAdjustmentMentor.sheets.mentor[1].actualName, 'Cover4', '完整自訂全天仍應列入代導鐘點費');

const publicOvertime = build([{
  date: '2026-07-13', period: 1, className: '701', type: 'substitution',
  originalTeacherEmail: 'bill@x', actualTeacherEmail: 'cover@x', subFee: '公費代課', status: 'approved'
}]);
assert.equal(publicOvertime.sheets.overtime.length, 1, '國教公費代課應列入國教超鐘點工作表');
assert.equal(publicOvertime.sheets.overtime[0].name, 'cover@x');
assert.equal(publicOvertime.sheets.overtime[0].actualHours, 1);
assert.equal(publicOvertime.sheets.publicSub.length, 0, '國教公費代課不應分流到公付代課表');

const substituteAttribute = build([{
  date: '2026-07-13', period: 1, className: '701', type: 'substitution',
  originalTeacherEmail: 'bill@x', actualTeacherEmail: 'cover@x', subFee: '公費代課', status: 'approved'
}], 0, [{
  teacherEmail: 'bill@x', dayOfWeek: 1, period: 1, className: '701', attr: '代課'
}]);
assert.equal(substituteAttribute.sheets.overtime.length, 0, '代課屬性請假且無超鐘點時不列入超鐘點工作表');
assert.equal(substituteAttribute.sheets.publicSub.find(row => row.name === 'Billing'), undefined, '課表代課不應混入一般公付代課工作表');
assert.equal(substituteAttribute.sheets.publicSub.find(row => row.name === 'cover@x'), undefined, '小鐘點代課不應列入一般公付代課工作表');
assert.equal(substituteAttribute.substituteAttributePlans.length, 1, '課表代課應建立獨立工作表資料');
assert.equal(substituteAttribute.substituteAttributePlans[0].plan, '國教');
assert.equal(substituteAttribute.substituteAttributePlans[0].rows[0].name, 'Billing');
assert.equal(substituteAttribute.substituteAttributePlans[0].rows[0].hours, 1);
assert.equal(substituteAttribute.substituteAttributePlans[0].rows[0].note, '代課1節（7/6）');

const substituteAttributeCoverage = window.ExportAccounting.buildExportData({
  reportMonth: '2026-07',
  periods: { publicSub: period },
  teachers: [
    { email: 'bill@x', name: 'Billing', baseHours: 0 },
    { email: 'cover@x', name: 'Cover', baseHours: 16 }
  ],
  allSchedules: [
    { teacherEmail: 'bill@x', dayOfWeek: 1, period: 1, className: '701', attr: '代課' }
  ],
  substitutionRecords: [{
    date: '2026-07-06', period: 1, className: '701', type: 'substitution',
    originalTeacherEmail: 'bill@x', actualTeacherEmail: 'cover@x',
    subFee: '公費代課', status: 'approved'
  }]
});
assert.equal(substituteAttributeCoverage.sheets.overtime.length, 0, '小鐘點被代課不應列入超鐘點工作表');
assert.equal(substituteAttributeCoverage.sheets.publicSub.length, 0, '小鐘點被代課不應列入一般公付代課工作表');
assert.equal(substituteAttributeCoverage.sheets.selfSub.length, 0, '小鐘點被代課不應列入自付代課工作表');
const substituteCoverageRow = substituteAttributeCoverage.substituteAttributePlans[0].rows
  .find(row => row.name === 'Cover');
assert.ok(substituteCoverageRow, '小鐘點被代課應由實際授課人列入小鐘點表');
assert.equal(substituteCoverageRow.note, '代Billing1節（7/6）', '小鐘點備註應標出被代的原任教師');

const substituteAttributeNotOvertimeSummary = window.ExportAccounting.buildExportData({
  reportMonth: '2026-07',
  reportWeeksCount: 1,
  periods: { overtime: period },
  teachers: [{ email: 'bill@x', name: 'Billing', baseHours: 1 }],
  allSchedules: [
    { teacherEmail: 'bill@x', dayOfWeek: 1, period: 1, className: '701', attr: '代課' },
    { teacherEmail: 'bill@x', dayOfWeek: 1, period: 2, className: '702', attr: '一般', specialTags: '超鐘點' }
  ],
  monthlyReportRows: [{
    email: 'bill@x', name: 'Billing', expensePlan: '國教',
    weeklyOvertime: 1, scheduledOvertime: 1, reduceDeduction: 0
  }],
  substitutionRecords: [{
    date: '2026-07-06', period: 1, className: '701', type: 'substitution',
    originalTeacherEmail: 'bill@x', actualTeacherEmail: 'cover@x',
    subFee: '自費代課', status: 'approved',
    courseAttr: '代課', courseSpecialTags: '', courseIsOvertime: false, courseIsSubstitute: true
  }]
});
assert.equal(substituteAttributeNotOvertimeSummary.sheets.overtime.length, 1, '小鐘點紀錄不應讓超鐘點摘要列被扣到消失');
assert.equal(substituteAttributeNotOvertimeSummary.sheets.overtime[0].deduction, 0, '小鐘點紀錄不應扣超鐘點節數');
assert.equal(substituteAttributeNotOvertimeSummary.sheets.overtime[0].note, '', '小鐘點紀錄不應出現在超鐘點摘要備註');

const selfPaidSubstituteAttributeCoverage = window.ExportAccounting.buildExportData({
  reportMonth: '2026-07',
  periods: { publicSub: period },
  teachers: [
    { email: 'bill@x', name: 'Billing', baseHours: 0 },
    { email: 'cover@x', name: 'Cover', baseHours: 16 }
  ],
  allSchedules: [
    { teacherEmail: 'bill@x', dayOfWeek: 1, period: 1, className: '701', attr: '代課' }
  ],
  substitutionRecords: [{
    date: '2026-07-06', period: 1, className: '701', type: 'substitution',
    originalTeacherEmail: 'bill@x', actualTeacherEmail: 'cover@x',
    subFee: '自費代課', status: 'approved'
  }]
});
assert.equal(selfPaidSubstituteAttributeCoverage.sheets.overtime.length, 0, '自費小鐘點被代課不應列入超鐘點工作表');
assert.equal(selfPaidSubstituteAttributeCoverage.sheets.publicSub.length, 0, '自費小鐘點被代課不應列入公付代課工作表');
assert.equal(selfPaidSubstituteAttributeCoverage.sheets.selfSub.length, 0, '自費小鐘點被代課不應列入自付代課工作表');
assert.ok(selfPaidSubstituteAttributeCoverage.substituteAttributePlans[0].rows.some(row => row.name === 'Cover'), '自費小鐘點被代課仍應列入小鐘點表');

const exchangedSubstituteAttribute = window.ExportAccounting.buildExportData({
  reportMonth: '2026-09',
  reportStartDate: '2026-09-21',
  reportEndDate: '2026-09-25',
  reportWeeksCount: 1,
  periods: { publicSub: { start: '2026-09-21', end: '2026-09-25' } },
  teachers: [
    { email: 'exchange-small@x', name: '交換小鐘點', baseHours: 0 },
    { email: 'exchange-target@x', name: '交換對方', baseHours: 16 }
  ],
  allSchedules: [
    { teacherEmail: 'exchange-small@x', dayOfWeek: 2, period: 2, className: '705', subject: '生活科技', attr: '代課' },
    { teacherEmail: 'exchange-target@x', dayOfWeek: 2, period: 5, className: '704', subject: '國文', attr: '一般' }
  ],
  substitutionRecords: [
    {
      id: 'exchange-small_1', requestId: 'exchange-small', date: '2026-09-22', period: 5,
      type: 'exchange', originalTeacherEmail: 'exchange-target@x', actualTeacherEmail: 'exchange-small@x',
      className: '705', subject: '生活科技', subFee: '無',
      courseAttr: '代課', courseSpecialTags: '', courseIsOvertime: false, courseIsSubstitute: true
    },
    {
      id: 'exchange-small_2', requestId: 'exchange-small', date: '2026-09-22', period: 2,
      type: 'exchange', originalTeacherEmail: 'exchange-small@x', actualTeacherEmail: 'exchange-target@x',
      className: '704', subject: '國文', subFee: '無',
      courseAttr: '一般', courseSpecialTags: '', courseIsOvertime: false, courseIsSubstitute: false
    }
  ]
});
assert.equal(exchangedSubstituteAttribute.sheets.overtime.length, 0, '調課後小鐘點不應列入超鐘點工作表');
assert.equal(exchangedSubstituteAttribute.sheets.publicSub.length, 0, '調課後小鐘點不應列入一般公付代課工作表');
assert.equal(exchangedSubstituteAttribute.substituteAttributePlans[0].rows[0].name, '交換小鐘點');
assert.equal(exchangedSubstituteAttribute.substituteAttributePlans[0].rows[0].note, '代課1節（9/22）', '調課後小鐘點應以實際授課日期列入小鐘點表');

const publicLeaveTypes = build([
  {
    date: '2026-07-13', period: 1, className: '701', type: 'substitution',
    originalTeacherEmail: 'bill@x', actualTeacherEmail: 'cover@x', subFee: '公費代課', reason: '公假', status: 'approved'
  },
  {
    date: '2026-07-14', period: 2, className: '702', type: 'substitution',
    originalTeacherEmail: 'bill@x', actualTeacherEmail: 'cover@x', subFee: '公費代課', reason: '身心調適假', status: 'approved'
  }
], 0, [
  { teacherEmail: 'bill@x', dayOfWeek: 1, period: 1, className: '701', attr: '一般' },
  { teacherEmail: 'bill@x', dayOfWeek: 2, period: 2, className: '702', attr: '一般' }
]);
assert.equal(publicLeaveTypes.sheets.publicSub.length, 1, '一般公付代課應留在公付代課工作表');
assert.equal(publicLeaveTypes.sheets.publicSubAdjustment.length, 1, '身心調適假應獨立列入專用公付代課工作表');
assert.equal(publicLeaveTypes.sheets.publicSub[0].note, '7/13代Billing公假1節', '公付代課備註應使用月日、原教師、假別與節數格式');
assert.equal(publicLeaveTypes.sheets.publicSub[0].note.includes('身心調適假'), false, '一般公付代課表不應混入身心調適假');
assert.equal(publicLeaveTypes.sheets.publicSubAdjustment[0].note, '7/14代Billing身心調適假1節', '身心調適假備註應使用一致格式');

const datedSubstituteAttribute = window.ExportAccounting.buildExportData({
  reportMonth: '2026-09',
  periods: { publicSub: { start: '2026-09-01', end: '2026-09-30' } },
  teachers: [{ email: 'bill@x', name: 'Billing', baseHours: 16 }],
  allSchedules: [],
  substitutionRecords: [],
  monthlyReportRows: [{
    email: 'bill@x',
    name: 'Billing',
    substituteAttributeDetails: [
      { date: '2026-09-25', source: '計畫A' },
      { date: '2026-09-18', source: '計畫A' },
      { date: '2026-09-18', source: '計畫A' }
    ]
  }]
});
assert.equal(datedSubstituteAttribute.substituteAttributePlans[0].rows[0].hours, 3);
assert.equal(datedSubstituteAttribute.substituteAttributePlans[0].rows[0].note, '代課3節（9/18、9/25）');

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
assert.deepEqual(splitSubstituteAttribute.substituteAttributePlans.map(group => group.rows[0].hours), [1, 1]);

const fallbackClassNote = build([], 2, schedules);
assert.equal(fallbackClassNote.overtimePlans[0].rows[0].note, '', '沒有實際異動時超鐘點備註應留白');

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
assert.equal(multiDateNote, '7/1事假扣1節、7/8事假扣1節', '相同假別應合併日期並保留各日節數');

const chronologicalLeave = window.ExportAccounting.buildExportData({
  reportMonth: '2026-09',
  reportStartDate: '2026-09-01',
  reportEndDate: '2026-10-02',
  reportWeeksCount: 5,
  periods: { overtime: { start: '2026-09-01', end: '2026-10-02' } },
  teachers: [{ email: 'bill@x', name: 'Billing', baseHours: 0, expensePlan: '計畫A' }],
  allSchedules: [
    { teacherEmail: 'bill@x', dayOfWeek: 2, period: 1, className: '703', attr: '一般', specialTags: '超鐘點' },
    { teacherEmail: 'bill@x', dayOfWeek: 2, period: 2, className: '702', attr: '一般', specialTags: '超鐘點' },
    { teacherEmail: 'bill@x', dayOfWeek: 3, period: 1, className: '703', attr: '一般', specialTags: '超鐘點' },
    { teacherEmail: 'bill@x', dayOfWeek: 3, period: 2, className: '704', attr: '一般', specialTags: '超鐘點' },
    { teacherEmail: 'bill@x', dayOfWeek: 4, period: 1, className: '705', attr: '一般', specialTags: '超鐘點' },
    { teacherEmail: 'bill@x', dayOfWeek: 5, period: 1, className: '701', attr: '一般', specialTags: '超鐘點' },
    { teacherEmail: 'bill@x', dayOfWeek: 5, period: 2, className: '702', attr: '一般', specialTags: '超鐘點' }
  ],
  substitutionRecords: [
    { date: '2026-10-02', period: 1, periodCount: 2, className: '701', type: 'substitution', originalTeacherEmail: 'bill@x', actualTeacherEmail: 'cover@x', subFee: '公費代課', reason: '公假', status: 'approved' },
    { date: '2026-09-11', period: 2, periodCount: 2, className: '702', type: 'substitution', originalTeacherEmail: 'bill@x', actualTeacherEmail: 'cover@x', subFee: '公費代課', reason: '公假', status: 'approved' },
    { date: '2026-09-22', period: 1, periodCount: 3, className: '703', type: 'substitution', originalTeacherEmail: 'bill@x', actualTeacherEmail: 'cover@x', subFee: '公費代課', reason: '休假', status: 'approved' }
  ]
});
assert.equal(
  chronologicalLeave.overtimePlans[0].rows[0].note,
  '1、9/11公假扣2節、10/2公假扣2節\n2、9/22休假扣3節',
  '備註應先依日期排序，再依假別分組合併'
);

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
assert.equal(publicSpecial.sheets.overtime.length, 1, '國教特殊節次公費代課應列入國教工作表');
assert.equal(publicSpecial.sheets.overtime[0].name, 'cover@x');
assert.equal(publicSpecial.sheets.overtime[0].actualHours, 2);
assert.equal(publicSpecial.sheets.publicSub.length, 0, '國教特殊節次公費代課不應分流到公付代課表');

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
assert.equal(selfSpecial.sheets.overtime.length, 2);
assert.equal(selfSpecial.sheets.overtime[0].name, 'Billing');
assert.equal(selfSpecial.sheets.overtime[1].name, 'cover@x');
assert.equal(selfSpecial.sheets.overtime[1].actualHours, 2);
assert.equal(selfSpecial.sheets.selfSub.length, 0, '國教自費代課不應分流到自付代課表');

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
assert.equal(mixed.sheets.overtime[0].note.includes('\u8b8a\u52d5'), false, '超鐘點備註不應顯示變動字眼');

const publicRegular = build([{
  date: '2026-07-13', period: 3, className: '703', type: 'substitution',
  originalTeacherEmail: 'bill@x', actualTeacherEmail: 'cover@x', subFee: '公費代課', reason: '公假', status: 'approved'
}], 1, mixedSchedules);
assert.equal(publicRegular.sheets.overtime[0].deduction, 0);
assert.equal(publicRegular.sheets.overtime.length, 1, '未沖超鐘點的公費正式課代課不應混入超鐘點明細');
assert.equal(publicRegular.sheets.publicSub.length, 1, '未沖超鐘點的公費正式課代課應列入公付代課表');
assert.equal(publicRegular.sheets.publicSub[0].note, '7/13代Billing公假1節');

const combinedReturn = build([{
  date: '2026-07-13', period: 1, className: '701', type: 'substitution',
   originalTeacherEmail: 'bill@x', actualTeacherEmail: 'cover@x', subFee: '公費代課',
  specialFlow: 'combined_return', status: 'approved'
}], 0, [{
   teacherEmail: 'bill@x', dayOfWeek: 1, period: 1, className: '701', attr: '一般', specialTags: '超鐘點'
}]);
assert.equal(combinedReturn.sheets.overtime.length, 1, '合班回原紀錄仍應保留超鐘點摘要列');
assert.equal(combinedReturn.sheets.overtime[0].deduction, 1, '合班回原紀錄仍應扣原教師超鐘點');
assert.equal(combinedReturn.sheets.overtime[0].actualHours, 0, '合班回原紀錄不應產生原教師實得鐘點');
assert.ok(combinedReturn.sheets.overtime[0].note.includes('7/13公假扣1節（合班1節不排）'), '合班回原紀錄應在備註標明不排節數');
assert.equal(combinedReturn.sheets.publicSub.length, 0);

const combinedRegular = build([{
  date: '2026-07-13', period: 1, className: '701', type: 'substitution',
  originalTeacherEmail: 'bill@x', actualTeacherEmail: 'cover@x', subFee: '公費代課',
  specialFlow: 'combined_return', status: 'approved'
}], 0, [
  { teacherEmail: 'bill@x', dayOfWeek: 1, period: 1, className: '701', attr: '基本' },
  { teacherEmail: 'bill@x', dayOfWeek: 1, period: 2, className: '702', attr: '一般', specialTags: '超鐘點' }
]);
assert.equal(combinedRegular.sheets.overtime.length, 1, '公費正式課合班不應影響原教師超鐘點摘要');
assert.equal(combinedRegular.sheets.overtime[0].deduction, 0, '公費正式課合班不應扣超鐘點');
assert.equal(combinedRegular.sheets.overtime[0].note, '', '公費正式課合班不應產生扣鐘點備註');
assert.equal(combinedRegular.sheets.publicSub.length, 0, '公費正式課合班不應產生代課費明細');

const swappedPublic = build([{
  date: '2026-07-13', period: 1, className: '701', type: 'substitution',
  originalTeacherEmail: 'bill@x', actualTeacherEmail: 'cover@x', subFee: '公費代課', status: 'approved'
}], 0, [
  { teacherEmail: 'bill@x', dayOfWeek: 2, period: 3, className: '701', attr: '一般', specialTags: '超鐘點' }
], [{
  id: 'swap-billing', name: '補課', dateA: '2026-07-13', periodA: 1,
  dateB: '2026-07-14', periodB: 3, enabled: true
}]);
assert.equal(swappedPublic.sheets.overtime.length, 1, '國教調課後公費代課應列入國教超鐘點明細');
assert.equal(swappedPublic.sheets.overtime[0].name, 'cover@x');
assert.equal(swappedPublic.sheets.publicSub.length, 0, '國教調課後公費代課不應分流到公付代課表');

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
      originalTeacherEmail: 'bill@x', actualTeacherEmail: 'cover@x', subFee: '公費代課', reason: '公假', status: 'approved'
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
  expensePlan: '計畫A', serial: 1, title: '教師', name: 'Cover', weeklyOvertime: '',
  schedule: '', weeks: '', grossHours: '', deduction: '', actualHours: 1,
  rate: 455, amount: 455, reduceNote: '', note: '7/13代Billing公假1節'
});
assert.equal(configuredB.rows[0].expensePlan, '計畫B');
assert.equal(configuredB.rows[0].grossHours, '');
assert.equal(configuredB.rows[0].deduction, '');
assert.equal(configuredB.rows[0].actualHours, 1);
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
const defaultPlan = missingSource.overtimePlans.find(group => group.plan === '國教');
assert.ok(defaultPlan, 'missing slot source must be grouped into the default overtime plan');
assert.equal(missingSource.overtimePlans[0].plan, '國教', 'default overtime plan must be listed first');
assert.equal(defaultPlan.rows[0].expensePlan, '國教');
assert.equal(defaultPlan.rows[0].grossHours, 1);
assert.equal(defaultPlan.rows[0].actualHours, 1);
assert.equal(missingSource.blocking.length, 0, 'default overtime plan must not block accounting export');
assert.ok(missingSource.summary.some(item => item.key === 'overtime:國教' && item.hours === 1), 'default overtime plan must be included in export summary');

const fixedExportSchedules = [];
for (let i = 0; i < 13; i += 1) {
  fixedExportSchedules.push({
    teacherEmail: 'fixed-export@x', dayOfWeek: Math.floor(i / 7) + 1, period: (i % 7) + 1,
    className: 'B' + String(i + 1).padStart(2, '0'), attr: '基本'
  });
}
[
  { dayOfWeek: 2, period: 7, className: 'O01' },
  { dayOfWeek: 3, period: 1, className: 'O02' },
  { dayOfWeek: 3, period: 2, className: 'O03' },
  { dayOfWeek: 3, period: 3, className: 'O04' }
].forEach(slot => fixedExportSchedules.push(Object.assign({
  teacherEmail: 'fixed-export@x', attr: '一般', specialTags: '超鐘點'
}, slot)));
[
  { dayOfWeek: 3, period: 4, className: 'O05' },
  { dayOfWeek: 3, period: 5, className: 'O06' }
].forEach(slot => fixedExportSchedules.push(Object.assign({
  teacherEmail: 'fixed-export@x', attr: '一般', specialTags: '超鐘點',
  activeFrom: '2026-06-29', activeTo: '2026-07-03'
}, slot)));
const fixedExport = window.ExportAccounting.buildExportData({
  reportMonth: '2026-06',
  reportStartDate: '2026-06-01',
  reportEndDate: '2026-07-03',
  reportWeeksCount: 5,
  periods: { overtime: { start: '2026-06-01', end: '2026-07-03' } },
  teachers: [{ email: 'fixed-export@x', name: '固定匯出教師', baseHours: 13 }],
  allSchedules: fixedExportSchedules,
  classAwayEvents: [
    { name: '不調降事件', startDate: '2026-06-08', endDate: '2026-06-12', classes: ['O01'], billingRule: 'keep', enabled: true },
    { name: '調降事件', startDate: '2026-06-15', endDate: '2026-06-19', classes: ['O02'], billingRule: 'reduce', enabled: true }
  ],
  substitutionRecords: [{
    date: '2026-06-24', period: 1, className: 'O02', type: 'substitution',
    originalTeacherEmail: 'fixed-export@x', actualTeacherEmail: 'cover@x', subFee: '公費代課'
  }]
});
const fixedExportPlan = fixedExport.overtimePlans.find(group => group.plan === '國教');
assert.ok(fixedExportPlan, '固定超鐘點教師應建立國教分表');
assert.deepEqual([
  fixedExportPlan.rows[0].weeklyOvertime,
  fixedExportPlan.rows[0].weeks,
  fixedExportPlan.rows[0].grossHours,
  fixedExportPlan.rows[0].deduction,
  fixedExportPlan.rows[0].actualHours
], [6, 5, 30, 1, 29], '會計表應以固定週超鐘點乘週數，只扣須扣代課');
assert.ok(Number.isInteger(fixedExportPlan.rows[0].weeklyOvertime), '會計表每週超鐘點必須是整數');

const legacyAwayExport = window.ExportAccounting.buildExportData({
  reportMonth: '2026-07',
  reportWeeksCount: 5,
  periods: { overtime: period },
  teachers: [{ email: 'legacy-away@x', name: '舊資料教師', baseHours: 16, expensePlan: '國教' }],
  allSchedules: [],
  substitutionRecords: [],
  monthlyReportRows: [{
    email: 'legacy-away@x',
    name: '舊資料教師',
    expensePlan: '國教',
    weeklyOvertime: 3,
    scheduledOvertime: 15,
    reduceDeduction: 5,
    expensePlanAllocations: [{
      source: '國教', rawHours: 15, weeklyHours: 3,
      reduceHours: 5, grossHours: 10, deduction: 2, actualHours: 8
    }]
  }]
});
const legacyAwayRow = legacyAwayExport.overtimePlans[0].rows[0];
assert.deepEqual([
  legacyAwayRow.grossHours,
  legacyAwayRow.deduction,
  legacyAwayRow.actualHours
], [15, 2, 13], '會計匯出不應沿用舊月報的放假扣減');

console.log('export accounting tests PASS');
