import assert from 'node:assert/strict';
import { test } from 'vitest';
import FieldMap from '../src/domain/field-map.js';
import DomainClassAway from '../src/domain/domain-class-away.js';
import DomainActivityCover from '../src/domain/domain-activity-cover.js';

// 空堂「科目」條件契約：
// 事件可只停某一堂課（例：本土語-台語），課表只空該科；活動互代以「課堂」為單位，
// 併班（802、805、806）算一顆，且不影響整班、不進鐘點扣減。

const SEMESTER_END = '2027-01-20';

function courseEvent(extra) {
  return Object.assign({
    id: 'cae_test',
    name: '本土語停課',
    startDate: '2026-11-11',
    endDate: '2026-11-11',
    scope: 'classes',
    classes: ['802', '805', '806'],
    periods: ['3'],
    billingRule: 'keep',
    forMutual: true,
    enabled: true,
    subject: '',
    subjects: []
  }, extra || {});
}

const TAIYU_EVENT = courseEvent({ subject: '本土語-台語', subjects: ['本土語-台語'] });
const WHOLE_CLASS_EVENT = courseEvent({ subject: '', subjects: [] });

test('空堂事件科目欄：空白＝整班，有值＝只停該科', () => {
  const whole = FieldMap.mapClassAwayEvent({ '事件ID': 'a', '事件名稱': '畢旅', '科目': '' });
  assert.deepEqual(whole.subjects, [], '空白科目＝整班空堂');

  const scoped = FieldMap.mapClassAwayEvent({ '事件ID': 'b', '事件名稱': '本土語', '科目': '本土語-台語' });
  assert.equal(scoped.subject, '本土語-台語');
  assert.deepEqual(scoped.subjects, ['本土語-台語']);

  const multi = FieldMap.mapClassAwayEvent({ '事件ID': 'c', '科目': '本土語-台語、本土語-客語' });
  assert.deepEqual(multi.subjects, ['本土語-台語', '本土語-客語'], '多科目以「、」分隔');
});

test('課表空堂判定：只空科目命中的那一格', () => {
  const events = [TAIYU_EVENT];
  const cls = '802、805、806';
  assert.equal(
    DomainClassAway.isClassAwayOnDate(cls, '2026-11-11', events, SEMESTER_END, 3, '本土語-台語'),
    true, '台語那一格要空堂'
  );
  assert.equal(
    DomainClassAway.isClassAwayOnDate(cls, '2026-11-11', events, SEMESTER_END, 3, '本土語-客語'),
    false, '客語那一格不可被台語事件波及'
  );
  assert.equal(
    DomainClassAway.isClassAwayOnDate(cls, '2026-11-11', events, SEMESTER_END, 3, '國文'),
    false, '同班其他科目照常上課'
  );
  assert.equal(
    DomainClassAway.isClassAwayOnDate(cls, '2026-11-11', events, SEMESTER_END, 3),
    false, '沒帶科目＝班級層判定，科目型事件不算整班空堂'
  );
});

test('整班事件（無科目）行為不變', () => {
  const events = [WHOLE_CLASS_EVENT];
  const cls = '802、805、806';
  assert.equal(DomainClassAway.isClassAwayOnDate(cls, '2026-11-11', events, SEMESTER_END, 3), true);
  assert.equal(DomainClassAway.isClassAwayOnDate(cls, '2026-11-11', events, SEMESTER_END, 3, '國文'), true);
  assert.equal(DomainClassAway.isClassAwayOnDate(cls, '2026-11-11', events, SEMESTER_END, 4, '國文'), false);
});

test('科目包含語意：填本土語同時停客語與台語', () => {
  const events = [courseEvent({ subject: '本土語', subjects: ['本土語'] })];
  const cls = '802';
  assert.equal(DomainClassAway.isClassAwayOnDate(cls, '2026-11-11', events, SEMESTER_END, 3, '本土語-客語'), true);
  assert.equal(DomainClassAway.isClassAwayOnDate(cls, '2026-11-11', events, SEMESTER_END, 3, '本土語-台語'), true);
});

test('科目型事件不進整班清單、不進鐘點扣減，另以課堂清單帶出', () => {
  const events = [TAIYU_EVENT];
  assert.deepEqual(
    DomainClassAway.getActiveAwayClasses('2026-11-11', events, SEMESTER_END, 3, {}),
    [], '科目型事件不可列為整班空堂'
  );
  assert.deepEqual(
    DomainClassAway.getAwayClassesInRange('2026-11-11', '2026-11-11', events, SEMESTER_END, {}),
    [], '互代整班清單不列科目型事件'
  );
  const courses = DomainClassAway.getAwayCoursesInRange('2026-11-11', '2026-11-11', events, SEMESTER_END, {});
  assert.equal(courses.length, 1);
  assert.equal(courses[0].className, '802、805、806', '併班合成一顆');
  assert.equal(courses[0].subject, '本土語-台語');
  assert.deepEqual(courses[0].classes, ['802', '805', '806']);

  const deduction = DomainClassAway.computeReduceDeduction({
    teacherEmail: 'tw@example.edu.tw',
    allSchedules: [{
      teacherEmail: 'tw@example.edu.tw', dayOfWeek: 3, period: 3,
      className: '802、805、806', subject: '本土語-台語', attr: '一般'
    }],
    events: [courseEvent({ subject: '本土語-台語', subjects: ['本土語-台語'], billingRule: 'reduce' })],
    semesterEndDate: SEMESTER_END,
    reportMonth: '2026-11',
    reportWeeksCount: 1
  });
  assert.equal(deduction, 0, '科目型事件不可扣超鐘點');
});

test('互代外出單位：班級::科目 只命中該科', () => {
  const entry = DomainActivityCover.makeAwayEntry(['802', '805', '806'], '本土語-台語');
  assert.equal(entry, '802、805、806::本土語-台語');
  const parsed = DomainActivityCover.parseAwayEntry(entry);
  assert.deepEqual(parsed.classes, ['802', '805', '806']);
  assert.equal(parsed.subject, '本土語-台語');

  const list = [entry];
  assert.equal(
    DomainActivityCover.isCellAwayReleased({ className: '802、805、806', subject: '本土語-台語' }, list),
    true
  );
  assert.equal(
    DomainActivityCover.isCellAwayReleased({ className: '802、805、806', subject: '本土語-客語' }, list),
    false, '客語不可跟著外出'
  );
  assert.equal(
    DomainActivityCover.isCellAwayReleased({ className: '802', subject: '國文' }, list),
    false, '同班其他科目不可外出'
  );
  assert.equal(
    DomainActivityCover.isCellAwayReleased({ className: '802', subject: '國文' }, ['802']),
    true, '整班項目行為不變'
  );
});

test('互代 chip 切換保留課堂項目', () => {
  const entry = DomainActivityCover.makeAwayEntry(['802', '805', '806'], '本土語-台語');
  const afterAdd = DomainActivityCover.toggleAwayClass([], entry);
  assert.deepEqual(afterAdd, [entry]);
  const afterGrade = DomainActivityCover.toggleAwayGrade(['801', '802'], afterAdd, '8');
  assert.ok(afterGrade.indexOf(entry) >= 0, '年級快捷不可清掉課堂項目');
  assert.ok(afterGrade.indexOf('802') >= 0, '年級快捷照舊加入班級');
  const afterRemove = DomainActivityCover.toggleAwayClass(afterGrade, entry);
  assert.equal(afterRemove.indexOf(entry), -1);
  assert.ok(afterRemove.indexOf('802') >= 0, '移除課堂不可誤刪整班');
});

test('互代統計：同一堂三班只算一次', () => {
  const entry = DomainActivityCover.makeAwayEntry(['802', '805', '806'], '本土語-台語');
  const stats = DomainActivityCover.buildStats({
    active: true,
    awayClasses: [entry],
    startDate: '2026-11-11',
    endDate: '2026-11-11',
    periods: ['3'],
    allSchedules: [
      { teacherEmail: 'tw@example.edu.tw', dayOfWeek: 3, period: 3, className: '802、805、806', subject: '本土語-台語' }
    ]
  });
  assert.equal(stats.awayClasses, 3, '涉及 3 個班級');
  assert.equal(stats.releasedSlots, 1, '同一堂不可因三班重複計算');
});
