#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const context = {
  window: {
    DateUtils: {
      getTimetablePeriods() { return [1, 2, 3]; },
      formatPeriodText(period) { return '第' + period + '節'; }
    }
  },
  console,
  Array,
  Date,
  JSON,
  Math,
  Number,
  Object,
  RegExp,
  Set,
  String,
  isNaN,
  parseInt
};
vm.createContext(context);
['domain-school-swap.js', 'domain-schedule.js', 'ui-timetable.js'].forEach(function (file) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
});

const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const classSwapHelperStart = appSource.indexOf('const buildClassSchoolSwapChanges =');
const classSwapHelperEnd = appSource.indexOf('const classChangeSummary =', classSwapHelperStart);
assert.ok(classSwapHelperStart >= 0 && classSwapHelperEnd > classSwapHelperStart, 'class school swap summary helper must remain discoverable');
const classSwapContext = {
  window: {
    DomainSchoolSwap: context.window.DomainSchoolSwap,
    DateUtils: {
      parseCombinedClasses(raw) {
        return String(raw || '').split(/[、,，/／|｜\s]+/).filter(Boolean);
      }
    }
  },
  String,
  Array,
  Set,
  parseInt
};
vm.createContext(classSwapContext);
const buildClassSchoolSwapChanges = vm.runInContext(`(() => {
  ${appSource.slice(classSwapHelperStart, classSwapHelperEnd)}
  return buildClassSchoolSwapChanges;
})()`, classSwapContext);

function ref(value) {
  return { value };
}

function computed(fn) {
  return { value: fn() };
}

const allSchedules = ref([
  { teacherEmail: 'teacher@example.edu.tw', dayOfWeek: 2, period: 3, className: '702', subject: '數學', attr: '一般' }
]);
const schoolSwaps = ref([{
  id: 'swap-1', name: '校慶補課', dateA: '2026-08-17', dayA: 1, periodA: 2,
  dateB: '2026-08-18', dayB: 2, periodB: 3, enabled: true
}]);

const api = context.window.UiTimetable.create({
  computed,
  allSchedules,
  schoolSwaps,
  substitutionRecords: ref([]),
  substitutionsLookup: ref({}),
  allPendingRequests: ref([]),
  displayTimetableTeachers: ref([]),
  currentWeekDates: ref([]),
  getTeacherNameByEmail() { return '測試教師'; },
  getTeacherSubjectByEmail() { return '數學'; },
  formatDateMMDD(date) { return date; },
  isSingleWeek() { return true; },
  isClassAwayOnDate() { return false; },
  getWeekDayText(day) { return String(day); },
  batchSelectMode: ref(false),
  isBatchSlotSelected() { return false; },
  isMutualCover: ref(false),
  getMutualDraftAt() { return null; },
  mutualDrafts: ref([]),
  mutualAwayClasses: ref([]),
  mutualActivityStart: ref(''),
  mutualActivityEnd: ref(''),
  DAC: function () { return null; }
});

const swapped = api.getScheduleForDate('teacher@example.edu.tw', '2026-08-17', 2, 1);
assert.equal(swapped.className, '702');
assert.equal(swapped.subject, '數學');
assert.equal(swapped.schoolSwapEndpoint, 'A');
api.clearScheduleCache();

const patrolSchedules = [
  { teacherEmail: 'patrol@example.edu.tw', dayOfWeek: 1, period: 2, attr: '巡堂' },
  { teacherEmail: 'patrol@example.edu.tw', dayOfWeek: 2, period: 3, className: '702', subject: '數學', attr: '一般' }
];
const swapIndex = context.window.DomainSchoolSwap.buildIndex(schoolSwaps.value);
const patrolScheduleIndex = context.window.DomainSchedule.buildScheduleIndex(patrolSchedules);
const patrolAtA = context.window.DomainSchoolSwap.resolveSlotForTeacher(
  swapIndex, '2026-08-17', 1, 2, 'patrol@example.edu.tw', patrolScheduleIndex, patrolSchedules
);
const patrolAtB = context.window.DomainSchoolSwap.resolveSlotForTeacher(
  swapIndex, '2026-08-18', 2, 3, 'patrol@example.edu.tw', patrolScheduleIndex, patrolSchedules
);
assert.equal(patrolAtA.dayOfWeek, 1);
assert.equal(patrolAtA.period, 2);
assert.equal(patrolAtA.row, null);
assert.equal(patrolAtB.dayOfWeek, 2);
assert.equal(patrolAtB.period, 3);
assert.equal(patrolAtB.row, null);

const incomingOvertimeSchedules = [
  { teacherEmail: 'incoming-owner@example.edu.tw', dayOfWeek: 2, period: 6,
    className: '905', subject: '國文', attr: '一般' },
  { teacherEmail: 'incoming-teacher@example.edu.tw', dayOfWeek: 3, period: 6,
    className: '904', subject: '關思溝通成人', attr: '一般', specialTags: '超鐘點' }
];
const incomingExchange = {
  requestId: 'exchange-overtime', type: 'exchange', date: '2026-09-22', period: 6,
  originalTeacherEmail: 'incoming-owner@example.edu.tw',
  actualTeacherEmail: 'incoming-teacher@example.edu.tw',
  className: '904', subject: '關思溝通成人', subFee: '無'
};
const incomingOtherSide = Object.assign({}, incomingExchange, {
  id: 'exchange-overtime-2', date: '2026-09-16', period: 6,
  originalTeacherEmail: 'incoming-teacher@example.edu.tw',
  actualTeacherEmail: 'incoming-owner@example.edu.tw',
  className: '905', subject: '國文'
});
const incomingCell = context.window.DomainSchedule.resolveApprovedSchedule({
  teacherEmail: 'incoming-teacher@example.edu.tw', dateStr: '2026-09-22', dayOfWeek: 2, period: 6,
  allSchedules: incomingOvertimeSchedules,
  scheduleIndex: context.window.DomainSchedule.buildScheduleIndex(incomingOvertimeSchedules),
  periodSubs: [incomingExchange],
  allSubs: [incomingExchange, incomingOtherSide],
  helpers: { getTeacherNameByEmail: value => value, getWeekDayText: value => String(value) }
});
assert.equal(incomingCell.isSubstitutionDuty, true, '調課後調入格仍應標記實際授課');
assert.equal(incomingCell.isOvertime, true, '調課後調入格應保留原課超鐘點旗標');
assert.equal(incomingCell.specialTags, '超鐘點', '調課後調入格應保留原課特殊標記');

const incomingSubstituteSchedules = [
  { teacherEmail: 'small-owner@example.edu.tw', dayOfWeek: 2, period: 5,
    className: '906', subject: '國文', attr: '一般' },
  { teacherEmail: 'small-teacher@example.edu.tw', dayOfWeek: 3, period: 5,
    className: '907', subject: '生活科技', attr: '代課' }
];
const incomingSubstitute = {
  requestId: 'exchange-substitute', type: 'exchange', date: '2026-09-22', period: 5,
  originalTeacherEmail: 'small-owner@example.edu.tw',
  actualTeacherEmail: 'small-teacher@example.edu.tw',
  className: '907', subject: '生活科技', subFee: '無'
};
const incomingSubstituteOtherSide = Object.assign({}, incomingSubstitute, {
  id: 'exchange-substitute-2', date: '2026-09-16',
  originalTeacherEmail: 'small-teacher@example.edu.tw',
  actualTeacherEmail: 'small-owner@example.edu.tw',
  className: '906', subject: '國文'
});
const incomingSubstituteCell = context.window.DomainSchedule.resolveApprovedSchedule({
  teacherEmail: 'small-teacher@example.edu.tw', dateStr: '2026-09-22', dayOfWeek: 2, period: 5,
  allSchedules: incomingSubstituteSchedules,
  scheduleIndex: context.window.DomainSchedule.buildScheduleIndex(incomingSubstituteSchedules),
  periodSubs: [incomingSubstitute],
  allSubs: [incomingSubstitute, incomingSubstituteOtherSide],
  helpers: { getTeacherNameByEmail: value => value, getWeekDayText: value => String(value) }
});
assert.equal(incomingSubstituteCell.attr, '代課', '調課後調入格應保留原課代課屬性');
assert.equal(incomingSubstituteCell.isSubstitute, true, '調課後調入格應保留小鐘點旗標');

const chainedAttributeSchedules = [
  { teacherEmail: 'chain-owner@example.edu.tw', dayOfWeek: 2, period: 4,
    className: '801', subject: '自然', attr: '一般' },
  { teacherEmail: 'chain-middle@example.edu.tw', dayOfWeek: 2, period: 4,
    className: '802', subject: '數學', attr: '一般' }
];
const chainedAttributeEdge = {
  requestId: 'exchange-chained-attribute', type: 'exchange', date: '2026-09-22', period: 4,
  originalTeacherEmail: 'chain-owner@example.edu.tw',
  actualTeacherEmail: 'chain-middle@example.edu.tw',
  className: '802', subject: '數學', subFee: '無',
  courseAttr: '代課', courseSpecialTags: '超鐘點',
  courseIsOvertime: true, courseIsSubstitute: true
};
const chainedAttributeOtherSide = Object.assign({}, chainedAttributeEdge, {
  id: 'exchange-chained-attribute-2', date: '2026-09-16',
  originalTeacherEmail: 'chain-middle@example.edu.tw',
  actualTeacherEmail: 'chain-owner@example.edu.tw',
  className: '801', subject: '自然',
  courseAttr: '一般', courseSpecialTags: '',
  courseIsOvertime: false, courseIsSubstitute: false
});
const chainedAttributeCell = context.window.DomainSchedule.resolveApprovedSchedule({
  teacherEmail: 'chain-middle@example.edu.tw', dateStr: '2026-09-22', dayOfWeek: 2, period: 4,
  allSchedules: chainedAttributeSchedules,
  scheduleIndex: context.window.DomainSchedule.buildScheduleIndex(chainedAttributeSchedules),
  periodSubs: [chainedAttributeEdge],
  allSubs: [chainedAttributeEdge, chainedAttributeOtherSide],
  helpers: { getTeacherNameByEmail: value => value, getWeekDayText: value => String(value) }
});
assert.equal(chainedAttributeCell.attr, '代課', '多段調課應沿用來源課程的代課屬性');
assert.equal(chainedAttributeCell.specialTags, '超鐘點', '多段調課應沿用來源課程的特殊標記');
assert.equal(chainedAttributeCell.isOvertime, true, '多段調課應沿用來源課程的超鐘點旗標');
assert.equal(chainedAttributeCell.isSubstitute, true, '多段調課應沿用來源課程的小鐘點旗標');

const pendingExchange = {
  type: 'exchange',
  requesterEmail: 'owner@example.edu.tw',
  targetTeacherEmail: 'invitee@example.edu.tw',
  requestDate: '2026-08-31',
  requestPeriod: 4,
  className: '701',
  subject: '文旅享繪',
  targetDate: '2026-09-02',
  targetPeriod: 7,
  targetClassName: '701',
  targetSubject: '數學'
};
const pendingIndex = context.window.DomainSchedule.buildPendingIndex([pendingExchange]);
const courseAtTarget = context.window.DomainSchedule.applyPendingOverlay({
  cell: null,
  teacherEmail: 'owner@example.edu.tw',
  dateStr: '2026-09-02',
  period: 7,
  pendingRequests: [pendingExchange],
  pendingIndex: pendingIndex,
  getWeekDayText: day => String(day),
  allSchedules: [],
  scheduleIndex: context.window.DomainSchedule.buildScheduleIndex([]),
  resolveBaseSlot: (date, day, period) => ({ dayOfWeek: day, period: period })
});
assert.equal(courseAtTarget.subject, '文旅享繪');

const courseAtSource = context.window.DomainSchedule.applyPendingOverlay({
  cell: null,
  teacherEmail: 'invitee@example.edu.tw',
  dateStr: '2026-08-31',
  period: 4,
  pendingRequests: [pendingExchange],
  pendingIndex: pendingIndex,
  getWeekDayText: day => String(day),
  allSchedules: [],
  scheduleIndex: context.window.DomainSchedule.buildScheduleIndex([]),
  resolveBaseSlot: (date, day, period) => ({ dayOfWeek: day, period: period })
});
assert.equal(courseAtSource.subject, '數學');

const concurrentSchedules = [
  { teacherEmail: 'alice@example.edu.tw', dayOfWeek: 1, period: 7, className: '807', subject: '原課' },
  { teacherEmail: 'bob@example.edu.tw', dayOfWeek: 1, period: 7, className: '801', subject: '掉入課' }
];
const concurrentSubs = [
  {
    date: '2026-09-07', period: 7,
    originalTeacherEmail: 'alice@example.edu.tw', actualTeacherEmail: 'cover@example.edu.tw',
    className: '807', subject: '原課', type: 'substitution', subFee: '自費代課'
  },
  {
    date: '2026-09-07', period: 7,
    originalTeacherEmail: 'bob@example.edu.tw', actualTeacherEmail: 'alice@example.edu.tw',
    className: '801', subject: '掉入課', type: 'substitution', subFee: '自費代課'
  }
];
const concurrentCell = context.window.DomainSchedule.resolveApprovedSchedule({
  cell: null,
  teacherEmail: 'alice@example.edu.tw',
  dateStr: '2026-09-07',
  dayOfWeek: 1,
  period: 7,
  allSchedules: concurrentSchedules,
  scheduleIndex: context.window.DomainSchedule.buildScheduleIndex(concurrentSchedules),
  periodSubs: concurrentSubs,
  allSubs: concurrentSubs,
  helpers: {
    getTeacherNameByEmail: email => String(email || ''),
    getTeacherSubjectByEmail: () => '',
    isSingleWeek: () => true,
    isClassAway: () => false,
    getWeekDayText: day => String(day)
  }
});
assert.equal(concurrentCell.className, '801', '同節掉入課應作為實際上課主資料');
assert.equal(concurrentCell.subject, '掉入課');
assert.equal(concurrentCell.isSubstitutionDuty, true);
assert.notEqual(concurrentCell.isSubstituted, true, '有掉入課時不可再被媒合視為空堂');
assert.equal(concurrentCell.hasConcurrentDuty, true);
assert.equal(concurrentCell.outgoingDuty.className, '807');
assert.equal(concurrentCell.outgoingDuty.subject, '原課');

const classSwapChanges = buildClassSchoolSwapChanges(
  '701',
  [
    { id: 'class-a', className: '701', dayOfWeek: 1, period: 2, subject: '國文', attr: '一般' },
    { id: 'class-b', className: '701', dayOfWeek: 2, period: 3, subject: '數學', attr: '一般' }
  ],
  schoolSwaps.value,
  ['2026-08-17', '2026-08-18'],
  () => true
);
assert.equal(classSwapChanges.length, 2, 'class summary must include both school swap endpoints');
assert.equal(classSwapChanges[0].date, '2026-08-17');
assert.equal(classSwapChanges[0].subject, '數學');
assert.equal(classSwapChanges[0].sourceDate, '2026-08-18');
assert.equal(classSwapChanges[1].date, '2026-08-18');
assert.equal(classSwapChanges[1].subject, '國文');
assert.equal(classSwapChanges[1].sourceDate, '2026-08-17');
assert.equal(buildClassSchoolSwapChanges(
  '701',
  [{ className: '701', dayOfWeek: 2, period: 3, subject: '數學', attr: '一般' }],
  [{ id: 'disabled', dateA: '2026-08-17', dayA: 1, periodA: 2, dateB: '2026-08-18', dayB: 2, periodB: 3, enabled: false }],
  ['2026-08-17', '2026-08-18'],
  () => true
).length, 0, 'disabled school swaps must stay out of class summary');

console.log('school swap contract tests PASS');
