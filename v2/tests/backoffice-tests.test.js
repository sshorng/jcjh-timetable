import assert from 'node:assert/strict';
import { test } from 'vitest';
import path from 'node:path';
import { UiBackoffice } from '../src/modules/ui-backoffice.js';

test('backoffice tests（v1 移植）', () => {
  /**
   * UiBackoffice 後台操作測試（2A：app.js §6 尾搬移的安全網）
   *
   * 驗證重點：
   * - create 回傳 24 件 API
   * - 歷史選取簇（不碰 DOM 部分）行為正確
   * - resetAppState 清空欄位；devSwitch/restoreAdmin 往返
   * - logout 經 _nextDataLoadSeq 推進（seq 留守 app.js）
   */

  const ref = (v) => ({ value: v });
  const computed = (fn) => ({ get value() { return fn(); } });


  assert.ok(UiBackoffice, 'UiBackoffice 應掛載');

  let seq = 5;
  const deps = {
    computed, loading: ref(false), user: ref({ email: 'a@school.example' }),
    cancelAll: () => {}, clearSWR: () => {},
    isGsiInitialized: () => false, isGoogleGsiReady: () => false,
    suppressGsiAutoLogin: () => {}, gsiLoggingIn: ref(false),
    paginatedHistoryRecords: ref([{ id: 'h1', displayKind: 'item' }, { id: 'h2', displayKind: 'item' }]),
    selectedRecordIds: ref([]), historyPage: ref(1), historyTotalPages: ref(3),
    isAdmin: ref(true), quotaAdjustForm: ref({}), showQuotaLedgerModal: ref(false),
    showQuotaAdjustModal: ref(false), quotaAdjustSaving: ref(false),
    teachersList: ref([]), openQuotaLedger: () => {},
    paperMode: ref(false), isMutualCover: ref(false), batchSelectMode: ref(false),
    ensureDAC: () => {}, lookupTeacher: () => null, getTeacherNameByEmail: () => '',
    emptySlotForm: ref({}), showEmptySlotModal: ref(false),
    detailSubRecord: ref(null), detailRequest: ref(null), showDetailModal: ref(false),
    pendingRequestData: ref(null), toggleCourseAdjustmentOnly: () => {},
    isPeriod8FeeLocked: ref(false), PERIOD8_FEE: '代課費', batchSubFee: ref(''),
    defaultSubFeeForReason: () => '', activeCell: ref(null), inputRequestDate: ref(''),
    selectedWeekDate: ref(''), prepCompare: () => {}, isSubmitting: ref(false),
    mutualDrafts: ref([]), mutualNote: ref(''), mutualSkipNotify: ref(false),
    loadingMessage: ref(''), currentSemester: ref(''), directApproveMode: ref(false),
    optimisticUpsertRequest: () => {}, sheetRequestToFront: (r) => r,
    deductMutualQuotaForRows: () => {}, softRefreshInBackground: () => {},
    persistMutualPanelDraft: () => {}, activityBalanceCtx: ref(null),
    ACTIVITY_PUBLIC_FEE: '活動公費', successModalTitle: ref(''), successModalMessage: ref(''),
    hasLineTemplate: ref(false), lineBatchParts: ref([]), lineCopyText: ref(''),
    showSuccessModal: ref(false), buildLineBatchInviteText: () => '',
    DAC: ref([]), successFlowMode: ref(''), notificationsSuppressed: ref(false),
    openPaperPrintMutualDrafts: () => {}, getMutualPanelApi: () => null,
    userRole: ref('teacher'), allSchedules: ref([1]), schoolSwaps: ref([1]),
    classDirectory: ref(['701']), classViewSchedules: ref([1]),
    classViewSchoolSwaps: ref([1]), classViewSubstitutionRecords: ref([1]),
    classViewClassAwayEvents: ref([1]), classViewLoadedClass: ref('701'),
    substitutionRecords: ref([1]), homeroomRecords: ref([1]),
    homeroomAssignSelections: ref({ a: 1 }), mySentRequests: ref([1]),
    myPendingRequests: ref([1]), adminPendingRequests: ref([{ id: 'p1' }]),
    batchGroupExpanded: ref({}), showMatchModal: ref(true),
    showPrintPreviewModal: ref(true), printPreview: ref({}), printPreviewImageBusy: ref(true),
    proxyTargetEmail: ref('x@y'), proxyTargetQuery: ref('q'),
    showProxyTargetDropdown: ref(true), classReadonlyMode: ref(false),
    activeTab: ref('timetable'), readStoredTab: () => 'timetable', adminSubTab: ref(''),
    readStoredAdminSubTab: () => '', _navPersistReady: ref(true),
    persistNavPosition: () => {}, isSimulating: ref(false), originalUser: ref(null),
    recomputeRequestBuckets: () => {}, loadWeeklyData: async () => {},
    selectedAdminPendingIds: ref([]),
    openPaperPrintDraftForSubmittedRequests: () => {},
    paginatedAdminPending: ref([{ id: 'p1' }, { id: 'p2' }]),
    isAdminPendingSelected: (id) => deps.selectedAdminPendingIds.value.includes(id),
    _nextDataLoadSeq: () => { seq += 1; return seq; },
  };
  const api = UiBackoffice.create(deps);

  const EXPECTED = ['logout', 'readHistoryCheckedIds', 'getHistoryPageSelectableIds', 'setHistorySelection', 'syncHistorySelectionFromDom', 'toggleSelectAllRecords', 'changeHistoryPage', 'isHistoryRecordSelected', 'isHistoryBatchGroupSelected', 'toggleHistoryBatchGroupSelection', 'openManualQuotaAdjust', 'saveManualQuotaAdjust', 'openEmptySlotAssign', 'openEmptySlotFromDetail', 'onLeaveReasonChange', 'previewMutualDraft', 'submitAllMutualDrafts', 'toggleMutualCover', 'resetAppState', 'restoreNavAfterLogin', 'devSwitchUser', 'restoreAdmin', 'openBatchPendingPrintPreview', 'isAdminPendingPageFullySelected'];
  for (const k of EXPECTED) assert.ok(api[k], '缺少 ' + k);

  // 歷史選取簇（vm 跨 realm：以 join 比對）
  assert.equal([...api.getHistoryPageSelectableIds()].join(','), 'h1,h2');
  api.setHistorySelection(['h1'], true);
  assert.equal([...deps.selectedRecordIds.value].join(','), 'h1');
  assert.equal(api.isHistoryRecordSelected('h1'), true);
  assert.equal(api.isHistoryRecordSelected('h2'), false);
  assert.equal(api.isHistoryBatchGroupSelected({ items: [{ id: 'h1' }] }), true);
  assert.equal(api.isHistoryBatchGroupSelected({ items: [{ id: 'h1' }, { id: 'h2' }] }), false);
  api.toggleSelectAllRecords();
  assert.equal([...deps.selectedRecordIds.value].sort().join(','), 'h1,h2');
  api.changeHistoryPage(99);
  assert.equal(deps.historyPage.value, 3, '分頁應夾在上限');
  api.changeHistoryPage(-5);
  assert.equal(deps.historyPage.value, 1, '分頁應夾在下限');

  // 待辦選取
  assert.equal(api.isAdminPendingPageFullySelected(), false);
  api.setHistorySelection(['h1', 'h2'], false);
  assert.equal([...deps.selectedRecordIds.value].join(','), '');

  // dev 模擬往返
  deps.isAdmin.value = true;
  deps.lookupTeacher = () => null;
  assert.equal(api.devSwitchUser('nobody@school.example'), undefined);
  assert.equal(api.restoreAdmin(), undefined);

  // logout：seq 推進＋狀態清空
  api.logout();
  assert.equal(seq, 6, 'logout 應經 accessor 推進 seq');
  assert.equal(deps.user.value, null);
  assert.equal(deps.loading.value, false);
  assert.equal(deps.allSchedules.value.length, 0);
  assert.equal(deps.proxyTargetEmail.value, '');

  console.log('backoffice tests PASS（24 API＋歷史選取＋dev 往返＋logout）');

});
