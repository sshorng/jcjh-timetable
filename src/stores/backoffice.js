/** v2 stores/backoffice.js — 由 v1 setup() §分節機械分解（gen-final.cjs）。 */
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import FieldMap from '../domain/field-map.js';
import { UiClassAwayAdmin } from '../modules/ui-activity.js';
import { UiBackoffice } from '../modules/ui-backoffice.js';
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
const getBackofficeApi = () => {
      if (_backofficeApi) return _backofficeApi;
      if (!UiBackoffice) {
        console.error('UiBackoffice 未載入');
        return null;
      }
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

    const logout = (...args) => {
      const b = getBackofficeApi();
      return b ? b.logout(...args) : undefined;
    };
    const toggleSelectAllRecords = (...args) => {
      const b = getBackofficeApi();
      return b ? b.toggleSelectAllRecords(...args) : undefined;
    };
    const isHistoryRecordSelected = (...args) => {
      const b = getBackofficeApi();
      return b ? b.isHistoryRecordSelected(...args) : false;
    };
    const isHistoryBatchGroupSelected = (...args) => {
      const b = getBackofficeApi();
      return b ? b.isHistoryBatchGroupSelected(...args) : false;
    };
    const toggleHistoryBatchGroupSelection = (...args) => {
      const b = getBackofficeApi();
      return b ? b.toggleHistoryBatchGroupSelection(...args) : undefined;
    };
    const changeHistoryPage = (...args) => {
      const b = getBackofficeApi();
      return b ? b.changeHistoryPage(...args) : undefined;
    };
    const openBatchPendingPrintPreview = (...args) => {
      const b = getBackofficeApi();
      return b ? b.openBatchPendingPrintPreview(...args) : undefined;
    };
    const isAdminPendingPageFullySelected = (...args) => {
      const b = getBackofficeApi();
      return b ? b.isAdminPendingPageFullySelected(...args) : false;
    };
    const syncHistorySelectionFromDom = (...args) => {
      const b = getBackofficeApi();
      return b ? b.syncHistorySelectionFromDom(...args) : undefined;
    };
    const openManualQuotaAdjust = (...args) => {
      const a = getBackofficeApi();
      return a ? a.openManualQuotaAdjust(...args) : undefined;
    };
    const saveManualQuotaAdjust = (...args) => {
      const a = getBackofficeApi();
      return a ? a.saveManualQuotaAdjust(...args) : undefined;
    };
    const openEmptySlotAssign = (...args) => {
      const a = getBackofficeApi();
      return a ? a.openEmptySlotAssign(...args) : undefined;
    };
    const openEmptySlotFromDetail = (...args) => {
      const a = getBackofficeApi();
      return a ? a.openEmptySlotFromDetail(...args) : undefined;
    };
    const onLeaveReasonChange = (...args) => {
      const a = getBackofficeApi();
      return a ? a.onLeaveReasonChange(...args) : undefined;
    };
    const previewMutualDraft = (...args) => {
      const a = getBackofficeApi();
      return a ? a.previewMutualDraft(...args) : undefined;
    };
    const submitAllMutualDrafts = (...args) => {
      const a = getBackofficeApi();
      return a ? a.submitAllMutualDrafts(...args) : undefined;
    };
    const toggleMutualCover = (...args) => {
      const a = getBackofficeApi();
      return a ? a.toggleMutualCover(...args) : undefined;
    };
    const resetAppState = (...args) => {
      const a = getBackofficeApi();
      return a ? a.resetAppState(...args) : undefined;
    };
    const restoreNavAfterLogin = (...args) => {
      const a = getBackofficeApi();
      return a ? a.restoreNavAfterLogin(...args) : undefined;
    };
    const devSwitchUser = (...args) => {
      const a = getBackofficeApi();
      return a ? a.devSwitchUser(...args) : undefined;
    };
    const restoreAdmin = (...args) => {
      const a = getBackofficeApi();
      return a ? a.restoreAdmin(...args) : undefined;
    };
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
