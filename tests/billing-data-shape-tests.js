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

const schedule = window.FieldMap.mapSchedule({
  '教師姓名': 'Billing',
  '星期': 1,
  '節次': 1,
  '班級': '701',
  '科目': '國文',
  '課堂屬性': '',
  '特殊標記': '超鐘點'
});
assert.equal(schedule.attr, '一般');
assert.equal(schedule.isOvertime, true);

const substituteSchedule = window.FieldMap.mapSchedule({
  '教師姓名': 'SmallSub',
  '星期': 1,
  '節次': 1,
  '班級': '701',
  '科目': '國文',
  '課堂屬性': '代課'
});
assert.equal(substituteSchedule.attr, '代課');
assert.equal(substituteSchedule.isSubstitute, true);
assert.equal(window.DomainBilling.isWeeklyHoursSlot(substituteSchedule), false);
assert.equal(window.DomainBilling.isSubstituteScheduleSlot(substituteSchedule), true);

const request = window.FieldMap.mapRequest({
  '狀態': '已核准',
  '申請人姓名': 'Billing',
  '受邀人姓名': 'Cover',
  '異動日期': '2026/07/13',
  '異動節次': '1',
  '異動類型': '代課',
  '班級': '701',
  '經費來源': '公費代課'
});
assert.equal(request.requestDate, '2026-07-13');

const courseAdjustmentRequest = window.FieldMap.mapRequest({
  '請假事由': '事假',
  '僅課務調整': '是'
});
assert.equal(courseAdjustmentRequest.courseAdjustmentOnly, true, '僅課務調整欄位應正規化為 true');
assert.equal(window.DomainBilling.isBillableHomeroomRecord({
  sourceRequestId: 'req-partial,req-older-full',
  leaveTimeType: '全天',
  leaveTime: '08:00~16:00'
}, [{ requestId: 'req-partial', reason: '事假', leaveTimeType: '下午', leaveTime: '12:00~16:00' }]), true, '未載入的舊來源仍應依已建立的整日紀錄計費');
assert.equal(window.DomainBilling.isBillableHomeroomRecord({
  sourceRequestId: 'req-staff-full',
  originalTeacherName: '行政導師',
  leaveTimeType: '自訂',
  leaveTime: '08:00~16:00'
}, [{ requestId: 'req-staff-full', reason: '事假', leaveTimeType: '自訂', leaveTime: '08:00~16:00' }], [
  { email: '行政導師', name: '行政導師', role: 'staff' }
]), false, '行政／職員整日應依 17:00 結束');

const mentorWorkbook = window.DomainBilling.buildSubFeeExcelWorkbook({
  reportMonth: '2026-07',
  substitutionRecords: [
    { requestId: 'req-course-only', date: '2026-07-13', reason: '課務調整', status: 'approved' },
    { requestId: 'req-normal', date: '2026-07-14', reason: '事假', status: 'approved' },
    { requestId: 'req-partial', date: '2026-07-15', reason: '事假', leaveTimeType: '下午', leaveTime: '12:00~16:00', status: 'approved' },
    { requestId: 'req-full-custom', date: '2026-07-16', reason: '事假', leaveTimeType: '自訂', leaveTime: '08:00~16:00', status: 'approved' }
  ],
  homeroomRecords: [
    { sourceRequestId: 'req-course-only', date: '2026-07-13', actualTeacherEmail: 'Cover', actualTeacherName: 'Cover', originalTeacherName: '701導師', className: '701', status: 'assigned' },
    { sourceRequestId: 'req-normal', date: '2026-07-14', actualTeacherEmail: 'Cover2', actualTeacherName: 'Cover2', originalTeacherName: '702導師', className: '702', status: 'assigned' },
    { sourceRequestId: 'req-partial', date: '2026-07-15', actualTeacherEmail: 'Cover3', actualTeacherName: 'Cover3', originalTeacherName: '703導師', className: '703', status: 'assigned' },
    { sourceRequestId: 'req-full-custom', date: '2026-07-16', actualTeacherEmail: 'Cover4', actualTeacherName: 'Cover4', originalTeacherName: '704導師', className: '704', status: 'assigned' }
  ]
});
assert.equal(mentorWorkbook.mentorAoa.length, 4, '月度代導清冊應排除僅課務調整與非整日請假');
assert.equal(mentorWorkbook.mentorAoa[2][6], 'Cover2', '月度代導清冊仍應保留一般代導教師');
assert.equal(mentorWorkbook.mentorAoa[3][6], 'Cover4', '月度代導清冊仍應保留完整自訂全天');

const rangedWorkbook = window.DomainBilling.buildSubFeeExcelWorkbook({
  reportMonth: '2026-07',
  reportStartDate: '2026-07-31',
  reportEndDate: '2026-08-03',
  substitutionRecords: [
    { date: '2026-07-30', period: 1, className: '701', type: 'substitution', originalTeacherName: 'Outside', actualTeacherName: 'Cover', subFee: '公費代課', status: 'approved' },
    { date: '2026-07-31', period: 1, className: '702', type: 'substitution', originalTeacherName: 'Inside', actualTeacherName: 'Cover', subFee: '公費代課', status: 'approved' },
    { date: '2026-08-04', period: 1, className: '703', type: 'substitution', originalTeacherName: 'Outside', actualTeacherName: 'Cover', subFee: '公費代課', status: 'approved' }
  ],
  homeroomRecords: [
    { date: '2026-07-30', actualTeacherEmail: 'cover@x', actualTeacherName: 'Cover', originalTeacherName: 'Outside導師', className: '701', status: 'assigned' },
    { date: '2026-08-03', actualTeacherEmail: 'cover@x', actualTeacherName: 'Cover', originalTeacherName: 'Inside導師', className: '702', status: 'assigned' }
  ]
});
assert.equal(rangedWorkbook.pubAoa.length, 3, '逐筆公付清冊應只取指定日期區間');
assert.equal(rangedWorkbook.mentorAoa.length, 3, '逐筆代導清冊應只取指定日期區間');
assert.equal(rangedWorkbook.pubAoa[2][2], '115.07.31(五)', '跨月份日期區間應保留區間內資料');
assert.equal(rangedWorkbook.mentorAoa[2][2], '115.08.03(一)', '跨月份日期區間應保留迄日資料');

const row = window.DomainBilling.buildMonthlyReportRows({
  teachers: [{ email: 'Billing', name: 'Billing', baseHours: 0 }],
  allSchedules: [schedule],
  substitutionRecords: [{
    date: request.requestDate,
    period: request.requestPeriod,
    className: request.className,
    type: 'substitution',
    originalTeacherName: request.requesterName,
    actualTeacherName: request.targetTeacherName,
    subFee: request.subFee
  }],
  reportMonth: '2026-07',
  reportWeeksCount: 1
})[0];

assert.equal(row.publicOvertimeUsed, 1);
assert.equal(row.schoolPublicPayout, 0);
assert.equal(row.actualOvertime, 0);

const rangedReport = window.DomainBilling.buildMonthlyReportRows({
  teachers: [{ email: 'RangeTeacher', name: 'RangeTeacher', baseHours: 0 }],
  allSchedules: [{ teacherEmail: 'RangeTeacher', dayOfWeek: 1, period: 1, className: '701', attr: '一般', specialTags: '超鐘點' }],
  substitutionRecords: [],
  reportMonth: '2026-07',
  reportStartDate: '2026-07-13',
  reportEndDate: '2026-07-24'
})[0];
assert.equal(rangedReport.weeklyPeriods, 1, '日期區間月報應保留每週課表節數');
assert.equal(rangedReport.scheduledOvertime, 2, '日期區間涵蓋兩週時應自動計兩週超鐘');

const fixedSchedules = [];
for (let i = 0; i < 13; i += 1) {
  fixedSchedules.push({
    teacherEmail: 'fixed@x', dayOfWeek: Math.floor(i / 7) + 1, period: (i % 7) + 1,
    className: 'B' + String(i + 1).padStart(2, '0'), attr: '基本'
  });
}
[
  { dayOfWeek: 2, period: 7, className: 'O01' },
  { dayOfWeek: 3, period: 1, className: 'O02' },
  { dayOfWeek: 3, period: 2, className: 'O03' },
  { dayOfWeek: 3, period: 3, className: 'O04' }
].forEach(slot => fixedSchedules.push(Object.assign({
  teacherEmail: 'fixed@x', attr: '一般', specialTags: '超鐘點'
}, slot)));
[
  { dayOfWeek: 3, period: 4, className: 'O05' },
  { dayOfWeek: 3, period: 5, className: 'O06' }
].forEach(slot => fixedSchedules.push(Object.assign({
  teacherEmail: 'fixed@x', attr: '一般', specialTags: '超鐘點',
  activeFrom: '2026-06-29', activeTo: '2026-07-03'
}, slot)));
const fixedInput = {
  teachers: [{ email: 'fixed@x', name: '固定教師', baseHours: 13 }],
  allSchedules: fixedSchedules,
  substitutionRecords: [],
  reportMonth: '2026-06',
  reportStartDate: '2026-06-01',
  reportEndDate: '2026-07-03',
  reportWeeksCount: 5
};
const fixedRow = window.DomainBilling.buildMonthlyReportRows(fixedInput)[0];
assert.deepEqual([
  fixedRow.weeklyPeriods,
  fixedRow.baseHours,
  fixedRow.weeklyOvertime,
  fixedRow.scheduledOvertime,
  fixedRow.expensePlanAllocations[0].rawHours,
  fixedRow.expensePlanAllocations[0].weeklyHours
], [19, 13, 6, 30, 30, 6], '大鐘點應固定週超鐘點乘結算週數');
assert.ok(Number.isInteger(fixedRow.expensePlanAllocations[0].weeklyHours));

const awayFixedRow = window.DomainBilling.buildMonthlyReportRows(Object.assign({}, fixedInput, {
  classAwayEvents: [
    { name: '不調降事件', startDate: '2026-06-08', endDate: '2026-06-12', classes: ['O01'], billingRule: 'keep', enabled: true },
    { name: '調降事件', startDate: '2026-06-15', endDate: '2026-06-19', classes: ['O02'], billingRule: 'reduce', enabled: true }
  ]
}))[0];
assert.deepEqual([
  awayFixedRow.reduceDeduction,
  awayFixedRow.actualOvertime,
  awayFixedRow.expensePlanAllocations[0].grossHours,
  awayFixedRow.expensePlanAllocations[0].deduction,
  awayFixedRow.expensePlanAllocations[0].actualHours
], [2, 28, 28, 0, 28], '任何空堂事件未授課都應扣固定超鐘點');

const substitutedFixedRow = window.DomainBilling.buildMonthlyReportRows(Object.assign({}, fixedInput, {
  substitutionRecords: [{
    date: '2026-06-24', period: 1, className: 'O02', type: 'substitution',
    originalTeacherEmail: 'fixed@x', actualTeacherEmail: 'cover@x', subFee: '公費代課'
  }]
}))[0];
assert.deepEqual([
  substitutedFixedRow.scheduledOvertime,
  substitutedFixedRow.publicOvertimeUsed,
  substitutedFixedRow.actualOvertime,
  substitutedFixedRow.expensePlanAllocations[0].rawHours,
  substitutedFixedRow.expensePlanAllocations[0].grossHours,
  substitutedFixedRow.expensePlanAllocations[0].deduction,
  substitutedFixedRow.expensePlanAllocations[0].actualHours
], [30, 1, 29, 30, 30, 1, 29], '被代課應從固定超鐘點總額扣除');

const fixedSmallSchedules = [
  { teacherEmail: 'small-fixed@x', dayOfWeek: 1, period: 1, className: 'S01', attr: '代課' },
  { teacherEmail: 'small-fixed@x', dayOfWeek: 1, period: 2, className: 'S02', attr: '代課' },
  { teacherEmail: 'small-fixed@x', dayOfWeek: 2, period: 1, className: 'S03', attr: '代課', activeFrom: '2026-06-29', activeTo: '2026-07-03' }
];
const fixedSmallRow = window.DomainBilling.buildMonthlyReportRows({
  teachers: [{ email: 'small-fixed@x', name: '固定小鐘點', baseHours: 0 }],
  allSchedules: fixedSmallSchedules,
  substitutionRecords: [{
    date: '2026-06-30', period: 1, className: 'S03', type: 'substitution',
    originalTeacherEmail: 'small-fixed@x', actualTeacherEmail: 'cover@x', subFee: '公費代課'
  }],
  classAwayEvents: [{
    name: '小鐘點空堂', startDate: '2026-06-08', endDate: '2026-06-12',
    classes: ['S02'], billingRule: 'keep', enabled: true
  }],
  reportMonth: '2026-06',
  reportStartDate: '2026-06-01',
  reportEndDate: '2026-07-03',
  reportWeeksCount: 5
})[0];
assert.deepEqual([
  fixedSmallRow.substituteScheduledCount,
  fixedSmallRow.substitutePaidCount,
  fixedSmallRow.substituteDeduction,
  fixedSmallRow.substituteLeaveAdditionalDeduction,
  fixedSmallRow.substituteKeepAwayDeduction
], [15, 13, 2, 1, 1], '小鐘點應固定週節數乘週數再扣被代與空堂');

const substituteLeaveRow = window.DomainBilling.buildMonthlyReportRows({
  teachers: [{ email: 'SmallSub', name: '小鐘點教師', baseHours: 0 }],
  allSchedules: [substituteSchedule],
  substitutionRecords: [{
    date: '2026-07-06',
    period: 1,
    className: '701',
    type: 'substitution',
    originalTeacherName: 'SmallSub',
    actualTeacherName: 'Cover',
    subFee: '活動公費'
  }],
  reportMonth: '2026-07',
  reportWeeksCount: 1
})[0];
assert.equal(substituteLeaveRow.substituteDeduction, 1, '代課屬性請假應扣一節');
assert.equal(substituteLeaveRow.substituteLeaveAdditionalDeduction, 1);
assert.equal(substituteLeaveRow.substituteScheduledCount, 1, '小鐘點應依結算週數計算');
assert.equal(substituteLeaveRow.substitutePaidCount, 0, '代課屬性未授課不應列入公付代課');
assert.equal(substituteLeaveRow.pubSubCount, 0, '代課屬性未授課不應列入公付代課');
assert.equal(substituteLeaveRow.actualOvertime, 0);

const substituteAwayRow = window.DomainBilling.buildMonthlyReportRows({
  teachers: [{ email: 'SmallSub', name: '小鐘點教師', baseHours: 0 }],
  allSchedules: [substituteSchedule],
  classAwayEvents: [{
    id: 'away-keep', name: '中秋節', startDate: '2026-07-06', endDate: '2026-07-06',
    classes: ['701'], billingRule: 'keep', enabled: true
  }],
  substitutionRecords: [],
  reportMonth: '2026-07',
  reportWeeksCount: 1
})[0];
assert.equal(substituteAwayRow.substituteKeepAwayDeduction, 1, '代課屬性空堂應扣一節');
assert.equal(substituteAwayRow.substituteAdditionalDeduction, 1);
assert.equal(substituteAwayRow.substituteScheduledCount, 1, '小鐘點空堂仍應先計固定週節數');
assert.equal(substituteAwayRow.substitutePaidCount, 0, '代課屬性空堂未授課不應列入公付代課');
assert.equal(substituteAwayRow.pubSubCount, 0, '代課屬性空堂未授課不應列入公付代課');
assert.equal(substituteAwayRow.actualOvertime, 0);
assert.equal(substituteAwayRow.expensePlanAllocations.length, 0, '代課屬性不應產生超鐘點經費分配');

const swappedSchedule = window.FieldMap.mapSchedule({
  '教師姓名': 'Billing',
  '星期': 2,
  '節次': 3,
  '班級': '701',
  '科目': '數學',
  '課堂屬性': '一般',
  '特殊標記': '超鐘點'
});
const swappedRow = window.DomainBilling.buildMonthlyReportRows({
  teachers: [{ email: 'Billing', name: 'Billing', baseHours: 0 }],
  allSchedules: [swappedSchedule],
  schoolSwaps: [{
    id: 'swap-billing',
    name: '補課',
    dateA: '2026-07-13',
    periodA: 1,
    dateB: '2026-07-14',
    periodB: 3,
    enabled: true
  }],
  substitutionRecords: [{
    date: '2026-07-13',
    period: 1,
    className: '701',
    type: 'substitution',
    originalTeacherName: 'Billing',
    actualTeacherName: 'Cover',
    subFee: '公費代課'
  }],
  reportMonth: '2026-07',
  reportWeeksCount: 1
})[0];
assert.equal(swappedRow.publicOvertimeUsed, 1, 'school swap must resolve the original overtime slot');
assert.equal(swappedRow.actualOvertime, 0);

const configuredPlan = JSON.stringify([
  { day: 1, period: 1, className: '701', source: '計畫A' },
  { day: 1, period: 2, className: '702', source: '計畫B' }
]);
const configuredRow = window.DomainBilling.buildMonthlyReportRows({
  teachers: [{ email: 'Billing', name: 'Billing', baseHours: 0, expensePlan: configuredPlan }],
  allSchedules: [
    window.FieldMap.mapSchedule({ '教師姓名': 'Billing', '星期': 1, '節次': 1, '班級': '701', '課堂屬性': '一般', '特殊標記': '超鐘點' }),
    window.FieldMap.mapSchedule({ '教師姓名': 'Billing', '星期': 1, '節次': 2, '班級': '702', '課堂屬性': '一般', '特殊標記': '超鐘點' })
  ],
  substitutionRecords: [
    { date: '2026-07-13', period: 1, className: '701', type: 'substitution', originalTeacherName: 'Billing', actualTeacherName: 'Cover', subFee: '公費代課' },
    { date: '2026-07-13', period: 2, className: '702', type: 'substitution', originalTeacherName: 'Billing', actualTeacherName: 'Cover', subFee: '公費代課' }
  ],
  reportMonth: '2026-07',
  reportWeeksCount: 1
})[0];
assert.equal(configuredRow.expensePlanSummary, '計畫A（1節）、計畫B（1節）');
assert.deepEqual(configuredRow.expensePlanAllocations.map(row => [row.source, row.rawHours, row.deduction, row.actualHours]), [
  ['計畫A', 1, 1, 0],
  ['計畫B', 1, 1, 0]
]);

const partiallyConfiguredPlan = JSON.stringify([
  { day: 1, period: 1, className: '701', source: '計畫A' }
]);
const partiallyConfiguredRow = window.DomainBilling.buildMonthlyReportRows({
  teachers: [{ email: 'Billing', name: 'Billing', baseHours: 0, expensePlan: partiallyConfiguredPlan }],
  allSchedules: [
    window.FieldMap.mapSchedule({ '教師姓名': 'Billing', '星期': 1, '節次': 1, '班級': '701', '課堂屬性': '一般', '特殊標記': '超鐘點' }),
    window.FieldMap.mapSchedule({ '教師姓名': 'Billing', '星期': 1, '節次': 2, '班級': '702', '課堂屬性': '一般', '特殊標記': '超鐘點' })
  ],
  substitutionRecords: [],
  reportMonth: '2026-07',
  reportWeeksCount: 1
})[0];
assert.equal(partiallyConfiguredRow.expensePlanSummary, '計畫A（1節）、預設（1節）');
assert.deepEqual(partiallyConfiguredRow.expensePlanAllocations.map(row => [row.source, row.rawHours]), [
  ['計畫A', 1],
  ['預設', 1]
]);

const coEmployedRow = window.DomainBilling.buildMonthlyReportRows({
  teachers: [{ email: 'CoEmployed', name: '共聘教師', jobTitle: '共聘', baseHours: 0 }],
  allSchedules: [],
  substitutionRecords: [],
  reportMonth: '2026-07',
  reportWeeksCount: 1
})[0];
assert.equal(coEmployedRow.jobTitle, '共聘');
assert.equal(window.DomainBilling.toExcelRows([coEmployedRow])[0]['職務'], '共聘');

const defaultJobRow = window.DomainBilling.buildMonthlyReportRows({
  teachers: [{ email: 'DefaultJob', name: '未填職務', baseHours: 0 }],
  allSchedules: [],
  substitutionRecords: [],
  reportMonth: '2026-07',
  reportWeeksCount: 1
})[0];
assert.equal(defaultJobRow.jobTitle, '教師');
assert.equal(window.DomainBilling.toExcelRows([defaultJobRow])[0]['職務'], '教師');

const reportTotals = window.DomainBilling.sumMonthlyReportRows([
  {
    weeklyPeriods: 20, baseHours: 16, weeklyOvertime: 4, reduceDeduction: 1,
    selfPaidDeduction: 2, publicOvertimeUsed: 3, substituteAdditionalDeduction: 1,
    actualOvertime: -2, overtimeFee: -910, pubSubCount: 4, pubSubFee: 1820,
    selfSubCount: 1, selfSubFee: 455, period8SubCount: 2, period8Fee: 1200
  },
  {
    weeklyPeriods: 18, baseHours: 16, weeklyOvertime: 2, reduceDeduction: 0,
    selfPaidDeduction: 1, publicOvertimeUsed: 0, substituteAdditionalDeduction: 2,
    actualOvertime: 1, overtimeFee: 455, pubSubCount: 0, pubSubFee: 0,
    selfSubCount: 2, selfSubFee: 910, period8SubCount: 1, period8Fee: 600
  }
]);
assert.deepEqual(reportTotals, {
  weeklyPeriods: 38,
  baseHours: 32,
  weeklyOvertime: 6,
  reduceDeduction: 1,
  selfPaidDeduction: 3,
  publicOvertimeUsed: 3,
  substituteAdditionalDeduction: 3,
  actualOvertime: -1,
  overtimeFee: -455,
  pubSubCount: 4,
  pubSubFee: 1820,
  selfSubCount: 3,
  selfSubFee: 1365,
  period8SubCount: 3,
  period8Fee: 1800
});

console.log('billing data shape tests PASS');
