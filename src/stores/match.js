/** v2 stores/match.js — 由 v1 setup() §分節機械分解（gen-final.cjs）。 */
import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import DateUtils from '../domain/date-utils.js';
import { ensureUiMatchModule, tabModulesReady } from '../modules/tab-gates.js';
import { useDataStore } from './data.js';
import { ensureEventQuotaLedger } from '../modules/quota-gates.js';
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
    // 互代模式：找人代課清單顯示「該空堂事件」額度（而非總額度），與送出扣包一致。
    const eventQuotaByName = ref({});
    const eventQuotaEventId = ref('');
    const eventQuotaLoading = ref(false);
    const eventQuotaError = ref('');
    let _eventQuotaSig = '';
    // 互代模式：找人代課清單顯示「該空堂事件」額度。
    // 資料只有一個來源：額度帳本（與匯出、發放同一支 API），在前端算出每人各事件包剩餘。
    // 不用 getQuotaSpendPreview、不重試、不分批：失敗就顯示「!」，下次開抽屜會再算。
    const refreshMutualEventQuotas = async () => {
      const tourRefs = storeToRefs(useTourStore());
      const mutualRefs = storeToRefs(useMutualStore());
      const sessionRefs = storeToRefs(useSessionStore());
      const isMutual = !!(tourRefs.isMutualCover && tourRefs.isMutualCover.value);
      const eventId = (isMutual && mutualRefs.mutualImportEventId)
        ? String(mutualRefs.mutualImportEventId.value || '').trim()
        : '';
      const list = (tourRefs.recommendedTeachers && tourRefs.recommendedTeachers.value) || [];
      if (!isMutual || !eventId) {
        _eventQuotaSig = '';
        eventQuotaError.value = '';
        if (eventQuotaEventId.value || Object.keys(eventQuotaByName.value).length) {
          eventQuotaEventId.value = '';
          eventQuotaByName.value = {};
        }
        let stripped = false;
        const cleaned = list.map((t) => {
          if (t && (typeof t.eventQuotaRemaining !== 'undefined' || typeof t.eventQuotaPackageId !== 'undefined')) {
            stripped = true;
            const c = Object.assign({}, t);
            delete c.eventQuotaRemaining;
            delete c.eventQuotaPackageId;
            return c;
          }
          return t;
        });
        if (stripped) tourRefs.recommendedTeachers.value = cleaned;
        return;
      }
      const names = [];
      const seen = {};
      list.forEach((t) => {
        const nm = String((t && (t.name || t.teacherName)) || '').trim();
        if (nm && !seen[nm]) { seen[nm] = true; names.push(nm); }
      });
      if (!names.length) return;
      const sig = eventId + '|' + names.join(',');
      if (sig === _eventQuotaSig && eventQuotaEventId.value === eventId) return;
      eventQuotaLoading.value = true;
      try {
        const gate = await ensureEventQuotaLedger();
        const preview = await gate.loadEventQuotaPreviewFromLedger(names, {
          getSemesterId: () => useSessionStore().currentSemester,
          fetchLedger: (o) => useGasStore().fetchMutualQuotaLedger(o)
        });
        const nowEventId = String((mutualRefs.mutualImportEventId && mutualRefs.mutualImportEventId.value) || '').trim();
        if (nowEventId !== eventId) return;
        let eventName = '';
        try {
          const evs = (sessionRefs.classAwayEvents && sessionRefs.classAwayEvents.value) || [];
          for (let i = 0; i < evs.length; i++) {
            if (String((evs[i] && evs[i].id) || '') === eventId) { eventName = String(evs[i].name || '').trim(); break; }
          }
        } catch (eEv) { /* ignore */ }
        const byName = {};
        (preview || []).forEach((p) => { if (p && p.name) byName[String(p.name)] = p; });
        const quotaDeductFee = useTourStore().QUOTA_DEDUCT_FEE;
        const activityPublicFee = useTourStore().ACTIVITY_PUBLIC_FEE;
        const map = {};
        names.forEach((nm) => {
          const pv = byName[nm] || null;
          const packs = (pv && pv.packs) || [];
          let hit = null;
          for (let k = 0; k < packs.length; k++) {
            if (String(packs[k].eventId || '') === eventId) { hit = packs[k]; break; }
          }
          if (!hit && eventName) {
            for (let k = 0; k < packs.length; k++) {
              if (String(packs[k].eventName || '') === eventName) { hit = packs[k]; break; }
            }
          }
          map[nm] = hit
            ? { remaining: Math.max(0, Math.round((parseFloat(hit.remaining) || 0) * 1000) / 1000), packageId: hit.packageId || '' }
            : { remaining: 0, packageId: '' };
        });
        eventQuotaEventId.value = eventId;
        eventQuotaByName.value = map;
        const cur = (tourRefs.recommendedTeachers && tourRefs.recommendedTeachers.value) || [];
        const patched = cur.map((t) => {
          const nm = String((t && (t.name || t.teacherName)) || '').trim();
          const hit = (nm && map[nm]) || null;
          if (!hit) return t;
          const pending = parseFloat(t.pendingDraft) || 0;
          const net = Math.max(0, Math.round((hit.remaining - pending) * 1000) / 1000);
          if (t.eventQuotaRemaining === net && t.eventQuotaPackageId === hit.packageId) return t;
          const c = Object.assign({}, t, { eventQuotaRemaining: net, eventQuotaPackageId: hit.packageId });
          const totalLeft = typeof c.remainingReleased === 'number'
            ? c.remainingReleased
            : (parseFloat(c.mutualQuota) || 0);
          if (!c.isPeriod8) c.suggestedFee = totalLeft >= 1 ? quotaDeductFee : activityPublicFee;
          return c;
        });
        tourRefs.recommendedTeachers.value = patched;
        eventQuotaError.value = '';
        _eventQuotaSig = sig;
      } catch (eAll) {
        if (typeof console !== 'undefined' && console.error) console.error('[事件額度] 讀取失敗：', eAll);
        eventQuotaError.value = '讀不到';
      } finally {
        eventQuotaLoading.value = false;
      }
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
    const _tourRefs = storeToRefs(useTourStore());
    const _mutualRefs = storeToRefs(useMutualStore());
    watch(() => [
      _tourRefs.recommendedTeachers.value,
      _tourRefs.isMutualCover.value,
      _mutualRefs.mutualImportEventId.value
    ], () => { refreshMutualEventQuotas(); });
    }
    return { batchExchangePreviewSlotKey, compareWeekSelectionA, compareWeekSelectionB, quotaPackPreview, quotaPackLoading, quotaPackError, quotaPackOptions, quotaFifoPackageId, quotaSelectedPack, eventQuotaByName, eventQuotaEventId, eventQuotaLoading, eventQuotaError, refreshMutualEventQuotas, personalChanges, scheduleScope, MATCH_PAGE_SIZE, filteredRecommendedTeachers, filteredExchangeList, displayedRecommendedTeachers, displayedExchangeList, batchCompareViewEmail, batchCompareSubGroups, exchangeIncomingConflict, hasSubTeacherConflict, getMatchApi, ensureMatchModule, setBatchExchangePreviewSlot, quotaTeacherNameOf, warmQuotaPackCache, fetchQuotaPackPreview, doFetchQuotaPackPreview, resetQuotaPackOverride, loadMoreMatches, bindMatchNativeSelect, unbindMatchNativeSelect, selectMatchPreviewSub, selectMatchPreviewExchange, clearMatchPreview, closeMatchModal, getMatchSlotDateMMDD, initImmediateMatch1 };
});
