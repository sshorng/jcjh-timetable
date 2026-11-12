import assert from 'node:assert/strict';
import { test } from 'vitest';
import FieldMap from '../src/domain/field-map.js';
import ExportAccounting from '../src/modules/export-accounting.js';

/**
 * 代課費專案款項分表（RDQ-spec-substitute-project-fund-20261112）
 * - 申請單「代課費來源」空白＝公付，輸出必須與改版前逐筆相同。
 * - 有值＝該筆代課費從公付代課表移到「公付代課-〈專案名〉」專屬工作表。
 * - 超鐘點／請假扣減完全不受影響（domain-billing 未動）。
 */
const period = { start: '2026-07-01', end: '2026-07-31' };

function buildOptions(records) {
  return {
    reportMonth: '2026-07',
    reportWeeksCount: 1,
    periods: {
      overtime: period,
      adjunct: period,
      publicSub: period,
      selfSub: period,
      mentor: period
    },
    teachers: [
      { email: 'a@x', name: 'Alpha', baseHours: 16 },
      { email: 'b@x', name: 'Beta', baseHours: 16 },
      { email: 'c@x', name: 'Gamma', baseHours: 16 }
    ],
    allSchedules: [],
    substitutionRecords: records
  };
}

function record(overrides) {
  return Object.assign({
    date: '2026-07-02',
    period: 1,
    className: '701',
    type: 'substitution',
    originalTeacherEmail: 'origin@x',
    originalTeacherName: 'Origin',
    actualTeacherEmail: 'a@x',
    actualTeacherName: 'Alpha',
    subFee: '公費代課',
    reason: '事假',
    status: 'approved'
  }, overrides || {});
}

function buildExport(records) {
  return ExportAccounting.buildExportData(buildOptions(records));
}

test('requestSubsidySource：空白、缺欄與前後空白都收斂成空字串，有值則 trim', () => {
  assert.equal(FieldMap.requestSubsidySource({}), '', '缺欄視為公付（空字串）');
  assert.equal(FieldMap.requestSubsidySource(null), '', '空紀錄視為公付');
  assert.equal(FieldMap.requestSubsidySource({ '代課費來源': '' }), '', '空白視為公付');
  assert.equal(FieldMap.requestSubsidySource({ '代課費來源': '   ' }), '', '全空白視為公付');
  assert.equal(FieldMap.requestSubsidySource({ '代課費來源': '  深耕計畫  ' }), '深耕計畫', '專案名稱去頭尾空白');
  assert.equal(FieldMap.requestSubsidySource({ subsidySource: '雙語計畫' }), '雙語計畫', '支援前端 camelCase 別名');
  assert.equal(FieldMap.requestSubsidySourceSheetValue(' 深耕計畫 '), '深耕計畫', '寫回 Sheets 前 trim');
  assert.equal(FieldMap.requestSubsidySourceSheetValue(null), '', '未指定時寫回空白（＝公付）');
  assert.equal(FieldMap.requestSubsidySourceSheetValue(undefined), '', 'undefined 寫回空白');
});

test('指定專案的節數從公付代課表移除，改列專案分表', () => {
  const data = buildExport([
    record({ date: '2026-07-02', actualTeacherEmail: 'a@x', actualTeacherName: 'Alpha', '代課費來源': ' 深耕計畫 ' })
  ]);
  assert.equal(data.sheets.publicSub.length, 0, '已指定專案的節數不可留在公付代課表');
  assert.equal(data.publicSubPlans.length, 1, '應建立一個專案分表資料');
  assert.equal(data.publicSubPlans[0].plan, '深耕計畫', '專案名稱去空白後作為分表名稱');
  assert.equal(data.publicSubPlans[0].rows.length, 1, '專案分表應有一筆教師列');
  assert.equal(data.publicSubPlans[0].rows[0].name, 'Alpha', '專案分表列出實際授課教師');
  assert.equal(data.publicSubPlans[0].rows[0].hours, 1, '專案分表節數正確');
  assert.equal(data.publicSubPlans[0].rows[0].amount, data.publicSubPlans[0].rows[0].hours * data.publicSubPlans[0].rows[0].rate,
    '專案分表金額＝節數×鐘點費');
  const summary = data.summary.find((item) => item.key === 'publicSub:深耕計畫');
  assert.ok(summary, '匯出摘要需列出專案表');
  assert.equal(summary.label, '公付代課-深耕計畫', '專案表摘要標籤');
  assert.equal(summary.count, 1, '專案表摘要筆數');
});

test('代課費來源空白的紀錄：公付代課表輸出與改版前逐筆相同（不被專案紀錄污染）', () => {
  const legacyRecords = [
    record({ date: '2026-07-02', period: 1, actualTeacherEmail: 'a@x', actualTeacherName: 'Alpha' }),
    record({ date: '2026-07-03', period: 2, actualTeacherEmail: 'b@x', actualTeacherName: 'Beta' })
  ];
  const withProjects = legacyRecords.concat([
    record({ date: '2026-07-06', period: 3, actualTeacherEmail: 'a@x', actualTeacherName: 'Alpha', '代課費來源': '深耕計畫' }),
    record({ date: '2026-07-07', period: 4, actualTeacherEmail: 'c@x', actualTeacherName: 'Gamma', '代課費來源': '雙語計畫' })
  ]);
  const before = buildExport(legacyRecords);
  const after = buildExport(withProjects);
  assert.deepEqual(after.sheets.publicSub, before.sheets.publicSub,
    '舊資料（無代課費來源欄）的公付代課表必須與改版前逐筆相同');
  assert.equal(after.sheets.publicSub.length, 2, '公付代課表只保留空白來源的兩筆教師列');
  assert.equal(after.publicSubPlans.length, 2, '兩個專案各一張分表');
  assert.equal(before.publicSubPlans.length, 0, '沒有指定專案時不產生專案分表');
});

test('同月兩個專案：各自一張專案表，筆數與節數正確', () => {
  const data = buildExport([
    record({ date: '2026-07-02', period: 1, actualTeacherEmail: 'a@x', actualTeacherName: 'Alpha', '代課費來源': '深耕計畫' }),
    record({ date: '2026-07-03', period: 2, actualTeacherEmail: 'a@x', actualTeacherName: 'Alpha', '代課費來源': '深耕計畫' }),
    record({ date: '2026-07-06', period: 3, actualTeacherEmail: 'b@x', actualTeacherName: 'Beta', '代課費來源': '雙語計畫' }),
    record({ date: '2026-07-07', period: 4, actualTeacherEmail: 'c@x', actualTeacherName: 'Gamma' })
  ]);
  assert.deepEqual(data.publicSubPlans.map((group) => group.plan), ['深耕計畫', '雙語計畫'].sort((a, b) => a.localeCompare(b, 'zh-Hant', { numeric: true })),
    '專案表依名稱排序');
  const deep = data.publicSubPlans.find((group) => group.plan === '深耕計畫');
  const bilingual = data.publicSubPlans.find((group) => group.plan === '雙語計畫');
  assert.equal(deep.rows.length, 1, '深耕計畫分表只有一位教師');
  assert.equal(deep.rows[0].hours, 2, '深耕計畫兩節合併為同一列');
  assert.equal(bilingual.rows.length, 1, '雙語計畫分表一位教師');
  assert.equal(bilingual.rows[0].hours, 1, '雙語計畫一節');
  assert.equal(data.sheets.publicSub.length, 1, '空白來源仍留在公付代課表');
  assert.equal(data.sheets.publicSub[0].name, 'Gamma', '公付代課表只剩空白來源教師');
  const totalPlannedHours = data.publicSubPlans.reduce((sum, group) => sum + group.rows.reduce((s, row) => s + row.hours, 0), 0);
  assert.equal(totalPlannedHours, 3, '兩張專案表節數合計正確');
});

test('公付代課-身心調適假比照分表，且不影響一般公付代課表', () => {
  const data = buildExport([
    record({ date: '2026-07-02', period: 1, actualTeacherEmail: 'a@x', actualTeacherName: 'Alpha', reason: '身心調適假', '代課費來源': '安心計畫' }),
    record({ date: '2026-07-03', period: 2, actualTeacherEmail: 'b@x', actualTeacherName: 'Beta', reason: '事假', '代課費來源': '安心計畫' })
  ]);
  assert.equal(data.sheets.publicSubAdjustment.length, 0, '身心調適假專案的節數不留在原表');
  assert.equal(data.publicSubAdjustmentPlans.length, 1, '身心調適假應建立專案分表');
  assert.equal(data.publicSubAdjustmentPlans[0].plan, '安心計畫');
  assert.equal(data.publicSubAdjustmentPlans[0].rows[0].name, 'Alpha');
  assert.equal(data.publicSubAdjustmentPlans[0].rows[0].hours, 1);
  assert.equal(data.publicSubPlans.length, 1, '一般代課仍歸一般專案分表');
  assert.equal(data.publicSubPlans[0].rows[0].name, 'Beta');
  const summary = data.summary.find((item) => item.key === 'publicSubAdjustment:安心計畫');
  assert.ok(summary, '摘要需列出身心調適假專案表');
  assert.equal(summary.label, '公付代課-身心調適假-安心計畫');
});

test('專案表的標題與頁籤名稱只在有專案時加上專案名稱', () => {
  const publicSub = {
    key: 'publicSub',
    label: '公付代課',
    suffix: '公付代課',
    titleSuffix: '公付代課鐘點費印領清冊'
  };
  const adjustment = {
    key: 'publicSubAdjustment',
    label: '公付代課-身心調適假',
    suffix: '公付代課-身心調適假',
    titleSuffix: '公付代課-身心調適假鐘點費印領清冊'
  };
  const publicSubTemplateTitle = '臺北市立建成國中[[年]]年[[月]]月([[日期]])公付代課鐘點費印領清冊';
  assert.equal(
    ExportAccounting.titleFor(publicSub, '2026-07', period, null),
    '臺北市立建成國中115年7月（7/1~7/31）公付代課鐘點費印領清冊',
    '無專案時標題維持原樣'
  );
  assert.equal(
    ExportAccounting.titleFor(publicSub, '2026-07', period, null),
    ExportAccounting.titleFromTemplate(publicSubTemplateTitle, '2026-07', period, null),
    '無專案的公付代課標題必須與範本標題完全相同（舊輸出零變化）'
  );
  assert.equal(
    ExportAccounting.titleFor(publicSub, '2026-07', period, null, '深耕計畫'),
    '臺北市立建成國中115年7月（7/1~7/31）公付代課鐘點費（深耕計畫）印領清冊',
    '專案表標題帶入專案名稱'
  );
  assert.equal(
    ExportAccounting.titleFor(adjustment, '2026-07', period, null, '安心計畫'),
    '臺北市立建成國民中學115年7月（7/1~7/31）公付代課-身心調適假鐘點費（安心計畫）印領清冊',
    '身心調適假專案表標題沿用原校名寫法'
  );
});

test('代課費來源指定專案時，經費徽章顯示「計畫」而非「公費」', async () => {
  const { UiLineTemplate } = await import('../src/modules/ui-line-template.js');
  const tagsOf = (req) => UiLineTemplate.getRequestTypeTags(req).map((tag) => tag.label);

  assert.deepEqual(
    tagsOf({ type: 'substitution', subFee: '公費代課', subsidySource: '深耕計畫' }),
    ['計畫'],
    '指定專案＝計畫經費'
  );
  assert.deepEqual(
    tagsOf({ type: 'substitution', subFee: '公費代課' }),
    ['公費'],
    '未指定專案維持公費'
  );
  assert.deepEqual(
    tagsOf({ type: 'substitution', subFee: '公費代課', '代課費來源': '  雙語計畫  ' }),
    ['計畫'],
    'Sheets 原欄名與前後空白都要認得'
  );
  assert.deepEqual(
    tagsOf({ type: 'substitution', subFee: '自費代課', subsidySource: '深耕計畫' }),
    [],
    '自費代課不會因為填了專案就變成計畫'
  );
});
