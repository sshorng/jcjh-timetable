import assert from 'node:assert/strict';
import { test } from 'vitest';
import { UiTimetable } from '../src/modules/ui-timetable.js';

const ref = (value) => ({ value });

function makeTimetable(rows) {
  return UiTimetable.create({
    computed: (getter) => ({ get value() { return getter(); } }),
    allSchedules: ref(rows),
    isMutualCover: ref(false),
    batchSelectMode: ref(false),
    isAdmin: ref(true),
    user: ref(null),
    showToast: () => {},
    canOperateOnTeacherEmail: () => false,
    getTeacherNameByEmail: () => ''
  });
}

test('同一位老師同一節被排兩班：被蓋掉的列要留下來當衝堂列', () => {
  const timetable = makeTimetable([
    { teacherEmail: 'a@x', dayOfWeek: 1, period: 1, className: '802', subject: '國文' },
    { teacherEmail: 'a@x', dayOfWeek: 1, period: 1, className: '805', subject: '數學' }
  ]);
  const primary = { className: '802', subject: '國文' };
  const conflicts = timetable.getSlotConflicts('a@x', '2026-11-17', 1, 1, primary);
  assert.equal(conflicts.length, 1, '另一筆課不能被吃掉');
  assert.equal(conflicts[0].className, '805');
  assert.equal(conflicts[0].subject, '數學');
});

test('單雙週輪替與空列不算衝堂', () => {
  const timetable = makeTimetable([
    { teacherEmail: 'a@x', dayOfWeek: 2, period: 3, className: '802', subject: '國文', attr: '單週' },
    { teacherEmail: 'a@x', dayOfWeek: 2, period: 3, className: '805', subject: '國文', attr: '雙週' },
    { teacherEmail: 'a@x', dayOfWeek: 2, period: 3, className: '', subject: '' }
  ]);
  assert.deepEqual(timetable.getSlotConflicts('a@x', '2026-11-18', 2, 3, null), []);
});

test('只有一筆課時不會誤報衝堂', () => {
  const timetable = makeTimetable([
    { teacherEmail: 'a@x', dayOfWeek: 3, period: 2, className: '802', subject: '國文' }
  ]);
  assert.deepEqual(timetable.getSlotConflicts('a@x', '2026-11-19', 3, 2, { className: '802', subject: '國文' }), []);
});
