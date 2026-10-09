/** v2 stores/timetable.js — 由 v1 setup() §分節機械分解（gen-final.cjs）。 */
import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import DateUtils from '../domain/date-utils.js';
import FieldMap from '../domain/field-map.js';
import { ensureUiCalendarModule } from '../modules/tab-gates.js';
import { UiClassView } from '../modules/ui-classview.js';
import { UiLineTemplate } from '../modules/ui-line-template.js';
import { UiListHelpers } from '../modules/ui-list-helpers.js';

import { UiSchedule } from '../modules/ui-schedule.js';
import { UiSchoolSwap } from '../modules/ui-schoolswap.js';
import { outputModulesReady } from '../modules/output-gates.js';
import { UiTimetable } from '../modules/ui-timetable.js';
import { useDataStore } from './data.js';
import { useGasStore } from './gas.js';
import { useHistoryStore } from './history.js';
import { useHomeroomStore } from './homeroom.js';
import { useInteractionStore } from './interaction.js';
import { useMatchStore } from './match.js';
import { useMutualStore } from './mutual.js';
import { useOutputStore } from './output.js';
import { useRequestsStore } from './requests.js';
import { useSessionStore } from './session.js';
import { useSubmitStore } from './submit.js';
import { useTourStore } from './tour.js';
import { storeToRefs } from 'pinia';
export const useTimetableStore = defineStore('timetable', () => {
  const { isTriangleRequest } = UiListHelpers;
  const { getLineHandledSlot, isCombinedReturnRequest } = UiLineTemplate;
    let _calendarApi = null;
    const parseScheduleClasses = (raw) => (DateUtils && DateUtils.parseCombinedClasses)
      ? DateUtils.parseCombinedClasses(raw)
      : String(raw || '').split(/[、,，/／|｜\s]+/).map(s => s.trim()).filter(Boolean);
    const timetablePeriods = (DateUtils && DateUtils.getTimetablePeriods)
      ? DateUtils.getTimetablePeriods()
      : [0, 1, 2, 3, 4, 45, 5, 6, 7, 8];
    const formatPeriodText = (p) =>
      (DateUtils && DateUtils.formatPeriodText)
        ? DateUtils.formatPeriodText(p)
         : (Number(p) === 0 ? '早自習' : (Number(p) === 45 ? '午休' : ('第' + p + '節')));
    const isCombinedClass = (raw) =>
      !!(DateUtils && DateUtils.isCombinedClass && DateUtils.isCombinedClass(raw));
    const currentWeekDates = computed(() => {
      const a = getScheduleApi();
      return a ? a.currentWeekDates.value : [];
    });
    const classUsesPublicData = computed(() => storeToRefs(useMutualStore()).classReadonlyMode.value || storeToRefs(useSessionStore()).userRole.value === 'teacher');
    const classScheduleRows = computed(() => classUsesPublicData.value ? storeToRefs(useMutualStore()).classViewSchedules.value : storeToRefs(useSessionStore()).allSchedules.value);
    const classSubstitutionRows = computed(() => classUsesPublicData.value ? storeToRefs(useMutualStore()).classViewSubstitutionRecords.value : storeToRefs(useSessionStore()).substitutionRecords.value);
    const displayTimetableTeachers = computed(() => {
      const a = getScheduleApi();
      return a ? a.displayTimetableTeachers.value : [];
    });
    const TT_PAGE_SIZE_DEFAULT = 10;
    const ttPageSize = ref(TT_PAGE_SIZE_DEFAULT);
    const ttPage = ref(1);
    const ttTotalPages = computed(() =>
      Math.max(1, Math.ceil((displayTimetableTeachers.value || []).length / (ttPageSize.value || TT_PAGE_SIZE_DEFAULT)))
    );
    const visibleTimetableTeachers = computed(() => {
      const a = getScheduleApi();
      return a ? a.visibleTimetableTeachers.value : [];
    });
    const ttNeedPager = computed(() => (displayTimetableTeachers.value || []).length > ttPageSize.value);
    const changeTtPage = (n) => {
      ttPage.value = Math.max(1, Math.min(n, ttTotalPages.value));
    };
    const pendingCount = computed(() => {
      let count = storeToRefs(useTourStore()).myPendingRequests.value.length;
      if (storeToRefs(useSessionStore()).isAdmin.value || storeToRefs(useSessionStore()).isStaff.value) count += storeToRefs(useTourStore()).adminPendingRequests.value.length;
      return count;
    });
    const myInviteCount = computed(() => storeToRefs(useTourStore()).myPendingRequests.value.length);
    const adminTodoCount = computed(() => (storeToRefs(useSessionStore()).isAdmin.value || storeToRefs(useSessionStore()).isStaff.value) ? storeToRefs(useTourStore()).adminPendingRequests.value.length : 0);
    const quickTodoSentOpen = computed(() =>
      (storeToRefs(useTourStore()).mySentRequests.value || []).filter(r =>
        r.status === 'pending_teacher' || r.status === 'pending_admin'
      )
    );
    const hasQuickTodo = computed(() =>
      (storeToRefs(useTourStore()).myPendingRequests.value || []).length > 0 || quickTodoSentOpen.value.length > 0
    );
    const allTeachersList = computed(() => {
      const excludeName = storeToRefs(useTourStore()).activeCell.value?.teacherEmail || useDataStore().getTeacherNameByEmail(storeToRefs(useSessionStore()).user.value?.email);
      return storeToRefs(useSessionStore()).teachersList.value.filter(t => (t.teacherName || t.name) !== excludeName);
    });
    const teachersListDetails = computed(() => storeToRefs(useSessionStore()).teachersList.value);
    // 教師管理大表分頁（200 人規模直接渲染會頓；沿用 tt 分頁模式）
    const TEACHERS_PAGE_SIZE_DEFAULT = 50;
    const teachersPageSize = ref(TEACHERS_PAGE_SIZE_DEFAULT);
    const teachersPage = ref(1);
    const teachersTotalPages = computed(() => {
      const list = teachersListDetails.value || [];
      return Math.max(1, Math.ceil(list.length / (teachersPageSize.value || TEACHERS_PAGE_SIZE_DEFAULT)));
    });
    const teachersNeedPager = computed(() => (teachersListDetails.value || []).length > teachersPageSize.value);
    const pagedTeachersListDetails = computed(() => {
      const { rows } = UiListHelpers.paginateList(
        teachersListDetails.value, teachersPage.value, teachersPageSize.value
      );
      return rows;
    });
    const changeTeachersPage = (n) => {
      teachersPage.value = UiListHelpers.clampPage(n, teachersTotalPages.value);
    };
    const accountingPlanOptions = computed(() => {
      const _outputReady = outputModulesReady.value;
      const a = useOutputStore().getReportApi();
      return a ? a.accountingPlanOptions.value : [];
    });
    const getExpensePlanSummary = (value) => FieldMap && FieldMap.formatExpensePlanSummary
      ? FieldMap.formatExpensePlanSummary(value)
      : String(value || '預設').trim() || '預設';
    const isExpensePlanSlotConfig = (value) => {
      if (!FieldMap || typeof FieldMap.parseExpensePlan !== 'function') return false;
      return FieldMap.parseExpensePlan(value).mode === 'slots';
    };
    const pendingHomeroomRecords = computed(() => {
      return (storeToRefs(useSessionStore()).homeroomRecords.value || [])
        .filter(r => r && r.enabled !== false && String(r.status || '').toLowerCase() !== 'cancelled')
        .filter(useHomeroomStore().isBillableHomeroomRecord)
        .filter(r => !r.actualTeacherName);
    });
    const getHomeroomCoverCandidates = (record) => {
      const original = String(record && record.originalTeacherName || '').toLowerCase();
      return (storeToRefs(useSessionStore()).teachersList.value || [])
        .filter(t => t && (t.teacherName || t.name) && String(t.teacherName || t.name).toLowerCase() !== original)
        .slice()
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'zh-Hant'));
    };
    const filteredManualCoverTeachers = computed(() => {
      const a = useHomeroomStore().getHomeroomApi();
      return a ? a.filteredManualCoverTeachers.value : [];
    });
    const getTodayYmdStr = DateUtils.getTodayString;
    const homeroomTeachersList = computed(() => {
      return (storeToRefs(useSessionStore()).teachersList.value || []).filter(t => {
        const title = String(t && t.jobTitle || '').trim();
        return title.indexOf('導師') >= 0;
      }).sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'zh-Hant'));
    });
    const showManualHomeroomModal = ref(false);
    const homeroomStatusFilter = ref('all');
    const manualHomeroomForm = ref({
      leaveEmail: '',
      className: '',
         date: getTodayYmdStr(),
         leaveTimeType: '全天',
         leaveTime: '08:00~16:00',
      actualTeacherEmail: '',
      note: ''
    });
    const currentMonthHomeroomRecords = computed(() => {
      const a = useHomeroomStore().getHomeroomApi();
      return a ? a.currentMonthHomeroomRecords.value : [];
    });
    const currentMonthHomeroomFeeTotal = computed(() => {
      return (currentMonthHomeroomRecords.value || []).reduce((sum, r) => sum + (Number(r.feeAmount) || 455), 0);
    });
    const currentMonthHomeroomAssignedCount = computed(() => {
      return (currentMonthHomeroomRecords.value || []).filter(r => !!r.actualTeacherName).length;
    });
    const currentMonthHomeroomPendingCount = computed(() => {
      return (currentMonthHomeroomRecords.value || []).filter(r => !r.actualTeacherName).length;
    });
    const exchangeTeachersList = computed(() => {
      const a = useHomeroomStore().getHomeroomApi();
      return a ? a.exchangeTeachersList.value : [];
    });
    const myTeacherProfile = computed(() => {
      return storeToRefs(useSessionStore()).user.value ? useDataStore().lookupTeacher(storeToRefs(useSessionStore()).user.value.email) : null;
    });
    const isRequestValid = computed(() => {
      const a = useHomeroomStore().getHomeroomApi();
      return a ? a.isRequestValid.value : false;
    });
    const filteredHistoryRecords = computed(() => {
      const a = useHistoryStore().getHistoryApi();
      return a ? a.filteredHistoryRecords.value : [];
    });
    const dateFilteredHistoryRecords = computed(() => {
      const a = useHistoryStore().getHistoryApi();
      return a ? a.dateFilteredHistoryRecords.value : [];
    });
    const batchGroupExpanded = ref({});
    const getBatchGroupStateKey = (scope, batchId) =>
      String(scope || '') + '|' + String(batchId || '').trim().toLowerCase();
    const isBatchGroupExpanded = (scope, batchId) =>
      !!batchGroupExpanded.value[getBatchGroupStateKey(scope, batchId)];
    const toggleBatchGroup = (scope, batchId) => {
      const key = getBatchGroupStateKey(scope, batchId);
      const next = Object.assign({}, batchGroupExpanded.value);
      if (next[key]) delete next[key];
      else next[key] = true;
      batchGroupExpanded.value = next;
    };
    const historyBatchGroups = computed(() => {
      const a = useHistoryStore().getHistoryApi();
      return a ? a.historyBatchGroups.value : [];
    });
    const historyTotalPages = computed(() => {
      const a = useHistoryStore().getHistoryApi();
      return a ? a.historyTotalPages.value : 1;
    });
    const paginatedHistoryRecords = computed(() => {
      const a = useHistoryStore().getHistoryApi();
      return a ? a.paginatedHistoryRecords.value : [];
    });
    const pendingMyPendingPage = ref(1);
    const pendingMySentPage = ref(1);
    const pendingAdminPage = ref(1);
    const pendingSearchQuery = ref('');
    const filteredMyPendingRequests = computed(() => {
      const a = useHistoryStore().getHistoryApi();
      return a ? a.filteredMyPendingRequests.value : [];
    });
    const filteredMySentRequests = computed(() => {
      const a = useHistoryStore().getHistoryApi();
      return a ? a.filteredMySentRequests.value : [];
    });
    const filteredAdminPendingRequests = computed(() => {
      const a = useHistoryStore().getHistoryApi();
      return a ? a.filteredAdminPendingRequests.value : [];
    });
    const paginatedMyPending = computed(() => {
      const a = useHistoryStore().getHistoryApi();
      return a ? a.paginatedMyPending.value : [];
    });
    const sentBatchGroups = computed(() => {
      const a = useHistoryStore().getHistoryApi();
      return a ? a.sentBatchGroups.value : [];
    });
    const adminPendingBatchGroups = computed(() => {
      const a = useHistoryStore().getHistoryApi();
      return a ? a.adminPendingBatchGroups.value : [];
    });
    const paginatedMySent = computed(() => {
      const a = useHistoryStore().getHistoryApi();
      return a ? a.paginatedMySent.value : [];
    });
    const paginatedAdminPending = computed(() => {
      const a = useHistoryStore().getHistoryApi();
      return a ? a.paginatedAdminPending.value : [];
    });
    const pendingMyPendingTotal = computed(() => {
      const a = useHistoryStore().getHistoryApi();
      return a ? a.pendingMyPendingTotal.value : 1;
    });
    const pendingMySentTotal = computed(() => {
      const a = useHistoryStore().getHistoryApi();
      return a ? a.pendingMySentTotal.value : 1;
    });
    const pendingAdminTotal = computed(() => {
      const a = useHistoryStore().getHistoryApi();
      return a ? a.pendingAdminTotal.value : 1;
    });
    const recommendedExchangeList = computed(() => {
      const a = useHomeroomStore().getHomeroomApi();
      return a ? a.recommendedExchangeList.value : [];
    });
    const isPeriod8FeeLocked = computed(() => {
      const a = useSubmitStore().getSubmitApi();
      return a ? a.isPeriod8FeeLocked.value : false;
    });
    const isSubFeeLockedToSelf = isPeriod8FeeLocked;
    const quotaDeductPreview = computed(() => {
      const a = useHomeroomStore().getHomeroomApi();
      return a ? a.quotaDeductPreview.value : null;
    });
    const quotaDeductInsufficient = computed(() =>
      !!(quotaDeductPreview.value && quotaDeductPreview.value.some(q => q.short))
    );
    let _timetableApi = null;
    let _classViewApi = null;
    let _schoolSwapApi = null;
    let _scheduleApi = null;
// 2.1b：UiCalendar 改閘門按需載入（加入日曆動作才抓）；未載入前回 null（既有守衛語義）。
let UiCalendar = null;
let _calendarModulesPromise = null;
const ensureCalendarModule = () => {
  if (!_calendarModulesPromise) {
    _calendarModulesPromise = ensureUiCalendarModule().then((m) => { UiCalendar = m; })
      .catch((e) => { _calendarModulesPromise = null; throw e; });
  }
  return _calendarModulesPromise;
};
const getCalendarApi = () => {
      if (_calendarApi) return _calendarApi;
      if (!UiCalendar) {
        // 未載入一律靜默回 null（載入中／尚未排程皆屬正常；失敗由 ensure 拋錯＋toast）。
        return null;
      }
      _calendarApi = UiCalendar.create({
        user: storeToRefs(useSessionStore()).user, substitutionRecords: storeToRefs(useSessionStore()).substitutionRecords, getTeacherNameByEmail: useDataStore().getTeacherNameByEmail,
        isExchangeLikeRequest: useMutualStore().isExchangeLikeRequest, isTriangleRequest, getTriangleGroupRequests: useDataStore().getTriangleGroupRequests,
        getTargetClassAndSubject: useMutualStore().getTargetClassAndSubject, isCombinedReturnRequest, formatPeriodText
      });
      return _calendarApi;
    };

const getTimetableApi = () => {
      if (_timetableApi) return _timetableApi;
      if (!UiTimetable) {
        console.error('UiTimetable 未載入');
        return null;
      }
      _timetableApi = UiTimetable.create({
         computed,
         watch,
         allSchedules: storeToRefs(useSessionStore()).allSchedules, schoolSwaps: storeToRefs(useSessionStore()).schoolSwaps, substitutionRecords: storeToRefs(useSessionStore()).substitutionRecords, substitutionsLookup: storeToRefs(useSubmitStore()).substitutionsLookup, allPendingRequests: storeToRefs(useTourStore()).allPendingRequests,
         requestsList: storeToRefs(useSessionStore()).requestsList,
         activeCell: storeToRefs(useTourStore()).activeCell, inputRequestDate: storeToRefs(useTourStore()).inputRequestDate, teachersList: storeToRefs(useSessionStore()).teachersList, timetablePeriods,
         trianglePickB: storeToRefs(useTourStore()).trianglePickB, trianglePickC: storeToRefs(useTourStore()).trianglePickC, triangleCandidateSearch: storeToRefs(useOutputStore()).triangleCandidateSearch, triangleCandidateDisplayCount: storeToRefs(useOutputStore()).triangleCandidateDisplayCount,
         triangleReason: storeToRefs(useTourStore()).triangleReason, triangleNote: storeToRefs(useTourStore()).triangleNote,
         getExchangeWeekDates, showTriangleTimetablePreview: storeToRefs(useMutualStore()).showTriangleTimetablePreview,
         notificationsSuppressed: storeToRefs(useSubmitStore()).notificationsSuppressed, paperFlow: storeToRefs(useSubmitStore()).paperFlow, openLineMessageEditor: useMutualStore().openLineMessageEditor,
         isPaperFlowRequest: useRequestsStore().isPaperFlowRequest, isProxySubmitRequest: useRequestsStore().isProxySubmitRequest, getLineHandledSlot,
         lookupTeacher: useDataStore().lookupTeacher, isCombinedClass,
        // 只用目前可見頁的教師建 grid，全校模式才真正省算力
         displayTimetableTeachers: visibleTimetableTeachers, currentWeekDates,
         getTeacherNameByEmail: useDataStore().getTeacherNameByEmail, getTeacherSubjectByEmail: useDataStore().getTeacherSubjectByEmail, callGasApi: useGasStore().callGasApi, formatDateMMDD: DateUtils.formatDateMMDD, isSingleWeek: useSessionStore().isSingleWeek,
        isEmptySlotAssignmentRequest: useSessionStore().isEmptySlotAssignmentRequest, isCourseAdjustmentOnlyRequest: useSessionStore().isCourseAdjustmentOnlyRequest,
        isClassAwayOnDate: useSessionStore().isClassAwayOnDate, getWeekDayText: DateUtils.getWeekDayText,
         batchSelectMode: storeToRefs(useTourStore()).batchSelectMode, batchFlowMode: storeToRefs(useTourStore()).batchFlowMode, isBatchSlotSelected: useSubmitStore().isBatchSlotSelected, isMutualCover: storeToRefs(useTourStore()).isMutualCover, getMutualDraftAt: useMutualStore().getMutualDraftAt,
         mutualDrafts: storeToRefs(useTourStore()).mutualDrafts, mutualAwayClasses: storeToRefs(useTourStore()).mutualAwayClasses, mutualActivityStart: storeToRefs(useTourStore()).mutualActivityStart, mutualActivityEnd: storeToRefs(useTourStore()).mutualActivityEnd,
         mutualActivityStartPeriod: storeToRefs(useTourStore()).mutualActivityStartPeriod, mutualActivityEndPeriod: storeToRefs(useTourStore()).mutualActivityEndPeriod, isMutualActivitySlotInRange: useTourStore().isMutualActivitySlotInRange, DAC: useTourStore().DAC,
        getTodayString: DateUtils.getTodayString, getClassAwayEventsForView: useSessionStore().getClassAwayEventsForView, semesterEndDate: storeToRefs(useSessionStore()).semesterEndDate, classList: storeToRefs(useMutualStore()).classList,
      });
      return _timetableApi;
    };

const getClassViewApi = () => {
      if (_classViewApi) return _classViewApi;
      if (!UiClassView) {
        console.error('UiClassView 未載入');
        return null;
      }
      _classViewApi = UiClassView.create({
        computed,
        isTriangleRequest, isCombinedReturnRequest,
        requestsList: storeToRefs(useSessionStore()).requestsList, allPendingRequests: storeToRefs(useTourStore()).allPendingRequests, isExchangeLikeRequest: useMutualStore().isExchangeLikeRequest,
        substitutionRecords: storeToRefs(useSessionStore()).substitutionRecords, getTeacherNameByEmail: useDataStore().getTeacherNameByEmail, classViewSchedules: storeToRefs(useMutualStore()).classViewSchedules, selectedClass: storeToRefs(useMutualStore()).selectedClass,
        selectedClassWeekDates: storeToRefs(useMutualStore()).selectedClassWeekDates, classSubstitutionRows, getWeekDayText: DateUtils.getWeekDayText, formatDateMMDD: DateUtils.formatDateMMDD,
        isQuotaDeductFee: useTourStore().isQuotaDeductFee, formatPeriodText, classUsesPublicData, classViewSchoolSwaps: storeToRefs(useMutualStore()).classViewSchoolSwaps,
        schoolSwaps: storeToRefs(useSessionStore()).schoolSwaps, buildClassSchoolSwapChanges, classScheduleRows, isSingleWeek: useSessionStore().isSingleWeek
      });
      return _classViewApi;
    };

const getSchoolSwapApi = () => {
      if (_schoolSwapApi) return _schoolSwapApi;
      if (!UiSchoolSwap) {
        console.error('UiSchoolSwap 未載入');
        return null;
      }
      _schoolSwapApi = UiSchoolSwap.create({
        computed, callGasApi: useGasStore().callGasApi, currentWeekDates, schoolSwapModalMode: storeToRefs(useSessionStore()).schoolSwapModalMode, schoolSwapForm: storeToRefs(useSessionStore()).schoolSwapForm,
        showSchoolSwapModal: storeToRefs(useSessionStore()).showSchoolSwapModal, schoolSwaps: storeToRefs(useSessionStore()).schoolSwaps, clearScheduleCache, softRefreshInBackground: useDataStore().softRefreshInBackground,
        schoolSwapWeekdayNumber: useSessionStore().schoolSwapWeekdayNumber, schoolSwapSaving: storeToRefs(useSessionStore()).schoolSwapSaving, isSingleWeek: useSessionStore().isSingleWeek
      });
      return _schoolSwapApi;
    };

const getScheduleApi = () => {
      if (_scheduleApi) return _scheduleApi;
      if (!UiSchedule) {
        console.error('UiSchedule 未載入');
        return null;
      }
      _scheduleApi = UiSchedule.create({
        computed, classDirectory: storeToRefs(useMutualStore()).classDirectory, classScheduleRows, classSubstitutionRows,
        period8WeekDates: storeToRefs(useMutualStore()).period8WeekDates, period8Ready: storeToRefs(useDataStore()).period8Ready,
        allSchedules: storeToRefs(useSessionStore()).allSchedules, substitutionRecords: storeToRefs(useSessionStore()).substitutionRecords, classAwayEvents: storeToRefs(useSessionStore()).classAwayEvents, semesterEndDate: storeToRefs(useSessionStore()).semesterEndDate,
        getTeacherNameByEmail: useDataStore().getTeacherNameByEmail, getClassAwayEventName, isSingleWeek: useSessionStore().isSingleWeek, parseScheduleClasses,
        selectedClass: storeToRefs(useMutualStore()).selectedClass, selectedClassWeekDates: storeToRefs(useMutualStore()).selectedClassWeekDates, classReadonlyMode: storeToRefs(useMutualStore()).classReadonlyMode, userRole: storeToRefs(useSessionStore()).userRole,
        classViewSchoolSwaps: storeToRefs(useMutualStore()).classViewSchoolSwaps, schoolSwaps: storeToRefs(useSessionStore()).schoolSwaps, selectedWeekDate: storeToRefs(useSessionStore()).selectedWeekDate, toLocalDateStr: DateUtils.toLocalDateStr, user: storeToRefs(useSessionStore()).user,
        canViewAllTimetables: storeToRefs(useSessionStore()).canViewAllTimetables, teachersList: storeToRefs(useSessionStore()).teachersList, lookupTeacher: useDataStore().lookupTeacher, parseTeacherSubjects: useSessionStore().parseTeacherSubjects,
        searchQuery: storeToRefs(useSessionStore()).searchQuery, selectedSubject: storeToRefs(useSessionStore()).selectedSubject, isMutualCover: storeToRefs(useTourStore()).isMutualCover,
        selectedClassDate: storeToRefs(useMutualStore()).selectedClassDate, period8WeekDate: storeToRefs(useMutualStore()).period8WeekDate,
        showMatchModal: storeToRefs(useSessionStore()).showMatchModal, activeCell: storeToRefs(useTourStore()).activeCell, ttPageSize, TT_PAGE_SIZE_DEFAULT, ttPage,
      });
      return _scheduleApi;
    };

    const resolveCellFromBaseAndSubs = (...args) => getTimetableApi().resolveCellFromBaseAndSubs(...args);
    const convertRequestsToSubstitutions = (...args) => getTimetableApi().convertRequestsToSubstitutions(...args);
    const getClassAwayEventName = (...args) => getTimetableApi().getClassAwayEventName(...args);
    const openAddSchoolSwapModal = (...args) => getSchoolSwapApi().openAddSchoolSwapModal(...args);
    const openEditSchoolSwapModal = (...args) => getSchoolSwapApi().openEditSchoolSwapModal(...args);
    const saveSchoolSwap = (...args) => getSchoolSwapApi().saveSchoolSwap(...args);
    const deleteSchoolSwap = (...args) => getSchoolSwapApi().deleteSchoolSwap(...args);
    const buildClassSchoolSwapChanges = (...args) => getSchoolSwapApi().buildClassSchoolSwapChanges(...args);
    const getCalendarDetails = async (...args) => {
      await ensureCalendarModule();
      const a = getCalendarApi();
      return a ? a.getCalendarDetails(...args) : null;
    };
    const addToGoogleCalendar = async (...args) => {
      await ensureCalendarModule();
      const a = getCalendarApi();
      return a ? a.addToGoogleCalendar(...args) : undefined;
    };
    const downloadIcsCalendar = async (...args) => {
      await ensureCalendarModule();
      const a = getCalendarApi();
      return a ? a.downloadIcsCalendar(...args) : undefined;
    };
    const addEventToCalendar = async (...args) => {
      await ensureCalendarModule();
      const a = getCalendarApi();
      return a ? a.addEventToCalendar(...args) : undefined;
    };
    const timetableApiOrNull = () => getTimetableApi();
    const resolveDetailRequest = (...args) => getClassViewApi().resolveDetailRequest(...args);
    const copyLineMessageForRequest = (...args) => getTimetableApi().copyLineMessageForRequest(...args);
    const getExchangeWeekDates = (...args) => getTimetableApi().getExchangeWeekDates(...args);
    const fetchRecommendations = () => {
      const a = getTimetableApi();
      if (!a) return;
      a.fetchRecommendations({
        matchMode: storeToRefs(useTourStore()).matchMode, inputRequestDate: storeToRefs(useTourStore()).inputRequestDate, activeCell: storeToRefs(useTourStore()).activeCell, teachersList: storeToRefs(useSessionStore()).teachersList, getTeacherSubjectByEmail: useDataStore().getTeacherSubjectByEmail,
        activityBalanceCtx: useMutualStore().activityBalanceCtx, recommendationLoading: storeToRefs(useTourStore()).recommendationLoading, matchSearchQuery: storeToRefs(useMutualStore()).matchSearchQuery, matchDisplayCount: storeToRefs(useMutualStore()).matchDisplayCount,
        matchShowNoTeacherWarning: storeToRefs(useMutualStore()).matchShowNoTeacherWarning, matchEmptyReasons: storeToRefs(useMutualStore()).matchEmptyReasons, recommendedTeachers: storeToRefs(useTourStore()).recommendedTeachers,
        scheduleScope: storeToRefs(useMatchStore()).scheduleScope,
        fetchMatchCandidates: typeof useGasStore().fetchMatchCandidates === 'function' ? useGasStore().fetchMatchCandidates : null
      });
    };
    const getApprovedScheduleForDate = (teacherEmail, dateStr, period, dayOfWeek) => {
      const a = getTimetableApi();
      return a ? a.getApprovedScheduleForDate(teacherEmail, dateStr, period, dayOfWeek) : null;
    };
    const getScheduleForDate = (teacherEmail, dateStr, period, dayOfWeek) => {
      const a = getTimetableApi();
      return a ? a.getScheduleForDate(teacherEmail, dateStr, period, dayOfWeek) : null;
    };
    const clearScheduleCache = () => { const a = getTimetableApi(); if (a) a.clearScheduleCache(); };
    const findCombinedReturnCandidates = (...args) => getTimetableApi().findCombinedReturnCandidates(...args);
    const triangleTeacherKey = (...args) => getTimetableApi().triangleTeacherKey(...args);
    const triangleSlotKey = (...args) => getTimetableApi().triangleSlotKey(...args);
    const triangleCellIsUsable = (...args) => getTimetableApi().triangleCellIsUsable(...args);
    const triangleSourceParticipant = (...args) => getTimetableApi().triangleSourceParticipant(...args);
    const triangleCandidateParticipant = (...args) => getTimetableApi().triangleCandidateParticipant(...args);
    const triangleCandidateIsRestricted = (...args) => getTimetableApi().triangleCandidateIsRestricted(...args);
    const buildTriangleOccupiedByTeacher = (...args) => getTimetableApi().buildTriangleOccupiedByTeacher(...args);
    const triangleCandidateSearchText = (...args) => getTimetableApi().triangleCandidateSearchText(...args);
    const createTriangleScheduleGetter = (...args) => getTimetableApi().createTriangleScheduleGetter(...args);
    const validateTriangleSelection = (...args) => getTimetableApi().validateTriangleSelection(...args);
    const triangleCandidateCanMoveTo = (...args) => getTimetableApi().triangleCandidateCanMoveTo(...args);
    const triangleCandidateSort = (...args) => getTimetableApi().triangleCandidateSort(...args);
    const triangleCandidatePriority = (...args) => getTimetableApi().triangleCandidatePriority(...args);
    const triangleCandidateBPriority = (...args) => getTimetableApi().triangleCandidateBPriority(...args);
    const selectTriangleCandidateB = (...args) => getTimetableApi().selectTriangleCandidateB(...args);
    const selectTriangleCandidateC = (...args) => getTimetableApi().selectTriangleCandidateC(...args);
    const loadMoreTriangleCandidates = (...args) => getTimetableApi().loadMoreTriangleCandidates(...args);
    const openTriangleTimetablePreview = (...args) => getTimetableApi().openTriangleTimetablePreview(...args);
    const resetTriangleDraft = (...args) => getTimetableApi().resetTriangleDraft(...args);
    const isAwayClassCell = (className, dateStr, period) => {
      const a = getTimetableApi();
      return a ? a.isAwayClassCell(className, dateStr, period) : false;
    };
    const getClassCellClassForDate = (teacherEmail, dateStr, period, dayOfWeek) => {
      const a = getTimetableApi();
      return a ? a.getClassCellClassForDate(teacherEmail, dateStr, period, dayOfWeek) : 'is-empty';
    };
    const getClassCellClassForClass = (className, day, period) => {
      const a = getTimetableApi();
       return a
         ? a.getClassCellClassForClass({ classSchedules: storeToRefs(useInteractionStore()).classSchedules, selectedClassWeekDates: storeToRefs(useMutualStore()).selectedClassWeekDates, classSubstitutionMap: storeToRefs(useMutualStore()).classSubstitutionMap, isClassAwayOnDate: useSessionStore().isClassAwayOnDate }, className, day, period)
        : 'is-empty';
    };
    const mapPublicClassRequests = (...args) => getClassViewApi().mapPublicClassRequests(...args);
    const cellFromGrid = (email, day, period) => {
      const a = getTimetableApi();
      return a ? a.cellFromGrid(email, day, period) : null;
    };
    const findPriorDutyAtSlot = (...args) => getTimetableApi().findPriorDutyAtSlot(...args);
    const normalizeRechangeRequestId = (...args) => getTimetableApi().normalizeRechangeRequestId(...args);
    const isEffectiveChangedDuty = (...args) => getTimetableApi().isEffectiveChangedDuty(...args);
    const hasOtherChangedDutyAtSlot = (...args) => getTimetableApi().hasOtherChangedDutyAtSlot(...args);
    const resolveHistoryLeaveClassSubject = (...args) => getTimetableApi().resolveHistoryLeaveClassSubject(...args);
    const resolveRestrictionForHistoryRec = (...args) => getTimetableApi().resolveRestrictionForHistoryRec(...args);
    const isHistoryLeaveRechanged = (...args) => getTimetableApi().isHistoryLeaveRechanged(...args);
    const isHistoryExchangeRechanged = (...args) => getTimetableApi().isHistoryExchangeRechanged(...args);
    const isRequestLeaveRechanged = (...args) => getTimetableApi().isRequestLeaveRechanged(...args);
    const isRequestExchangeRechanged = (...args) => getTimetableApi().isRequestExchangeRechanged(...args);
    const formatHistoryLeaveSlot = (...args) => getTimetableApi().formatHistoryLeaveSlot(...args);
    const formatHistoryExchangeSlot = (...args) => getTimetableApi().formatHistoryExchangeSlot(...args);
    const findBaseScheduleSlot = (...args) => getTimetableApi().findBaseScheduleSlot(...args);
    const isHistoryLeaveRestricted = (...args) => getTimetableApi().isHistoryLeaveRestricted(...args);
    const isHistoryExchangeRestricted = (...args) => getTimetableApi().isHistoryExchangeRestricted(...args);
    function initImmediateTimetable1() {
    watch(ttPageSize, () => { ttPage.value = 1; });
    }
    function initImmediateTimetable2() {
    watch(ttTotalPages, (max) => {
      if (ttPage.value > max) ttPage.value = max;
    });
    }

  return { parseScheduleClasses, timetablePeriods, formatPeriodText, isCombinedClass, currentWeekDates, classUsesPublicData, classScheduleRows, classSubstitutionRows, displayTimetableTeachers, TT_PAGE_SIZE_DEFAULT, ttPageSize, ttPage, ttTotalPages, visibleTimetableTeachers, ttNeedPager, changeTtPage, pendingCount, myInviteCount, adminTodoCount, quickTodoSentOpen, hasQuickTodo, allTeachersList, teachersListDetails, TEACHERS_PAGE_SIZE_DEFAULT, teachersPageSize, teachersPage, teachersTotalPages, teachersNeedPager, pagedTeachersListDetails, changeTeachersPage, accountingPlanOptions, getExpensePlanSummary, isExpensePlanSlotConfig, pendingHomeroomRecords, getHomeroomCoverCandidates, filteredManualCoverTeachers, getTodayYmdStr, homeroomTeachersList, showManualHomeroomModal, homeroomStatusFilter, manualHomeroomForm, currentMonthHomeroomRecords, currentMonthHomeroomFeeTotal, currentMonthHomeroomAssignedCount, currentMonthHomeroomPendingCount, exchangeTeachersList, myTeacherProfile, isRequestValid, filteredHistoryRecords, dateFilteredHistoryRecords, batchGroupExpanded, getBatchGroupStateKey, isBatchGroupExpanded, toggleBatchGroup, historyBatchGroups, historyTotalPages, paginatedHistoryRecords, pendingMyPendingPage, pendingMySentPage, pendingAdminPage, pendingSearchQuery, filteredMyPendingRequests, filteredMySentRequests, filteredAdminPendingRequests, paginatedMyPending, sentBatchGroups, adminPendingBatchGroups, paginatedMySent, paginatedAdminPending, pendingMyPendingTotal, pendingMySentTotal, pendingAdminTotal, recommendedExchangeList, isPeriod8FeeLocked, isSubFeeLockedToSelf, quotaDeductPreview, quotaDeductInsufficient, ensureCalendarModule, getCalendarApi, getTimetableApi, getClassViewApi, getSchoolSwapApi, getScheduleApi, resolveCellFromBaseAndSubs, convertRequestsToSubstitutions, getClassAwayEventName, openAddSchoolSwapModal, openEditSchoolSwapModal, saveSchoolSwap, deleteSchoolSwap, buildClassSchoolSwapChanges, getCalendarDetails, addToGoogleCalendar, downloadIcsCalendar, addEventToCalendar, timetableApiOrNull, resolveDetailRequest, copyLineMessageForRequest, getExchangeWeekDates, fetchRecommendations, getApprovedScheduleForDate, getScheduleForDate, clearScheduleCache, findCombinedReturnCandidates, triangleTeacherKey, triangleSlotKey, triangleCellIsUsable, triangleSourceParticipant, triangleCandidateParticipant, triangleCandidateIsRestricted, buildTriangleOccupiedByTeacher, triangleCandidateSearchText, createTriangleScheduleGetter, validateTriangleSelection, triangleCandidateCanMoveTo, triangleCandidateSort, triangleCandidatePriority, triangleCandidateBPriority, selectTriangleCandidateB, selectTriangleCandidateC, loadMoreTriangleCandidates, openTriangleTimetablePreview, resetTriangleDraft, isAwayClassCell, getClassCellClassForDate, getClassCellClassForClass, mapPublicClassRequests, cellFromGrid, findPriorDutyAtSlot, normalizeRechangeRequestId, isEffectiveChangedDuty, hasOtherChangedDutyAtSlot, resolveHistoryLeaveClassSubject, resolveRestrictionForHistoryRec, isHistoryLeaveRechanged, isHistoryExchangeRechanged, isRequestLeaveRechanged, isRequestExchangeRechanged, formatHistoryLeaveSlot, formatHistoryExchangeSlot, findBaseScheduleSlot, isHistoryLeaveRestricted, isHistoryExchangeRestricted, initImmediateTimetable1, initImmediateTimetable2 };
});

