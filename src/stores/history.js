/** v2 stores/history.js — 由 v1 setup() §分節機械分解（gen-final.cjs）。 */
import { defineStore } from 'pinia';
import { computed, watch } from 'vue';
import { UiHistory } from '../modules/ui-history.js';
import { useAdminStore } from './admin.js';
import { useDataStore } from './data.js';
import { useGasStore } from './gas.js';
import { useHomeroomStore } from './homeroom.js';
import { useMutualStore } from './mutual.js';
import { useRequestsStore } from './requests.js';
import { useSessionStore } from './session.js';
import { useTimetableStore } from './timetable.js';
import { useTourStore } from './tour.js';
import { storeToRefs } from 'pinia';
export const useHistoryStore = defineStore('history', () => {
    const dashboardStats = computed(() => {
      const h = getHistoryApi();
      return h ? h.dashboardStats.value : null;
    });
    let _historyApi = null;
const getHistoryApi = () => {
      if (_historyApi) return _historyApi;
      if (!UiHistory) {
        console.error('UiHistory 未載入');
        return null;
      }
      _historyApi = UiHistory.create({
        computed,
        loading: storeToRefs(useSessionStore()).loading, loadingMessage: storeToRefs(useSessionStore()).loadingMessage,
        watch,
        user: storeToRefs(useSessionStore()).user, allSchedules: storeToRefs(useSessionStore()).allSchedules, schoolSwaps: storeToRefs(useSessionStore()).schoolSwaps, isSingleWeek: useSessionStore().isSingleWeek, substitutionRecords: storeToRefs(useSessionStore()).substitutionRecords, isAdmin: storeToRefs(useSessionStore()).isAdmin, isStaff: storeToRefs(useSessionStore()).isStaff, getTeacherNameByEmail: useDataStore().getTeacherNameByEmail, requestsList: storeToRefs(useSessionStore()).requestsList,
        isProxySubmitRequest: useRequestsStore().isProxySubmitRequest, historyTypeFilter: storeToRefs(useMutualStore()).historyTypeFilter, historySearchQuery: storeToRefs(useMutualStore()).historySearchQuery, historyFilterMode: storeToRefs(useMutualStore()).historyFilterMode,
        historyFilterDate: storeToRefs(useMutualStore()).historyFilterDate, isHistoryExchangeType: useMutualStore().isHistoryExchangeType, historyPageSize: storeToRefs(useMutualStore()).historyPageSize, historyPage: storeToRefs(useMutualStore()).historyPage,
        flattenBatchDisplayGroups: useHomeroomStore().flattenBatchDisplayGroups,
        pendingSearchQuery: storeToRefs(useTimetableStore()).pendingSearchQuery, myPendingRequests: storeToRefs(useTourStore()).myPendingRequests, mySentRequests: storeToRefs(useTourStore()).mySentRequests, adminPendingRequests: storeToRefs(useTourStore()).adminPendingRequests,
        pendingMyPendingPage: storeToRefs(useTimetableStore()).pendingMyPendingPage, pendingMySentPage: storeToRefs(useTimetableStore()).pendingMySentPage, pendingAdminPage: storeToRefs(useTimetableStore()).pendingAdminPage, pendingPageSize: useDataStore().pendingPageSize,
        dashboardScope: storeToRefs(useAdminStore()).dashboardScope, currentWeekDates: storeToRefs(useTimetableStore()).currentWeekDates,
        historyLoadedMonths: storeToRefs(useDataStore()).historyLoadedMonths, historyFullLoaded: storeToRefs(useDataStore()).historyFullLoaded, historyMonthLoading: storeToRefs(useDataStore()).historyMonthLoading, fetchHistoryMonth: useGasStore().fetchHistoryMonth, mergeRequestsFromServer: useDataStore().mergeRequestsFromServer,
        ensureHistoryMonthLoaded: useDataStore().ensureHistoryMonthLoaded, historyLoadingFull: storeToRefs(useDataStore()).historyLoadingFull, applyInitialPayload: useDataStore().applyInitialPayload, fetchInitialData: useGasStore().fetchInitialData,
        currentSemester: storeToRefs(useSessionStore()).currentSemester,
      });
      return _historyApi;
    };

    const loadHistoryMonth = (...args) => {
      const a = getHistoryApi();
      return a ? a.loadHistoryMonth(...args) : undefined;
    };
    const setHistoryFilterMode = (...args) => {
      const a = getHistoryApi();
      return a ? a.setHistoryFilterMode(...args) : undefined;
    };
    const setHistoryTypeFilter = (...args) => {
      const a = getHistoryApi();
      return a ? a.setHistoryTypeFilter(...args) : undefined;
    };
    const loadFullSemesterHistory = (...args) => {
      const a = getHistoryApi();
      return a ? a.loadFullSemesterHistory(...args) : undefined;
    };
    const reloadWindowedHistory = (...args) => {
      const a = getHistoryApi();
      return a ? a.reloadWindowedHistory(...args) : undefined;
    };
    const getWeekStart = (...args) => {
      const a = getHistoryApi();
      return a ? a.getWeekStart(...args) : '';
    };
    const getMonthStart = (...args) => {
      const a = getHistoryApi();
      return a ? a.getMonthStart(...args) : '';
    };
    const matchPendingSearch = (...args) => {
      const a = getHistoryApi();
      return a ? a.matchPendingSearch(...args) : true;
    };
  return { dashboardStats, getHistoryApi, loadHistoryMonth, setHistoryFilterMode, setHistoryTypeFilter, loadFullSemesterHistory, reloadWindowedHistory, getWeekStart, getMonthStart, matchPendingSearch };
});
