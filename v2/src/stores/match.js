/** v2 stores/match.js — 由 v1 setup() §分節機械分解（gen-final.cjs）。 */
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
import { useMutualStore } from './mutual.js';
import { useOutputStore } from './output.js';
import { useRequestsStore } from './requests.js';
import { useSessionStore } from './session.js';
import { useSubmitStore } from './submit.js';
import { useTimetableStore } from './timetable.js';
import { useTourStore } from './tour.js';
import { storeToRefs } from 'pinia';
export const useMatchStore = defineStore('match', () => {
    const batchExchangePreviewSlotKey = ref('');
    const compareWeekSelectionA = ref('source');
    const compareWeekSelectionB = ref('target');
    const quotaPackPreview = ref([]);
    const quotaPackLoading = ref(false);
    const quotaPackError = ref('');
    const quotaPackOptions = computed(() => {
      const a = getMatchApi();
      return a ? a.quotaPackOptions.value : [];
    });
    const quotaFifoPackageId = computed(() => {
      const a = getMatchApi();
      return a ? a.quotaFifoPackageId.value : '';
    });
    const quotaSelectedPack = computed(() => {
      const a = getMatchApi();
      return a ? a.quotaSelectedPack.value : null;
    });
    const personalChanges = computed(() => {
      const a = useHistoryStore().getHistoryApi();
      return a ? a.personalChanges.value : [];
    });
    const scheduleScope = ref('full'); // full | teacher_self_and_class
    const MATCH_PAGE_SIZE = 10;
    const filteredRecommendedTeachers = computed(() => {
      const a = getMatchApi();
      return a ? a.filteredRecommendedTeachers.value : [];
    });
    const filteredExchangeList = computed(() => {
      const a = getMatchApi();
      return a ? a.filteredExchangeList.value : [];
    });
    const displayedRecommendedTeachers = computed(() =>
      filteredRecommendedTeachers.value.slice(0, storeToRefs(useMutualStore()).matchDisplayCount.value)
    );
    const displayedExchangeList = computed(() => {
      const a = getMatchApi();
      return a ? a.displayedExchangeList.value : [];
    });
    const batchCompareViewEmail = ref('');
    const batchCompareSubGroups = computed(() => {
      const a = useSubmitStore().getSubmitApi();
      return a ? a.batchCompareSubGroups.value : [];
    });;
    const exchangeIncomingConflict = computed(() => {
      const a = useSubmitStore().getSubmitApi();
      return a ? a.exchangeIncomingConflict.value : null;
    });
    const hasSubTeacherConflict = computed(() => {
      const a = useSubmitStore().getSubmitApi();
      return a ? a.hasSubTeacherConflict.value : false;
    });
    let _matchApi = null;
const getMatchApi = () => {
      if (_matchApi) return _matchApi;
      if (!UiMatch) {
        console.error('UiMatch 未載入');
        return null;
      }
      _matchApi = UiMatch.create({
        computed, lookupTeacher: useDataStore().lookupTeacher, getTeacherNameByEmail: useDataStore().getTeacherNameByEmail, callGasApi: useGasStore().callGasApi, isAdmin: storeToRefs(useSessionStore()).isAdmin, fetchQuotaSpendPreview: useGasStore().fetchQuotaSpendPreview,
        pendingRequestData: storeToRefs(useMutualStore()).pendingRequestData, QUOTA_DEDUCT_FEE: useTourStore().QUOTA_DEDUCT_FEE, isPeriod8FeeLocked: storeToRefs(useTimetableStore()).isPeriod8FeeLocked, quotaPackPreview,
        quotaPackError, quotaPackLoading, matchMode: storeToRefs(useTourStore()).matchMode, matchDisplayCount: storeToRefs(useMutualStore()).matchDisplayCount, MATCH_PAGE_SIZE,
        matchSearchQuery: storeToRefs(useMutualStore()).matchSearchQuery, recommendedTeachers: storeToRefs(useTourStore()).recommendedTeachers, isMutualCover: storeToRefs(useTourStore()).isMutualCover, recommendedExchangeList: storeToRefs(useTimetableStore()).recommendedExchangeList,
        getWeekDayText: DateUtils.getWeekDayText, formatPeriodText: useTimetableStore().formatPeriodText, exchangeWeekdayFilter: storeToRefs(useMutualStore()).exchangeWeekdayFilter,
        batchExchangePreviewSlotKey, compareWeekSelectionA, compareWeekSelectionB,
        activeCell: storeToRefs(useTourStore()).activeCell, matchShowNoTeacherWarning: storeToRefs(useMutualStore()).matchShowNoTeacherWarning, matchEmptyReasons: storeToRefs(useMutualStore()).matchEmptyReasons, showMatchModal: storeToRefs(useSessionStore()).showMatchModal,
        getExchangeWeekDates: useTimetableStore().getExchangeWeekDates, exchangeWeekOffset: storeToRefs(useMutualStore()).exchangeWeekOffset, formatDateMMDD: DateUtils.formatDateMMDD, toLocalDateStr: DateUtils.toLocalDateStr,
      });
      return _matchApi;
    };

    const setBatchExchangePreviewSlot = (...args) => {
      const a = getMatchApi();
      return a ? a.setBatchExchangePreviewSlot(...args) : undefined;
    };
    const quotaTeacherNameOf = (...args) => {
      const a = getMatchApi();
      return a ? a.quotaTeacherNameOf(...args) : undefined;
    };
    const warmQuotaPackCache = (...args) => {
      const a = getMatchApi();
      return a ? a.warmQuotaPackCache(...args) : undefined;
    };
    const fetchQuotaPackPreview = (...args) => {
      const a = getMatchApi();
      return a ? a.fetchQuotaPackPreview(...args) : undefined;
    };
    const doFetchQuotaPackPreview = (...args) => {
      const a = getMatchApi();
      return a ? a.doFetchQuotaPackPreview(...args) : undefined;
    };
    const resetQuotaPackOverride = (...args) => {
      const a = getMatchApi();
      return a ? a.resetQuotaPackOverride(...args) : undefined;
    };
    const loadMoreMatches = (...args) => {
      const a = getMatchApi();
      return a ? a.loadMoreMatches(...args) : undefined;
    };
    const bindMatchNativeSelect = (...args) => {
      const a = getMatchApi();
      return a ? a.bindMatchNativeSelect(...args) : undefined;
    };
    const unbindMatchNativeSelect = (...args) => {
      const a = getMatchApi();
      return a ? a.unbindMatchNativeSelect(...args) : undefined;
    };
    const selectMatchPreviewSub = (...args) => {
      const a = getMatchApi();
      return a && a.selectMatchPreviewSub ? a.selectMatchPreviewSub(...args) : undefined;
    };
    const selectMatchPreviewExchange = (...args) => {
      const a = getMatchApi();
      return a && a.selectMatchPreviewExchange ? a.selectMatchPreviewExchange(...args) : undefined;
    };
    const clearMatchPreview = (...args) => {
      const a = getMatchApi();
      return a ? a.clearMatchPreview(...args) : undefined;
    };
    const closeMatchModal = (...args) => {
      const a = getMatchApi();
      return a ? a.closeMatchModal(...args) : undefined;
    };
    const getMatchSlotDateMMDD = (...args) => {
      const a = getMatchApi();
      return a ? a.getMatchSlotDateMMDD(...args) : '';
    };
    function initImmediateMatch1() {
    watch(storeToRefs(useMutualStore()).pendingRequestData, (pending) => {
      if (pending && pending.mode === 'exchange') {
        compareWeekSelectionA.value = 'source';
        compareWeekSelectionB.value = 'target';
      }
      if (pending && pending.isExchangeBatch) {
        const batchId = String(pending.submitBatchId || '');
        if (batchId !== storeToRefs(useDataStore()).batchExchangePreviewBatchId.value) {
          storeToRefs(useDataStore()).batchExchangePreviewBatchId.value = batchId;
          const slots = Array.isArray(pending.batchSlots) ? pending.batchSlots : [];
          const first = slots.find(slot => !slot.exchangeSubmitted) || slots[0];
          batchExchangePreviewSlotKey.value = first ? String(first.key) : '';
        }
      } else if (!pending) {
        storeToRefs(useDataStore()).batchExchangePreviewBatchId.value = '';
        batchExchangePreviewSlotKey.value = '';
      }
      if (pending && pending.isBatch) storeToRefs(useDataStore()).batchCompareWeekIndex.value = 0;
    });
    }
  return { batchExchangePreviewSlotKey, compareWeekSelectionA, compareWeekSelectionB, quotaPackPreview, quotaPackLoading, quotaPackError, quotaPackOptions, quotaFifoPackageId, quotaSelectedPack, personalChanges, scheduleScope, MATCH_PAGE_SIZE, filteredRecommendedTeachers, filteredExchangeList, displayedRecommendedTeachers, displayedExchangeList, batchCompareViewEmail, batchCompareSubGroups, exchangeIncomingConflict, hasSubTeacherConflict, getMatchApi, setBatchExchangePreviewSlot, quotaTeacherNameOf, warmQuotaPackCache, fetchQuotaPackPreview, doFetchQuotaPackPreview, resetQuotaPackOverride, loadMoreMatches, bindMatchNativeSelect, unbindMatchNativeSelect, selectMatchPreviewSub, selectMatchPreviewExchange, clearMatchPreview, closeMatchModal, getMatchSlotDateMMDD, initImmediateMatch1 };
});
