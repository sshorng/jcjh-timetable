import assert from 'node:assert/strict';
import { test } from 'vitest';
import FieldMap from '../src/domain/field-map.js';
import DomainBilling from '../src/domain/domain-billing.js';
import ExportAccounting from '../src/modules/export-accounting.js';

// 併班上課「不扣鐘點」契約：
// 申請單新增「鐘點規則」欄（空白＝依假別扣＝現行行為），教學組在併班上課面板
// 選「不扣鐘點」後，請假教師的超鐘點與第8節鐘點都不被扣減，且舊資料結果不變。

const OVERTIME_SCHEDULE = {
  teacherEmail: 'keep@example.edu.tw',
  teacherName: '鐘點師',
  dayOfWeek: 1,
  period: 1,
  className: '701',
  subject: '國文',
  attr: '一般',
  specialTags: '超鐘點'
};

function combinedRecord(extra) {
  return Object.assign({
    date: '2026-07-06',
    period: 1,
    className: '701',
    subject: '國文',
    type: 'substitution',
    originalTeacherEmail: 'keep@example.edu.tw',
    originalTeacherName: '鐘點師',
    actualTeacherEmail: 'cover@example.edu.tw',
    actualTeacherName: '併班師',
    subFee: '公費代課',
    reason: '公假',
    status: 'approved',
    specialFlow: 'combined_return',
    '特殊流程': 'combined_return'
  }, extra || {});
}

function monthlyRow(record) {
  return DomainBilling.buildMonthlyReportRows({
    teachers: [{ email: 'keep@example.edu.tw', name: '鐘點師', baseHours: 0 }],
    allSchedules: [OVERTIME_SCHEDULE],
    substitutionRecords: [record],
    reportMonth: '2026-07',
    reportWeeksCount: 1
  })[0];
}

test('申請單鐘點規則：空白＝依假別扣，不扣鐘點＝keep', () => {
  assert.equal(FieldMap.mapRequest({ '申請單ID': 'r1', '鐘點規則': '' }).billingRule, 'reduce',
    '空白值必須維持現行的依假別扣');
  assert.equal(FieldMap.mapRequest({ '申請單ID': 'r2', '鐘點規則': '不扣鐘點' }).billingRule, 'keep');
  assert.equal(FieldMap.isRequestClockKept({ billingRule: 'keep' }), true);
  assert.equal(FieldMap.isRequestClockKept({ '鐘點規則': '不扣鐘點' }), true);
  assert.equal(FieldMap.isRequestClockKept({}), false, '沒有欄位的舊資料不可被當成不扣鐘點');
  assert.equal(FieldMap.isRequestClockKept({ '鐘點規則': '依假別扣鐘點' }), false);
  assert.equal(FieldMap.requestClockRuleSheetValue('keep'), '不扣鐘點');
  assert.equal(FieldMap.requestClockRuleSheetValue('reduce'), '');
});

test('併班選不扣鐘點：超鐘點不扣減、併班教師仍不支領', () => {
  const kept = monthlyRow(combinedRecord({ '鐘點規則': '不扣鐘點' }));
  assert.equal(kept.publicOvertimeUsed, 0, '不扣鐘點不可計入公費請假扣減');
  assert.equal(kept.schoolPublicPayout, 0, '併班不另付代課費');
  assert.equal(kept.selfPaidDeduction, 0);
  assert.equal(kept.actualOvertime, kept.scheduledOvertime, '超鐘點應照原節數計算');
  assert.equal(kept.pubSubCount, 0, '併班教師不支領公費代課費');
  assert.equal(kept.selfSubCount, 0, '併班教師不支領自費代課費');
});

test('併班未選不扣鐘點：維持現行依假別扣鐘點', () => {
  const deducted = monthlyRow(combinedRecord());
  assert.equal(deducted.publicOvertimeUsed, 1, '舊行為：公費請假仍扣被代教師超鐘點');
  assert.equal(deducted.actualOvertime, 0);
});

test('第8節併班選不扣鐘點：原任課教師鐘點照算', () => {
  const base = {
    reportMonth: '2026-07',
    allSchedules: [{
      teacherEmail: 'p8@example.edu.tw',
      teacherName: '八節師',
      dayOfWeek: 1,
      period: 8,
      className: '701',
      subject: '課輔',
      attr: '課輔'
    }],
    getTeacherNameByEmail: (email) => email,
    isSingleWeek: () => true
  };
  const makeRecord = (extra) => Object.assign({
    date: '2026-07-13',
    period: 8,
    className: '701',
    type: 'substitution',
    originalTeacherEmail: 'p8@example.edu.tw',
    originalTeacherName: '八節師',
    actualTeacherEmail: '',
    actualTeacherName: '',
    subFee: '第8節代課',
    status: 'approved',
    specialFlow: 'combined_return',
    '特殊流程': 'combined_return'
  }, extra || {});

  const kept = DomainBilling.buildPeriod8Payout(Object.assign({}, base, {
    substitutionRecords: [makeRecord({ '鐘點規則': '不扣鐘點' })]
  }));
  const keptDay = kept.details.find((row) => row.date === '2026-07-13');
  assert.ok(keptDay, '應產生 7/13 第8節明細');
  assert.equal(keptDay.source, 'own');
  assert.equal(keptDay.fee, DomainBilling.FEE_8TH, '不扣鐘點時原教師第8節鐘點照算');
  assert.equal(kept.byEmail['p8@example.edu.tw'].count >= 1, true);

  const deducted = DomainBilling.buildPeriod8Payout(Object.assign({}, base, {
    substitutionRecords: [makeRecord()]
  }));
  const deductedDay = deducted.details.find((row) => row.date === '2026-07-13');
  assert.ok(deductedDay);
  assert.equal(deductedDay.source, 'combined_return', '未選不扣鐘點時維持現行：合班不計代課費');
  assert.equal(deductedDay.fee, 0);
});

test('超鐘點表備註寫明併班不扣鐘點，且不再出現扣N節', () => {
  const period = { start: '2026-07-01', end: '2026-07-31' };
  const records = [combinedRecord({ '鐘點規則': '不扣鐘點' })];
  const data = ExportAccounting.buildExportData({
    reportMonth: '2026-07',
    reportWeeksCount: 1,
    periods: { overtime: period, adjunct: period },
    teachers: [{ email: 'keep@example.edu.tw', name: '鐘點師', baseHours: 0, expensePlan: '國教' }],
    allSchedules: [OVERTIME_SCHEDULE],
    substitutionRecords: records,
    monthlyReportRows: DomainBilling.buildMonthlyReportRows({
      teachers: [{ email: 'keep@example.edu.tw', name: '鐘點師', baseHours: 0 }],
      allSchedules: [OVERTIME_SCHEDULE],
      substitutionRecords: records,
      reportMonth: '2026-07',
      reportWeeksCount: 1
    })
  });
  const overtimeRows = (data.overtimePlans || [])
    .reduce((all, group) => all.concat(group.rows || []), []);
  const row = overtimeRows.find((item) => item.name === '鐘點師');
  assert.ok(row, '超鐘點表應保留該教師列');
  assert.equal(row.deduction, 0, '不扣鐘點時不得列出扣減節數');
  assert.equal(row.actualHours, row.grossHours, '實得節數應等於應得節數');
  assert.match(row.note, /併班不扣鐘點/, '備註要寫明原因，會計才看得懂');
  assert.doesNotMatch(row.note, /扣\d+節/, '不可再寫成扣鐘點');
});
