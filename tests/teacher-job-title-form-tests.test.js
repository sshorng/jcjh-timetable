import assert from 'node:assert/strict';
import { test } from 'vitest';
import { UiAdmin } from '../src/modules/ui-admin.js';

// 教師名單編輯：職務必須帶入現有值，且儲存時要真的送出「職務」。
test('教師表單職務帶入與儲存（教支人員自填語言）', async () => {
  const ref = value => ({ value });
  let savedPayload = null;
  const teacher = {
    loginEmail: 'support@example.com',
    email: '教支甲',
    name: '教支甲',
    subject: '本土語',
    jobTitle: '教支人員-臺灣台語',
    role: 'teacher',
    baseHours: 0,
    mutualQuota: 0,
    fixedOvertimeConfigured: false,
    expensePlan: '本土語'
  };
  const teachersList = ref([teacher]);
  const admin = UiAdmin.create({
    ref,
    callGasApi: async (action, payload) => {
      if (action === 'saveTeacher') savedPayload = payload;
      return { success: true };
    },
    showToast: () => {},
    showConfirm: async () => true,
    loading: ref(false),
    loadingMessage: ref(''),
    loadWeeklyData: async () => {},
    currentSemester: ref('S1'),
    reportMonth: ref('2026-08'),
    accountingPeriod: ref({ start: '2026-08-01', end: '2026-08-31' }),
    teachersList,
    allSchedules: ref([]),
    leaveReasonOptions: [],
    historyEditForm: ref({}),
    showHistoryEditModal: ref(false),
    requestsList: ref([])
  });

  admin.openEditTeacherModal(teacher);
  assert.equal(admin.teacherForm.value.jobTitle, '教支人員-臺灣台語',
    '編輯教師時應帶入現有職務，不可空白');

  admin.teacherForm.value.jobTitle = '教支人員-臺灣客語';
  await admin.saveTeacher();

  assert.equal(savedPayload['職務'], '教支人員-臺灣客語',
    '儲存教師時應送出職務欄位，否則手動改的職務不會存檔');
  assert.equal(teachersList.value[0].jobTitle, '教支人員-臺灣客語',
    '儲存後教師名單應同步顯示新職務');
});
