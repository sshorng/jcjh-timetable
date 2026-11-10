import assert from 'node:assert/strict';
import { test } from 'vitest';
import { UiTimetable } from '../src/modules/ui-timetable.js';
import DomainClassAway from '../src/domain/domain-class-away.js';

// 班級課表讀單科空堂契約：
// 1. 事件只停「本土語-台語」時，802 該節只有台語那堂空堂，客語照常上課 → 整格仍算上課。
// 2. 同班該節每一堂課都停（或事件是整班空堂）→ 整格算空堂。
// 3. 空堂標籤與事件名稱要依科目判定，不可把整班每一堂都貼上同一個事件名稱。

const D = '2026-12-02';
const SEM = '2027-01-20';

function ref(value) { return { value }; }

function eventOf(extra) {
  return Object.assign({
    id: 'cae_1',
    name: '本土語停課',
    startDate: D,
    endDate: D,
    scope: 'classes',
    classes: ['802'],
    subjects: ['本土語-台語'],
    periods: ['3'],
    billingRule: 'keep',
    enabled: true
  }, extra || {});
}

function makeDeps(events) {
  const isClassAwayOnDate = (className, dateStr, period, subject) => DomainClassAway.isClassAwayOnDate(
    className, dateStr, events, SEM, period, subject
  );
  return {
    classSchedules: ref({
      '802': {
        '3-3': [
          { id: 'a_ty', teacherEmail: 'tw@school', teacherName: '台語師', subject: '本土語-台語', className: '802' },
          { id: 'a_hk', teacherEmail: 'hk@school', teacherName: '客語師', subject: '本土語-客語', className: '802' }
        ],
        '3-4': [
          { id: 'b_cn', teacherEmail: 'cn@school', teacherName: '國文師', subject: '國文', className: '802' }
        ]
      }
    }),
    selectedClassWeekDates: ref(['2026-11-30', '2026-12-01', D, '2026-12-03', '2026-12-04']),
    classSubstitutionMap: ref({}),
    isClassAwayOnDate: isClassAwayOnDate
  };
}

function makeTimetable(events) {
  return UiTimetable.create({
    computed: getter => ({ get value() { return getter(); } }),
    getTodayString: () => D,
    getClassAwayEventsForView: () => events,
    semesterEndDate: ref(SEM)
  });
}

test('只停台語：客語照上，整格仍算上課', () => {
  const events = [eventOf()];
  const timetable = makeTimetable(events);
  const deps = makeDeps(events);
  assert.equal(
    timetable.getClassCellClassForClass(deps, '802', 3, 3),
    'has-class',
    '只停台語不可把 802 整格判成空堂'
  );
  assert.equal(timetable.getClassCellClassForClass(deps, '802', 3, 4), 'has-class', '未命中的節次不空堂');
});

test('同班該節每門課都停 → 整格空堂', () => {
  const events = [eventOf({ subjects: ['本土語-台語', '本土語-客語'] })];
  const timetable = makeTimetable(events);
  const deps = makeDeps(events);
  assert.equal(timetable.getClassCellClassForClass(deps, '802', 3, 3), 'is-away-class');
});

test('整班空堂事件 → 整格空堂', () => {
  const events = [eventOf({ subjects: [] })];
  const timetable = makeTimetable(events);
  const deps = makeDeps(events);
  assert.equal(timetable.getClassCellClassForClass(deps, '802', 3, 3), 'is-away-class');
});

test('空堂事件名稱依科目判定', () => {
  const events = [eventOf()];
  const timetable = makeTimetable(events);
  assert.equal(timetable.getClassAwayEventName('802', D, 3, '本土語-台語'), '本土語停課');
  assert.equal(timetable.getClassAwayEventName('802', D, 3, '本土語-客語'), '', '客語不該掛台語的停課標籤');
  assert.equal(timetable.getClassAwayEventName('802', D, 4, '國文'), '', '不同節次不該命中');
});

test('整班空堂事件名稱不分科目', () => {
  const events = [eventOf({ subjects: [] })];
  const timetable = makeTimetable(events);
  assert.equal(timetable.getClassAwayEventName('802', D, 3, '國文'), '本土語停課');
  assert.equal(timetable.getClassAwayEventName('802', D, 3), '本土語停課');
});
