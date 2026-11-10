// @vitest-environment happy-dom
// 代辦（待核准）列印後才核審：確認列印就要落地「是否已印」，否則核准後的歷史紀錄全掛未列印。
import assert from 'node:assert/strict';
import { test } from 'vitest';
import { ref } from 'vue';
import { UiPrint } from '../src/modules/ui-print.js';

function makeApi({ isAdmin = true, isStaff = false } = {}) {
  const gasCalls = [];
  const marked = [];
  const requests = [{
    id: 'req-1',
    type: 'substitution',
    status: 'pending_admin',
    requesterEmail: 'owner@school.example',
    targetTeacherEmail: 'invitee@school.example',
    requestDate: '2026-09-07',
    requestPeriod: 1,
    className: '802',
    subject: '生活科技'
  }];
  const requestsList = ref(requests.slice());
  const substitutionRecords = ref([]);
  const printPreview = ref(null);
  const showPrintPreviewModal = ref(false);
  const api = UiPrint.create({
    getTeacherNameByEmail: v => String(v || ''),
    getTeacherSubjectByEmail: () => '',
    getTeacherJobTitleByEmail: () => '教師',
    getWeekDayText: () => '',
    allSchedules: ref([]),
    isAdmin: ref(isAdmin),
    isStaff: ref(isStaff),
    getScheduleForDate: () => null,
    selectedRecordIds: ref([]),
    substitutionRecords,
    requestsList,
    loading: ref(false),
    loadingMessage: ref(''),
    printPreview,
    showPrintPreviewModal,
    printPreviewImageBusy: ref(false),
    showDetailModal: ref(false),
    showCompareModal: ref(false),
    detailRequest: ref(null),
    detailSubRecord: ref(null),
    paperPrintDraft: ref(null),
    paperSignatureByTeacher: ref({}),
    isTriangleRequest: () => false,
    isExchangeLikeRequest: () => false,
    isCombinedReturnRequest: () => false,
    isCourseAdjustmentOnlyRequest: () => false,
    pendingRequestData: ref({}),
    defaultSubFeeForReason: () => '自費代課',
    batchSlots: ref([]),
    decodePaperTimeKey: () => ({ period: 1 }),
    successActionRequests: ref([]),
    showSuccessModal: ref(false),
    showTriangleTimetablePreview: ref(false),
    triangleParticipants: ref([]),
    triangleLegs: ref([]),
    triangleReason: ref(''), triangleNote: ref(''), triangleReady: ref(false),
    mutualDrafts: ref([]), mutualNote: ref(''),
    ensurePrintReady: async () => {},
    addEventToCalendar: () => {},
    syncHistorySelectionFromDom: () => {},
    buildPaperRecordsForSubmittedRequests: rows => (rows || []).map(r => ({
      id: r.id,
      requestId: r.id,
      type: 'substitution',
      originalTeacherEmail: r.requesterEmail,
      actualTeacherEmail: r.targetTeacherEmail,
      date: r.requestDate,
      period: r.requestPeriod,
      className: r.className,
      subject: r.subject,
      reason: '事假',
      printed: !!r.printed
    })),
    openPaperPrintDraftForSubmittedRequests: async () => true,
    callGasApi: async (action, payload) => { gasCalls.push({ action, payload }); return {}; }
  });
  return { api, gasCalls, marked, requestsList, printPreview };
}

async function stubPrintEnv(run) {
  const realOpen = window.open;
  const writes = [];
  window.open = () => ({
    document: { open() {}, write(html) { writes.push(String(html)); }, close() {} },
    close() {}, focus() {}, print() {}
  });
  try { await run(); } finally { window.open = realOpen; }
  return writes;
}

test('代辦批次列印：教學組按確認列印 → 標記已印', async () => {
  document.body.innerHTML = '<div id="toast-container"></div>';
  const { api, gasCalls, printPreview } = makeApi({ isAdmin: true });
  const opened = await api.openBatchRequestsPrintPreview([{ id: 'req-1' }]);
  assert.equal(opened, true);
  assert.equal(printPreview.value.skipMarkPrinted, false, '教學組列印不應跳過標記');
  await stubPrintEnv(() => api.confirmPrintPreview());
  assert.equal(gasCalls.length, 1, '應同步一次後端已印標記');
  assert.equal(gasCalls[0].action, 'batchMarkPrinted');
  assert.deepEqual(Array.from(gasCalls[0].payload.ids), ['req-1']);
});

test('代辦批次列印：一般教師維持不標記（避免權限警告）', async () => {
  document.body.innerHTML = '<div id="toast-container"></div>';
  const { api, gasCalls, printPreview } = makeApi({ isAdmin: false, isStaff: false });
  await api.openBatchRequestsPrintPreview([{ id: 'req-1' }]);
  assert.equal(printPreview.value.skipMarkPrinted, true);
  await stubPrintEnv(() => api.confirmPrintPreview());
  assert.equal(gasCalls.length, 0);
});
