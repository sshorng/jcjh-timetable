/** v2 stores/match.js — 由 v1 setup() §分節機械分解（gen-final.cjs）。 */
import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import DateUtils from '../domain/date-utils.js';
import { ensureUiMatchModule, tabModulesReady } from '../modules/tab-gates.js';
import { useDataStore } from './data.js';
import { useGasStore } from './gas.js';
import { useHistoryStore } from './history.js';
import { useMutualStore } from './mutual.js';
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
// 2.1c：UiMatch 改閘門按需載入（媒合抽屜開啟才抓）；未載入前回 null（既有守衛語義）。
let UiMatch = null;
let _matchModulesPromise = null;
const ensureMatchModule = () => {
  if (!_matchModulesPromise) {
    _matchModulesPromise = ensureUiMatchModule().then((m) => { UiMatch = m; })
      .catch((e) => { _matchModulesPromise = null; throw e; });
  }
  return _matchModulesPromise;
};
    let _matchApi = null;
const getMatchApi = () => {
      // 2.1c：讀 ready 使呼叫端 computed 在模組載入後自動重算（未載入照舊回 null）。
      const _matchReady = tabModulesReady.value.match;
      if (_matchApi) return _matchApi;
      if (!UiMatch) {
        // 未載入一律靜默回 null（載入中／尚未排程皆屬正常；失敗由 ensure 拋錯＋toast）。
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

    const setBatchExchangePreviewSlot = async (...args) => {
      await ensureMatchModule();
      const a = getMatchApi();
      return a ? a.setBatchExchangePreviewSlot(...args) : undefined;
    };
    // 2.1c內聯：純函式（查教師名），免經 matchApi，模組未載也正確（與 ui-match.js 同邏輯）。
    const quotaTeacherNameOf = (email) => {
      const em = String(email || '').toLowerCase().trim();
      if (!em) return '';
      try {
        const lookupTeacher = useDataStore().lookupTeacher;
        const getTeacherNameByEmail = useDataStore().getTeacherNameByEmail;
        const t = (typeof lookupTeacher === 'function' ? lookupTeacher(em) : null);
        const nm = (t && (t.teacherName || t.name)) || (typeof getTeacherNameByEmail === 'function' ? getTeacherNameByEmail(em) : '') || '';
        return String(nm || '').trim();
      } catch (e) { return ''; }
    };
    const warmQuotaPackCache = async (...args) => {
      await ensureMatchModule();
      const a = getMatchApi();
      return a ? a.warmQuotaPackCache(...args) : undefined;
    };
    const fetchQuotaPackPreview = async (...args) => {
      await ensureMatchModule();
      const a = getMatchApi();
      return a ? a.fetchQuotaPackPreview(...args) : undefined;
    };
    const doFetchQuotaPackPreview = async (...args) => {
      await ensureMatchModule();
      const a = getMatchApi();
      return a ? a.doFetchQuotaPackPreview(...args) : undefined;
    };
    const resetQuotaPackOverride = async (...args) => {
      await ensureMatchModule();
      const a = getMatchApi();
      return a ? a.resetQuotaPackOverride(...args) : undefined;
    };
    const loadMoreMatches = async (...args) => {
      await ensureMatchModule();
      const a = getMatchApi();
      return a ? a.loadMoreMatches(...args) : undefined;
    };
    const bindMatchNativeSelect = async (...args) => {
      await ensureMatchModule();
      const a = getMatchApi();
      return a ? a.bindMatchNativeSelect(...args) : undefined;
    };
    const unbindMatchNativeSelect = async (...args) => {
      await ensureMatchModule();
      const a = getMatchApi();
      return a ? a.unbindMatchNativeSelect(...args) : undefined;
    };
    const selectMatchPreviewSub = async (...args) => {
      await ensureMatchModule();
      const a = getMatchApi();
      return a && a.selectMatchPreviewSub ? a.selectMatchPreviewSub(...args) : undefined;
    };
    const selectMatchPreviewExchange = async (...args) => {
      await ensureMatchModule();
      const a = getMatchApi();
      return a && a.selectMatchPreviewExchange ? a.selectMatchPreviewExchange(...args) : undefined;
    };
    const clearMatchPreview = async (...args) => {
      await ensureMatchModule();
      const a = getMatchApi();
      return a ? a.clearMatchPreview(...args) : undefined;
    };
    const closeMatchModal = async (...args) => {
      await ensureMatchModule();
      const a = getMatchApi();
      return a ? a.closeMatchModal(...args) : undefined;
    };
    // 2.1c內聯：純函式（週次日期格式），免經 matchApi（與 ui-match.js 同邏輯；抽屜模板 render 路徑）。
    const getMatchSlotDateMMDD = (dayOfWeek) => {
      if (!dayOfWeek) return '';
      const dates = useTimetableStore().getExchangeWeekDates();
      if (dates && dates[dayOfWeek - 1]) {
        const baseStr = dates[dayOfWeek - 1];
        const offset = parseInt(storeToRefs(useMutualStore()).exchangeWeekOffset.value, 10) || 0;
        if (offset === 0) return DateUtils.formatDateMMDD(baseStr);
        const d = new Date(String(baseStr).replace(/-/g, '/'));
        if (!isNaN(d.getTime())) {
          d.setDate(d.getDate() + offset * 7);
          return DateUtils.formatDateMMDD(DateUtils.toLocalDateStr(d));
        }
        return DateUtils.formatDateMMDD(baseStr);
      }
      return '';
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
  return { batchExchangePreviewSlotKey, compareWeekSelectionA, compareWeekSelectionB, quotaPackPreview, quotaPackLoading, quotaPackError, quotaPackOptions, quotaFifoPackageId, quotaSelectedPack, personalChanges, scheduleScope, MATCH_PAGE_SIZE, filteredRecommendedTeachers, filteredExchangeList, displayedRecommendedTeachers, displayedExchangeList, batchCompareViewEmail, batchCompareSubGroups, exchangeIncomingConflict, hasSubTeacherConflict, getMatchApi, ensureMatchModule, setBatchExchangePreviewSlot, quotaTeacherNameOf, warmQuotaPackCache, fetchQuotaPackPreview, doFetchQuotaPackPreview, resetQuotaPackOverride, loadMoreMatches, bindMatchNativeSelect, unbindMatchNativeSelect, selectMatchPreviewSub, selectMatchPreviewExchange, clearMatchPreview, closeMatchModal, getMatchSlotDateMMDD, initImmediateMatch1 };
});
