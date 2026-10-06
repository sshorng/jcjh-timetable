/**
 * 自 v1 ui-backoffice.js 機械移植（port-modules.cjs）：
 * IIFE 掛載改 ESM export；body 與 v1 逐字一致。
 */
import FieldMap from '../domain/field-map.js';
import { UiMutualSubmit } from '../modules/ui-mutual.js';

/**
 * ui-backoffice.js — 後台操作（登入登出／歷史選取／額度調整／空堂排班／互代送出／dev 模擬）（從 app.js 抽出，2A）
 *
 * Eager 載入（setup 內委派，需先於 app.js）。create(deps) 注入 refs／回呼。
 * _dataLoadSeq 留守 app.js（logout 經 _nextDataLoadSeq 存取）。
 */
import { showToast, showConfirm } from '../ui/toast.js';
const UiBackoffice = (() => {
  function create(deps) {
    deps = deps || {};
    var _quotaLedgerCache = deps._quotaLedgerCache;
    var callGasApi = deps.callGasApi;
    var computed = deps.computed;
    var loading = deps.loading;
    var user = deps.user;
    var cancelAll = deps.cancelAll;
    var clearSWR = deps.clearSWR;
    var isGsiInitialized = deps.isGsiInitialized;
    var isGoogleGsiReady = deps.isGoogleGsiReady;
    var suppressGsiAutoLogin = deps.suppressGsiAutoLogin;
    var gsiLoggingIn = deps.gsiLoggingIn;
    var paginatedHistoryRecords = deps.paginatedHistoryRecords;
    var selectedRecordIds = deps.selectedRecordIds;
    var historyPage = deps.historyPage;
    var historyTotalPages = deps.historyTotalPages;
    var isAdmin = deps.isAdmin;
    var quotaAdjustForm = deps.quotaAdjustForm;
    var showQuotaLedgerModal = deps.showQuotaLedgerModal;
    var showQuotaAdjustModal = deps.showQuotaAdjustModal;
    var quotaAdjustSaving = deps.quotaAdjustSaving;
    var teachersList = deps.teachersList;
    var openQuotaLedger = deps.openQuotaLedger;
    var paperMode = deps.paperMode;
    var isMutualCover = deps.isMutualCover;
    var batchSelectMode = deps.batchSelectMode;
    var ensureDAC = deps.ensureDAC;
    var lookupTeacher = deps.lookupTeacher;
    var getTeacherNameByEmail = deps.getTeacherNameByEmail;
    var emptySlotForm = deps.emptySlotForm;
    var showEmptySlotModal = deps.showEmptySlotModal;
    var detailSubRecord = deps.detailSubRecord;
    var detailRequest = deps.detailRequest;
    var showDetailModal = deps.showDetailModal;
    var pendingRequestData = deps.pendingRequestData;
    var toggleCourseAdjustmentOnly = deps.toggleCourseAdjustmentOnly;
    var isPeriod8FeeLocked = deps.isPeriod8FeeLocked;
    var PERIOD8_FEE = deps.PERIOD8_FEE;
    var batchSubFee = deps.batchSubFee;
    var defaultSubFeeForReason = deps.defaultSubFeeForReason;
    var activeCell = deps.activeCell;
    var inputRequestDate = deps.inputRequestDate;
    var selectedWeekDate = deps.selectedWeekDate;
    var prepCompare = deps.prepCompare;
    var isSubmitting = deps.isSubmitting;
    var mutualDrafts = deps.mutualDrafts;
    var mutualNote = deps.mutualNote;
    var mutualSkipNotify = deps.mutualSkipNotify;
    var loadingMessage = deps.loadingMessage;
    var currentSemester = deps.currentSemester;
    var directApproveMode = deps.directApproveMode;
    var optimisticUpsertRequest = deps.optimisticUpsertRequest;
    var sheetRequestToFront = deps.sheetRequestToFront;
    var deductMutualQuotaForRows = deps.deductMutualQuotaForRows;
    var softRefreshInBackground = deps.softRefreshInBackground;
    var persistMutualPanelDraft = deps.persistMutualPanelDraft;
    var activityBalanceCtx = deps.activityBalanceCtx;
    var ACTIVITY_PUBLIC_FEE = deps.ACTIVITY_PUBLIC_FEE;
    var successModalTitle = deps.successModalTitle;
    var successModalMessage = deps.successModalMessage;
    var hasLineTemplate = deps.hasLineTemplate;
    var lineBatchParts = deps.lineBatchParts;
    var lineCopyText = deps.lineCopyText;
    var showSuccessModal = deps.showSuccessModal;
    var buildLineBatchInviteText = deps.buildLineBatchInviteText;
    var DAC = deps.DAC;
    var successFlowMode = deps.successFlowMode;
    var notificationsSuppressed = deps.notificationsSuppressed;
    var openPaperPrintMutualDrafts = deps.openPaperPrintMutualDrafts;
    var getMutualPanelApi = deps.getMutualPanelApi;
    var userRole = deps.userRole;
    var allSchedules = deps.allSchedules;
    var schoolSwaps = deps.schoolSwaps;
    var classDirectory = deps.classDirectory;
    var classViewSchedules = deps.classViewSchedules;
    var classViewSchoolSwaps = deps.classViewSchoolSwaps;
    var classViewSubstitutionRecords = deps.classViewSubstitutionRecords;
    var classViewClassAwayEvents = deps.classViewClassAwayEvents;
    var classViewLoadedClass = deps.classViewLoadedClass;
    var substitutionRecords = deps.substitutionRecords;
    var homeroomRecords = deps.homeroomRecords;
    var homeroomAssignSelections = deps.homeroomAssignSelections;
    var mySentRequests = deps.mySentRequests;
    var myPendingRequests = deps.myPendingRequests;
    var adminPendingRequests = deps.adminPendingRequests;
    var batchGroupExpanded = deps.batchGroupExpanded;
    var showMatchModal = deps.showMatchModal;
    var showPrintPreviewModal = deps.showPrintPreviewModal;
    var printPreview = deps.printPreview;
    var printPreviewImageBusy = deps.printPreviewImageBusy;
    var proxyTargetEmail = deps.proxyTargetEmail;
    var proxyTargetQuery = deps.proxyTargetQuery;
    var showProxyTargetDropdown = deps.showProxyTargetDropdown;
    var classReadonlyMode = deps.classReadonlyMode;
    var activeTab = deps.activeTab;
    var readStoredTab = deps.readStoredTab;
    var adminSubTab = deps.adminSubTab;
    var readStoredAdminSubTab = deps.readStoredAdminSubTab;
    var _navPersistReady = deps._navPersistReady;
    var persistNavPosition = deps.persistNavPosition;
    var isSimulating = deps.isSimulating;
    var originalUser = deps.originalUser;
    var recomputeRequestBuckets = deps.recomputeRequestBuckets;
    var loadWeeklyData = deps.loadWeeklyData;
    var selectedAdminPendingIds = deps.selectedAdminPendingIds;
    var openPaperPrintDraftForSubmittedRequests = deps.openPaperPrintDraftForSubmittedRequests;
    var paginatedAdminPending = deps.paginatedAdminPending;
    var isAdminPendingSelected = deps.isAdminPendingSelected;
    var _nextDataLoadSeq = deps._nextDataLoadSeq;

const logout = () => {
  loading.value = true;
  const prevEmail = user.value && user.value.email ? user.value.email : '';
  _nextDataLoadSeq();
  if (typeof cancelAll === 'function') cancelAll();
  sessionStorage.removeItem('jcjh_google_id_token');
  clearSWR();
  // 不記憶本站上次帳號：revoke + disableAutoSelect + 清 g_state
  try {
    if (prevEmail && isGsiInitialized() && isGoogleGsiReady() && typeof google.accounts.id.revoke === 'function') {
      google.accounts.id.revoke(String(prevEmail), function () { /* ignore */ });
    }
  } catch (eRev) { /* ignore */ }
  suppressGsiAutoLogin();
  gsiLoggingIn.value = false;
  resetAppState();
  loading.value = false;
};

const readHistoryCheckedIds = () => {
  const ids = [];
  try {
    document.querySelectorAll('.hist-select-cb:checked').forEach((el) => {
      const id = el.getAttribute('data-rec-id') || el.value;
      if (id) ids.push(id);
    });
  } catch (e) { /* ignore */ }
  return ids;
};

const getHistoryPageSelectableIds = () => {
  const ids = [];
  const seen = new Set();
  const add = (id) => {
    if (id == null || String(id) === '') return;
    const key = String(id);
    if (seen.has(key)) return;
    seen.add(key);
    ids.push(key);
  };
  (paginatedHistoryRecords.value || []).forEach(row => {
    if (row && row.displayKind === 'batch') {
      (row.items || []).forEach(item => add(item && item.id));
    } else if (row && row.displayKind === 'item') {
      add(row.id);
    }
  });
  return ids;
};

const setHistorySelection = (ids, on) => {
  const selected = new Set((selectedRecordIds.value || []).map(id => String(id)));
  (ids || []).forEach(id => {
    const key = String(id);
    if (on) selected.add(key);
    else selected.delete(key);
  });
  selectedRecordIds.value = Array.from(selected);
  const idSet = new Set((ids || []).map(id => String(id)));
  try {
    document.querySelectorAll('.hist-select-cb').forEach(el => {
      const id = el.getAttribute('data-rec-id') || el.value;
      if (idSet.has(String(id))) el.checked = on;
    });
    const pageIds = getHistoryPageSelectableIds();
    const pageSelected = pageIds.length > 0 && pageIds.every(id => selected.has(String(id)));
    document.querySelectorAll('.hist-select-all').forEach(el => {
      el.checked = pageSelected;
    });
  } catch (e) { /* ignore */ }
};

const syncHistorySelectionFromDom = () => {
  const checkedIds = readHistoryCheckedIds();
  const renderedIds = [];
  try {
    document.querySelectorAll('.hist-select-cb').forEach(el => {
      const id = el.getAttribute('data-rec-id') || el.value;
      if (id) renderedIds.push(String(id));
    });
  } catch (e) { /* ignore */ }
  const renderedSet = new Set(renderedIds);
  const next = [];
  // 收合批次的子列不在 DOM，保留它們原本的選取狀態。
  (selectedRecordIds.value || []).forEach(id => {
    if (!renderedSet.has(String(id)) && !next.includes(String(id))) next.push(String(id));
  });
  checkedIds.forEach(id => {
    if (!next.includes(String(id))) next.push(String(id));
  });
  selectedRecordIds.value = next;
  const selected = new Set(next);
  const pageIds = getHistoryPageSelectableIds();
  const pageSelected = pageIds.length > 0 && pageIds.every(id => selected.has(String(id)));
  try {
    document.querySelectorAll('.hist-select-all').forEach(el => { el.checked = pageSelected; });
  } catch (eHeader) { /* ignore */ }
};

const toggleSelectAllRecords = (e) => {
  const ids = getHistoryPageSelectableIds();
  if (!ids.length) {
    if (e && e.target) e.target.checked = false;
    return;
  }
  const selected = new Set((selectedRecordIds.value || []).map(id => String(id)));
  const allOn = ids.every(id => selected.has(String(id)));
  const on = e && e.target ? !!e.target.checked : !allOn;
  setHistorySelection(ids, on);
};

const changeHistoryPage = (n) => {
  historyPage.value = Math.max(1, Math.min(n, historyTotalPages.value));
};

const isHistoryRecordSelected = (id) =>
  (selectedRecordIds.value || []).some(selectedId => String(selectedId) === String(id));

const isHistoryBatchGroupSelected = (group) => {
  const ids = (group && group.items || []).map(item => item && item.id).filter(id => id != null).map(String);
  if (!ids.length) return false;
  const selected = new Set((selectedRecordIds.value || []).map(id => String(id)));
  return ids.every(id => selected.has(id));
};

const toggleHistoryBatchGroupSelection = (group, event) => {
  const ids = (group && group.items || []).map(item => item && item.id).filter(id => id != null).map(String);
  if (ids.length) setHistorySelection(ids, !!(event && event.target && event.target.checked));
};

const openManualQuotaAdjust = (teacher) => {
  if (!isAdmin.value) {
    showToast('僅管理員可手動調整額度', 'warning');
    return;
  }
  if (!teacher) return;
  const email = String(teacher.loginEmail || teacher.email || teacher.teacherEmail || '').trim().toLowerCase();
  if (!email) {
    showToast('找不到教師帳號，無法調整額度', 'warning');
    return;
  }
  const rawBalance = teacher.sheetQuota != null ? teacher.sheetQuota
    : (teacher.mutualQuota != null ? teacher.mutualQuota : teacher.balance);
  const balance = Math.max(0, parseFloat(rawBalance) || 0);
  quotaAdjustForm.value = {
    email: email,
    name: String(teacher.name || teacher.teacherName || email),
    balance: balance,
    direction: 'add',
    amount: 1,
    note: ''
  };
  showQuotaLedgerModal.value = false;
  showQuotaAdjustModal.value = true;
};

const saveManualQuotaAdjust = async () => {
  if (!isAdmin.value) {
    showToast('僅管理員可手動調整額度', 'warning');
    return;
  }
  const form = quotaAdjustForm.value;
  const amount = Number(form.amount);
  if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount <= 0) {
    showToast('請輸入大於 0 的整數節數', 'info');
    return;
  }
  const current = Math.max(0, parseFloat(form.balance) || 0);
  const next = Math.round((current + (form.direction === 'subtract' ? -amount : amount)) * 1000) / 1000;
  if (next < 0) {
    showToast('扣除節數不可超過目前餘額', 'warning');
    return;
  }
  const actionText = form.direction === 'subtract' ? '扣除' : '增加';
  const note = String(form.note || '').trim();
  quotaAdjustSaving.value = true;
  try {
    const res = await callGasApi('updateMutualQuotas', {
      list: [{ email: form.email, mutualQuota: next, note: note }]
    });
    if (res && res.success === false) throw new Error(res.message || '後端拒絕額度調整');
    const roster = teachersList.value.slice();
    const index = roster.findIndex((teacher) =>
      [teacher.loginEmail, teacher.email, teacher.teacherEmail].some((value) =>
        value && String(value).trim().toLowerCase() === form.email
      )
    );
    if (index >= 0) {
      roster[index] = Object.assign({}, roster[index], { mutualQuota: next });
      teachersList.value = roster;
    }
    try {
      if (typeof window.__quotaLedgerCacheBust === 'function') window.__quotaLedgerCacheBust();
    } catch (eBust) { /* ignore */ }
    showQuotaAdjustModal.value = false;
    showToast('已' + actionText + ' ' + amount + ' 節，餘額 ' + current + ' → ' + next, 'success');
    await openQuotaLedger({ email: form.email, loginEmail: form.email, name: form.name, mutualQuota: next });
  } catch (e) {
    showToast('額度調整失敗：' + (e && e.message ? e.message : String(e)), 'error');
  } finally {
    quotaAdjustSaving.value = false;
  }
};

const openEmptySlotAssign = async (teacherEmail, dayOfWeek, period, dateStr, cell) => {
  if (paperMode.value && !isAdmin.value) {
    showToast('目前為紙本模式，空堂排班不建立線上申請', 'info');
    return;
  }
  if (!isAdmin.value) {
    showToast('僅教學組可使用空堂排班', 'warning');
    return;
  }
  if (isMutualCover.value) {
    showToast('請先關閉活動互代模式再使用空堂排班', 'info');
    return;
  }
  if (batchSelectMode.value) {
    showToast('請先結束批次選取再使用空堂排班', 'info');
    return;
  }
  const DAC0 = await ensureDAC();
  if (DAC0 && DAC0.isEmptySlotAssignable && cell && !DAC0.isEmptySlotAssignable(cell)) {
    showToast('此格非空堂，無法空堂排班', 'warning');
    return;
  }
  const t = lookupTeacher(teacherEmail);
  const q = t ? (parseFloat(t.mutualQuota) || 0) : 0;
  const isPatrolCell = !!(cell && (cell.isPatrol || cell.attr === '巡堂'));
  const freedBySub = !!(cell && cell.isSubstituted);
  emptySlotForm.value = {
    teacherEmail: String(teacherEmail || '').trim().toLowerCase(),
    teacherName: getTeacherNameByEmail(teacherEmail) || teacherEmail,
    dateStr: String(dateStr || '').slice(0, 10),
    dayOfWeek: parseInt(dayOfWeek, 10) || 1,
    period: parseInt(period, 10) || 1,
    taskName: (isPatrolCell || freedBySub) ? '巡堂' : '',
    className: '',
    note: freedBySub ? '調開／被代後空堂排班' : '',
    quota: q
  };
  showEmptySlotModal.value = true;
};

const openEmptySlotFromDetail = () => {
  const sub = detailSubRecord.value;
  if (!sub || !sub.originalTeacherEmail) {
    showToast('找不到原課老師，無法空堂排班', 'warning');
    return;
  }
  const dateStr = String(sub.date || (detailRequest.value && detailRequest.value.requestDate) || '').slice(0, 10);
  const period = parseInt(sub.period != null ? sub.period : (detailRequest.value && detailRequest.value.requestPeriod), 10) || 0;
  let dayOfWeek = parseInt(sub.dayOfWeek, 10);
  if (!dayOfWeek && dateStr) {
    const d = new Date(dateStr.replace(/-/g, '/'));
    if (!Number.isNaN(d.getTime())) dayOfWeek = d.getDay() === 0 ? 7 : d.getDay();
  }
  if (!dateStr || !Number.isFinite(period)) {
    showToast('缺少日期或節次', 'warning');
    return;
  }
  showDetailModal.value = false;
  openEmptySlotAssign(
    sub.originalTeacherEmail,
    dayOfWeek || 1,
    period,
    dateStr,
    { isSubstituted: true }
  );
};

const onLeaveReasonChange = () => {
  const pending = pendingRequestData.value;
  if (!pending) return;
  const mode = pending.mode;
  if (mode !== 'substitution' && mode !== 'exchange') return;
  if (String(pending.reason || '').trim() === '課務調整') {
    toggleCourseAdjustmentOnly({ target: { checked: true } });
    return;
  }
  if (mode !== 'substitution' || pending.courseAdjustmentOnly) return;
  if (isPeriod8FeeLocked.value) {
    pending.subFee = PERIOD8_FEE;
    batchSubFee.value = PERIOD8_FEE;
    return;
  }
  if (isMutualCover.value) return;
  const reason = pending.reason;
  if (!reason) return;
  pendingRequestData.value.subFee = defaultSubFeeForReason(reason);
  batchSubFee.value = pendingRequestData.value.subFee;
};

const previewMutualDraft = (d) => {
  if (!d || !d.subEmail) return;
  activeCell.value = {
    teacherEmail: d.leaveEmail,
    teacherName: d.leaveName,
    dayOfWeek: d.dayOfWeek,
    period: d.period,
    classData: {
      className: d.className || '',
      subject: d.subject || '',
      restriction: d.restriction || ''
    }
  };
  inputRequestDate.value = d.dateStr;
  selectedWeekDate.value = d.dateStr;
  prepCompare('substitution', d.subEmail);
};

const submitAllMutualDrafts = async () => {
  if (isSubmitting.value || loading.value) {
    showToast('申請送出中，請稍候…', 'info');
    return;
  }
  // 2B 懶載：送出前確保互代模組已載入
  if (!UiMutualSubmit && typeof window.ensureUiMutual === 'function') {
    try { await window.ensureUiMutual(); } catch (e) { /* ignore，沿用下方提示 */ }
  }
  if (!UiMutualSubmit) {
    showToast('送出模組未載入', 'error');
    return;
  }
  await UiMutualSubmit.submitAllMutualDrafts({
    isMutualCover, mutualDrafts, mutualNote, mutualSkipNotify,
    showConfirm, showToast, loading, loadingMessage, isSubmitting, currentSemester,
    isAdmin, directApproveMode, callGasApi, optimisticUpsertRequest, sheetRequestToFront,
    deductMutualQuotaForRows, softRefreshInBackground, persistMutualPanelDraft, activityBalanceCtx,
    PERIOD8_FEE, ACTIVITY_PUBLIC_FEE, successModalTitle, successModalMessage,
     hasLineTemplate, lineBatchParts, lineCopyText, showSuccessModal, buildLineBatchInviteText, DAC,
      successFlowMode, paperMode, notificationsSuppressed,
     openPaperPrintMutualDrafts: function () { return openPaperPrintMutualDrafts(); }
   });
};

const toggleMutualCover = async () => {
  if (!isMutualCover.value) await ensureDAC();
  const a = getMutualPanelApi();
  if (a) a.toggleMutualCover();
};

const resetAppState = () => {
  user.value = null;
  userRole.value = 'teacher';
  // 登出不強制改分頁；重整／再登入仍依 localStorage 還原上次位置
  teachersList.value = [];
  allSchedules.value = [];
   schoolSwaps.value = [];
  classDirectory.value = [];
  classViewSchedules.value = [];
  classViewSchoolSwaps.value = [];
  classViewSubstitutionRecords.value = [];
  classViewClassAwayEvents.value = [];
  classViewLoadedClass.value = '';
  substitutionRecords.value = [];
  homeroomRecords.value = [];
  homeroomAssignSelections.value = {};
   mySentRequests.value = [];
   myPendingRequests.value = [];
   adminPendingRequests.value = [];
   batchGroupExpanded.value = {};
   showMatchModal.value = false;
   showPrintPreviewModal.value = false;
  printPreview.value = null;
  printPreviewImageBusy.value = false;
  proxyTargetEmail.value = '';
  proxyTargetQuery.value = '';
  showProxyTargetDropdown.value = false;
};

const restoreNavAfterLogin = () => {
  if (classReadonlyMode.value) {
    activeTab.value = 'class';
    return;
  }
  let tab = readStoredTab();
  if (tab === 'admin' && userRole.value !== 'admin') tab = 'timetable';
  activeTab.value = tab;
  adminSubTab.value = readStoredAdminSubTab();
  _navPersistReady = true;
  persistNavPosition();
};

const devSwitchUser = (email) => {
  if (!isAdmin.value && !isSimulating.value) return;
  if (originalUser.value && email === originalUser.value.email) {
    restoreAdmin();
    return;
  }
  const match = lookupTeacher(email);
  if (match) {
    if (!originalUser.value) {
      originalUser.value = { email: user.value.email, role: userRole.value };
    }
    user.value = {
      email: match.email,
      displayName: match.name + ' (模擬)',
      photoURL: 'https://www.gstatic.com/images/branding/product/1x/avatar_circle_blue_512dp.png'
    };
    const raw = match.role || 'teacher';
    userRole.value = (FieldMap && FieldMap.normalizeTeacherRole)
      ? FieldMap.normalizeTeacherRole(raw, match.jobTitle)
      : ((FieldMap && FieldMap.normalizeRole) ? FieldMap.normalizeRole(raw) : raw);
    proxyTargetEmail.value = '';
    // 先用目前已載入的全量資料，依「被模擬者 Email」重算待辦／送出列表
    recomputeRequestBuckets();
    loadWeeklyData().catch(function () {});
  }
};

const restoreAdmin = () => {
  if (!originalUser.value) return;
  user.value = {
    email: originalUser.value.email,
    displayName: '管理員 (已還原)',
    photoURL: 'https://www.gstatic.com/images/branding/product/1x/avatar_circle_blue_512dp.png'
  };
  userRole.value = originalUser.value.role;
  originalUser.value = null;
  proxyTargetEmail.value = '';
  recomputeRequestBuckets();
   loadWeeklyData().catch(function () {});
};

const openBatchPendingPrintPreview = () => {
  const ids = (selectedAdminPendingIds.value || []).map(id => String(id));
  if (!ids.length) {
    showToast('請先勾選要預覽列印的申請單', 'warning');
    return false;
  }
  const requests = (adminPendingRequests.value || []).filter(request =>
    request && ids.includes(String(request.id))
  );
  if (!requests.length) {
    showToast('找不到已勾選的待核准申請單', 'warning');
    return false;
  }
  return openPaperPrintDraftForSubmittedRequests(requests);
};

const isAdminPendingPageFullySelected = () => {
  const ids = [];
  (paginatedAdminPending.value || []).forEach(row => {
    if (row && row.displayKind === 'batch') {
      (row.items || []).forEach(item => {
        if (item && item.id != null) ids.push(item.id);
      });
    } else if (row && row.displayKind === 'item' && row.id != null) {
      ids.push(row.id);
    }
  });
  return ids.length > 0 && ids.every(id => isAdminPendingSelected(id));
};

const emptySlotQuotaZero = computed(() => {
  const DAC0 = DAC();
  if (DAC0 && DAC0.quotaZeroNeedsRepay) {
    return DAC0.quotaZeroNeedsRepay(emptySlotForm.value.quota);
  }
  return (parseInt(emptySlotForm.value.quota, 10) || 0) <= 0;
});





    return {
      logout: logout,
      readHistoryCheckedIds: readHistoryCheckedIds,
      getHistoryPageSelectableIds: getHistoryPageSelectableIds,
      setHistorySelection: setHistorySelection,
      syncHistorySelectionFromDom: syncHistorySelectionFromDom,
      toggleSelectAllRecords: toggleSelectAllRecords,
      changeHistoryPage: changeHistoryPage,
      isHistoryRecordSelected: isHistoryRecordSelected,
      isHistoryBatchGroupSelected: isHistoryBatchGroupSelected,
      toggleHistoryBatchGroupSelection: toggleHistoryBatchGroupSelection,
      openManualQuotaAdjust: openManualQuotaAdjust,
      saveManualQuotaAdjust: saveManualQuotaAdjust,
      openEmptySlotAssign: openEmptySlotAssign,
      openEmptySlotFromDetail: openEmptySlotFromDetail,
      onLeaveReasonChange: onLeaveReasonChange,
      previewMutualDraft: previewMutualDraft,
      submitAllMutualDrafts: submitAllMutualDrafts,
      toggleMutualCover: toggleMutualCover,
      resetAppState: resetAppState,
      restoreNavAfterLogin: restoreNavAfterLogin,
      devSwitchUser: devSwitchUser,
      restoreAdmin: restoreAdmin,
      openBatchPendingPrintPreview: openBatchPendingPrintPreview,
      isAdminPendingPageFullySelected: isAdminPendingPageFullySelected,      emptySlotQuotaZero: emptySlotQuotaZero,

    };
  }
  return { create: create };
})();

export { UiBackoffice };
