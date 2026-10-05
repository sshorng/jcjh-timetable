/** v2 stores/history.js — 由 v1 setup() §分節機械分解（gen-final.cjs）。 */
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
import { useHomeroomStore } from './homeroom.js';
import { useInteractionStore } from './interaction.js';
import { useMatchStore } from './match.js';
import { useMutualStore } from './mutual.js';
import { useOutputStore } from './output.js';
import { useRequestsStore } from './requests.js';
import { useSessionStore } from './session.js';
import { useSubmitStore } from './submit.js';
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
