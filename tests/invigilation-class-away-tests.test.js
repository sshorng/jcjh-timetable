import assert from 'node:assert/strict';
import { test } from 'vitest';
import { ExportInvigilation } from '../src/modules/export-invigilation-recovered.js';

// 監考表讀空堂契約：
// 1. 班級在該節是空堂（整班停課，或該班該節每門課都被單科空堂停掉）→ 不必監考，
//    不列入「缺少」；停課課程的老師也不列入「重複」。
// 2. 只要該班該節還有一門課照常上課（例：本土語只停台語、客語照上）→ 仍要監考。
// 3. 沒有帶 awayEvents 時行為與改版前完全相同。

const D = '2026-12-02';
const SEM = '2027-01-20';
const dow = new Date(D + 'T00:00:00');
const DOW_MON1 = dow.getDay() === 0 ? 7 : dow.getDay();

function baseRow(email, className, subject, period) {
  return {
    teacherEmail: email,
    dayOfWeek: DOW_MON1,
    period: period || 2,
    className: className,
    subject: subject,
    attr: '一般'
  };
}

function awayEvent(extra) {
  return Object.assign({
    id: 'cae_exam',
    name: '本土語停課',
    startDate: D,
    endDate: D,
    scope: 'classes',
    classes: ['802'],
    subjects: ['本土語-台語', '本土語-客語'],
    periods: ['2'],
    billingRule: 'keep',
    enabled: true
  }, extra || {});
}

function teacher(name, text) {
  return { name: name, email: name + '@school', slots: [{ text: text, changed: false }] };
}

const SPEC = [{ date: D, period: 2 }];
const BASE = [
  baseRow('tw@school', '802', '本土語-台語'),
  baseRow('hk@school', '802', '本土語-客語'),
  baseRow('cn@school', '701', '國文')
];

test('單科空堂：該班該節每門課都停 → 不必監考，不列缺少', () => {
  const coverage = ExportInvigilation.validateClassCoverage(
    { left: [teacher('甲', '701')], right: [] },
    SPEC, [], BASE,
    { awayEvents: [awayEvent()], semesterEndDate: SEM }
  );
  assert.equal(coverage.ok, true, '802 兩門課都停，不應要求監考');
  assert.deepEqual(coverage.missing, []);
  assert.equal(coverage.awaySkipped.length, 1);
  assert.deepEqual(coverage.awaySkipped[0].classNames, ['802']);
});

test('單科空堂：只停台語，802 客語照上 → 仍要監考', () => {
  const coverage = ExportInvigilation.validateClassCoverage(
    { left: [teacher('甲', '701')], right: [] },
    SPEC, [], BASE,
    { awayEvents: [awayEvent({ subjects: ['本土語-台語'] })], semesterEndDate: SEM }
  );
  assert.equal(coverage.ok, false, '客語照上，802 仍需要一位監考');
  assert.ok(coverage.missing[0].classNames.includes('802'));
  assert.deepEqual(coverage.awaySkipped, []);
});

test('整班空堂（事件未指定科目）→ 不必監考', () => {
  const coverage = ExportInvigilation.validateClassCoverage(
    { left: [teacher('甲', '701')], right: [] },
    SPEC, [], BASE,
    { awayEvents: [awayEvent({ subjects: [] })], semesterEndDate: SEM }
  );
  assert.equal(coverage.ok, true);
  assert.deepEqual(coverage.awaySkipped[0].classNames, ['802']);
});

test('未帶 awayEvents 時維持舊行為（802 列為缺少）', () => {
  const coverage = ExportInvigilation.validateClassCoverage(
    { left: [teacher('甲', '701')], right: [] },
    SPEC, [], BASE
  );
  assert.equal(coverage.ok, false);
  assert.ok(coverage.missing[0].classNames.includes('802'));
  assert.deepEqual(coverage.awaySkipped, []);
});

test('監考表：空堂科目的課不列為監考勤務，未空堂科目照列', () => {
  const spec = ExportInvigilation.buildPeriodSpec([D, D]);
  const awayOpts = { awayEvents: [awayEvent()], semesterEndDate: SEM };
  const teachers = [{ name: '台語師', email: 'tw@school', subject: '本土語' }];

  const awayCell = (email, dateStr, period) => (
    dateStr === D && parseInt(period, 10) === 2
      ? { className: '802', subject: '本土語-台語', teacherEmail: 'tw@school' }
      : null
  );
  const keepCell = (email, dateStr, period) => (
    dateStr === D && parseInt(period, 10) === 2
      ? { className: '802', subject: '國文', teacherEmail: 'tw@school' }
      : null
  );

  const awayMatrix = ExportInvigilation.buildTeacherMatrix(
    teachers, spec, awayCell, 38, null, [], awayOpts
  );
  assert.equal(awayMatrix.left[0].slots[1].text, '', '停課的同仁不寫入監考格');

  const keepMatrix = ExportInvigilation.buildTeacherMatrix(
    teachers, spec, keepCell, 38, null, [], awayOpts
  );
  assert.equal(keepMatrix.left[0].slots[1].text, '802', '照常上課的科目仍要監考');

  const legacyMatrix = ExportInvigilation.buildTeacherMatrix(
    teachers, spec, awayCell, 38, null, []
  );
  assert.equal(legacyMatrix.left[0].slots[1].text, '802', '沒帶空堂事件時行為不變');
});

test('匯出提示說明略過幾個班級節次', () => {
  const coverage = ExportInvigilation.validateClassCoverage(
    { left: [teacher('甲', '701')], right: [] },
    SPEC, [], BASE,
    { awayEvents: [awayEvent()], semesterEndDate: SEM }
  );
  const note = ExportInvigilation.coverageAwayNote(coverage);
  assert.match(note, /略過 1 個班級節次/);
  assert.equal(ExportInvigilation.coverageAwayNote({ awaySkipped: [] }), '');
});
