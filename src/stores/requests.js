/** v2 stores/requests.js — 由 v1 setup() §分節機械分解（gen-final.cjs）。 */
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import FieldMap from '../domain/field-map.js';
import { ensureUiApprovalModule, tabModulesReady } from '../modules/tab-gates.js';
import { UiLineTemplate } from '../modules/ui-line-template.js';
import { UiListHelpers } from '../modules/ui-list-helpers.js';
import { showConfirm, showToast } from '../ui/toast.js';
import { useAdminStore } from './admin.js';
import { useBackofficeStore } from './backoffice.js';
import { useDataStore } from './data.js';
import { useGasStore } from './gas.js';
import { useInteractionStore } from './interaction.js';
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
    // 2.1d：選取狀態由 store 持有（:checked render 路徑），模組改注入共用，免經 approvalApi。
    const selectedAdminPendingIds = ref([]);
    const lastBatchPrintIds = computed(() => {
      const a = getApprovalApi();
      return a ? a.lastBatchPrintIds.value : [];
    });
    const showBatchPrintPrompt = computed(() => {
      const a = getApprovalApi();
      return a ? a.showBatchPrintPrompt.value : false;
    });
// 2.1d：UiApproval 改閘門按需載入（pending／admin 頁籤及簽核動作才抓）；未載入前回 null（既有守衛語義）。
let UiApproval = null;
let _approvalModulesPromise = null;
const ensureApprovalModule = () => {
  if (!_approvalModulesPromise) {
    _approvalModulesPromise = ensureUiApprovalModule().then((m) => { UiApproval = m; })
      .catch((e) => { _approvalModulesPromise = null; throw e; });
  }
  return _approvalModulesPromise;
};
// 2.1d內聯：紙本／代申請判定為純函式（render＋boot 路徑多處同步調用），與 ui-approval.js 同邏輯。
const isPaperFlowValue = (value) => {
  if (value === true || value === 1) return true;
  const normalized = String(value == null ? '' : value).trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === '是' || normalized === '紙本';
};
    const isProxySubmitRequest = (r) => {
      if (!r) return false;
      if (r.isProxySubmit === true) return true;
      if (r.proxyByName) return true;
      const note = String(r.note || '');
      return note.indexOf('[行政代申請') >= 0;
    };
    const isPaperFlowRequest = (request) => {
      if (!request) return false;
      if (isPaperFlowValue(request.paperFlow)) return true;
      const pendingPaperStatus = request.status === 'pending_admin' || request.status === 'pending_teacher';
      const suppressed = storeToRefs(useSubmitStore()).notificationsSuppressed.value;
      if (suppressed && pendingPaperStatus && !isProxySubmitRequest(request)) return true;
      if (request.paperFlowSpecified === true) return false;
      if (Object.prototype.hasOwnProperty.call(request, '紙本流程')) {
        return isPaperFlowValue(request['紙本流程']);
      }
      return !!(suppressed && pendingPaperStatus && !isProxySubmitRequest(request));
    };
    const isAdminPendingSelected = (id) => {
      try {
        if (typeof document !== 'undefined') {
          const el = document.querySelector('.admin-select-cb[data-req-id="' + String(id) + '"]');
          if (el) return !!el.checked;
        }
      } catch (e) { /* ignore */ }
      return selectedAdminPendingIds.value.some((selectedId) => String(selectedId) === String(id));
    };
    const isAdminBatchGroupSelected = (group) => {
      const ids = (group && group.items || []).filter((row) => row && row.id != null).map((row) => String(row.id));
      if (!ids.length) return false;
      const selected = new Set((selectedAdminPendingIds.value || []).map((sid) => String(sid)));
      return ids.every((sid) => selected.has(sid));
    };
const getApprovalApi = () => {
      // 讀 ready 使呼叫端 computed 在模組載入後自動重算（未載入照舊回 null）。
      const _approvalReady = tabModulesReady.value.approval;
      if (_approvalApi) return _approvalApi;
      if (!UiApproval) {
        // 未載入一律靜默回 null（載入中／尚未排程皆屬正常；失敗由 ensure 拋錯＋toast）。
        return null;
      }
      _approvalApi = UiApproval.create({
        ref, selectedAdminPendingIds,
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

    const toggleAdminPendingSelect = async (...args) => {
      await ensureApprovalModule();
      const a = getApprovalApi();
      return a ? a.toggleAdminPendingSelect(...args) : undefined;
    };
    const toggleSelectAllAdminPending = async (...args) => {
      await ensureApprovalModule();
      const a = getApprovalApi();
      return a ? a.toggleSelectAllAdminPending(...args) : undefined;
    };
    const toggleAdminBatchGroupSelection = async (...args) => {
      await ensureApprovalModule();
      const a = getApprovalApi();
      return a ? a.toggleAdminBatchGroupSelection(...args) : undefined;
    };
    const clearAdminPendingSelection = async (...args) => {
      await ensureApprovalModule();
      const a = getApprovalApi();
      return a ? a.clearAdminPendingSelection(...args) : undefined;
    };
    const respondToRequest = async (...args) => {
      await ensureApprovalModule();
      const a = getApprovalApi();
      return a ? a.respondToRequest(...args) : undefined;
    };
    const respondToBatch = async (...args) => {
      await ensureApprovalModule();
      const a = getApprovalApi();
      return a ? a.respondToBatch(...args) : undefined;
    };
    const adminApprove = async (...args) => {
      await ensureApprovalModule();
      const a = getApprovalApi();
      return a ? a.adminApprove(...args) : undefined;
    };
    const adminReject = async (...args) => {
      await ensureApprovalModule();
      const a = getApprovalApi();
      return a ? a.adminReject(...args) : undefined;
    };
    const batchAdminApprove = async (...args) => {
      await ensureApprovalModule();
      const a = getApprovalApi();
      return a ? a.batchAdminApprove(...args) : undefined;
    };
    const batchAdminReject = async (...args) => {
      await ensureApprovalModule();
      const a = getApprovalApi();
      return a ? a.batchAdminReject(...args) : undefined;
    };
    const printLastBatchNotices = async (...args) => {
      await ensureApprovalModule();
      const a = getApprovalApi();
      return a ? a.printLastBatchNotices(...args) : undefined;
    };
    const dismissBatchPrintPrompt = async (...args) => {
      await ensureApprovalModule();
      const a = getApprovalApi();
      return a ? a.dismissBatchPrintPrompt(...args) : undefined;
    };
    const cancelRequest = async (...args) => {
      await ensureApprovalModule();
      const a = getApprovalApi();
      return a ? a.cancelRequest(...args) : undefined;
    };
    const deleteSubstitutionRecord = async (...args) => {
      await ensureApprovalModule();
      const a = getApprovalApi();
      return a ? a.deleteSubstitutionRecord(...args) : undefined;
    };
    const sendSelectedBatchNotices = async (...args) => {
      await ensureApprovalModule();
      const a = getApprovalApi();
      return a ? a.sendSelectedBatchNotices(...args) : undefined;
    };
    const startCombinedReturn = async (...args) => {
      await ensureApprovalModule();
      const a = getApprovalApi();
      return a ? a.startCombinedReturn(...args) : undefined;
    };
    const executeEmptySlotAssign = async (...args) => {
      await ensureApprovalModule();
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
    // 模板形狀安全：未載入回空進度物件（.summary／.steps 照常用），載入後經 ready 自動重算。
    const getRequestProgressSteps = (...args) => {
      const a = getApprovalApi();
      return a ? a.getRequestProgressSteps(...args) : { steps: [], summary: '', failed: false, overdue: false, overdueHint: '' };
    };
    const submitTriangleRequest = async (...args) => {
      await ensureApprovalModule();
      const a = getApprovalApi();
      return a ? a.submitTriangleRequest(...args) : undefined;
    };
    const checkUrlCallback = async (...args) => {
      // 免載入短路：無簽核回呼也無班級深連結時不抓模組（每次登入都跑此函式）。
      try {
        const q = String((typeof window !== 'undefined' && window.location && window.location.search) || '');
        const hasAction = /(^|[?&])action=respond/.test(q);
        const hasClass = /(^|[?&])(class|cls|view)=/.test(q);
        if (!hasAction && !hasClass) return undefined;
      } catch (e) { /* 保守起見繼續載入 */ }
      await ensureApprovalModule();
      const a = getApprovalApi();
      return a ? a.checkUrlCallback(...args) : undefined;
    };
    function initRequests1() {
      useInteractionStore().bindFlagModal(storeToRefs(useBackofficeStore()).showClassAwayModal, () => { storeToRefs(useBackofficeStore()).showClassAwayModal.value = false; }, '空堂事件');
      useInteractionStore().bindFlagModal(showBatchPrintPrompt, () => { dismissBatchPrintPrompt(); }, '批次列印');
    }
  return { selectedAdminPendingIds, lastBatchPrintIds, showBatchPrintPrompt, getApprovalApi, ensureApprovalModule, isAdminPendingSelected, toggleAdminPendingSelect, toggleSelectAllAdminPending, isAdminBatchGroupSelected, toggleAdminBatchGroupSelection, clearAdminPendingSelection, respondToRequest, respondToBatch, adminApprove, adminReject, batchAdminApprove, batchAdminReject, printLastBatchNotices, dismissBatchPrintPrompt, cancelRequest, deleteSubstitutionRecord, sendSelectedBatchNotices, startCombinedReturn, executeEmptySlotAssign, formatRequestSummary, getApproveRiskFlags, formatApproveBatchRiskSummary, getRequestProgressSteps, isPaperFlowRequest, isProxySubmitRequest, submitTriangleRequest, checkUrlCallback, initRequests1 };
});
