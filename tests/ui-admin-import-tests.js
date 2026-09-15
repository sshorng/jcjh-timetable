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
admin.overtimePlanRows.value[0].source = '校務自訂計畫';
assert.ok(admin.getOvertimeExpenseSourceOptions().includes('校務自訂計畫'), '目前輸入的新計畫也應立即成為下拉建議');

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
admin.importSchedules().then(() => {
  assert.equal(importPayload.list[0]['節次'], 0);
   assert.equal(importPayload.list[0]['課堂屬性'], '一般');
   assert.equal(importPayload.list[0]['特殊標記'], '超鐘點');
  assert.equal(importPayload.list[0]['啟用起日'], '2026-08-01');
  assert.equal(importPayload.list[0]['啟用迄日'], '2026-08-15');
  console.log('ui-admin import tests PASS');
}).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
