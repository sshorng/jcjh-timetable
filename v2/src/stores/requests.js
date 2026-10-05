/** v2 stores/requests.js — 由 v1 setup() §分節機械分解（gen-final.cjs）。 */
import { defineStore } from 'pinia';
import { computed, nextTick, reactive, ref, watch } from 'vue';
import DateUtils from '../domain/date-utils.js';
import DomainActivityCover from '../domain/domain-activity-cover.js';
import DomainBilling from '../domain/domain-billing.js';
import DomainClassAway from '../domain/domain-class-away.js';
import DomainMatch from '../domain/domain-match.js';
import DomainSchedule from '../domain/domain-schedule.js';
import DomainSchoolSwap from '../domain/domain-school-swap.js';
import DomainTriangle from '../domain/domain-triangle.js';
import FeeUtils from '../domain/fee-utils.js';
import FieldMap from '../domain/field-map.js';
import ExportAccounting from '../modules/export-accounting.js';
import ExportPeriod8Accounting from '../modules/export-period8-accounting.js';
import { OnboardingTour } from '../modules/onboarding-tour.js';
import { TemplateBuffer } from '../modules/template-buffer.js';
import { UiBatchPanel, UiBatchSubmit, UiClassAwayAdmin, UiMutualBridge } from '../modules/ui-activity.js';
import { UiAdmin } from '../modules/ui-admin.js';
import { UiApproval } from '../modules/ui-approval.js';
import { UiAuth } from '../modules/ui-auth.js';
import { UiBackoffice } from '../modules/ui-backoffice.js';
import { UiCalendar } from '../modules/ui-calendar.js';
import { UiClassView } from '../modules/ui-classview.js';
import { UiData } from '../modules/ui-data.js';
import { UiExport } from '../modules/ui-export.js';
import { UiHistory } from '../modules/ui-history.js';
import { UiHomeroom } from '../modules/ui-homeroom.js';
import { UiInteraction } from '../modules/ui-interaction.js';
import { UiLineTemplate } from '../modules/ui-line-template.js';
import { UiListHelpers } from '../modules/ui-list-helpers.js';
import { UiMatch } from '../modules/ui-match.js';
import { UiMutualPanelState, UiMutualSubmit } from '../modules/ui-mutual.js';
import { UiPrint } from '../modules/ui-print.js';
import { UiProxy } from '../modules/ui-proxy.js';
import { UiReport } from '../modules/ui-report.js';
import { UiSubmitHelpers } from '../modules/ui-request.js';
import { UiSamePeriodSwap } from '../modules/ui-same-period-swap.js';
import { UiSchedule } from '../modules/ui-schedule.js';
import { UiSchoolSwap } from '../modules/ui-schoolswap.js';
import { UiStyle } from '../modules/ui-style.js';
import { UiSubmit } from '../modules/ui-submit.js';
import { UiSync } from '../modules/ui-sync.js';
import { UiTimetable } from '../modules/ui-timetable.js';
import { UiTour } from '../modules/ui-tour.js';
import { fallbackAvatarDataUri, installModalA11y, showConfirm, showToast } from '../ui/toast.js';
import { useAdminStore } from './admin.js';
import { useBackofficeStore } from './backoffice.js';
import { useDataStore } from './data.js';
import { useGasStore } from './gas.js';
import { useHistoryStore } from './history.js';
import { useHomeroomStore } from './homeroom.js';
import { useInteractionStore } from './interaction.js';
import { useMatchStore } from './match.js';
import { useMutualStore } from './mutual.js';
import { useOutputStore } from './output.js';
import { useSessionStore } from './session.js';
import { useSubmitStore } from './submit.js';
import { useTimetableStore } from './timetable.js';
import { useTourStore } from './tour.js';
import { storeToRefs } from 'pinia';
export const useRequestsStore = defineStore('requests', () => {
  const { getStatusText, isTriangleRequest } = UiListHelpers;
  const { formatLeaveClassSlot } = UiLineTemplate;
    let _approvalApi = null;
    const selectedAdminPendingIds = computed(() => {
      const a = getApprovalApi();
      return a ? a.selectedAdminPendingIds.value : [];
    });
    const lastBatchPrintIds = computed(() => {
      const a = getApprovalApi();
      return a ? a.lastBatchPrintIds.value : [];
    });
    const showBatchPrintPrompt = computed(() => {
      const a = getApprovalApi();
      return a ? a.showBatchPrintPrompt.value : false;
    });
const getApprovalApi = () => {
      if (_approvalApi) return _approvalApi;
      if (!UiApproval) {
        console.error('UiApproval 未載入');
        return null;
      }
      _approvalApi = UiApproval.create({
        ref,
        callGasApi: useGasStore().callGasApi, callGasApiWithProgress: useSessionStore().callGasApiWithProgress, showToast, showConfirm, loading: storeToRefs(useSessionStore()).loading, loadingMessage: storeToRefs(useSessionStore()).loadingMessage,
        getStatusText, getTeacherNameByEmail: useDataStore().getTeacherNameByEmail, isAdmin: storeToRefs(useSessionStore()).isAdmin, notificationsSuppressed: storeToRefs(useSubmitStore()).notificationsSuppressed,
        syncHistorySelectionFromDom: useBackofficeStore().syncHistorySelectionFromDom, substitutionRecords: storeToRefs(useSessionStore()).substitutionRecords, requestsList: storeToRefs(useSessionStore()).requestsList,
        optimisticPatchRequestStatus: useDataStore().optimisticPatchRequestStatus, isTriangleRequest, restoreMutualQuotaForRows: useSubmitStore().restoreMutualQuotaForRows,
        activeCell: storeToRefs(useTourStore()).activeCell, pendingRequestData: storeToRefs(useMutualStore()).pendingRequestData, combinedReturnCandidates: storeToRefs(useMutualStore()).combinedReturnCandidates, PERIOD8_FEE: useTourStore().PERIOD8_FEE, isMutualCover: storeToRefs(useTourStore()).isMutualCover,
        consecAlertsA: storeToRefs(useMutualStore()).consecAlertsA, consecAlertsB: storeToRefs(useMutualStore()).consecAlertsB, matchPreview: storeToRefs(useTourStore()).matchPreview, showCompareModal: storeToRefs(useMutualStore()).showCompareModal, inputRequestDate: storeToRefs(useTourStore()).inputRequestDate,
        currentWeekDates: storeToRefs(useTimetableStore()).currentWeekDates, isCombinedClass: useTimetableStore().isCombinedClass, findCombinedReturnCandidates: useTimetableStore().findCombinedReturnCandidates, paperMode: storeToRefs(useSubmitStore()).paperMode, ensureDAC: useTourStore().ensureDAC,
        emptySlotForm: storeToRefs(useDataStore()).emptySlotForm, emptySlotQuotaZero: storeToRefs(useAdminStore()).emptySlotQuotaZero, isSubmitting: storeToRefs(useMutualStore()).isSubmitting, DAC: useTourStore().DAC, showEmptySlotModal: storeToRefs(useDataStore()).showEmptySlotModal,
        printSelectedForms: useOutputStore().printSelectedForms, openPrintPreview: useOutputStore().openPrintPreview, mySentRequests: storeToRefs(useTourStore()).mySentRequests, myPendingRequests: storeToRefs(useTourStore()).myPendingRequests,
        adminPendingRequests: storeToRefs(useTourStore()).adminPendingRequests, allPendingRequests: storeToRefs(useTourStore()).allPendingRequests, paginatedAdminPending: storeToRefs(useTimetableStore()).paginatedAdminPending, selectedRecordIds: storeToRefs(useMutualStore()).selectedRecordIds,
        activeTab: storeToRefs(useSessionStore()).activeTab, showDetailModal: storeToRefs(useMutualStore()).showDetailModal, detailRequest: storeToRefs(useMutualStore()).detailRequest, detailSubRecord: storeToRefs(useMutualStore()).detailSubRecord,
        isExchangeLikeRequest: useMutualStore().isExchangeLikeRequest, lookupTeacher: useDataStore().lookupTeacher, teachersList: storeToRefs(useSessionStore()).teachersList, ACTIVITY_PUBLIC_FEE: useTourStore().ACTIVITY_PUBLIC_FEE,
        formatLeaveClassSlot, formatExchangeClassSlot: useDataStore().formatExchangeClassSlot,
        isLeaveClassRestricted: useDataStore().isLeaveClassRestricted, isExchangeClassRestricted: useDataStore().isExchangeClassRestricted,
        triangleSubmitting: storeToRefs(useTourStore()).triangleSubmitting, triangleValidation: storeToRefs(useOutputStore()).triangleValidation, triangleReason: storeToRefs(useTourStore()).triangleReason, onlineSubstitutionEnabled: storeToRefs(useSessionStore()).onlineSubstitutionEnabled,
        triangleParticipants: storeToRefs(useOutputStore()).triangleParticipants, triangleNote: storeToRefs(useTourStore()).triangleNote, sheetRequestToFront: FieldMap.mapRequest, currentSemester: storeToRefs(useSessionStore()).currentSemester,
        optimisticUpsertRequest: useDataStore().optimisticUpsertRequest, successActionRequests: storeToRefs(useMutualStore()).successActionRequests, showMatchModal: storeToRefs(useSessionStore()).showMatchModal, hasLineTemplate: storeToRefs(useMutualStore()).hasLineTemplate,
        lineCopyText: storeToRefs(useMutualStore()).lineCopyText, lineBatchParts: storeToRefs(useMutualStore()).lineBatchParts, showSuccessModal: storeToRefs(useMutualStore()).showSuccessModal, resetTriangleDraft: useTimetableStore().resetTriangleDraft,
        openPaperPrintDraftForSubmittedRequests: useOutputStore().openPaperPrintDraftForSubmittedRequests, successModalTitle: storeToRefs(useMutualStore()).successModalTitle, successModalMessage: storeToRefs(useMutualStore()).successModalMessage,
        successFlowMode: storeToRefs(useMutualStore()).successFlowMode, softRefreshInBackground: useDataStore().softRefreshInBackground,
      });
      return _approvalApi;
    };

    const isAdminPendingSelected = (...args) => {
      const a = getApprovalApi();
      return a ? a.isAdminPendingSelected(...args) : false;
    };
    const toggleAdminPendingSelect = (...args) => {
      const a = getApprovalApi();
      return a ? a.toggleAdminPendingSelect(...args) : undefined;
    };
    const toggleSelectAllAdminPending = (...args) => {
      const a = getApprovalApi();
      return a ? a.toggleSelectAllAdminPending(...args) : undefined;
    };
    const isAdminBatchGroupSelected = (...args) => {
      const a = getApprovalApi();
      return a ? a.isAdminBatchGroupSelected(...args) : false;
    };
    const toggleAdminBatchGroupSelection = (...args) => {
      const a = getApprovalApi();
      return a ? a.toggleAdminBatchGroupSelection(...args) : undefined;
    };
    const clearAdminPendingSelection = (...args) => {
      const a = getApprovalApi();
      return a ? a.clearAdminPendingSelection(...args) : undefined;
    };
    const respondToRequest = (...args) => {
      const a = getApprovalApi();
      return a ? a.respondToRequest(...args) : undefined;
    };
    const respondToBatch = (...args) => {
      const a = getApprovalApi();
      return a ? a.respondToBatch(...args) : undefined;
    };
    const adminApprove = (...args) => {
      const a = getApprovalApi();
      return a ? a.adminApprove(...args) : undefined;
    };
    const adminReject = (...args) => {
      const a = getApprovalApi();
      return a ? a.adminReject(...args) : undefined;
    };
    const batchAdminApprove = (...args) => {
      const a = getApprovalApi();
      return a ? a.batchAdminApprove(...args) : undefined;
    };
    const batchAdminReject = (...args) => {
      const a = getApprovalApi();
      return a ? a.batchAdminReject(...args) : undefined;
    };
    const printLastBatchNotices = (...args) => {
      const a = getApprovalApi();
      return a ? a.printLastBatchNotices(...args) : undefined;
    };
    const dismissBatchPrintPrompt = (...args) => {
      const a = getApprovalApi();
      return a ? a.dismissBatchPrintPrompt(...args) : undefined;
    };
    const cancelRequest = (...args) => {
      const a = getApprovalApi();
      return a ? a.cancelRequest(...args) : undefined;
    };
    const deleteSubstitutionRecord = (...args) => {
      const a = getApprovalApi();
      return a ? a.deleteSubstitutionRecord(...args) : undefined;
    };
    const sendSelectedBatchNotices = (...args) => {
      const a = getApprovalApi();
      return a ? a.sendSelectedBatchNotices(...args) : undefined;
    };
    const startCombinedReturn = (...args) => {
      const a = getApprovalApi();
      return a ? a.startCombinedReturn(...args) : undefined;
    };
    const executeEmptySlotAssign = (...args) => {
      const a = getApprovalApi();
      return a ? a.executeEmptySlotAssign(...args) : undefined;
    };
    const formatRequestSummary = (...args) => {
      const a = getApprovalApi();
      return a ? a.formatRequestSummary(...args) : '';
    };
    const getApproveRiskFlags = (...args) => {
      const a = getApprovalApi();
      return a ? a.getApproveRiskFlags(...args) : [];
    };
    const formatApproveBatchRiskSummary = (...args) => {
      const a = getApprovalApi();
      return a ? a.formatApproveBatchRiskSummary(...args) : '';
    };
    const getRequestProgressSteps = (...args) => {
      const a = getApprovalApi();
      return a ? a.getRequestProgressSteps(...args) : [];
    };
    const isPaperFlowRequest = (...args) => {
      const a = getApprovalApi();
      return a ? a.isPaperFlowRequest(...args) : false;
    };
    const isProxySubmitRequest = (...args) => {
      const a = getApprovalApi();
      return a ? a.isProxySubmitRequest(...args) : false;
    };
    const submitTriangleRequest = (...args) => {
      const a = getApprovalApi();
      return a ? a.submitTriangleRequest(...args) : undefined;
    };
    const checkUrlCallback = (...args) => {
      const a = getApprovalApi();
      return a ? a.checkUrlCallback(...args) : undefined;
    };
    function initRequests1() {
      useInteractionStore().bindFlagModal(storeToRefs(useBackofficeStore()).showClassAwayModal, () => { storeToRefs(useBackofficeStore()).showClassAwayModal.value = false; }, '空堂事件');
      useInteractionStore().bindFlagModal(showBatchPrintPrompt, () => { dismissBatchPrintPrompt(); }, '批次列印');
    }
  return { selectedAdminPendingIds, lastBatchPrintIds, showBatchPrintPrompt, getApprovalApi, isAdminPendingSelected, toggleAdminPendingSelect, toggleSelectAllAdminPending, isAdminBatchGroupSelected, toggleAdminBatchGroupSelection, clearAdminPendingSelection, respondToRequest, respondToBatch, adminApprove, adminReject, batchAdminApprove, batchAdminReject, printLastBatchNotices, dismissBatchPrintPrompt, cancelRequest, deleteSubstitutionRecord, sendSelectedBatchNotices, startCombinedReturn, executeEmptySlotAssign, formatRequestSummary, getApproveRiskFlags, formatApproveBatchRiskSummary, getRequestProgressSteps, isPaperFlowRequest, isProxySubmitRequest, submitTriangleRequest, checkUrlCallback, initRequests1 };
});
