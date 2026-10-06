import assert from 'node:assert/strict';
import { test } from 'vitest';
import DomainBilling from '../src/domain/domain-billing.js';

test('billing units：sumMonthlyReportRows 只加總有限數值', () => {
  const totals = DomainBilling.sumMonthlyReportRows([
    { weeklyPeriods: 20, overtimeFee: 1000, pubSubCount: 2 },
    { weeklyPeriods: 16, overtimeFee: 500, pubSubCount: 'x', period8Fee: undefined },
    null
  ]);
  assert.equal(totals.weeklyPeriods, 36);
  assert.equal(totals.overtimeFee, 1500);
  assert.equal(totals.pubSubCount, 2);
  assert.equal(totals.period8Fee, 0);
  const empty = DomainBilling.sumMonthlyReportRows([]);
  assert.equal(empty.weeklyPeriods, 0);
  assert.equal(empty.overtimeFee, 0);
});

test('billing units：僅課表呈現不進結算', () => {
  assert.equal(DomainBilling.isTimetableOnlyFee('僅課表呈現（不結算）'), true);
  assert.equal(DomainBilling.isTimetableOnlyFee('僅課表呈現'), true);
  assert.equal(DomainBilling.isTimetableOnlyFee('公費代課'), false);
  assert.equal(DomainBilling.isTimetableOnlyFee(''), false);
  assert.equal(DomainBilling.isTimetableOnlyRecord({ subFee: '僅課表呈現' }), true);
  assert.equal(DomainBilling.isTimetableOnlyRecord({ '經費來源': '自費代課' }), false);
});

test('billing units：getWeekKey 取當週週一（含週日歸前一週一）', () => {
  assert.equal(DomainBilling.getWeekKey('2026-09-07'), '2026-09-07'); // 週一
  assert.equal(DomainBilling.getWeekKey('2026-09-09'), '2026-09-07'); // 週三
  assert.equal(DomainBilling.getWeekKey('2026-09-13'), '2026-09-07'); // 週日
});

test('billing units：toExcelRows 欄位映射＋固定超鐘點開關', () => {
  const rows = DomainBilling.toExcelRows([{
    name: '王小明',
    jobTitle: '',
    subject: '國文',
    weeklyPeriods: 20,
    baseHours: 16,
    fixedOvertimeConfigured: true,
    fixedOvertimeHours: 2,
    fixedOvertimeSlots: '一/3',
    reportWeeksCount: 4,
    weeklyOvertime: 4,
    overtimeFee: 2400
  }, {
    name: '李美華',
    subject: '數學',
    fixedOvertimeConfigured: false,
    fixedOvertimeHours: 9,
    reportWeeksCount: 4
  }]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0]['教師姓名'], '王小明');
  assert.equal(rows[0]['職務'], '教師');
  assert.equal(rows[0]['固定超鐘點/週'], 2);
  assert.equal(rows[0]['固定超鐘點節次'], '一/3');
  assert.equal(rows[1]['固定超鐘點/週'], '');
  assert.equal(rows[1]['固定超鐘點節次'], '');
  assert.equal(rows[0]['超鐘點費(1-7)'], 2400);
  console.log('billing units tests PASS');
});
