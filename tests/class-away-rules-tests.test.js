import assert from 'node:assert/strict';
import { test } from 'vitest';
import FieldMap from '../src/domain/field-map.js';
import DomainClassAway from '../src/domain/domain-class-away.js';

// 空堂事件「多規則（聯集）」契約：
// 一個事件可含多條規則，任一規則命中即空堂；每條規則自帶範圍、科目、節次、鐘點。
// 沒有 `規則清單` 的舊事件＝單一規則，行為與改版前相同。

const SEMESTER_END = '2027-01-20';
const DATE = '2026-11-11';

const RULES = [
  { scope: 'all', classes: [], subjects: [], periods: ['8'], billingRule: 'keep' },
  { scope: 'classes', classes: ['9英A', '8英B'], subjects: [], periods: ['all'], billingRule: 'keep' },
  { scope: 'classes', classes: ['701', '801'], subjects: ['本土語-客語', '本土語-手語'], periods: ['all'], billingRule: 'keep' }
];

function unionEvent(extra) {
  return Object.assign({
    id: 'cae_union',
    name: '停課組合',
    startDate: DATE,
    endDate: DATE,
    scope: 'all',
    classes: [],
    periods: ['8'],
    enabled: true,
    forMutual: true,
    billingRule: 'keep',
    '規則清單': JSON.stringify(RULES)
  }, extra || {});
}

test('規則清單：解析成正規化規則，空白＝單一舊規則', () => {
  const ev = FieldMap.mapClassAwayEvent(unionEvent());
  assert.equal(ev.rules.length, 3);
  assert.equal(ev.rules[0].scope, 'all');
  assert.deepEqual(ev.rules[0].periods, ['8']);
  assert.deepEqual(ev.rules[1].classes, ['9英A', '8英B']);
  assert.deepEqual(ev.rules[2].subjects, ['本土語-客語', '本土語-手語']);

  const legacy = FieldMap.mapClassAwayEvent({
    '事件ID': 'cae_legacy', '事件名稱': '畢旅', '班級清單': '901,902', '停課節次': '全部節次'
  });
  assert.deepEqual(legacy.rules, [], '舊事件沒有規則清單');
  const rules = DomainClassAway.eventRuleList(legacy);
  assert.equal(rules.length, 1, '舊事件合成單一規則');
  assert.deepEqual(rules[0].classes, ['901', '902']);
});

test('聯集判定：三條規則各自命中，互不干擾', () => {
  const events = [unionEvent()];
  // 規則1：全校第8節
  assert.equal(DomainClassAway.isClassAwayOnDate('706', DATE, events, SEMESTER_END, 8), true);
  assert.equal(DomainClassAway.isClassAwayOnDate('706', DATE, events, SEMESTER_END, 5), false);
  // 規則2：英資班全部節次
  assert.equal(DomainClassAway.isClassAwayOnDate('9英A', DATE, events, SEMESTER_END, 5), true);
  assert.equal(DomainClassAway.isClassAwayOnDate('706', DATE, events, SEMESTER_END, 5), false);
  // 規則3：本土語科目條件
  assert.equal(DomainClassAway.isClassAwayOnDate('701', DATE, events, SEMESTER_END, 3, '本土語-客語'), true);
  assert.equal(DomainClassAway.isClassAwayOnDate('701', DATE, events, SEMESTER_END, 3, '本土語-手語'), true);
  assert.equal(DomainClassAway.isClassAwayOnDate('701', DATE, events, SEMESTER_END, 3, '國文'), false);
  assert.equal(DomainClassAway.isClassAwayOnDate('801', DATE, events, SEMESTER_END, 3, '本土語-台語'), false);
});

test('聯集帶入互代：整班清單與課堂清單分开取', () => {
  const events = [unionEvent()];
  const allClasses = ['701', '706', '801', '9英A', '8英B'];
  const classes = DomainClassAway.getAwayClassesInRange(DATE, DATE, events, SEMESTER_END, { allClasses: allClasses });
  assert.deepEqual(classes, ['706', '701', '801', '9英A', '8英B'].sort(),
    '規則1（全校）＋規則2（英資班）都要列整班，科目型規則不列');
  assert.equal(classes.indexOf('706'), classes.indexOf('706'));

  const courses = DomainClassAway.getAwayCoursesInRange(DATE, DATE, events, SEMESTER_END, { allClasses: allClasses });
  assert.equal(courses.length, 2, '兩條科目條件各一顆課堂');
  assert.deepEqual(courses.map((c) => c.subject).sort(), ['本土語-手語', '本土語-客語'].sort());
  assert.deepEqual(courses[0].classes, ['701', '801']);
});

test('規則鐘點：只有 reduce 且非科目型規則才扣', () => {
  const ev = unionEvent({
    startDate: '2026-11-09',
    endDate: '2026-11-13',
    '規則清單': JSON.stringify([
      { scope: 'all', classes: [], subjects: [], periods: ['8'], billingRule: 'reduce' },
      { scope: 'classes', classes: ['701'], subjects: [], periods: ['5'], billingRule: 'reduce' },
      { scope: 'classes', classes: ['801'], subjects: ['本土語-客語'], periods: ['6'], billingRule: 'reduce' }
    ])
  });
  const deduction = DomainClassAway.computeReduceDeduction({
    teacherEmail: 't@example.edu.tw',
    allSchedules: [
      { teacherEmail: 't@example.edu.tw', dayOfWeek: 3, period: 8, className: '706', subject: '國文', attr: '一般' },
      { teacherEmail: 't@example.edu.tw', dayOfWeek: 3, period: 5, className: '701', subject: '國文', attr: '一般' },
      { teacherEmail: 't@example.edu.tw', dayOfWeek: 3, period: 6, className: '801', subject: '本土語-客語', attr: '一般' }
    ],
    events: [ev],
    semesterEndDate: SEMESTER_END,
    reportMonth: '2026-11',
    reportWeeksCount: 2
  });
  assert.equal(deduction, 1, '只算第5節那條（第8節不在小鐘點口徑、科目型不扣）');
});
