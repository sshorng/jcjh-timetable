#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');

global.window = global;
require('../ui-same-period-swap.js');

function ref(value) {
  return { value };
}

function computed(fn) {
  return { get value() { return fn(); } };
}

const date = '2026-10-12';
const source = { className: '701', subject: '國文', attr: '' };
const cells = {
  'a@school.example': source,
  'b@school.example': { className: '802', subject: '數學', attr: '' },
  'c@school.example': { className: '803', subject: '英文', attr: '', isPending: true },
  'd@school.example': { className: '巡堂', subject: '巡堂', attr: '巡堂', isPatrol: true },
  'e@school.example': { className: '804', subject: '抽離', attr: '抽離', isPullOut: true },
  'f@school.example': { className: '701', subject: '國文', attr: '' },
  'g@school.example': { className: '805', subject: '自然', attr: '', isClassAway: true }
};
const teachers = [
  { email: 'a@school.example', name: 'A老師' },
  { email: 'b@school.example', name: 'B老師' },
  { email: 'c@school.example', name: 'C老師' },
  { email: 'd@school.example', name: 'D老師' },
  { email: 'e@school.example', name: 'E老師' },
  { email: 'f@school.example', name: 'F老師' },
  { email: 'g@school.example', name: 'G老師' },
  { email: 'b@school.example', name: '重複教師' }
];

const candidates = window.UiSamePeriodSwap.listCandidates({
  teachers,
  sourceEmail: 'A@school.example',
  date,
  day: 1,
  period: 3,
  sourceCell: source,
  getScheduleForDate(email) { return cells[String(email).toLowerCase()] || null; }
});
assert.deepEqual(candidates.map(candidate => candidate.email), ['b@school.example']);
assert.equal(candidates[0].className, '802');
assert.equal(candidates[0].subject, '數學');

const pullOutCandidates = window.UiSamePeriodSwap.listCandidates({
  teachers: [
    { email: 'a@school.example', name: 'A老師' },
    { email: 'b@school.example', name: 'B老師' }
  ],
  sourceEmail: 'a@school.example',
  date,
  day: 1,
  period: 3,
  sourceCell: { className: '701', subject: '抽離國文', attr: '抽離', isPullOut: true },
  getScheduleForDate(email) {
    return email === 'b@school.example'
      ? { className: '802', subject: '抽離數學', attr: '抽離', isPullOut: true }
      : null;
  }
});
assert.equal(pullOutCandidates.length, 1, '抽離課應可與另一堂抽離課互換');

const sortedCandidates = window.UiSamePeriodSwap.listCandidates({
  teachers: [
    { email: 'source@school.example', name: '起點' },
    { email: 'c907@school.example', name: '丙老師' },
    { email: 'c905@school.example', name: '甲老師' },
    { email: 'c906@school.example', name: '乙老師' }
  ],
  sourceEmail: 'source@school.example',
  date,
  day: 1,
  period: 3,
  sourceCell: { className: '701', subject: '國文', attr: '' },
  getScheduleForDate(email) {
    const classByTeacher = {
      'c907@school.example': ['907', '體育'],
      'c905@school.example': ['905', '健康教育'],
      'c906@school.example': ['906', '國文']
    };
    const course = classByTeacher[email];
    return course ? { className: course[0], subject: course[1], attr: '' } : null;
  }
});
assert.deepEqual(sortedCandidates.map(candidate => candidate.className), ['905', '906', '907'], '候選教師應依班級號碼排序');

let confirmationText = '';
let submitted = null;
let refreshed = false;
let toastMessage = '';
const activeCell = ref({
  teacherEmail: 'A老師',
  teacherName: 'A老師',
  dayOfWeek: 1,
  period: 3,
  classData: source
});
const inputRequestDate = ref(date);
const showMatchModal = ref(true);
const isAdmin = ref(true);
const mappedTeachers = [
  { email: 'A老師', loginEmail: 'a@school.example', name: 'A老師' },
  { email: 'B老師', loginEmail: 'b@school.example', name: 'B老師' }
];
const mappedCells = {
  'a老師': source,
  'b老師': cells['b@school.example']
};
const ui = window.UiSamePeriodSwap.create({
  ref,
  computed,
  isAdmin,
  activeCell,
  inputRequestDate,
  teachersList: ref(mappedTeachers),
  getTeacherNameByEmail(identity) { return identity === 'a老師' || identity === 'a@school.example' ? 'A老師' : 'B老師'; },
  getScheduleForDate(identity) { return mappedCells[String(identity).toLowerCase()] || null; },
  formatPeriodText(period) { return '第' + period + '節'; },
  async showConfirm(message) { confirmationText = message; return true; },
  async callGasApi(action, data) { submitted = { action, data }; return { success: true }; },
  showToast(message) { toastMessage = message; },
  showMatchModal,
  clearScheduleCache() {},
  softRefreshInBackground() { refreshed = true; }
});

ui.openSamePeriodSwapModal();
assert.equal(ui.showSamePeriodSwapModal.value, true);
assert.equal(ui.samePeriodSwapCandidates.value.length, 1);
assert.equal(ui.samePeriodSwapFilteredCandidates.value[0].key, 'b老師', '以班級識別鍵選取教師，登入 Email 另行提交');
ui.samePeriodSwapSearchQuery.value = '數學';
assert.equal(ui.samePeriodSwapFilteredCandidates.value.length, 1, '搜尋應依科目篩選候選');
ui.samePeriodSwapSearchQuery.value = '沒有這堂課';
assert.equal(ui.samePeriodSwapFilteredCandidates.value.length, 0, '無搜尋結果時應清楚顯示空結果');
ui.samePeriodSwapSearchQuery.value = '';
ui.samePeriodSwapTargetKey.value = 'b老師';
ui.saveSamePeriodSwap().then(() => {
  assert.match(confirmationText, /A老師：701 國文/);
  assert.match(confirmationText, /B老師：802 數學/);
  assert.equal(submitted.action, 'adminCreateSamePeriodExchange');
  assert.deepEqual(submitted.data, {
    date,
    period: 3,
    teacherAEmail: 'a@school.example',
    teacherBEmail: 'b@school.example'
  });
  assert.equal(ui.showSamePeriodSwapModal.value, false);
  assert.equal(showMatchModal.value, false);
  assert.equal(refreshed, true);
  assert.equal(toastMessage, '同節互換已套用');

  isAdmin.value = false;
  ui.openSamePeriodSwapModal();
  assert.equal(ui.showSamePeriodSwapModal.value, false, '一般教師不可開啟管理員互換視窗');
  console.log('same period swap UI tests PASS');
}).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
