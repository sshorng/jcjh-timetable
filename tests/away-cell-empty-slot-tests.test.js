import assert from 'node:assert/strict';
import { test } from 'vitest';
import { UiTimetable } from '../src/modules/ui-timetable.js';

const ref = (value) => ({ value });

function makeTimetable(cell) {
  return UiTimetable.create({
    computed: (getter) => ({ get value() { return getter(); } }),
    getScheduleForDate: () => cell,
    isMutualCover: ref(false),
    batchSelectMode: ref(false),
    isAdmin: ref(true),
    user: ref(null),
    allSchedules: ref([]),
    showToast: () => {},
    canOperateOnTeacherEmail: () => false,
    getTeacherNameByEmail: () => ''
  });
}

test('空堂事件格子：教學組點格直接開空堂排班', () => {
  const cell = { className: '802', subject: '本土語-台語', isClassAway: true };
  const timetable = makeTimetable(cell);
  const opened = [];
  const toasts = [];
  const clickDeps = {
    isScheduleEditMode: ref(false),
    isMutualCover: ref(false),
    isAdmin: ref(true),
    user: ref(null),
    openEmptySlotAssign: (...args) => opened.push(args),
    showToast: (message) => toasts.push(message)
  };
  timetable.handleCellClick(clickDeps, 'tea@x', 3, 3, '2026-11-20');
  assert.equal(opened.length, 1, '教學組點空堂事件格應開空堂排班');
  assert.equal(opened[0][0], 'tea@x');
  assert.equal(opened[0][2], 3);
  assert.equal(opened[0][3], '2026-11-20');
  assert.equal(opened[0][4], cell, '要把格子帶進空堂排班，才知道原班科');
  assert.deepEqual(toasts, []);
});

test('空堂事件格子：非教學組仍只看到提示、不開排班', () => {
  const cell = { className: '802', subject: '本土語-台語', isClassAway: true };
  const timetable = makeTimetable(cell);
  const opened = [];
  const toasts = [];
  const clickDeps = {
    isScheduleEditMode: ref(false),
    isMutualCover: ref(false),
    isAdmin: ref(false),
    user: ref(null),
    openEmptySlotAssign: (...args) => opened.push(args),
    showToast: (message) => toasts.push(message),
    canOperateOnTeacherEmail: () => false
  };
  timetable.handleCellClick(clickDeps, 'tea@x', 3, 3, '2026-11-20');
  assert.equal(opened.length, 0);
  assert.equal(toasts.length, 1);
  assert.match(toasts[0], /空堂事件/);
});
