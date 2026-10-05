/** v2 stores/interaction.js — 由 v1 setup() §分節機械分解（gen-final.cjs）。 */
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
import { useMatchStore } from './match.js';
import { useMutualStore } from './mutual.js';
import { useOutputStore } from './output.js';
import { useRequestsStore } from './requests.js';
import { useSessionStore } from './session.js';
import { useSubmitStore } from './submit.js';
import { useTimetableStore } from './timetable.js';
import { useTourStore } from './tour.js';
import { storeToRefs } from 'pinia';
export const useInteractionStore = defineStore('interaction', () => {
    const classSchedules = computed(() => {
      const a = useTimetableStore().getScheduleApi();
      return a ? a.classSchedules.value : [];
    });
    const classViewerReadonly = computed(() => storeToRefs(useTimetableStore()).classUsesPublicData.value);
    const canStartSecondSubFromDetail = computed(() => {
      const a = getInteractApi();
      return a ? a.canStartSecondSubFromDetail.value : false;
    });
    let _interactApi = null;
    const isMatchPreviewSelected = () => false;
    const isMatchSourceCell = () => false;
    const isMatchSourceEntry = () => false;
    const isMatchHoverCell = () => false;
    const isMatchHoverEntry = () => false;
    const changeClassWeek = (offset) => {
      const d = new Date(storeToRefs(useMutualStore()).selectedClassDate.value + 'T00:00:00');
      d.setDate(d.getDate() + offset * 7);
      storeToRefs(useMutualStore()).selectedClassDate.value = DateUtils.toLocalDateStr(d);
    };
    const changePeriod8Week = (offset) => {
      const d = new Date(storeToRefs(useMutualStore()).period8WeekDate.value + 'T00:00:00');
      d.setDate(d.getDate() + offset * 7);
      storeToRefs(useMutualStore()).period8WeekDate.value = DateUtils.toLocalDateStr(d);
    };
    const goToPeriod8ThisWeek = () => {
      storeToRefs(useMutualStore()).period8WeekDate.value = DateUtils.toLocalDateStr(new Date());
    };
    const goToClassThisWeek = () => {
      storeToRefs(useMutualStore()).selectedClassDate.value = DateUtils.toLocalDateStr(new Date());
    };
    const schoolExportStart = ref('');
    const schoolExportEnd = ref('');
    const schoolExportIncludeWeekend = ref(false);
    const schoolExportOnlyChanged = ref(false);
    const schoolExportSelectedEmails = ref([]); // 小寫 email，預設全選（見 watch）
    const schoolExportTeacherFilter = ref('');
    let _schoolExportKnownEmails = {};
    const filteredSchoolExportTeachers = computed(() => {
      const a = useOutputStore().getReportApi();
      return a ? a.filteredSchoolExportTeachers.value : [];
    });
    const invigilationExportTitle = ref('');
const getInteractApi = () => {
      if (_interactApi) return _interactApi;
      if (!UiInteraction) {
        console.error('UiInteraction 未載入');
        return null;
      }
      _interactApi = UiInteraction.create({
        substitutionRecords: storeToRefs(useSessionStore()).substitutionRecords,
        showMatchModal: storeToRefs(useSessionStore()).showMatchModal, activeCell: storeToRefs(useTourStore()).activeCell, matchMode: storeToRefs(useTourStore()).matchMode, pendingClassView: storeToRefs(useMutualStore()).pendingClassView, activeTab: storeToRefs(useSessionStore()).activeTab, selectedClass: storeToRefs(useMutualStore()).selectedClass,
        classReadonlyMode: storeToRefs(useMutualStore()).classReadonlyMode, getTimetableApi: useTimetableStore().getTimetableApi, classSchedules, selectedClassWeekDates: storeToRefs(useMutualStore()).selectedClassWeekDates,
        classSubstitutionMap: storeToRefs(useMutualStore()).classSubstitutionMap, detailSubRecord: storeToRefs(useMutualStore()).detailSubRecord, detailRequest: storeToRefs(useMutualStore()).detailRequest, showDetailModal: storeToRefs(useMutualStore()).showDetailModal,
        resolveDetailRequest: useTimetableStore().resolveDetailRequest, classViewerReadonly, getTeacherNameByEmail: useDataStore().getTeacherNameByEmail, inputRequestDate: storeToRefs(useTourStore()).inputRequestDate,
        exchangeTargetDate: storeToRefs(useMutualStore()).exchangeTargetDate, exchangeWeekOffset: storeToRefs(useMutualStore()).exchangeWeekOffset, exchangePeriodId: storeToRefs(useMutualStore()).exchangePeriodId, exchangeTeacherEmail: storeToRefs(useMutualStore()).exchangeTeacherEmail,
        matchPreview: storeToRefs(useTourStore()).matchPreview, recommendedTeachers: storeToRefs(useTourStore()).recommendedTeachers, matchSearchQuery: storeToRefs(useMutualStore()).matchSearchQuery, matchDisplayCount: storeToRefs(useMutualStore()).matchDisplayCount,
        fetchRecommendations: useTimetableStore().fetchRecommendations, isClassAwayOnDate: useSessionStore().isClassAwayOnDate, canOperateOnTeacherEmail: useSessionStore().canOperateOnTeacherEmail,
        ensureProxyTargetForTeacher: useSessionStore().ensureProxyTargetForTeacher, user: storeToRefs(useSessionStore()).user, isAdmin: storeToRefs(useSessionStore()).isAdmin, isScheduleEditMode: storeToRefs(useDataStore()).isScheduleEditMode, openScheduleEditModal: useAdminStore().openScheduleEditModal,
        isMutualLead: useMutualStore().isMutualLead, getMutualDraftAt: useMutualStore().getMutualDraftAt, removeMutualDraft: useMutualStore().removeMutualDraft, isMutualActivitySlotInRange: useTourStore().isMutualActivitySlotInRange,
        showCompareModal: storeToRefs(useMutualStore()).showCompareModal, batchSelectMode: storeToRefs(useTourStore()).batchSelectMode, batchFlowMode: storeToRefs(useTourStore()).batchFlowMode, toggleBatchSlot: useSubmitStore().toggleBatchSlot,
        canStartSecondSubFromDetail, exchangeTeacherClasses: storeToRefs(useMutualStore()).exchangeTeacherClasses, allSchedules: storeToRefs(useSessionStore()).allSchedules, openEmptySlotAssign: useBackofficeStore().openEmptySlotAssign,
        displayTimetableTeachers: storeToRefs(useTimetableStore()).displayTimetableTeachers, ttPageSize: storeToRefs(useTimetableStore()).ttPageSize, TT_PAGE_SIZE_DEFAULT: storeToRefs(useTimetableStore()).TT_PAGE_SIZE_DEFAULT, ttPage: storeToRefs(useTimetableStore()).ttPage, formatDateMMDD: DateUtils.formatDateMMDD,
        teachersList: storeToRefs(useSessionStore()).teachersList,
        classList: storeToRefs(useMutualStore()).classList,
      });
      return _interactApi;
    };


    const scrollMainToTop = (...args) => {
      const a = getInteractApi();
      return a ? a.scrollMainToTop(...args) : undefined;
    };
    const jumpToTeacherTimetable = (...args) => {
      const a = getInteractApi();
      return a ? a.jumpToTeacherTimetable(...args) : undefined;
    };
    const showDetailForRecord = (...args) => {
      const a = getInteractApi();
      return a ? a.showDetailForRecord(...args) : undefined;
    };
    const bindVueModalA11y = (...args) => {
      const a = getInteractApi();
      return a ? a.bindVueModalA11y(...args) : undefined;
    };
    const bindFlagModal = (...args) => {
      const a = getInteractApi();
      return a ? a.bindFlagModal(...args) : undefined;
    };
    const paintMatchSourceDom = (...args) => {
      const a = getInteractApi();
      return a ? a.paintMatchSourceDom(...args) : undefined;
    };
    const applyClassViewFromUrl = (...args) => {
      const a = getInteractApi();
      return a ? a.applyClassViewFromUrl(...args) : undefined;
    };
    const resolvePendingClassView = (...args) => {
      const a = getInteractApi();
      return a ? a.resolvePendingClassView(...args) : undefined;
    };
    const getClassReadonlyLink = (...args) => {
      const a = getInteractApi();
      return a ? a.getClassReadonlyLink(...args) : undefined;
    };
    const copyClassReadonlyLink = (...args) => {
      const a = getInteractApi();
      return a ? a.copyClassReadonlyLink(...args) : undefined;
    };
    const handleClassCellClick = (...args) => {
      const a = getInteractApi();
      return a ? a.handleClassCellClick(...args) : undefined;
    };
    const handlePeriod8CellClick = (...args) => {
      const a = getInteractApi();
      return a ? a.handlePeriod8CellClick(...args) : undefined;
    };
    const handleCellClick = (...args) => {
      const a = getInteractApi();
      return a ? a.handleCellClick(...args) : undefined;
    };
    const startSecondSub = (...args) => {
      const a = getInteractApi();
      return a ? a.startSecondSub(...args) : undefined;
    };
    const loadTeacherClassesForExchange = (...args) => {
      const a = getInteractApi();
      return a ? a.loadTeacherClassesForExchange(...args) : undefined;
    };
    function initImmediateInteraction1() {
    watch(storeToRefs(useSessionStore()).teachersList, (list) => {
      if (!list || !list.length) return;
      const all = list.map(t => String(t.email || '').toLowerCase()).filter(Boolean);
      const selected = {};
      schoolExportSelectedEmails.value.forEach(e => { selected[e] = 1; });
      const known = _schoolExportKnownEmails;
      const isFirst = Object.keys(known).length === 0;
      const next = [];
      all.forEach(em => {
        if (isFirst || selected[em] || !known[em]) next.push(em);
      });
      schoolExportSelectedEmails.value = next;
      const nextKnown = {};
      all.forEach(em => { nextKnown[em] = 1; });
      _schoolExportKnownEmails = nextKnown;
    }, { immediate: true });
    }
  return { classSchedules, classViewerReadonly, canStartSecondSubFromDetail, isMatchPreviewSelected, isMatchSourceCell, isMatchSourceEntry, isMatchHoverCell, isMatchHoverEntry, changeClassWeek, changePeriod8Week, goToPeriod8ThisWeek, goToClassThisWeek, schoolExportStart, schoolExportEnd, schoolExportIncludeWeekend, schoolExportOnlyChanged, schoolExportSelectedEmails, schoolExportTeacherFilter, filteredSchoolExportTeachers, invigilationExportTitle, getInteractApi, scrollMainToTop, jumpToTeacherTimetable, showDetailForRecord, bindVueModalA11y, bindFlagModal, paintMatchSourceDom, applyClassViewFromUrl, resolvePendingClassView, getClassReadonlyLink, copyClassReadonlyLink, handleClassCellClick, handlePeriod8CellClick, handleCellClick, startSecondSub, loadTeacherClassesForExchange, initImmediateInteraction1 };
});
