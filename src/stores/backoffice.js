/** v2 stores/backoffice.js — 由 v1 setup() §分節機械分解（gen-final.cjs）。 */
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import FieldMap from '../domain/field-map.js';
import { UiClassAwayAdmin } from '../modules/ui-activity.js';
import { UiLineTemplate } from '../modules/ui-line-template.js';
import { UiMutualPanelState } from '../modules/ui-mutual.js';
import { showConfirm, showToast } from '../ui/toast.js';
import { useAdminStore } from './admin.js';
import { useDataStore } from './data.js';
import { useGasStore } from './gas.js';
import { useInteractionStore } from './interaction.js';
import { useMutualStore } from './mutual.js';
import { useOutputStore } from './output.js';
import { useRequestsStore } from './requests.js';
import { useSessionStore } from './session.js';
import { useSubmitStore } from './submit.js';
import { useTimetableStore } from './timetable.js';
import { useTourStore } from './tour.js';
import { storeToRefs } from 'pinia';
export const useBackofficeStore = defineStore('backoffice', () => {
  const { buildLineBatchInviteText } = UiLineTemplate;
    const isSimulating = computed(() => !!storeToRefs(useSessionStore()).originalUser.value);
    let _backofficeApi = null;
    const closeEmptySlotModal = () => {
      storeToRefs(useDataStore()).showEmptySlotModal.value = false;
    };
    const PUBLIC_FEE_REASONS = ['公假', '婚假', '喪假', '產假', '產前假/分娩假', '身心調適假'];
    const isPublicFeeReason = (reason) => {
      const r = String(reason || '').trim();
      if (!r) return false;
      if (PUBLIC_FEE_REASONS.includes(r)) return true;
      // 相容舊資料：公差、分娩假
      if (r.includes('公假') || r.includes('公差') || r.includes('婚假') || r.includes('喪假')) return true;
      if (r.includes('產假') || r.includes('分娩') || r.includes('產前') || r.includes('身心調適')) return true;
      return false;
    };
    const defaultSubFeeForReason = (reason) => {
      if (storeToRefs(useTimetableStore()).isPeriod8FeeLocked.value) return useTourStore().PERIOD8_FEE;
      if (storeToRefs(useTourStore()).isMutualCover.value) return useTourStore().ACTIVITY_PUBLIC_FEE;
      return isPublicFeeReason(reason) ? '公費代課' : '自費代課';
    };
    const getHistoryEditDefaultSubFee = (reason, period) => {
      if (parseInt(period, 10) === 8) return useTourStore().PERIOD8_FEE;
      return isPublicFeeReason(reason) ? '公費代課' : '自費代課';
    };
    const mutualDraftKey = (leaveEmail, dateStr, period) =>
      (UiMutualPanelState && UiMutualPanelState.mutualDraftKey)
        ? UiMutualPanelState.mutualDraftKey(leaveEmail, dateStr, period)
        : (String(leaveEmail || '').toLowerCase() + '|' + dateStr + '|' + period);
    const changePendingPage = (section, n) => {
      const maxPages = { pending: storeToRefs(useTimetableStore()).pendingMyPendingTotal, sent: storeToRefs(useTimetableStore()).pendingMySentTotal, admin: storeToRefs(useTimetableStore()).pendingAdminTotal };
      const refs = { pending: storeToRefs(useTimetableStore()).pendingMyPendingPage, sent: storeToRefs(useTimetableStore()).pendingMySentPage, admin: storeToRefs(useTimetableStore()).pendingAdminPage };
      const max = maxPages[section].value;
      refs[section].value = Math.max(1, Math.min(n, max));
    };
    const closeSuccessGoPending = () => {
      storeToRefs(useMutualStore()).showSuccessModal.value = false;
      storeToRefs(useSessionStore()).activeTab.value = 'pending';
    };
    const closeSuccessGoRecords = () => {
      storeToRefs(useMutualStore()).showSuccessModal.value = false;
      storeToRefs(useSessionStore()).activeTab.value = 'records';
      storeToRefs(useSessionStore()).showMatchModal.value = false;
      storeToRefs(useMutualStore()).showCompareModal.value = false;
    };
    const closeSuccessStayTimetable = () => {
      storeToRefs(useMutualStore()).showSuccessModal.value = false;
      storeToRefs(useSessionStore()).activeTab.value = 'timetable';
      storeToRefs(useSessionStore()).showMatchModal.value = false;
      storeToRefs(useMutualStore()).showCompareModal.value = false;
    };
    const closeSuccessCopyLine = async () => {
      if (storeToRefs(useMutualStore()).hasLineTemplate.value && storeToRefs(useMutualStore()).lineCopyText.value) {
        await useMutualStore().copyLineMessage();
      }
      // 保持 Modal 開啟或關閉皆可；複製後仍可選其他按鈕
    };
const ensureUiBackofficeApi = async () => {
      if (_backofficeApi) return _backofficeApi;
      // ui-backoffice.js 改動態載入：首次操作才抓 chunk，不進首屏主包。
      // 呼叫端一律經 needUiBackoffice（失敗會 toast）；三個同步查詢已內聯至殼層，不受影響。
      const { UiBackoffice } = await import('../modules/ui-backoffice.js');
      _backofficeApi = UiBackoffice.create({
        computed, loading: storeToRefs(useSessionStore()).loading, user: storeToRefs(useSessionStore()).user, cancelAll: useGasStore().cancelAll, callGasApi: useGasStore().callGasApi, clearSWR: useGasStore().clearSWR, isGsiInitialized: useSessionStore().isGsiInitialized, isGoogleGsiReady: useSessionStore().isGoogleGsiReady,
        suppressGsiAutoLogin: useSessionStore().suppressGsiAutoLogin, gsiLoggingIn: storeToRefs(useSessionStore()).gsiLoggingIn, paginatedHistoryRecords: storeToRefs(useTimetableStore()).paginatedHistoryRecords, selectedRecordIds: storeToRefs(useMutualStore()).selectedRecordIds,
        historyPage: storeToRefs(useMutualStore()).historyPage, historyTotalPages: storeToRefs(useTimetableStore()).historyTotalPages, isAdmin: storeToRefs(useSessionStore()).isAdmin, quotaAdjustForm: storeToRefs(useAdminStore()).quotaAdjustForm, showQuotaLedgerModal: storeToRefs(useAdminStore()).showQuotaLedgerModal,
        showQuotaAdjustModal: storeToRefs(useAdminStore()).showQuotaAdjustModal, quotaAdjustSaving: storeToRefs(useAdminStore()).quotaAdjustSaving, teachersList: storeToRefs(useSessionStore()).teachersList, openQuotaLedger: useAdminStore().openQuotaLedger,
        paperMode: storeToRefs(useSubmitStore()).paperMode, isMutualCover: storeToRefs(useTourStore()).isMutualCover, batchSelectMode: storeToRefs(useTourStore()).batchSelectMode, ensureDAC: useTourStore().ensureDAC, lookupTeacher: useDataStore().lookupTeacher,
        getTeacherNameByEmail: useDataStore().getTeacherNameByEmail, emptySlotForm: storeToRefs(useDataStore()).emptySlotForm, showEmptySlotModal: storeToRefs(useDataStore()).showEmptySlotModal, detailSubRecord: storeToRefs(useMutualStore()).detailSubRecord,
        detailRequest: storeToRefs(useMutualStore()).detailRequest, showDetailModal: storeToRefs(useMutualStore()).showDetailModal, pendingRequestData: storeToRefs(useMutualStore()).pendingRequestData, toggleCourseAdjustmentOnly: useSubmitStore().toggleCourseAdjustmentOnly,
        isPeriod8FeeLocked: storeToRefs(useTimetableStore()).isPeriod8FeeLocked, PERIOD8_FEE: useTourStore().PERIOD8_FEE, batchSubFee: storeToRefs(useTourStore()).batchSubFee, defaultSubFeeForReason,
        activeCell: storeToRefs(useTourStore()).activeCell, inputRequestDate: storeToRefs(useTourStore()).inputRequestDate, selectedWeekDate: storeToRefs(useSessionStore()).selectedWeekDate, prepCompare: useSubmitStore().prepCompare, isSubmitting: storeToRefs(useMutualStore()).isSubmitting,
        mutualDrafts: storeToRefs(useTourStore()).mutualDrafts, mutualNote: storeToRefs(useTourStore()).mutualNote, mutualSkipNotify: storeToRefs(useTourStore()).mutualSkipNotify, loadingMessage: storeToRefs(useSessionStore()).loadingMessage, currentSemester: storeToRefs(useSessionStore()).currentSemester,
        directApproveMode: storeToRefs(useDataStore()).directApproveMode, optimisticUpsertRequest: useDataStore().optimisticUpsertRequest, sheetRequestToFront: FieldMap.mapRequest,
        deductMutualQuotaForRows: useSubmitStore().deductMutualQuotaForRows, softRefreshInBackground: useDataStore().softRefreshInBackground, persistMutualPanelDraft: useMutualStore().persistMutualPanelDraft,
        activityBalanceCtx: useMutualStore().activityBalanceCtx, ACTIVITY_PUBLIC_FEE: useTourStore().ACTIVITY_PUBLIC_FEE, successModalTitle: storeToRefs(useMutualStore()).successModalTitle, successModalMessage: storeToRefs(useMutualStore()).successModalMessage,
        hasLineTemplate: storeToRefs(useMutualStore()).hasLineTemplate, lineBatchParts: storeToRefs(useMutualStore()).lineBatchParts, lineCopyText: storeToRefs(useMutualStore()).lineCopyText, showSuccessModal: storeToRefs(useMutualStore()).showSuccessModal,
        buildLineBatchInviteText, DAC: useTourStore().DAC, successFlowMode: storeToRefs(useMutualStore()).successFlowMode, notificationsSuppressed: storeToRefs(useSubmitStore()).notificationsSuppressed,
        openPaperPrintMutualDrafts: useOutputStore().openPaperPrintMutualDrafts, getMutualPanelApi: useMutualStore().getMutualPanelApi, userRole: storeToRefs(useSessionStore()).userRole, allSchedules: storeToRefs(useSessionStore()).allSchedules,
        schoolSwaps: storeToRefs(useSessionStore()).schoolSwaps, classDirectory: storeToRefs(useMutualStore()).classDirectory, classViewSchedules: storeToRefs(useMutualStore()).classViewSchedules, classViewSchoolSwaps: storeToRefs(useMutualStore()).classViewSchoolSwaps,
        classViewSubstitutionRecords: storeToRefs(useMutualStore()).classViewSubstitutionRecords, classViewClassAwayEvents: storeToRefs(useMutualStore()).classViewClassAwayEvents, classViewLoadedClass: storeToRefs(useMutualStore()).classViewLoadedClass,
        substitutionRecords: storeToRefs(useSessionStore()).substitutionRecords, homeroomRecords: storeToRefs(useSessionStore()).homeroomRecords, homeroomAssignSelections: storeToRefs(useSessionStore()).homeroomAssignSelections, mySentRequests: storeToRefs(useTourStore()).mySentRequests,
        myPendingRequests: storeToRefs(useTourStore()).myPendingRequests, adminPendingRequests: storeToRefs(useTourStore()).adminPendingRequests, batchGroupExpanded: storeToRefs(useTimetableStore()).batchGroupExpanded, showMatchModal: storeToRefs(useSessionStore()).showMatchModal,
        showPrintPreviewModal: storeToRefs(useMutualStore()).showPrintPreviewModal, printPreview: storeToRefs(useMutualStore()).printPreview, printPreviewImageBusy: storeToRefs(useMutualStore()).printPreviewImageBusy, proxyTargetEmail: storeToRefs(useSessionStore()).proxyTargetEmail,
        proxyTargetQuery: storeToRefs(useSessionStore()).proxyTargetQuery, showProxyTargetDropdown: storeToRefs(useSessionStore()).showProxyTargetDropdown, classReadonlyMode: storeToRefs(useMutualStore()).classReadonlyMode, activeTab: storeToRefs(useSessionStore()).activeTab,
        readStoredTab: useSessionStore().readStoredTab, adminSubTab: storeToRefs(useSessionStore()).adminSubTab, readStoredAdminSubTab: useSessionStore().readStoredAdminSubTab, _navPersistReady: useSessionStore()._navPersistReady,
        persistNavPosition: useSessionStore().persistNavPosition, isSimulating, originalUser: storeToRefs(useSessionStore()).originalUser, recomputeRequestBuckets: useDataStore().recomputeRequestBuckets,
        loadWeeklyData: useDataStore().loadWeeklyData, selectedAdminPendingIds: storeToRefs(useRequestsStore()).selectedAdminPendingIds, openPaperPrintDraftForSubmittedRequests: useOutputStore().openPaperPrintDraftForSubmittedRequests,
        paginatedAdminPending: storeToRefs(useTimetableStore()).paginatedAdminPending, isAdminPendingSelected: useRequestsStore().isAdminPendingSelected,
        _nextDataLoadSeq: () => useDataStore().nextDataLoadSeq(),
        ref, callGasApiWithProgress: useSessionStore().callGasApiWithProgress, showImportTeachersModal: storeToRefs(useAdminStore()).showImportTeachersModal, teacherExcelData: storeToRefs(useAdminStore()).teacherExcelData, teacherExcelHeaders: storeToRefs(useAdminStore()).teacherExcelHeaders, teacherMappingFields: storeToRefs(useAdminStore()).teacherMappingFields, teacherImportPreview: storeToRefs(useAdminStore()).teacherImportPreview, showScheduleEditModal: storeToRefs(useAdminStore()).showScheduleEditModal, scheduleForm: storeToRefs(useAdminStore()).scheduleForm, showTeacherModal: storeToRefs(useAdminStore()).showTeacherModal, teacherModalMode: storeToRefs(useAdminStore()).teacherModalMode, teacherForm: storeToRefs(useAdminStore()).teacherForm, showOvertimePlanModal: storeToRefs(useAdminStore()).showOvertimePlanModal, overtimePlanTeacher: storeToRefs(useAdminStore()).overtimePlanTeacher, overtimePlanRows: storeToRefs(useAdminStore()).overtimePlanRows, overtimePlanPeriodEnd: storeToRefs(useAdminStore()).overtimePlanPeriodEnd, overtimePlanUsesFixedSlots: storeToRefs(useAdminStore()).overtimePlanUsesFixedSlots, showTeacherExpenseAuditModal: storeToRefs(useAdminStore()).showTeacherExpenseAuditModal, teacherExpenseAuditRows: storeToRefs(useAdminStore()).teacherExpenseAuditRows, teacherExpenseAuditSummary: storeToRefs(useAdminStore()).teacherExpenseAuditSummary, accountingPeriod: storeToRefs(useDataStore()).accountingPeriod, reportMonth: storeToRefs(useDataStore()).reportMonth, accountingPlanOptions: storeToRefs(useTimetableStore()).accountingPlanOptions, excelData: storeToRefs(useAdminStore()).excelData, excelHeaders: storeToRefs(useAdminStore()).excelHeaders, mappingFields: storeToRefs(useAdminStore()).mappingFields, importPreview: storeToRefs(useAdminStore()).importPreview, bindFlagModal: useInteractionStore().bindFlagModal, showHistoryEditModal: storeToRefs(useDataStore()).showHistoryEditModal, semesterStartDate: storeToRefs(useSessionStore()).semesterStartDate, semesterEndDate: storeToRefs(useSessionStore()).semesterEndDate, leaveReasonOptions: useAdminStore().leaveReasonOptions, getHistoryEditDefaultSubFee, historyEditForm: storeToRefs(useDataStore()).historyEditForm, requestsList: storeToRefs(useSessionStore()).requestsList, fetchMutualQuotaLedger: useGasStore().fetchMutualQuotaLedger, _quotaLedgerCache: useAdminStore()._quotaLedgerCache, QUOTA_LEDGER_CACHE_MS: useAdminStore().QUOTA_LEDGER_CACHE_MS, quotaLedgerTeacher: storeToRefs(useAdminStore()).quotaLedgerTeacher, quotaLedgerRows: storeToRefs(useAdminStore()).quotaLedgerRows, quotaLedgerLoading: storeToRefs(useAdminStore()).quotaLedgerLoading,
      });
      return _backofficeApi;
    };
    const getBackofficeApi = () => ensureUiBackofficeApi();
    const needUiBackoffice = async (fnName, ...args) => {
      try {
        const api = await ensureUiBackofficeApi();
        if (!api || typeof api[fnName] !== 'function') {
          showToast('後台功能未就緒', 'error');
          return;
        }
        return await api[fnName](...args);
      } catch (e) {
        showToast((e && e.message) || '後台模組載入失敗', 'error');
      }
    };

    const logout = (...a) => needUiBackoffice('logout', ...a);
    const toggleSelectAllRecords = (...a) => needUiBackoffice('toggleSelectAllRecords', ...a);
    // 以下三個查詢為同步渲染用（模板直接讀回傳值），不可改非同步：
    // 邏輯原在 UiBackoffice，皆為純謂詞，內聯至殼層（讀同一 refs，逐字一致）。
    const isHistoryRecordSelected = (id) =>
      (storeToRefs(useMutualStore()).selectedRecordIds.value || []).some(selectedId => String(selectedId) === String(id));
    const isHistoryBatchGroupSelected = (group) => {
      const ids = (group && group.items || []).map(item => item && item.id).filter(id => id != null).map(String);
      if (!ids.length) return false;
      const selected = new Set((storeToRefs(useMutualStore()).selectedRecordIds.value || []).map(id => String(id)));
      return ids.every(id => selected.has(id));
    };
    const toggleHistoryBatchGroupSelection = (...a) => needUiBackoffice('toggleHistoryBatchGroupSelection', ...a);
    const changeHistoryPage = (...a) => needUiBackoffice('changeHistoryPage', ...a);
    const openBatchPendingPrintPreview = (...a) => needUiBackoffice('openBatchPendingPrintPreview', ...a);
    const isAdminPendingPageFullySelected = () => {
      const ids = [];
      (storeToRefs(useTimetableStore()).paginatedAdminPending.value || []).forEach(row => {
        if (row && row.displayKind === 'batch') {
          (row.items || []).forEach(item => {
            if (item && item.id != null) ids.push(item.id);
          });
        } else if (row && row.displayKind === 'item' && row.id != null) {
          ids.push(row.id);
        }
      });
      const isAdminPendingSelected = useRequestsStore().isAdminPendingSelected;
      return ids.length > 0 && ids.every(id => isAdminPendingSelected(id));
    };
    const syncHistorySelectionFromDom = (...a) => needUiBackoffice('syncHistorySelectionFromDom', ...a);
    const openManualQuotaAdjust = (...a) => needUiBackoffice('openManualQuotaAdjust', ...a);
    const saveManualQuotaAdjust = (...a) => needUiBackoffice('saveManualQuotaAdjust', ...a);
    const openEmptySlotAssign = (...a) => needUiBackoffice('openEmptySlotAssign', ...a);
    const openEmptySlotFromDetail = (...a) => needUiBackoffice('openEmptySlotFromDetail', ...a);
    const onLeaveReasonChange = (...a) => needUiBackoffice('onLeaveReasonChange', ...a);
    const previewMutualDraft = (...a) => needUiBackoffice('previewMutualDraft', ...a);
    const submitAllMutualDrafts = (...a) => needUiBackoffice('submitAllMutualDrafts', ...a);
    const toggleMutualCover = (...a) => needUiBackoffice('toggleMutualCover', ...a);
    const resetAppState = (...a) => needUiBackoffice('resetAppState', ...a);
    const restoreNavAfterLogin = (...a) => needUiBackoffice('restoreNavAfterLogin', ...a);
    const devSwitchUser = (...a) => needUiBackoffice('devSwitchUser', ...a);
    const restoreAdmin = (...a) => needUiBackoffice('restoreAdmin', ...a);
const {
      showClassAwayModal, classAwayModalMode, classAwayPeriodOptions, classAwayForm,
      openAddClassAwayModal, openEditClassAwayModal, toggleClassAwayFormClass,
      isClassAwayFormClassSelected, selectClassAwayGrade,
      toggleClassAwayPeriod, isClassAwayPeriodSelected, selectClassAwayPeriodRange,
      setClassAwayPeriodBoundary, setClassAwayPeriodMode,
      clearClassAwayPeriods, isClassAwayFullDaySelected, classAwayPeriodLabel,
      classAwayDailyPeriodLabel, classAwayBoundaryPeriodLabel, isClassAwayRangeEvent,
      saveClassAwayEvent, deleteClassAwayEvent
    } = UiClassAwayAdmin.create({
      ref,
      callGasApi: useGasStore().callGasApi,
      showToast,
      showConfirm,
      classAwayEvents: storeToRefs(useSessionStore()).classAwayEvents,
      classList: storeToRefs(useMutualStore()).classList,
      currentSemester: storeToRefs(useSessionStore()).currentSemester,
      loading: storeToRefs(useSessionStore()).loading,
      clearScheduleCache: useTimetableStore().clearScheduleCache,
      softRefreshInBackground: useDataStore().softRefreshInBackground
    });


  return { isSimulating, closeEmptySlotModal, PUBLIC_FEE_REASONS, isPublicFeeReason, defaultSubFeeForReason, getHistoryEditDefaultSubFee, mutualDraftKey, changePendingPage, closeSuccessGoPending, closeSuccessGoRecords, closeSuccessStayTimetable, closeSuccessCopyLine, getBackofficeApi, showClassAwayModal, classAwayModalMode, classAwayPeriodOptions, classAwayForm, openAddClassAwayModal, openEditClassAwayModal, toggleClassAwayFormClass, isClassAwayFormClassSelected, selectClassAwayGrade, toggleClassAwayPeriod, isClassAwayPeriodSelected, selectClassAwayPeriodRange, setClassAwayPeriodBoundary, setClassAwayPeriodMode, clearClassAwayPeriods, isClassAwayFullDaySelected, classAwayPeriodLabel, classAwayDailyPeriodLabel, classAwayBoundaryPeriodLabel, isClassAwayRangeEvent, saveClassAwayEvent, deleteClassAwayEvent, logout, toggleSelectAllRecords, isHistoryRecordSelected, isHistoryBatchGroupSelected, toggleHistoryBatchGroupSelection, changeHistoryPage, openBatchPendingPrintPreview, isAdminPendingPageFullySelected, syncHistorySelectionFromDom, openManualQuotaAdjust, saveManualQuotaAdjust, openEmptySlotAssign, openEmptySlotFromDetail, onLeaveReasonChange, previewMutualDraft, submitAllMutualDrafts, toggleMutualCover, resetAppState, restoreNavAfterLogin, devSwitchUser, restoreAdmin };
});
