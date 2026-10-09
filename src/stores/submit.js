/** v2 stores/submit.js — 由 v1 setup() §分節機械分解（gen-final.cjs）。 */
import { defineStore } from 'pinia';
import { computed, watch } from 'vue';
import DateUtils from '../domain/date-utils.js';
import DomainSchedule from '../domain/domain-schedule.js';
import FieldMap from '../domain/field-map.js';
import { UiBatchPanel } from '../modules/ui-activity.js';
import { UiLineTemplate } from '../modules/ui-line-template.js';
import { UiSubmit } from '../modules/ui-submit.js';
import { showConfirm, showToast } from '../ui/toast.js';
import { useBackofficeStore } from './backoffice.js';
import { useDataStore } from './data.js';
import { useGasStore } from './gas.js';
import { useHomeroomStore } from './homeroom.js';
import { useMatchStore } from './match.js';
import { useMutualStore } from './mutual.js';
import { useOutputStore } from './output.js';
import { useSessionStore } from './session.js';
import { useTimetableStore } from './timetable.js';
import { useTourStore } from './tour.js';
import { storeToRefs } from 'pinia';
export const useSubmitStore = defineStore('submit', () => {
  const { buildAskFirstLineText, buildLineBatchInviteText, buildLineInviteText, getLineHandledSlot, shortTeacherName } = UiLineTemplate;
    const compareWeekDatesA = computed(() => {
      const a = getSubmitApi();
      return a ? a.compareWeekDatesA.value : [];
    });
    const compareWeekDatesB = computed(() => {
      const a = getSubmitApi();
      return a ? a.compareWeekDatesB.value : [];
    });
    const notificationsSuppressed = computed(() => !storeToRefs(useSessionStore()).onlineSubstitutionEnabled.value);
    const paperMode = computed(() => notificationsSuppressed.value && !storeToRefs(useSessionStore()).isAdmin.value);
    const getLeaveTimeDefaults = (leaveEmail) => {
      const t = useDataStore().lookupTeacher(leaveEmail);
      const isAdministrative = !!(t && (t.role === 'admin' || t.role === 'staff'));
      const end = isAdministrative ? '17:00' : '16:00';
      return { type: '全天', start: '08:00', end, range: '08:00~' + end };
    };
    const isProxySubmitGranted = computed(() => {
      const a = useSessionStore().getProxyApi();
      return a ? a.isProxySubmitGranted.value : false;
    });
    const canStaffProxySubmit = computed(() => storeToRefs(useSessionStore()).isStaff.value && isProxySubmitGranted.value);
    const isProxySubmitActive = computed(() => {
      const a = getSubmitApi();
      return a ? a.isProxySubmitActive.value : false;
    });
    const paperFlow = computed(() =>
      !storeToRefs(useTourStore()).isMutualCover.value
      && notificationsSuppressed.value
      && !isProxySubmitActive.value
    );
    const getProxyActor = () => {
      // 只要目前登入者有代申請能力就回傳本人（送出時再比對請假人）
      if (!storeToRefs(useSessionStore()).user.value) return null;
      if (!canStaffProxySubmit.value && !isProxySubmitActive.value) return null;
      return {
        email: String(storeToRefs(useSessionStore()).user.value.email || '').toLowerCase(),
        name: (storeToRefs(useSessionStore()).user.value.displayName || useDataStore().getTeacherNameByEmail(storeToRefs(useSessionStore()).user.value.email) || '').replace(/\s*\(模擬\)\s*$/, '')
      };
    };
    const shouldProxySubmitForLeave = (leaveName) => {
      if (!canStaffProxySubmit.value || !storeToRefs(useSessionStore()).user.value) return false;
      const me = String(useDataStore().getTeacherNameByEmail(storeToRefs(useSessionStore()).user.value.email) || '').trim().toLowerCase();
      const leave = String(useDataStore().getTeacherNameByEmail(leaveName) || leaveName || '').trim().toLowerCase();
      return !!(me && leave && leave !== me);
    };
    const substitutionsLookup = computed(() =>
      DomainSchedule.buildSubstitutionsLookup(storeToRefs(useSessionStore()).substitutionRecords.value)
    );
    let _submitApi = null;
const getSubmitApi = () => {
      if (_submitApi) return _submitApi;
      if (!UiSubmit) {
        console.error('UiSubmit 未載入');
        return null;
      }
      _submitApi = UiSubmit.create({
        isBatchExchangeFlow,
        resolvePendingPeriods: useHomeroomStore().resolvePendingPeriods,
        batchCompareWeekDates: storeToRefs(useDataStore()).batchCompareWeekDates,
        buildLineInviteText,
        computed, showToast, showConfirm, callGasApi: useGasStore().callGasApi, loading: storeToRefs(useSessionStore()).loading, loadingMessage: storeToRefs(useSessionStore()).loadingMessage,
        activeCell: storeToRefs(useTourStore()).activeCell, inputRequestDate: storeToRefs(useTourStore()).inputRequestDate, allSchedules: storeToRefs(useSessionStore()).allSchedules, getScheduleForDate: useTimetableStore().getScheduleForDate, formatDateMMDD: DateUtils.formatDateMMDD,
        getWeekDayText: DateUtils.getWeekDayText, exchangePeriodId: storeToRefs(useMutualStore()).exchangePeriodId, exchangeWeekOffset: storeToRefs(useMutualStore()).exchangeWeekOffset, exchangeTargetDate: storeToRefs(useMutualStore()).exchangeTargetDate, isSingleWeek: useSessionStore().isSingleWeek,
        consecAlertsA: storeToRefs(useMutualStore()).consecAlertsA, consecAlertsB: storeToRefs(useMutualStore()).consecAlertsB, isMutualCover: storeToRefs(useTourStore()).isMutualCover, assignMutualDraftFromMatch: useMutualStore().assignMutualDraftFromMatch, PERIOD8_FEE: useTourStore().PERIOD8_FEE,
        pendingRequestData: storeToRefs(useMutualStore()).pendingRequestData, showMatchModal: storeToRefs(useSessionStore()).showMatchModal, showCompareModal: storeToRefs(useMutualStore()).showCompareModal, getLeaveTimeDefaults,
        batchActiveSlotKey: storeToRefs(useTourStore()).batchActiveSlotKey, batchSlots: storeToRefs(useTourStore()).batchSlots, batchAssignMode: storeToRefs(useTourStore()).batchAssignMode, getTeacherNameByEmail: useDataStore().getTeacherNameByEmail, batchSelectMode: storeToRefs(useTourStore()).batchSelectMode, selectBatchSlotForMatch, isBatchMatchFlow,
        DAC: useTourStore().DAC, isMutualActivitySlotInRange: useTourStore().isMutualActivitySlotInRange, mutualAwayClasses: storeToRefs(useTourStore()).mutualAwayClasses, substitutionRecords: storeToRefs(useSessionStore()).substitutionRecords, allPendingRequests: storeToRefs(useTourStore()).allPendingRequests,
        currentWeekDates: storeToRefs(useTimetableStore()).currentWeekDates, compareWeekDatesA, compareWeekDatesB, isClassAwayOnDate: useSessionStore().isClassAwayOnDate, mutualDrafts: storeToRefs(useTourStore()).mutualDrafts,
        isAdmin: storeToRefs(useSessionStore()).isAdmin, isQuotaDeductFee: useTourStore().isQuotaDeductFee, isTimetableOnlyFee: useTourStore().isTimetableOnlyFee, successModalTitle: storeToRefs(useMutualStore()).successModalTitle, successModalMessage: storeToRefs(useMutualStore()).successModalMessage,
        lineCopyText: storeToRefs(useMutualStore()).lineCopyText, hasLineTemplate: storeToRefs(useMutualStore()).hasLineTemplate, showSuccessModal: storeToRefs(useMutualStore()).showSuccessModal, successActionRequests: storeToRefs(useMutualStore()).successActionRequests, successFlowMode: storeToRefs(useMutualStore()).successFlowMode,
        notificationsSuppressed, openPaperPrintDraft: useOutputStore().openPaperPrintDraft, openPaperPrintDraftFromCompare: useOutputStore().openPaperPrintDraftFromCompare,
        openPaperPrintDraftForSubmittedRequests: useOutputStore().openPaperPrintDraftForSubmittedRequests, canStaffProxySubmit, shouldProxySubmitForLeave,
        getProxyActor, user: storeToRefs(useSessionStore()).user, currentSemester: storeToRefs(useSessionStore()).currentSemester, TIMETABLE_ONLY_FEE: useTourStore().TIMETABLE_ONLY_FEE, ACTIVITY_PUBLIC_FEE: useTourStore().ACTIVITY_PUBLIC_FEE,
        defaultSubFeeForReason: useBackofficeStore().defaultSubFeeForReason, directApproveMode: storeToRefs(useDataStore()).directApproveMode, directApproveSkipNotify: storeToRefs(useTourStore()).directApproveSkipNotify, mutualSkipNotify: storeToRefs(useTourStore()).mutualSkipNotify,
        isSubmitting: storeToRefs(useMutualStore()).isSubmitting, optimisticUpsertRequest: useDataStore().optimisticUpsertRequest, sheetRequestToFront: FieldMap.mapRequest, deductMutualQuotaForRows,
        softRefreshInBackground: useDataStore().softRefreshInBackground, paperMode, paperFlow, getWeekDatesForCompare, toLocalDateStr: DateUtils.toLocalDateStr,
        lookupTeacher: useDataStore().lookupTeacher, getTeacherSubjectByEmail: useDataStore().getTeacherSubjectByEmail, canStaffProxySubmit, proxyTargetEmail: storeToRefs(useSessionStore()).proxyTargetEmail,
        batchCompareViewEmail: storeToRefs(useMatchStore()).batchCompareViewEmail, canOperateOnTeacherEmail: useSessionStore().canOperateOnTeacherEmail, ensureProxyTargetForTeacher: useSessionStore().ensureProxyTargetForTeacher,
        isStaff: storeToRefs(useSessionStore()).isStaff, isProxySubmitGranted, QUOTA_DEDUCT_FEE: useTourStore().QUOTA_DEDUCT_FEE, isPeriod8FeeLocked: storeToRefs(useTimetableStore()).isPeriod8FeeLocked,
        quotaDeductPreview: storeToRefs(useTimetableStore()).quotaDeductPreview, batchSubFee: storeToRefs(useTourStore()).batchSubFee,
        patchLocalMutualQuota: useMutualStore().patchLocalMutualQuota,
        bustQuotaLedgerViewCache: useMutualStore().bustQuotaLedgerViewCache,
        getLineHandledSlot, shortTeacherName, buildAskFirstLineText,
        sendLineMessage: useMutualStore().sendLineMessage, lineBatchParts: storeToRefs(useMutualStore()).lineBatchParts, formatPeriodText: useTimetableStore().formatPeriodText,
      });
      return _submitApi;
    };

    const deductMutualQuotaForRows = (...args) => getSubmitApi().deductMutualQuotaForRows(...args);
    const restoreMutualQuotaForRows = (...args) => getSubmitApi().restoreMutualQuotaForRows(...args);
    const sendLineBatchPart = (...args) => getSubmitApi().sendLineBatchPart(...args);
    const getWeekDatesForCompare = (...args) => getSubmitApi().getWeekDatesForCompare(...args);
    const getExchangeEndpointText = (...args) => getSubmitApi().getExchangeEndpointText(...args);
    const setLeaveTimePreset = (...args) => getSubmitApi().setLeaveTimePreset(...args);
    const toggleCourseAdjustmentOnly = (...args) => getSubmitApi().toggleCourseAdjustmentOnly(...args);
    const assertCanSubmitAsLeaveTeacher = (...args) => getSubmitApi().assertCanSubmitAsLeaveTeacher(...args);
    const assertQuotaDeductAllowed = (...args) => getSubmitApi().assertQuotaDeductAllowed(...args);
    const runComparePreparation = async (...args) => getSubmitApi().runComparePreparation(...args);
    const prepCompare = async (...args) => getSubmitApi().prepCompare(...args);
    const previewBatchCandidate = async (...args) => getSubmitApi().previewBatchCandidate(...args);
    const closeCompareModal = (...args) => getSubmitApi().closeCompareModal(...args);
    const isBatchSlotAt = (...args) => getSubmitApi().isBatchSlotAt(...args);
    const resolveCompareBEmail = (...args) => getSubmitApi().resolveCompareBEmail(...args);
    const getBatchSlotForCompareB = (...args) => getSubmitApi().getBatchSlotForCompareB(...args);
    const isSlotConflict = (...args) => getSubmitApi().isSlotConflict(...args);
    const confirmIfTargetPatrol = async (...args) => getSubmitApi().confirmIfTargetPatrol(...args);
    const getCompareCellText = (...args) => getSubmitApi().getCompareCellText(...args);
    const getCompareCellClass = (...args) => getSubmitApi().getCompareCellClass(...args);
    const validateSubmitRequest = async (...args) => getSubmitApi().validateSubmitRequest(...args);
    const buildSubmitPayload = (...args) => getSubmitApi().buildSubmitPayload(...args);
    const validateBatchExchangeSlot = (...args) => getSubmitApi().validateBatchExchangeSlot(...args);
    const executeSubmitRequest = async (...args) => getSubmitApi().executeSubmitRequest(...args);
    function initImmediateSubmit1() {
    watch([paperMode, storeToRefs(useSessionStore()).isAdmin, storeToRefs(useSessionStore()).activeTab], ([paper, admin, tab]) => {
      if (paper && !admin && tab === 'pending' && storeToRefs(useTourStore()).isMutualCover.value && !paperFlow.value) {
        useSessionStore().setActiveTab('timetable');
      }
    });
    }
const {
      batchSlotKey, isBatchSlotSelected, clearBatchSlots,
      isBatchMatchFlow, isBatchExchangeFlow, isBatchPerSlotMode, batchAssignedCount, batchAllSlotsAssigned, batchActiveSlot,
      groupBatchSlotsBySub, setBatchAssignMode, toggleBatchSelectMode, toggleBatchSlot,
      setBatchFlowMode,
      fetchSingleSlotRecommendations, fetchBatchRecommendations, selectBatchSlotForMatch,
      openBatchMatch, prepBatchCompare, assignBatchSlotSub, clearBatchSlotSub,
      prepBatchPerSlotCompare, prepBatchExchangeCompare, setBatchCompareViewEmail, executeBatchSubmit
    } = UiBatchPanel.create({
      computed: computed,
      showToast: showToast,
      showConfirm: showConfirm,
      // 下列函式定義在後方：一律用 wrapper，避免 const TDZ
      getTeacherNameByEmail: function (em) { return useDataStore().getTeacherNameByEmail(em); },
      getLeaveTimeDefaults: getLeaveTimeDefaults,
      getTeacherSubjectByEmail: function (em) { return useDataStore().getTeacherSubjectByEmail(em); },
      getScheduleForDate: function (a, b, c, d) { return useTimetableStore().getScheduleForDate(a, b, c, d); },
      formatDateMMDD: function (d) { return DateUtils.formatDateMMDD(d); },
      getTimetableApi: function () { return useTimetableStore().getTimetableApi(); },
      defaultSubFeeForReason: function (r) { return useBackofficeStore().defaultSubFeeForReason(r); },
      softRefreshInBackground: function (opts) { return useDataStore().softRefreshInBackground(opts || {}); },
      optimisticUpsertRequest: function (r) { return useDataStore().optimisticUpsertRequest(r); },
      sheetRequestToFront: function (r) { return FieldMap.mapRequest(r); },
      isAdmin: storeToRefs(useSessionStore()).isAdmin,
      isProxySubmitActive: function () { return isProxySubmitActive.value; },
      canStaffProxySubmit: function () { return canStaffProxySubmit.value; },
      shouldProxySubmitForLeave: shouldProxySubmitForLeave,
      getProxyActor: getProxyActor,
      isMutualCover: storeToRefs(useTourStore()).isMutualCover,
      DAC: useTourStore().DAC,
      mutualAwayClasses: storeToRefs(useTourStore()).mutualAwayClasses,
      batchSlots: storeToRefs(useTourStore()).batchSlots,
      batchSelectMode: storeToRefs(useTourStore()).batchSelectMode,
      batchFlowMode: storeToRefs(useTourStore()).batchFlowMode,
      exchangeWeekOffset: storeToRefs(useMutualStore()).exchangeWeekOffset,
      exchangeWeekdayFilter: storeToRefs(useMutualStore()).exchangeWeekdayFilter,
      batchAssignMode: storeToRefs(useTourStore()).batchAssignMode,
      batchActiveSlotKey: storeToRefs(useTourStore()).batchActiveSlotKey,
      batchSubTeacher: storeToRefs(useTourStore()).batchSubTeacher,
      batchReason: storeToRefs(useTourStore()).batchReason,
      batchSubFee: storeToRefs(useTourStore()).batchSubFee,
      batchNote: storeToRefs(useTourStore()).batchNote,
      batchCompareViewEmail: storeToRefs(useMatchStore()).batchCompareViewEmail,
      showBatchConfirmModal: storeToRefs(useTourStore()).showBatchConfirmModal,
      showMatchModal: storeToRefs(useSessionStore()).showMatchModal,
      showCompareModal: storeToRefs(useMutualStore()).showCompareModal,
      activeCell: storeToRefs(useTourStore()).activeCell,
      inputRequestDate: storeToRefs(useTourStore()).inputRequestDate,
      matchMode: storeToRefs(useTourStore()).matchMode,
      matchPreview: storeToRefs(useTourStore()).matchPreview,
      pendingRequestData: storeToRefs(useMutualStore()).pendingRequestData,
      recommendedTeachers: storeToRefs(useTourStore()).recommendedTeachers,
      recommendationLoading: storeToRefs(useTourStore()).recommendationLoading,
      matchSearchQuery: storeToRefs(useMutualStore()).matchSearchQuery,
      matchDisplayCount: storeToRefs(useMutualStore()).matchDisplayCount,
      matchShowNoTeacherWarning: storeToRefs(useMutualStore()).matchShowNoTeacherWarning,
      matchEmptyReasons: storeToRefs(useMutualStore()).matchEmptyReasons,
      consecAlertsA: storeToRefs(useMutualStore()).consecAlertsA,
      consecAlertsB: storeToRefs(useMutualStore()).consecAlertsB,
      directApproveMode: storeToRefs(useDataStore()).directApproveMode,
      paperMode: paperMode,
      paperFlow: paperFlow,
      notificationsSuppressed: notificationsSuppressed,
      openPaperPrintDraft: function (requests) {
        return requests && requests.length
          ? useOutputStore().openPaperPrintDraftForSubmittedRequests(requests)
          : useOutputStore().openPaperPrintDraftFromCompare();
      },
      openPaperPrintMutualDrafts: function () { return useOutputStore().openPaperPrintMutualDrafts(); },
      teachersList: storeToRefs(useSessionStore()).teachersList,
      activityBalanceCtx: useMutualStore().activityBalanceCtx,
      QUOTA_DEDUCT_FEE: useTourStore().QUOTA_DEDUCT_FEE,
      ACTIVITY_PUBLIC_FEE: useTourStore().ACTIVITY_PUBLIC_FEE,
      PERIOD8_FEE: useTourStore().PERIOD8_FEE,
      isSlotConflict: isSlotConflict,
      mutualSkipNotify: storeToRefs(useTourStore()).mutualSkipNotify,
      isQuotaDeductFee: useTourStore().isQuotaDeductFee,
      assertQuotaDeductAllowed: assertQuotaDeductAllowed,
      loading: storeToRefs(useSessionStore()).loading,
      loadingMessage: storeToRefs(useSessionStore()).loadingMessage,
      isSubmitting: storeToRefs(useMutualStore()).isSubmitting,
      currentSemester: storeToRefs(useSessionStore()).currentSemester,
      buildSubmitPayload: buildSubmitPayload,
      validateBatchExchangeSlot: validateBatchExchangeSlot,
      directApproveSkipNotify: storeToRefs(useTourStore()).directApproveSkipNotify,
      callGasApi: useGasStore().callGasApi,
      deductMutualQuotaForRows: deductMutualQuotaForRows,
      successModalTitle: storeToRefs(useMutualStore()).successModalTitle,
      successModalMessage: storeToRefs(useMutualStore()).successModalMessage,
      hasLineTemplate: storeToRefs(useMutualStore()).hasLineTemplate,
      lineBatchParts: storeToRefs(useMutualStore()).lineBatchParts,
      lineCopyText: storeToRefs(useMutualStore()).lineCopyText,
      showSuccessModal: storeToRefs(useMutualStore()).showSuccessModal,
      successActionRequests: storeToRefs(useMutualStore()).successActionRequests,
       buildLineBatchInviteText: buildLineBatchInviteText,
       buildLineInviteText: buildLineInviteText,
      successFlowMode: storeToRefs(useMutualStore()).successFlowMode
    });


  return { compareWeekDatesA, compareWeekDatesB, notificationsSuppressed, paperMode, getLeaveTimeDefaults, isProxySubmitGranted, canStaffProxySubmit, isProxySubmitActive, paperFlow, getProxyActor, shouldProxySubmitForLeave, substitutionsLookup, getSubmitApi, batchSlotKey, isBatchSlotSelected, clearBatchSlots, isBatchMatchFlow, isBatchExchangeFlow, isBatchPerSlotMode, batchAssignedCount, batchAllSlotsAssigned, batchActiveSlot, groupBatchSlotsBySub, setBatchAssignMode, toggleBatchSelectMode, toggleBatchSlot, setBatchFlowMode, fetchSingleSlotRecommendations, fetchBatchRecommendations, selectBatchSlotForMatch, openBatchMatch, prepBatchCompare, assignBatchSlotSub, clearBatchSlotSub, prepBatchPerSlotCompare, prepBatchExchangeCompare, setBatchCompareViewEmail, executeBatchSubmit, deductMutualQuotaForRows, restoreMutualQuotaForRows, sendLineBatchPart, getWeekDatesForCompare, getExchangeEndpointText, setLeaveTimePreset, toggleCourseAdjustmentOnly, assertCanSubmitAsLeaveTeacher, assertQuotaDeductAllowed, runComparePreparation, prepCompare, previewBatchCandidate, closeCompareModal, isBatchSlotAt, resolveCompareBEmail, getBatchSlotForCompareB, isSlotConflict, confirmIfTargetPatrol, getCompareCellText, getCompareCellClass, validateSubmitRequest, buildSubmitPayload, validateBatchExchangeSlot, executeSubmitRequest, initImmediateSubmit1 };
});
