/** v2 stores/data.js — 由 v1 setup() §分節機械分解（gen-final.cjs）。 */
import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import DateUtils from '../domain/date-utils.js';
import FieldMap from '../domain/field-map.js';
import { UiData } from '../modules/ui-data.js';
import { UiListHelpers } from '../modules/ui-list-helpers.js';
import { UiSubmitHelpers } from '../modules/ui-request.js';
import { UiStyle } from '../modules/ui-style.js';
import { UiSync } from '../modules/ui-sync.js';
import { showConfirm, showToast } from '../ui/toast.js';
import { useBackofficeStore } from './backoffice.js';
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
export const useDataStore = defineStore('data', () => {
  const { collapseTriangleRows, isTriangleRequest, requestRowStamp, serverRequestChangesLocal, sortRequestListDesc, stampIsNewer } = UiListHelpers;
    const requestWindowInfo = ref(null);
    const historyFullLoaded = ref(false);
    const historyLoadingFull = ref(false);
    const historyLoadedMonths = ref([]); // 已合併的 YYYY-MM
    const historyMonthLoading = ref(false);
    let _requestsWatermark = '';
    const bumpRequestsWatermarkFromRows = (rows) => {
      let max = _requestsWatermark;
      (rows || []).forEach(r => {
        const s = requestRowStamp(r);
        if (stampIsNewer(s, max)) max = s;
      });
      if (stampIsNewer(max, _requestsWatermark)) _requestsWatermark = max;
      return _requestsWatermark;
    };
    const watermarkAgeMs = () => {
      const s = String(_requestsWatermark || '').trim();
      if (!s) return Infinity;
      const t = s.replace('T', ' ');
      const norm = t.includes('/') ? t : t.replace(/-/g, '/');
      const ms = Date.parse(norm);
      if (!Number.isFinite(ms)) return Infinity;
      return Date.now() - ms;
    };
    const ensureHistoryMonthLoaded = (ym) => {
      const m = String(ym || storeToRefs(useMutualStore()).historyFilterDate.value || DateUtils.toLocalDateStr(new Date())).slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(m)) return;
      if (historyFullLoaded.value || historyLoadedMonths.value.indexOf(m) >= 0) return;
      if (historyMonthLoading.value) return;
      useHistoryStore().loadHistoryMonth(m, { silent: true });
    };
    const showHistoryEditModal = ref(false);
    const historyEditForm = ref({
      id: '',
      requestId: '',
      specialFlow: '',
      type: 'substitution',
      requesterEmail: '',
      targetTeacherEmail: '',
      className: '',
      subject: '',
      requestDate: '',
      requestPeriodDay: 1,
      requestPeriod: 1,
      targetDate: '',
      targetDayOfWeek: 1,
      targetPeriod: 1,
      reason: '',
      courseAdjustmentOnly: false,
      leaveTimeType: '',
      leaveTime: '',
      subFee: '自費代課',
      note: '',
      printed: false
    });
    const pendingPage = { pending: ref(1), sent: ref(1), admin: ref(1) };
    const pendingPageSize = 10;
    const isScheduleEditMode = ref(false);
    const REPORT_PERIOD_STORAGE_KEY = 'school-substitution-report-period-v1';
    const isValidReportPeriod = (period) => {
      const start = String(period && period.start || '').trim();
      const end = String(period && period.end || '').trim();
      return /^\d{4}-\d{2}-\d{2}$/.test(start)
        && /^\d{4}-\d{2}-\d{2}$/.test(end)
        && start <= end
        && !!(DateUtils && DateUtils.countWeeksInRange(start, end));
    };
    const readStoredReportPeriod = () => {
      try {
        const stored = JSON.parse(localStorage.getItem(REPORT_PERIOD_STORAGE_KEY) || 'null');
        if (stored && isValidReportPeriod(stored)) {
          return {
            month: /^\d{4}-\d{2}$/.test(String(stored.month || '')) ? stored.month : stored.start.slice(0, 7),
            start: stored.start,
            end: stored.end
          };
        }

        // 舊版匯出流程已按月份保存過區間，首次升級時沿用最近一次設定。
        const legacy = JSON.parse(localStorage.getItem('school-substitution-accounting-periods-v1') || '{}');
        const months = Object.keys(legacy).filter(month => /^\d{4}-\d{2}$/.test(month)).sort();
        for (let i = months.length - 1; i >= 0; i -= 1) {
          const saved = legacy[months[i]] || {};
          const period = saved.period || saved;
          if (isValidReportPeriod(period)) {
            return { month: months[i], start: period.start, end: period.end };
          }
        }
      } catch (e) { /* 無法讀取瀏覽器儲存時使用預設日期 */ }
      return null;
    };
    const storedReportPeriod = readStoredReportPeriod();
    const todayForReport = DateUtils && typeof DateUtils.getTodayString === 'function'
      ? DateUtils.getTodayString() : DateUtils.toLocalDateStr(new Date());
    const reportMonth = ref(storedReportPeriod ? storedReportPeriod.month : todayForReport.slice(0, 7));
    const accountingPeriodMonth = ref(reportMonth.value);
    const monthEndDate = (month) => {
      const match = String(month || '').match(/^(\d{4})-(\d{2})$/);
      if (!match) return '';
      const date = new Date(Number(match[1]), Number(match[2]), 0);
      return `${match[1]}-${match[2]}-${String(date.getDate()).padStart(2, '0')}`;
    };
    const defaultReportPeriod = DateUtils && typeof DateUtils.getAccountingPeriodForMonth === 'function'
      ? DateUtils.getAccountingPeriodForMonth(reportMonth.value)
      : { start: `${reportMonth.value}-01`, end: monthEndDate(reportMonth.value) };
    const reportStartDate = ref(storedReportPeriod ? storedReportPeriod.start : defaultReportPeriod.start);
    const reportEndDate = ref(storedReportPeriod ? storedReportPeriod.end : defaultReportPeriod.end);
    const accountingPeriod = computed(() => ({
      start: reportStartDate.value,
      end: reportEndDate.value
    }));
    const reportWeeksCount = computed(() => {
      if (DateUtils && typeof DateUtils.countWeeksInRange === 'function') {
        return DateUtils.countWeeksInRange(reportStartDate.value, reportEndDate.value);
      }
      return 0;
    });
    const monthlyReportData = ref([]);
    const monthlyReportLoading = ref(false);
    let monthlyReportRevision = 0;
    const monthlyReportKey = () => [
      monthlyReportRevision,
      reportMonth.value,
      reportStartDate.value,
      reportEndDate.value,
      reportWeeksCount.value
    ].join('|');
    const monthlyReportTotals = computed(() => {
      const a = useOutputStore().getReportApi();
      return a ? a.monthlyReportTotals.value : {};
    });
    const accountingExportLoading = ref(false);
    const period8Ready = ref(false);
    const period8Loading = ref(false);
    const period8ExportLoading = ref(false);
    const directApproveMode = ref(true);
    const period8RosterData = computed(() => {
      const a = useTimetableStore().getScheduleApi();
      return a ? a.period8RosterData.value : [];
    });
    const period8RosterRows = computed(() => period8RosterData.value.rows || []);
    const period8CellsFor = (row, dateStr) => (row && row.cells && row.cells[dateStr]) || [];
    const period8StatusLabel = (cell) => {
      if (!cell) return '';
       if (cell.status === 'away') return cell.awayName || '空堂事件';
      if (cell.status === 'exchange') return '調課';
      if (cell.status === 'combined_return') return '併班';
      if (cell.status === 'timetable_only') return '僅課務';
      if (cell.status === 'substitution') return '代課';
      return '';
    };
    const classScheduleIndex = computed(() => {
      const a = useTimetableStore().getScheduleApi();
      return a ? a.classScheduleIndex.value : {};
    });
    const getPeriodLabel = (p) =>
      (DateUtils && DateUtils.getPeriodLabel)
        ? DateUtils.getPeriodLabel(p)
        : String(p);
    const isLunchPeriod = (p) =>
      !!(DateUtils && DateUtils.isLunchPeriod && DateUtils.isLunchPeriod(p));
    const getPeriodClass = (p) => {
      const period = Number(p);
      if (period === 0) return 'is-early-period';
      if (isLunchPeriod(p)) return 'is-lunch-period';
      if (period === 8) return 'is-p8-period';
      return '';
    };
    const formatClassName = (raw) =>
      (DateUtils && DateUtils.formatClassName)
        ? DateUtils.formatClassName(raw)
        : String(raw || '');
    const getBatchCompareSlots = () => {
      const pending = storeToRefs(useMutualStore()).pendingRequestData.value || {};
      if (!pending.isBatch) return [];
      if (Array.isArray(storeToRefs(useTourStore()).batchSlots.value) && storeToRefs(useTourStore()).batchSlots.value.length) return storeToRefs(useTourStore()).batchSlots.value;
      return Array.isArray(pending.batchSlots) ? pending.batchSlots : [];
    };
    const batchCompareWeeks = computed(() => {
      if (!(storeToRefs(useMutualStore()).pendingRequestData.value || {}).isBatch) return [];
      if (UiSubmitHelpers && typeof UiSubmitHelpers.getBatchCompareWeeks === 'function') {
        return UiSubmitHelpers.getBatchCompareWeeks(getBatchCompareSlots());
      }
      return [];
    });
    const batchCompareWeekIndex = ref(0);
    const batchExchangePreviewBatchId = ref('');
    const batchCompareWeekTotal = computed(() => batchCompareWeeks.value.length);
    const batchCompareWeekDates = computed(() => {
      const weeks = batchCompareWeeks.value;
      const index = Math.max(0, Math.min(batchCompareWeekIndex.value, weeks.length - 1));
      if (weeks[index]) return weeks[index];
      const pending = storeToRefs(useMutualStore()).pendingRequestData.value || {};
      return useSubmitStore().getWeekDatesForCompare(pending.date || storeToRefs(useTourStore()).inputRequestDate.value);
    });
    const batchCompareWeekSlotCount = computed(() => {
      const dates = new Set(batchCompareWeekDates.value || []);
      return getBatchCompareSlots().filter(slot => {
        const dateStr = String(slot && (slot.dateStr || slot.date) || '').slice(0, 10);
        return dates.has(dateStr);
      }).length;
    });
    const shiftBatchCompareWeek = (delta) => {
      const total = batchCompareWeekTotal.value;
      if (total <= 1) return;
      const current = parseInt(batchCompareWeekIndex.value, 10) || 0;
      const amount = parseInt(delta, 10) || 0;
      batchCompareWeekIndex.value = Math.max(0, Math.min(total - 1, current + amount));
    };
    const compareDisplayDatesA = computed(() =>
      storeToRefs(useMatchStore()).compareWeekSelectionA.value === 'target' ? storeToRefs(useSubmitStore()).compareWeekDatesB.value : storeToRefs(useSubmitStore()).compareWeekDatesA.value
    );
    const compareDisplayDatesB = computed(() =>
      storeToRefs(useMatchStore()).compareWeekSelectionB.value === 'target' ? storeToRefs(useSubmitStore()).compareWeekDatesB.value : storeToRefs(useSubmitStore()).compareWeekDatesA.value
    );
    const setCompareWeekSelection = (who, view) => {
      const value = view === 'target' ? 'target' : 'source';
      if (who === 'A') storeToRefs(useMatchStore()).compareWeekSelectionA.value = value;
      if (who === 'B') storeToRefs(useMatchStore()).compareWeekSelectionB.value = value;
    };
    const isCrossWeekExchange = computed(() => {
      const pending = storeToRefs(useMutualStore()).pendingRequestData.value || {};
      return pending.mode === 'exchange'
        && storeToRefs(useSubmitStore()).compareWeekDatesA.value[0]
        && storeToRefs(useSubmitStore()).compareWeekDatesB.value[0]
        && storeToRefs(useSubmitStore()).compareWeekDatesA.value[0] !== storeToRefs(useSubmitStore()).compareWeekDatesB.value[0];
    });
    const getLeaveTimePresetRange = (leaveEmail, type) => {
      const d = useSubmitStore().getLeaveTimeDefaults(leaveEmail);
      if (type === '上午') return d.start + '~12:00';
      if (type === '下午') return '12:00~' + d.end;
      return d.range;
    };
    const updatePendingLeaveTime = () => {
      const p = storeToRefs(useMutualStore()).pendingRequestData.value || {};
      if (p.mode !== 'substitution') return;
      const start = String(p.leaveTimeStart || '').trim();
      const end = String(p.leaveTimeEnd || '').trim();
      storeToRefs(useMutualStore()).pendingRequestData.value = Object.assign({}, p, {
        leaveTimeType: '自訂',
        leaveTime: start && end ? (start + '~' + end) : ''
      });
    };
    const proxyTargetName = computed(() => {
      const em = storeToRefs(useSessionStore()).proxyTargetEmail.value;
      if (!em) return '';
      return getTeacherNameByEmail(em) || em;
    });
    const filteredProxyTeachers = computed(() => {
      const a = useSessionStore().getProxyApi();
      return a ? a.filteredProxyTeachers.value : [];
    });
    const proxyGrantCandidateTeachers = computed(() => {
      const a = useSessionStore().getProxyApi();
      return a ? a.proxyGrantCandidateTeachers.value : [];
    });
    const proxyGrantedTeachers = computed(() => {
      const set = {};
      (storeToRefs(useSessionStore()).proxySubmitEmails.value || []).forEach(e => { set[e] = 1; });
      return (storeToRefs(useSessionStore()).teachersList.value || []).filter(t =>
        t.role === 'staff' && set[String(t.loginEmail || '').toLowerCase()]
      );
    });
    const isProxySubmitEmailGranted = (email) => {
      const em = String(email || '').toLowerCase();
      return !!(em && (storeToRefs(useSessionStore()).proxySubmitEmails.value || []).indexOf(em) >= 0);
    };
    const userRoleText = computed(() => {
      const a = useSessionStore().getProxyApi();
      return a ? a.userRoleText.value : '';
    });
    const clearProxyTarget = () => {
      storeToRefs(useSessionStore()).proxyTargetEmail.value = '';
      storeToRefs(useSessionStore()).proxyTargetQuery.value = '';
      storeToRefs(useSessionStore()).showProxyTargetDropdown.value = false;
      storeToRefs(useSessionStore()).searchQuery.value = '';
      if (storeToRefs(useSessionStore()).isStaff.value) storeToRefs(useSessionStore()).selectedSubject.value = 'mine';
      showToast('已改回處理自己的課', 'info');
    };
    const clearAllProxySubmitEmails = async () => {
      if (!(storeToRefs(useSessionStore()).proxySubmitEmails.value || []).length) return;
      const ok = await showConfirm('確定清空所有行政的代申請授權？清空後沒有行政可代他人申請。', '清空授權');
      if (!ok) return;
      await useSessionStore().persistProxySubmitEmails([]);
    };
    const setProxySubmitEnabled = async (enabled) => {
      if (enabled) {
        showToast('請在下方勾選「指定行政」授權，不會一次開放全部行政', 'info');
        return;
      }
      await clearAllProxySubmitEmails();
    };
    const subjectsList = computed(() => {
      const list = new Set();
      storeToRefs(useSessionStore()).teachersList.value.forEach(t => {
        useSessionStore().parseTeacherSubjects(t.subject).forEach(s => list.add(s));
      });
      return Array.from(list).sort((a, b) => a.localeCompare(b, 'zh-Hant'));
    });
    const filteredTeachers = computed(() => {
      const a = useTimetableStore().getScheduleApi();
      return a ? a.filteredTeachers.value : [];
    });
    let _dataApi = null;
    let _syncApi = null;
    const changeWeek = (direction) => {
      const current = new Date(storeToRefs(useSessionStore()).selectedWeekDate.value);
      current.setDate(current.getDate() + (direction * 7));
      storeToRefs(useSessionStore()).selectedWeekDate.value = DateUtils.toLocalDateStr(current);
      // 不需要重新拉資料，課表格子由 currentWeekDates computed 自動更新
    };
    const getPeriodTimeSpan = (p) => DateUtils.getPeriodTimeSpan(p);
    const getWeekDayText = (d) => DateUtils.getWeekDayText(d);
    const formatDateMMDD = (dateStr) => DateUtils.formatDateMMDD(dateStr);
    const formatMoney = (value) => {
      const number = Number(String(value == null ? '' : value).replace(/,/g, '').trim());
      return Number.isFinite(number) ? number.toLocaleString('zh-TW') : '0';
    };
    const getTodayString = () => DateUtils.getTodayString();
    const teachersByEmail = computed(() => {
      const a = getDataApi();
      return a ? a.teachersByEmail.value : {};
    });
    const lookupTeacher = (email) => {
      if (!email) return null;
      const m = teachersByEmail.value;
      const key = String(email).trim();
      return m[key] || m[key.toLowerCase()] || null;
    };
    const getTeacherNameByEmail = (email) => {
      if (!email) return '';
      const t = lookupTeacher(email);
      return t ? t.name : String(email).split('@')[0];
    };
    const getTeacherSubjectByEmail = (email) => {
      if (!email) return '';
      const t = lookupTeacher(email);
      return t ? (t.subject || t['授課科目'] || t['任課科目'] || '') : '';
    };
    const teacherTimetableHours = computed(() => {
      const a = getDataApi();
      return a ? a.teacherTimetableHours.value : {};
    });
    const getTeacherIdentityTooltip = (email) => {
      const jobTitle = String(useHomeroomStore().getTeacherJobTitleByEmail(email) || '').trim();
      const subject = String(getTeacherSubjectByEmail(email) || '').trim();
      return `職務：${jobTitle || '未填寫'}\n科目：${subject || '未填寫'}`;
    };
    const normalizeSubjectColorName = UiStyle.normalizeSubjectColorName;
    const getSubjectStyle = UiStyle.getSubjectStyle;
    const getClassBadgeStyle = UiStyle.getClassBadgeStyle;
    const devTeacherQuery = ref('');
    const filteredDevTeachers = computed(() => {
      const a = getDataApi();
      return a ? a.filteredDevTeachers.value : [];
    });
    const isAdminDirectRequest = UiListHelpers.isAdminDirectRequest;
    const effectiveUserEmail = computed(() => {
      if (!storeToRefs(useSessionStore()).user.value || !storeToRefs(useSessionStore()).user.value.email) return '';
      return String(storeToRefs(useSessionStore()).user.value.email).toLowerCase().trim();
    });
    const sheetRequestToFront = (nr) => FieldMap.mapRequest(nr);
    const optimisticUpsertRequest = (frontReq) => {
      const list = storeToRefs(useSessionStore()).requestsList.value.slice();
      const idx = list.findIndex(r => r.id === frontReq.id);
      if (idx >= 0) list[idx] = Object.assign({}, list[idx], frontReq);
      else list.unshift(frontReq);
      storeToRefs(useSessionStore()).requestsList.value = list;
      recomputeRequestBuckets();
    };
    const SOFT_REFRESH_MIN_GAP_MS = 3500;
    let _dataLoadSeq = 0;
    const dataUpdatedAt = ref(null);
    const dataRefreshing = ref(false);
    const softSyncing = ref(false);
    const dataUpdatedLabel = computed(() => {
      const a = getDataApi();
      return a ? a.dataUpdatedLabel.value : '';
    });
    const selectClassForView = (className) => {
      let cls = String(className || '').trim();
      if (!cls) return;
      // 併班不設獨立視圖（按鈕已隱藏）：導向首個單班
      if (DateUtils && DateUtils.isCombinedClass && DateUtils.isCombinedClass(cls)) {
        const parts = DateUtils.parseCombinedClasses(cls);
        if (parts.length) cls = parts[0];
      }
      storeToRefs(useMutualStore()).selectedClass.value = cls;
      if (storeToRefs(useSessionStore()).user.value && storeToRefs(useTimetableStore()).classUsesPublicData.value) {
        loadPublicClassData(cls).catch(function () {});
      }
    };
    const openAddSemesterModal = () => {
      storeToRefs(useSessionStore()).semesterModalMode.value = 'add';
      storeToRefs(useSessionStore()).semesterForm.value = { id: '', name: '', startDate: '', endDate: '' };
      storeToRefs(useSessionStore()).showSemesterModal.value = true;
    };
    const openEditSemesterModal = (sem) => {
      storeToRefs(useSessionStore()).semesterModalMode.value = 'edit';
      storeToRefs(useSessionStore()).semesterForm.value = { id: sem.id, name: sem.name, startDate: sem.startDate, endDate: sem.endDate };
      storeToRefs(useSessionStore()).showSemesterModal.value = true;
    };
    const resolveExchangeTargetCell = (...args) => {
      const a = useTimetableStore().timetableApiOrNull();
      return a ? a.resolveExchangeTargetCell(...args) : null;
    };
    const cellIsRestricted = (...args) => {
      const a = useTimetableStore().timetableApiOrNull();
      return a ? a.cellIsRestricted(...args) : false;
    };
    const isLeaveClassRestricted = (...args) => {
      const a = useTimetableStore().timetableApiOrNull();
      return a ? a.isLeaveClassRestricted(...args) : false;
    };
    const isExchangeClassRestricted = (...args) => {
      const a = useTimetableStore().timetableApiOrNull();
      return a ? a.isExchangeClassRestricted(...args) : false;
    };
    const formatExchangeClassSlot = (...args) => {
      const a = useTimetableStore().timetableApiOrNull();
      return a ? a.formatExchangeClassSlot(...args) : '—';
    };
    const formatQuickTodoTitle = (...args) => {
      const a = useTimetableStore().timetableApiOrNull();
      return a ? a.formatQuickTodoTitle(...args) : '—';
    };
    const showEmptySlotModal = ref(false);
    const emptySlotForm = ref({
      teacherEmail: '',
      teacherName: '',
      dateStr: '',
      dayOfWeek: 1,
      period: 1,
      taskName: '',
      className: '',
      note: '',
      quota: 0
    });
const getDataApi = () => {
      if (_dataApi) return _dataApi;
      if (!UiData) {
        console.error('UiData 未載入');
        return null;
      }
      _dataApi = UiData.create({
        computed, activeCell: storeToRefs(useTourStore()).activeCell, matchMode: storeToRefs(useTourStore()).matchMode, callGasApi: useGasStore().callGasApi, matchSearchQuery: storeToRefs(useMutualStore()).matchSearchQuery, exchangeWeekdayFilter: storeToRefs(useMutualStore()).exchangeWeekdayFilter,
        clearMatchPreview: useMatchStore().clearMatchPreview, triangleCellIsUsable: useTimetableStore().triangleCellIsUsable, resetTriangleDraft: useTimetableStore().resetTriangleDraft, fetchRecommendations: useTimetableStore().fetchRecommendations,
        teachersList: storeToRefs(useSessionStore()).teachersList, allSchedules: storeToRefs(useSessionStore()).allSchedules, currentWeekDates: storeToRefs(useTimetableStore()).currentWeekDates, lookupTeacher, devTeacherQuery,
        isTriangleRequest, requestsList: storeToRefs(useSessionStore()).requestsList, isAdminDirectRequest, getTeacherNameByEmail,
        user: storeToRefs(useSessionStore()).user, userRole: storeToRefs(useSessionStore()).userRole, currentSemester: storeToRefs(useSessionStore()).currentSemester, scheduleScope: storeToRefs(useMatchStore()).scheduleScope, semestersList: storeToRefs(useSessionStore()).semestersList, classDirectory: storeToRefs(useMutualStore()).classDirectory, schoolSwaps: storeToRefs(useSessionStore()).schoolSwaps,
        homeroomRecords: storeToRefs(useSessionStore()).homeroomRecords, sortRequestListDesc, substitutionRecords: storeToRefs(useSessionStore()).substitutionRecords, convertRequestsToSubstitutions: useTimetableStore().convertRequestsToSubstitutions,
        approvedConvertSig: useHomeroomStore().approvedConvertSig, bumpRequestsWatermarkFromRows, effectiveUserEmail,
        mySentRequests: storeToRefs(useTourStore()).mySentRequests, myPendingRequests: storeToRefs(useTourStore()).myPendingRequests, adminPendingRequests: storeToRefs(useTourStore()).adminPendingRequests, collapseTriangleRows,
        allPendingRequests: storeToRefs(useTourStore()).allPendingRequests, classAwayEvents: storeToRefs(useSessionStore()).classAwayEvents, applySettings: useSessionStore().applySettings, requestWindowInfo,
        historyFullLoaded, stampIsNewer, clearScheduleCache: useTimetableStore().clearScheduleCache, softSyncing,
        softSyncRequestsDelta, softSyncRequestsOnly, softSyncPendingOnly, isAdmin: storeToRefs(useSessionStore()).isAdmin,
        loadHomeroomRecords: useHomeroomStore().loadHomeroomRecords, dataUpdatedAt, gasApiUrl: storeToRefs(useSessionStore()).gasApiUrl, fetchMetaData: useGasStore().fetchMetaData,
        classViewSchedules: storeToRefs(useMutualStore()).classViewSchedules, classViewSchoolSwaps: storeToRefs(useMutualStore()).classViewSchoolSwaps, classViewLoadedClass: storeToRefs(useMutualStore()).classViewLoadedClass,
        classViewSubstitutionRecords: storeToRefs(useMutualStore()).classViewSubstitutionRecords, mapPublicClassRequests: useTimetableStore().mapPublicClassRequests, classViewClassAwayEvents: storeToRefs(useMutualStore()).classViewClassAwayEvents,
        pendingClassView: storeToRefs(useMutualStore()).pendingClassView, selectedClass: storeToRefs(useMutualStore()).selectedClass, cancelAll: useGasStore().cancelAll, loading: storeToRefs(useSessionStore()).loading, loadingMessage: storeToRefs(useSessionStore()).loadingMessage,
        classReadonlyMode: storeToRefs(useMutualStore()).classReadonlyMode, activeTab: storeToRefs(useSessionStore()).activeTab, fetchPublicClassData: useGasStore().fetchPublicClassData, resolvePendingClassView: useInteractionStore().resolvePendingClassView,
        fetchInitialData: useGasStore().fetchInitialData, logout: useBackofficeStore().logout, semesterForm: storeToRefs(useSessionStore()).semesterForm, semesterModalMode: storeToRefs(useSessionStore()).semesterModalMode, showSemesterModal: storeToRefs(useSessionStore()).showSemesterModal,
        gsiButtonError: storeToRefs(useSessionStore()).gsiButtonError, SOFT_REFRESH_MIN_GAP_MS,
        _getDataLoadSeq: () => _dataLoadSeq,
        _nextDataLoadSeq: () => { _dataLoadSeq += 1; return _dataLoadSeq; },
        _getRequestsWatermark: () => _requestsWatermark,
        _setRequestsWatermark: (v) => { _requestsWatermark = v; },
        dataRefreshing,
      });
      return _dataApi;
    };

const getSyncApi = () => {
      if (_syncApi) return _syncApi;
      if (!UiSync) {
        console.error('UiSync 未載入');
        return null;
      }
      _syncApi = UiSync.create({
        computed, callGasApi: useGasStore().callGasApi, user: storeToRefs(useSessionStore()).user, fetchPendingOnly: useGasStore().fetchPendingOnly, currentSemester: storeToRefs(useSessionStore()).currentSemester, requestsList: storeToRefs(useSessionStore()).requestsList,
        sortRequestListDesc, recomputeRequestBuckets, bumpRequestsWatermarkFromRows,
        fetchInitialData: useGasStore().fetchInitialData, mergeRequestsFromServer, classAwayEvents: storeToRefs(useSessionStore()).classAwayEvents, requestWindowInfo,
        stampIsNewer, clearScheduleCache: useTimetableStore().clearScheduleCache, fetchRequestsDelta: useGasStore().fetchRequestsDelta, watermarkAgeMs,
        _getRequestsWatermark: () => _requestsWatermark,
        _setRequestsWatermark: (v) => { _requestsWatermark = v; },
        serverRequestChangesLocal,
      });
      return _syncApi;
    };

    const mergeRequestsFromServer = (...args) => {
      const a = getSyncApi();
      return a ? a.mergeRequestsFromServer(...args) : undefined;
    };
    const softSyncPendingOnly = (...args) => {
      const a = getSyncApi();
      return a ? a.softSyncPendingOnly(...args) : undefined;
    };
    const softSyncRequestsDelta = (...args) => {
      const a = getSyncApi();
      return a ? a.softSyncRequestsDelta(...args) : undefined;
    };
    const softSyncRequestsOnly = (...args) => {
      const a = getSyncApi();
      return a ? a.softSyncRequestsOnly(...args) : undefined;
    };
    const changeMatchMode = (...args) => {
      const a = getDataApi();
      return a ? a.changeMatchMode(...args) : undefined;
    };
    const getTeacherTimetableHours = (...args) => {
      const a = getDataApi();
      return a ? a.getTeacherTimetableHours(...args) : undefined;
    };
    const getRealTeacherName = (...args) => {
      const a = getDataApi();
      return a ? a.getRealTeacherName(...args) : undefined;
    };
    const getTriangleGroupRequests = (...args) => {
      const a = getDataApi();
      return a ? a.getTriangleGroupRequests(...args) : undefined;
    };
    const isMySentRequest = (...args) => {
      const a = getDataApi();
      return a ? a.isMySentRequest(...args) : undefined;
    };
    const applyInitialPayload = (...args) => {
      const a = getDataApi();
      return a ? a.applyInitialPayload(...args) : undefined;
    };
    const recomputeRequestBuckets = (...args) => {
      const a = getDataApi();
      return a ? a.recomputeRequestBuckets(...args) : undefined;
    };
    const optimisticPatchRequestStatuses = (...args) => {
      const a = getDataApi();
      return a ? a.optimisticPatchRequestStatuses(...args) : undefined;
    };
    const optimisticPatchRequestStatus = (...args) => {
      const a = getDataApi();
      return a ? a.optimisticPatchRequestStatus(...args) : undefined;
    };
    const optimisticPatchTriangleGroup = (...args) => {
      const a = getDataApi();
      return a ? a.optimisticPatchTriangleGroup(...args) : undefined;
    };
    const optimisticRemoveRequest = (...args) => {
      const a = getDataApi();
      return a ? a.optimisticRemoveRequest(...args) : undefined;
    };
    const markDataUpdated = (...args) => {
      const a = getDataApi();
      return a ? a.markDataUpdated(...args) : undefined;
    };
    const manualRefreshData = (...args) => {
      const a = getDataApi();
      return a ? a.manualRefreshData(...args) : undefined;
    };
    const softRefreshInBackground = (...args) => {
      const a = getDataApi();
      return a ? a.softRefreshInBackground(...args) : undefined;
    };
    const resolveUserRoleFromTeachers = (...args) => {
      const a = getDataApi();
      return a ? a.resolveUserRoleFromTeachers(...args) : undefined;
    };
    const loadSemesters = (...args) => {
      const a = getDataApi();
      return a ? a.loadSemesters(...args) : undefined;
    };
    const applyClassPayload = (...args) => {
      const a = getDataApi();
      return a ? a.applyClassPayload(...args) : undefined;
    };
    const preflightGoogleLogin = (...args) => {
      const a = getDataApi();
      return a ? a.preflightGoogleLogin(...args) : undefined;
    };
    const loadPublicClassData = (...args) => {
      const a = getDataApi();
      return a ? a.loadPublicClassData(...args) : undefined;
    };
    const loadWeeklyData = (...args) => {
      const a = getDataApi();
      return a ? a.loadWeeklyData(...args) : undefined;
    };
    const saveClientSettings = (...args) => {
      const a = getDataApi();
      return a ? a.saveClientSettings(...args) : undefined;
    };
    const saveSemester = (...args) => {
      const a = getDataApi();
      return a ? a.saveSemester(...args) : undefined;
    };
    const deleteSemester = (...args) => {
      const a = getDataApi();
      return a ? a.deleteSemester(...args) : undefined;
    };
    const setDefaultSemester = (...args) => {
      const a = getDataApi();
      return a ? a.setDefaultSemester(...args) : undefined;
    };
    function initImmediateData1() {
    watch([reportStartDate, reportEndDate], ([start, end]) => {
      if (!useOutputStore().isReportNavigating() && /^\d{4}-\d{2}-\d{2}$/.test(String(start || ''))) {
        reportMonth.value = String(start).slice(0, 7);
        accountingPeriodMonth.value = reportMonth.value;
      }
      const period = { start: String(start || ''), end: String(end || '') };
      if (isValidReportPeriod(period)) {
        try {
          localStorage.setItem(REPORT_PERIOD_STORAGE_KEY, JSON.stringify({
            month: reportMonth.value,
            start: period.start,
            end: period.end
          }));
        } catch (e) { /* 瀏覽器封鎖儲存時不影響頁面操作 */ }
        // 結算區間持久化非關鍵路徑：匯出模組按需載入，失敗靜默略過
        import('../modules/export-lazy.js').then((m) => m.ensureAccounting()).then((ExportAccounting) => {
          if (ExportAccounting && typeof ExportAccounting.savePeriodSettings === 'function') {
            ExportAccounting.savePeriodSettings(reportMonth.value, period);
          }
        }).catch(() => {});
      }
    });
    }
    function initImmediateData2() {
    watch(
      [storeToRefs(useSessionStore()).substitutionRecords, storeToRefs(useSessionStore()).teachersList, storeToRefs(useSessionStore()).allSchedules, storeToRefs(useSessionStore()).schoolSwaps, storeToRefs(useSessionStore()).classAwayEvents, storeToRefs(useSessionStore()).semesterEndDate, reportMonth, reportStartDate, reportEndDate, reportWeeksCount, storeToRefs(useSessionStore()).adminSubTab, storeToRefs(useSessionStore()).activeTab],
      () => {
        monthlyReportRevision += 1;
        if (storeToRefs(useSessionStore()).activeTab.value === 'admin' && storeToRefs(useSessionStore()).adminSubTab.value === 'billing') {
          useOutputStore().scheduleMonthlyReportCalculation();
        } else {
          useOutputStore().cancelScheduledMonthlyReport();
          monthlyReportLoading.value = false;
        }
      }
    );
    }
    function initImmediateData3() {
    watch(storeToRefs(useTourStore()).batchSlots, () => {
      if (!(storeToRefs(useMutualStore()).pendingRequestData.value || {}).isBatch) return;
      const total = batchCompareWeekTotal.value;
      if (!total) {
        batchCompareWeekIndex.value = 0;
        return;
      }
      batchCompareWeekIndex.value = Math.max(
        0,
        Math.min(total - 1, parseInt(batchCompareWeekIndex.value, 10) || 0)
      );
    });
    }
    function initData1() { useInteractionStore().bindFlagModal(showEmptySlotModal, () => { showEmptySlotModal.value = false; }, '空堂排班'); }
    const nextDataLoadSeq = () => { _dataLoadSeq += 1; return _dataLoadSeq; };
  return { requestWindowInfo, historyFullLoaded, historyLoadingFull, historyLoadedMonths, historyMonthLoading, bumpRequestsWatermarkFromRows, watermarkAgeMs, ensureHistoryMonthLoaded, showHistoryEditModal, historyEditForm, pendingPage, pendingPageSize, isScheduleEditMode, REPORT_PERIOD_STORAGE_KEY, isValidReportPeriod, readStoredReportPeriod, todayForReport, reportMonth, accountingPeriodMonth, monthEndDate, defaultReportPeriod, reportStartDate, reportEndDate, accountingPeriod, reportWeeksCount, monthlyReportData, monthlyReportLoading, monthlyReportRevision, monthlyReportKey, monthlyReportTotals, accountingExportLoading, period8Ready, period8Loading, period8ExportLoading, directApproveMode, period8RosterData, period8RosterRows, period8CellsFor, period8StatusLabel, classScheduleIndex, getPeriodLabel, isLunchPeriod, getPeriodClass, formatClassName, getBatchCompareSlots, batchCompareWeeks, batchCompareWeekIndex, batchExchangePreviewBatchId, batchCompareWeekTotal, batchCompareWeekDates, batchCompareWeekSlotCount, shiftBatchCompareWeek, compareDisplayDatesA, compareDisplayDatesB, setCompareWeekSelection, isCrossWeekExchange, getLeaveTimePresetRange, updatePendingLeaveTime, proxyTargetName, filteredProxyTeachers, proxyGrantCandidateTeachers, proxyGrantedTeachers, isProxySubmitEmailGranted, userRoleText, clearProxyTarget, clearAllProxySubmitEmails, setProxySubmitEnabled, subjectsList, filteredTeachers, changeWeek, getPeriodTimeSpan, getWeekDayText, formatDateMMDD, formatMoney, getTodayString, teachersByEmail, lookupTeacher, getTeacherNameByEmail, getTeacherSubjectByEmail, teacherTimetableHours, getTeacherIdentityTooltip, normalizeSubjectColorName, getSubjectStyle, getClassBadgeStyle, devTeacherQuery, filteredDevTeachers, isAdminDirectRequest, effectiveUserEmail, sheetRequestToFront, optimisticUpsertRequest, SOFT_REFRESH_MIN_GAP_MS, dataUpdatedAt, dataRefreshing, softSyncing, dataUpdatedLabel, selectClassForView, openAddSemesterModal, openEditSemesterModal, resolveExchangeTargetCell, cellIsRestricted, isLeaveClassRestricted, isExchangeClassRestricted, formatExchangeClassSlot, formatQuickTodoTitle, showEmptySlotModal, emptySlotForm, getDataApi, getSyncApi, mergeRequestsFromServer, softSyncPendingOnly, softSyncRequestsDelta, softSyncRequestsOnly, changeMatchMode, getTeacherTimetableHours, getRealTeacherName, getTriangleGroupRequests, isMySentRequest, applyInitialPayload, recomputeRequestBuckets, optimisticPatchRequestStatuses, optimisticPatchRequestStatus, optimisticPatchTriangleGroup, optimisticRemoveRequest, markDataUpdated, manualRefreshData, softRefreshInBackground, resolveUserRoleFromTeachers, loadSemesters, applyClassPayload, preflightGoogleLogin, loadPublicClassData, loadWeeklyData, saveClientSettings, saveSemester, deleteSemester, setDefaultSemester, initImmediateData1, initImmediateData2, initImmediateData3, initData1, nextDataLoadSeq };
});
