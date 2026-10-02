#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

global.window = global;
require('../ui-timetable.js');

const ref = value => ({ value });
const activeCell = ref(null);
const inputRequestDate = ref('');
const showMatchModal = ref(false);
const toastMessages = [];

const deps = {
  computed: getter => ({ get value() { return getter(); } }),
  classSchedules: ref({
    '904': {
      '1-1': [{ teacherEmail: '', teacherName: '張老師', subject: '國文' }]
    }
  }),
  selectedClassWeekDates: ref(['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09']),
  classSubstitutionMap: ref({}),
  detailSubRecord: ref(null),
  detailRequest: ref(null),
  showDetailModal: ref(false),
  resolveDetailRequest: () => null,
  classReadonlyMode: ref(false),
  isAdmin: ref(true),
  getTeacherNameByEmail: () => '',
  activeCell,
  inputRequestDate,
  matchMode: ref('substitution'),
  exchangeTargetDate: ref(''),
  exchangeWeekOffset: ref(0),
  exchangePeriodId: ref(''),
  exchangeTeacherEmail: ref(''),
  matchPreview: ref(null),
  recommendedTeachers: ref([]),
  matchSearchQuery: ref(''),
  matchDisplayCount: ref(10),
  showMatchModal,
  fetchRecommendations: () => {},
  isClassAwayOnDate: () => false,
  showToast: message => toastMessages.push(message),
  canOperateOnTeacherEmail: () => false,
  ensureProxyTargetForTeacher: () => {}
};
const timetable = window.UiTimetable.create({ computed: deps.computed });

timetable.handleClassCellClick(deps, '904', 1, 1);
assert.equal(activeCell.value.teacherEmail, '張老師', '班級課表缺教師 Email 時應以教師姓名作為來源鍵');
assert.equal(activeCell.value.classData.teacherEmail, '張老師');
assert.equal(inputRequestDate.value, '2026-10-05');
assert.equal(showMatchModal.value, true, '管理員可由班級課表開啟代課媒合');
assert.deepEqual(toastMessages, []);

const appSource = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const permissionStart = appSource.indexOf('const assertCanSubmitAsLeaveTeacher =');
const permissionEnd = appSource.indexOf('\n    };', permissionStart);
assert.ok(permissionStart >= 0 && permissionEnd > permissionStart, '提交時教師權限驗證函式存在');
assert.match(appSource.slice(permissionStart, permissionEnd), /if \(isAdmin\.value\)\s*\{[\s\S]*?return true;/, '管理員提交驗證不依賴行政代理授權名單');

console.log('class timetable admin tests PASS');
