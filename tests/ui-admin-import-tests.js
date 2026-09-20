#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');

global.window = global;
global.DateUtils = {
  parsePeriod(value) {
    if (String(value) === '早自習') return 0;
    if (String(value) === '午休') return 45;
    return parseInt(value, 10);
  }
};

require('../field-map.js');
require('../ui-admin.js');

const ref = value => ({ value });
let importPayload = null;
const schedules = ref([]);
const accountingPeriod = ref({ start: '2026-08-01', end: '2026-08-31' });
const admin = window.UiAdmin.create({
  ref,
  callGasApi: async () => ({ count: 1 }),
  callGasApiWithProgress: async (action, payload) => {
    assert.equal(action, 'importSchedulesBatch');
    importPayload = payload;
    return { count: payload.list.length };
  },
  showToast: () => {},
  showConfirm: async () => true,
  loading: ref(false),
  loadingMessage: ref(''),
  loadWeeklyData: async () => {},
  getTeacherNameByEmail: value => value,
  currentSemester: ref('S1'),
  reportMonth: ref('2026-08'),
  accountingPeriod,
  teachersList: ref([{ loginEmail: 'teacher@example.com', email: '教師', name: '教師' }]),
  allSchedules: schedules,
  leaveReasonOptions: [],
  getHistoryEditDefaultSubFee: () => '自費代課',
  historyEditForm: ref({}),
  showHistoryEditModal: ref(false),
  requestsList: ref([])
});
assert.deepEqual(admin.getOvertimeExpenseSourceOptions(), [], '未設定資料時不應提供預設計畫名稱');

schedules.value = [{
  teacherEmail: '教師',
  teacherName: '教師',
  dayOfWeek: 1,
  period: 1,
  className: '701',
   attr: '一般',
   specialTags: '超鐘點'
}];
admin.openOvertimePlanModal({ loginEmail: 'teacher@example.com', email: '教師', name: '教師' });
assert.equal(admin.overtimePlanRows.value.length, 1, '登入 Email 與課表姓名鍵不同時仍應找到超鐘點課格');
assert.equal(admin.overtimePlanUsesFixedSlots.value, false, '未設定固定節次時仍應使用課表日期判定');
admin.overtimePlanRows.value[0].source = '校務自訂計畫';
assert.ok(admin.getOvertimeExpenseSourceOptions().includes('校務自訂計畫'), '目前輸入的新計畫也應立即成為下拉建議');

const fixedSourceSchedules = ref([
  { teacherEmail: '固定@example.com', dayOfWeek: 1, period: 1, className: '701', attr: '一般' },
  { teacherEmail: '固定@example.com', dayOfWeek: 1, period: 2, className: '702', attr: '一般', specialTags: '超鐘點' },
  { teacherEmail: '固定@example.com', dayOfWeek: 2, period: 1, className: '802', attr: '代課' }
]);
const fixedSourceTeacher = {
  loginEmail: '固定@example.com',
  email: '固定',
  name: '固定',
  fixedOvertimeConfigured: true,
  fixedOvertimeHours: 1,
  fixedOvertimeSlots: '一1',
  expensePlan: JSON.stringify([
    { day: 1, period: 1, className: '701', source: '固定國教' },
    { day: 2, period: 1, className: '801', source: '小鐘點計畫' }
  ])
};
let fixedSourceSavePayload = null;
const fixedSourceActions = [];
const fixedSourceAdmin = window.UiAdmin.create({
  ref,
  callGasApi: async (action, payload) => {
    fixedSourceActions.push(action);
    if (action === 'saveTeacher') fixedSourceSavePayload = payload;
    return { count: 1 };
  },
  callGasApiWithProgress: async () => ({ count: 1 }),
  showToast: () => {},
  showConfirm: async () => true,
  loading: ref(false),
  loadingMessage: ref(''),
  currentSemester: ref('S1'),
  reportMonth: ref('2026-08'),
  accountingPeriod,
  teachersList: ref([fixedSourceTeacher]),
  allSchedules: fixedSourceSchedules,
  leaveReasonOptions: [],
  historyEditForm: ref({}),
  showHistoryEditModal: ref(false),
  requestsList: ref([])
});
fixedSourceAdmin.openOvertimePlanModal(fixedSourceTeacher);
assert.equal(fixedSourceAdmin.overtimePlanUsesFixedSlots.value, true, '固定節次來源設定不應再顯示日期判定');
fixedSourceAdmin.openTeacherExpenseAuditModal();
assert.equal(fixedSourceAdmin.teacherExpenseAuditSummary.value.total, 1, '教師經費檢查應涵蓋目前教師名單');
assert.equal(fixedSourceAdmin.teacherExpenseAuditSummary.value.blocked, 0, '有效教師經費資料不應被標記為不可整理');
assert.deepEqual(fixedSourceAdmin.overtimePlanRows.value.map(row => row.className), ['701', '801'],
  '經費來源應以固定超鐘點節次與已保存的小鐘點快照為準');
assert.deepEqual(fixedSourceAdmin.overtimePlanRows.value.map(row => row.source), ['固定國教', '小鐘點計畫']);
fixedSourceSchedules.value = [
  { teacherEmail: '固定@example.com', dayOfWeek: 1, period: 1, className: '703', attr: '一般' },
  { teacherEmail: '固定@example.com', dayOfWeek: 1, period: 2, className: '703', attr: '一般', specialTags: '超鐘點' },
  { teacherEmail: '固定@example.com', dayOfWeek: 2, period: 1, className: '802', attr: '代課' }
];
fixedSourceAdmin.openOvertimePlanModal(fixedSourceTeacher);
assert.deepEqual(fixedSourceAdmin.overtimePlanRows.value.map(row => row.className), ['701', '801'],
  '課表變更後仍應保留已保存的經費來源快照');
const fixedSourceSavePromise = fixedSourceAdmin.saveOvertimePlan();

const blankSnapshotSchedules = ref([
  { teacherEmail: '空白快照@example.com', dayOfWeek: 2, period: 2, className: '706', subject: '自然', attr: '代課' }
]);
const blankSnapshotTeacher = {
  loginEmail: '空白快照@example.com',
  email: '空白快照',
  name: '空白快照',
  expensePlan: JSON.stringify([{ day: 2, period: 2, className: '', source: '小鐘點計畫' }])
};
const blankSnapshotAdmin = window.UiAdmin.create({
  ref,
  callGasApi: async () => ({ count: 1 }),
  callGasApiWithProgress: async () => ({ count: 1 }),
  showToast: () => {},
  showConfirm: async () => true,
  loading: ref(false),
  loadingMessage: ref(''),
  currentSemester: ref('S1'),
  reportMonth: ref('2026-08'),
  accountingPeriod,
  teachersList: ref([blankSnapshotTeacher]),
  allSchedules: blankSnapshotSchedules,
  leaveReasonOptions: [],
  historyEditForm: ref({}),
  showHistoryEditModal: ref(false),
  requestsList: ref([])
});
blankSnapshotAdmin.openOvertimePlanModal(blankSnapshotTeacher);
assert.deepEqual(blankSnapshotAdmin.overtimePlanRows.value.map(row => row.className), ['706'],
  '空白經費快照應以目前有效課表補上班級');
assert.equal(blankSnapshotAdmin.overtimePlanRows.value[0].subject, '自然');

const auditTeacher = {
  loginEmail: '整理@example.com',
  email: '整理',
  name: '整理',
  fixedOvertimeHours: 2,
  fixedOvertimeSlots: '三5、一2',
  expensePlan: '[{"source":"計畫A", "period":"1", "className":"701", "day":"1"}]'
};
const auditActions = [];
const auditAdmin = window.UiAdmin.create({
  ref,
  callGasApi: async (action, payload) => {
    auditActions.push({ action, payload });
    return { count: 1 };
  },
  showToast: () => {},
  showConfirm: async () => true,
  loading: ref(false),
  loadingMessage: ref(''),
  currentSemester: ref('S1'),
  reportMonth: ref('2026-08'),
  accountingPeriod,
  teachersList: ref([auditTeacher]),
  allSchedules: ref([]),
  leaveReasonOptions: [],
  historyEditForm: ref({}),
  showHistoryEditModal: ref(false),
  requestsList: ref([])
});
auditAdmin.openTeacherExpenseAuditModal();
assert.equal(auditAdmin.teacherExpenseAuditSummary.value.normalizable, 1, '可標準化教師資料應列入整理預覽');
const auditNormalizePromise = auditAdmin.normalizeTeacherExpenseData();

let fixedBatchPayload = null;
let fixedBatchBackupPayload = null;
const fixedBatchTeachers = ref([
  { loginEmail: 'one@example.com', email: '一號', name: '一號' },
  { loginEmail: 'two@example.com', email: '二號', name: '二號' }
]);
const fixedBatchSchedules = ref([
  { teacherEmail: '一號', dayOfWeek: 1, period: 1, attr: '一般', specialTags: '超鐘點' },
  { teacherEmail: '一號', dayOfWeek: 3, period: 2, attr: '一般', specialTags: '超鐘點' },
  { teacherEmail: '一號', dayOfWeek: 5, period: 3, attr: '代課', specialTags: '' }
]);
const fixedBatchAdmin = window.UiAdmin.create({
  ref,
  callGasApi: async (action, payload) => {
    if (action === 'backupTeacherExpensePlans') fixedBatchBackupPayload = payload;
    return { count: 1 };
  },
  callGasApiWithProgress: async (action, payload) => {
    assert.equal(action, 'importTeachersBatch');
    fixedBatchPayload = payload;
    return { count: payload.list.length };
  },
  showToast: () => {},
  showConfirm: async () => true,
  loading: ref(false),
  loadingMessage: ref(''),
  currentSemester: ref('S1'),
  teachersList: fixedBatchTeachers,
  allSchedules: fixedBatchSchedules,
  leaveReasonOptions: [],
  historyEditForm: ref({}),
  showHistoryEditModal: ref(false),
  requestsList: ref([])
});
const fixedBatchPromise = fixedBatchAdmin.fillFixedOvertimeForAllTeachers();

schedules.value = [
  { teacherEmail: '教師', dayOfWeek: 1, period: 1, className: '700', attr: '一般', specialTags: '超鐘點', activeTo: '2026-07-31' },
  { teacherEmail: '教師', dayOfWeek: 1, period: 2, className: '701', attr: '一般', specialTags: '超鐘點', activeFrom: '2026-08-01', activeTo: '2026-08-15' },
  { teacherEmail: '教師', dayOfWeek: 1, period: 3, className: '702', attr: '一般', specialTags: '超鐘點', activeFrom: '2026-08-16' },
  { teacherEmail: '教師', dayOfWeek: 1, period: 4, className: '703', attr: '一般', specialTags: '超鐘點', activeFrom: '2026-09-01' }
];
admin.openOvertimePlanModal({ loginEmail: 'teacher@example.com', email: '教師', name: '教師' });
assert.deepEqual(admin.overtimePlanRows.value.map(row => row.className), ['702'], '來源設定應以結算最後一天判斷有效課程');
assert.equal(admin.overtimePlanPeriodEnd.value, '2026-08-31');

const vueLikeReportMonth = Object.create({ get value() { return '2026-09'; } });
const vueLikeAccountingPeriod = Object.create({ get value() { return {}; } });
const vueRefAdmin = window.UiAdmin.create({
  ref,
  callGasApi: async () => ({ count: 1 }),
  showToast: () => {},
  showConfirm: async () => true,
  loading: ref(false),
  loadingMessage: ref(''),
  currentSemester: ref('S1'),
  reportMonth: vueLikeReportMonth,
  accountingPeriod: vueLikeAccountingPeriod,
  teachersList: ref([]),
  allSchedules: ref([]),
  leaveReasonOptions: [],
  historyEditForm: ref({}),
  showHistoryEditModal: ref(false),
  requestsList: ref([])
});
vueRefAdmin.openOvertimePlanModal({ loginEmail: 'teacher@example.com', email: '教師', name: '教師' });
assert.equal(vueRefAdmin.overtimePlanPeriodEnd.value, '2026-09-30', '應讀取 Vue ref 原型上的月份值');

schedules.value = [{
  teacherEmail: '教師',
  teacherName: '教師',
  dayOfWeek: 2,
  period: 2,
  className: '702',
  attr: '代課',
  specialTags: ''
}];
admin.openOvertimePlanModal({ loginEmail: 'teacher@example.com', email: '教師', name: '教師' });
assert.equal(admin.overtimePlanRows.value.length, 1, '代課小鐘點課格也應可設定經費來源');

admin.mappingFields.value = {
  teacherName: 'name',
  subject: 'subject',
  dayOfWeek: 'day',
  period: 'period',
  className: 'className',
  attr: 'attr',
  restriction: '',
   specialTags: 'specialTags',
  activeFrom: 'from',
  activeTo: 'to'
};
admin.excelData.value = [{
  name: '教師',
  subject: '國文',
  day: '一',
  period: '早自習',
  className: '701',
   attr: '一般',
   specialTags: '超鐘點',
  from: '2026/08/01',
  to: '2026/08/15'
}];

admin.runImportPreview();
assert.equal(admin.importPreview.value.ok, 1);
Promise.all([admin.importSchedules(), fixedBatchPromise, fixedSourceSavePromise, auditNormalizePromise]).then(() => {
  assert.equal(importPayload.list[0]['節次'], 0);
   assert.equal(importPayload.list[0]['課堂屬性'], '一般');
   assert.equal(importPayload.list[0]['特殊標記'], '超鐘點');
  assert.equal(importPayload.list[0]['啟用起日'], '2026-08-01');
  assert.equal(importPayload.list[0]['啟用迄日'], '2026-08-15');
  assert.deepEqual(fixedBatchPayload.list.map(row => [row['教師姓名'], row['超鐘點節數'], row['超鐘點節次']]), [
    ['一號', 2, '一1、三2'],
    ['二號', 0, '']
   ], '一鍵代入只應依目前課表的超鐘點節次批次寫入所有教師，代課節次應留在小鐘點工作表，無標記者設為 0 節');
   assert.equal(fixedBatchBackupPayload.rows.length, 2, '批次改寫固定超鐘點前應先備份全部教師經費資料');
   assert.equal(fixedBatchTeachers.value[0].fixedOvertimeSlotsText, '一1、三2');
  assert.equal(fixedBatchTeachers.value[1].fixedOvertimeHours, 0);
   assert.equal(fixedSourceSavePayload['超鐘點節數'], 1, '儲存經費來源時不得清除固定超鐘點節數');
   assert.equal(fixedSourceSavePayload['超鐘點節次'], '一1', '儲存經費來源時不得清除固定超鐘點節次');
   assert.match(fixedSourceSavePayload['鐘點支出計畫'], /固定國教/);
   assert.deepEqual(fixedSourceActions, ['backupTeacherExpensePlans', 'saveTeacher'],
     '儲存經費來源前應先備份教師資料');
   assert.deepEqual(auditActions.map(item => item.action), ['backupTeacherExpensePlans', 'saveTeacher'],
     '整理教師資料前應先備份，再逐筆儲存');
   assert.match(auditActions[1].payload['鐘點支出計畫'], /^\[\{"day":1,"period":1,"className":"701","source":"計畫A"\}\]$/,
     '整理後來源 JSON 應使用標準欄位順序與格式');
   assert.equal(auditActions[1].payload['超鐘點節次'], '一2、三5', '整理後固定節次應排序並正規化');
   console.log('ui-admin import tests PASS');
}).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
