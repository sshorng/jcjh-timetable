#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');

global.window = global;
require('../field-map.js');
require('../domain-school-swap.js');
require('../date-utils.js');
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
assert.equal(substituteLeaveRow.substitutePaidCount, 3, '代課屬性已授課應列入公付代課');
assert.equal(substituteLeaveRow.pubSubCount, 3, '代課屬性已授課應列入公付代課');
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
assert.equal(substituteAwayRow.substitutePaidCount, 3, '代課屬性非空堂應列入公付代課');
assert.equal(substituteAwayRow.pubSubCount, 3, '代課屬性非空堂應列入公付代課');
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
