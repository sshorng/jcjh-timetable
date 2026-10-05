/** v2 stores/output.js — 由 v1 setup() §分節機械分解（gen-final.cjs）。 */
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
import { useRequestsStore } from './requests.js';
import { useSessionStore } from './session.js';
import { useSubmitStore } from './submit.js';
import { useTimetableStore } from './timetable.js';
import { useTourStore } from './tour.js';
import { storeToRefs } from 'pinia';
export const useOutputStore = defineStore('output', () => {
  const { isTriangleRequest } = UiListHelpers;
  const { isCombinedReturnRequest } = UiLineTemplate;
    let accountingPeriodNavigation = false;
    let monthlyReportLastCalculationKey = null;
    let monthlyReportCalculationId = 0;
    let _exportApi = null;
    const scheduleIndex = computed(() => {
      const a = useTimetableStore().getTimetableApi();
      return a ? a.scheduleIndex.value : DomainSchedule.buildScheduleIndex(storeToRefs(useSessionStore()).allSchedules.value);
    });
    const weekScheduleGrid = computed(() => {
      const a = useTimetableStore().getTimetableApi();
      return a ? a.weekScheduleGrid.value : {};
    });
    const triangleCandidates = computed(() => {
      const a = useTimetableStore().getTimetableApi();
      return a ? a.triangleCandidates.value : [];
    });
    const triangleCandidateB = computed(() => {
      const a = useTimetableStore().getTimetableApi();
      return a ? a.triangleCandidateB.value : null;
    });
    const triangleCandidateCList = computed(() => {
      const a = useTimetableStore().getTimetableApi();
      return a ? a.triangleCandidateCList.value : [];
    });
    const triangleCandidateC = computed(() => {
      const a = useTimetableStore().getTimetableApi();
      return a ? a.triangleCandidateC.value : null;
    });
    const triangleCandidateSearch = ref('');
    const triangleCandidateDisplayCount = ref(18);
    const triangleParticipants = computed(() => {
      const a = useTimetableStore().getTimetableApi();
      return a ? a.triangleParticipants.value : [null, null, null];
    });
    const triangleCandidateOptions = computed(() => {
      const a = useTimetableStore().getTimetableApi();
      return a ? a.triangleCandidateOptions.value : [];
    });
    const triangleDirectExchangeKeys = computed(() => {
      const a = useTimetableStore().getTimetableApi();
      return a ? a.triangleDirectExchangeKeys.value : {};
    });
    const triangleCandidateCOptions = computed(() => {
      const a = useTimetableStore().getTimetableApi();
      return a ? a.triangleCandidateCOptions.value : [];
    });
    const triangleCandidateCReadyCount = computed(() => {
      const a = useTimetableStore().getTimetableApi();
      return a ? a.triangleCandidateCReadyCount.value : 0;
    });
    const triangleCandidateBOptions = computed(() => {
      const a = useTimetableStore().getTimetableApi();
      return a ? a.triangleCandidateBOptions.value : [];
    });
    const triangleCandidateBReadyCount = computed(() => {
      const a = useTimetableStore().getTimetableApi();
      return a ? a.triangleCandidateBReadyCount.value : 0;
    });
    const displayedTriangleCOptions = computed(() => {
      const a = useTimetableStore().getTimetableApi();
      return a ? a.displayedTriangleCOptions.value : [];
    });
    const displayedTriangleBOptions = computed(() => {
      const a = useTimetableStore().getTimetableApi();
      return a ? a.displayedTriangleBOptions.value : [];
    });
    const triangleLegs = computed(() => {
      const a = useTimetableStore().getTimetableApi();
      return a ? a.triangleLegs.value : [];
    });
    const triangleValidation = computed(() => {
      const a = useTimetableStore().getTimetableApi();
      return a ? a.triangleValidation.value : { ok: false, errors: ['三角調模組尚未載入'] };
    });
    const trianglePreviewRows = computed(() => {
      const a = useTimetableStore().getTimetableApi();
      return a ? a.trianglePreviewRows.value : [];
    });
    const trianglePreviewWeekDates = computed(() => {
      const a = useTimetableStore().getTimetableApi();
      return a ? a.trianglePreviewWeekDates.value : [];
    });
    const triangleTimetablePreview = computed(() => {
      const a = useTimetableStore().getTimetableApi();
      return a ? a.triangleTimetablePreview.value : [];
    });
    const triangleReady = computed(() => {
      const a = useTimetableStore().getTimetableApi();
      return a ? a.triangleReady.value : false;
    });
    let _reportApi = null;
    let _printApi = null;
    const ensurePrintReady = async () => {
      const a = getPrintApi();
      if (!a) throw new Error('列印模組尚未載入');
    };
    const decodePaperTimeKey = DateUtils.decodePaperTimeKey;
    const openPaperPrintDraftForSubmittedRequests = (requests) =>
      openPaperPrintDraft(buildPaperRecordsForSubmittedRequests(requests), { canPrint: true });
    const openPaperPrintDraftFromCompare = () => openPaperPrintDraft(null, { returnTo: 'compare', canPrint: false });
const getExportApi = () => {
      if (_exportApi) return _exportApi;
      if (!UiExport) {
        console.error('UiExport 未載入');
        return null;
      }
      _exportApi = UiExport.create({
        isAdmin: storeToRefs(useSessionStore()).isAdmin, ensureActivityCoverReady, classAwayEvents: storeToRefs(useSessionStore()).classAwayEvents, semesterEndDate: storeToRefs(useSessionStore()).semesterEndDate,
        classList: storeToRefs(useMutualStore()).classList, requestsList: storeToRefs(useSessionStore()).requestsList, ensureDAC: useTourStore().ensureDAC, mutualLeadEmails: storeToRefs(useTourStore()).mutualLeadEmails, teachersList: storeToRefs(useSessionStore()).teachersList, allSchedules: storeToRefs(useSessionStore()).allSchedules,
        fetchQuotaLedgerHistoryForExport, getTeacherNameByEmail: useDataStore().getTeacherNameByEmail, resolveExchangeTargetCell: useDataStore().resolveExchangeTargetCell,
        findBaseScheduleSlot: useTimetableStore().findBaseScheduleSlot, isCourseAdjustmentOnlyRequest: useSessionStore().isCourseAdjustmentOnlyRequest, paperFlow: storeToRefs(useSubmitStore()).paperFlow, schoolExportStart: storeToRefs(useInteractionStore()).schoolExportStart,
        schoolExportEnd: storeToRefs(useInteractionStore()).schoolExportEnd, buildDefaultInvigilationTitle, invigilationExportTitle: storeToRefs(useInteractionStore()).invigilationExportTitle,
        ensureInvigilationExportReady, schoolExportSelectedEmails: storeToRefs(useInteractionStore()).schoolExportSelectedEmails, loading: storeToRefs(useSessionStore()).loading, loadingMessage: storeToRefs(useSessionStore()).loadingMessage,
        getScheduleForDate: useTimetableStore().getScheduleForDate, getApprovedScheduleForDate: useTimetableStore().getApprovedScheduleForDate, accountingExportLoading: storeToRefs(useDataStore()).accountingExportLoading,
        ensureBillingReady, reportStartDate: storeToRefs(useDataStore()).reportStartDate, reportEndDate: storeToRefs(useDataStore()).reportEndDate, reportWeeksCount: storeToRefs(useDataStore()).reportWeeksCount, reportMonth: storeToRefs(useDataStore()).reportMonth,
        calculateMonthlyReport, schoolSwaps: storeToRefs(useSessionStore()).schoolSwaps, substitutionRecords: storeToRefs(useSessionStore()).substitutionRecords, homeroomRecords: storeToRefs(useSessionStore()).homeroomRecords,
         monthlyReportData: storeToRefs(useDataStore()).monthlyReportData, isSingleWeek: useSessionStore().isSingleWeek, period8ExportLoading: storeToRefs(useDataStore()).period8ExportLoading, ensurePeriod8Ready,
        isCombinedReturnRequest, fetchMutualQuotaLedger: useGasStore().fetchMutualQuotaLedger
      });
      return _exportApi;
    };

const getReportApi = () => {
      if (_reportApi) return _reportApi;
      if (!UiReport) {
        console.error('UiReport 未載入');
        return null;
      }
      _reportApi = UiReport.create({
        computed, isValidReportPeriod: useDataStore().isValidReportPeriod, reportStartDate: storeToRefs(useDataStore()).reportStartDate, reportEndDate: storeToRefs(useDataStore()).reportEndDate, user: storeToRefs(useSessionStore()).user, isAdmin: storeToRefs(useSessionStore()).isAdmin,
        currentSemester: storeToRefs(useSessionStore()).currentSemester, fetchInitialData: useGasStore().fetchInitialData, applyInitialPayload: useDataStore().applyInitialPayload, period8Ready: storeToRefs(useDataStore()).period8Ready, period8Loading: storeToRefs(useDataStore()).period8Loading,
        requestWindowInfo: storeToRefs(useDataStore()).requestWindowInfo,
        ensureBillingReady, cancelScheduledMonthlyReport, monthlyReportKey: useDataStore().monthlyReportKey, monthlyReportLoading: storeToRefs(useDataStore()).monthlyReportLoading,
        monthlyReportData: storeToRefs(useDataStore()).monthlyReportData, reportWeeksCount: storeToRefs(useDataStore()).reportWeeksCount, teachersList: storeToRefs(useSessionStore()).teachersList, allSchedules: storeToRefs(useSessionStore()).allSchedules, schoolSwaps: storeToRefs(useSessionStore()).schoolSwaps,
        substitutionRecords: storeToRefs(useSessionStore()).substitutionRecords, reportMonth: storeToRefs(useDataStore()).reportMonth, getTeacherNameByEmail: useDataStore().getTeacherNameByEmail, classAwayEvents: storeToRefs(useSessionStore()).classAwayEvents,
        semesterEndDate: storeToRefs(useSessionStore()).semesterEndDate, isSingleWeek: useSessionStore().isSingleWeek, schoolExportTeacherFilter: storeToRefs(useInteractionStore()).schoolExportTeacherFilter, schoolExportSelectedEmails: storeToRefs(useInteractionStore()).schoolExportSelectedEmails,
        schoolExportStart: storeToRefs(useInteractionStore()).schoolExportStart, schoolExportEnd: storeToRefs(useInteractionStore()).schoolExportEnd, schoolExportIncludeWeekend: storeToRefs(useInteractionStore()).schoolExportIncludeWeekend,
        schoolExportOnlyChanged: storeToRefs(useInteractionStore()).schoolExportOnlyChanged, getApprovedScheduleForDate: useTimetableStore().getApprovedScheduleForDate, isClassAwayOnDate: useSessionStore().isClassAwayOnDate, ensureDAC: useTourStore().ensureDAC,
        semestersList: storeToRefs(useSessionStore()).semestersList, ensureExportReady,
        _getMonthlyReportCalculationId: () => monthlyReportCalculationId,
        _nextMonthlyReportCalculationId: () => { monthlyReportCalculationId += 1; return monthlyReportCalculationId; },
        _getMonthlyReportLastCalculationKey: () => monthlyReportLastCalculationKey,
        _setMonthlyReportLastCalculationKey: (v) => { monthlyReportLastCalculationKey = v; },
        activeTab: storeToRefs(useSessionStore()).activeTab, adminSubTab: storeToRefs(useSessionStore()).adminSubTab,
        accountingPeriodMonth: storeToRefs(useDataStore()).accountingPeriodMonth, nextTick,
        _isNav: () => accountingPeriodNavigation,
        _setNav: (v) => { accountingPeriodNavigation = v; },
      });
      return _reportApi;
    };

const getPrintApi = () => {
      if (_printApi) return _printApi;
      if (!UiPrint) {
        console.error('UiPrint 未載入');
        return null;
      }
      _printApi = UiPrint.create({
        getTeacherNameByEmail: useDataStore().getTeacherNameByEmail, getTeacherSubjectByEmail: useDataStore().getTeacherSubjectByEmail, getTeacherJobTitleByEmail: useHomeroomStore().getTeacherJobTitleByEmail,
        getWeekDayText: DateUtils.getWeekDayText, allSchedules: storeToRefs(useSessionStore()).allSchedules, isAdmin: storeToRefs(useSessionStore()).isAdmin, getScheduleForDate: useTimetableStore().getScheduleForDate, selectedRecordIds: storeToRefs(useMutualStore()).selectedRecordIds,
        substitutionRecords: storeToRefs(useSessionStore()).substitutionRecords, requestsList: storeToRefs(useSessionStore()).requestsList, markLocalPrinted, loading: storeToRefs(useSessionStore()).loading, loadingMessage: storeToRefs(useSessionStore()).loadingMessage,
        printPreview: storeToRefs(useMutualStore()).printPreview, showPrintPreviewModal: storeToRefs(useMutualStore()).showPrintPreviewModal, printPreviewImageBusy: storeToRefs(useMutualStore()).printPreviewImageBusy, showDetailModal: storeToRefs(useMutualStore()).showDetailModal,
        showCompareModal: storeToRefs(useMutualStore()).showCompareModal, syncHistorySelectionFromDom: useBackofficeStore().syncHistorySelectionFromDom, buildPaperRecordsForSubmittedRequests,
        isCombinedReturnRequest, isCourseAdjustmentOnlyRequest: useSessionStore().isCourseAdjustmentOnlyRequest, pendingRequestData: storeToRefs(useMutualStore()).pendingRequestData,
        defaultSubFeeForReason: useBackofficeStore().defaultSubFeeForReason, batchSlots: storeToRefs(useTourStore()).batchSlots, decodePaperTimeKey, paperPrintDraft: storeToRefs(useMutualStore()).paperPrintDraft,
        paperSignatureByTeacher: storeToRefs(useMutualStore()).paperSignatureByTeacher, successActionRequests: storeToRefs(useMutualStore()).successActionRequests, openPaperPrintDraftForSubmittedRequests,
        showSuccessModal: storeToRefs(useMutualStore()).showSuccessModal, showTriangleTimetablePreview: storeToRefs(useMutualStore()).showTriangleTimetablePreview, triangleParticipants, triangleLegs,
        triangleReason: storeToRefs(useTourStore()).triangleReason, triangleNote: storeToRefs(useTourStore()).triangleNote, paperFlow: storeToRefs(useSubmitStore()).paperFlow, addEventToCalendar: useTimetableStore().addEventToCalendar,
        triangleReady, mutualDrafts: storeToRefs(useTourStore()).mutualDrafts, mutualNote: storeToRefs(useTourStore()).mutualNote, ensurePrintReady,
        detailRequest: storeToRefs(useMutualStore()).detailRequest, detailSubRecord: storeToRefs(useMutualStore()).detailSubRecord, isTriangleRequest, isExchangeLikeRequest: useMutualStore().isExchangeLikeRequest,
      });
      return _printApi;
    };

    const printSingleRequest = (...args) => {
      const a = getPrintApi();
      return a ? a.printSingleRequest(...args) : undefined;
    };
    const markLocalPrinted = (...args) => {
      const a = getPrintApi();
      return a ? a.markLocalPrinted(...args) : undefined;
    };
    const cancelScheduledMonthlyReport = (...args) => {
      const a = getReportApi();
      return a ? a.cancelScheduledMonthlyReport(...args) : undefined;
    };
    const scheduleMonthlyReportCalculation = (...args) => {
      const a = getReportApi();
      return a ? a.scheduleMonthlyReportCalculation(...args) : undefined;
    };
    const shiftReportPeriod = (...args) => {
      const a = getReportApi();
      return a ? a.shiftReportPeriod(...args) : undefined;
    };
    const ensureBillingReady = (...args) => {
      const a = getExportApi();
      return a ? a.ensureBillingReady(...args) : Promise.reject(new Error('匯出模組未載入'));
    };
    const getBillingRequestWindow = (...args) => {
      const a = getReportApi();
      return a ? a.getBillingRequestWindow(...args) : undefined;
    };
    const billingRequestWindowIsLoaded = (...args) => {
      const a = getReportApi();
      return a ? a.billingRequestWindowIsLoaded(...args) : undefined;
    };
    const ensureBillingRequestsForPeriod = (...args) => {
      const a = getReportApi();
      return a ? a.ensureBillingRequestsForPeriod(...args) : undefined;
    };
    const ensurePeriod8Ready = (...args) => {
      const a = getReportApi();
      return a ? a.ensurePeriod8Ready(...args) : undefined;
    };
    const calculateMonthlyReport = (...args) => {
      const a = getReportApi();
      return a ? a.calculateMonthlyReport(...args) : undefined;
    };
    const exportReportToExcel = (...args) => {
      const a = getReportApi();
      return a ? a.exportReportToExcel(...args) : undefined;
    };
    const exportSubFeeToExcel = async (...args) => {
      const a = getExportApi();
      return a ? await a.exportSubFeeToExcel(...args) : undefined;
    };
    const exportPeriod8Accounting = async (...args) => {
      const a = getExportApi();
      return a ? await a.exportPeriod8Accounting(...args) : undefined;
    };
    const isSchoolExportTeacherSelected = (...args) => {
      const a = getReportApi();
      return a ? a.isSchoolExportTeacherSelected(...args) : undefined;
    };
    const toggleSchoolExportTeacher = (...args) => {
      const a = getReportApi();
      return a ? a.toggleSchoolExportTeacher(...args) : undefined;
    };
    const selectAllSchoolExportTeachers = (...args) => {
      const a = getReportApi();
      return a ? a.selectAllSchoolExportTeachers(...args) : undefined;
    };
    const clearSchoolExportTeachers = (...args) => {
      const a = getReportApi();
      return a ? a.clearSchoolExportTeachers(...args) : undefined;
    };
    const setSchoolExportThisWeek = (...args) => {
      const a = getReportApi();
      return a ? a.setSchoolExportThisWeek(...args) : undefined;
    };
    const exportSchoolTimetableWord = (...args) => {
      const a = getReportApi();
      return a ? a.exportSchoolTimetableWord(...args) : undefined;
    };
    const ensureActivityCoverReady = (...args) => {
      const a = getReportApi();
      return a ? a.ensureActivityCoverReady(...args) : undefined;
    };
    const fetchQuotaLedgerHistoryForExport = (...args) => {
      const a = getExportApi();
      return a ? a.fetchQuotaLedgerHistoryForExport(...args) : Promise.reject(new Error('匯出模組未載入'));
    };
    const exportActivityCoverWord = async (...args) => {
      const a = getExportApi();
      return a ? await a.exportActivityCoverWord(...args) : undefined;
    };
    const buildDefaultInvigilationTitle = (...args) => {
      const a = getReportApi();
      return a ? a.buildDefaultInvigilationTitle(...args) : undefined;
    };
    const ensureInvigilationExportReady = (...args) => {
      const a = getReportApi();
      return a ? a.ensureInvigilationExportReady(...args) : undefined;
    };
    const exportInvigilationWorkbook = async (...args) => {
      const a = getExportApi();
      return a ? await a.exportInvigilationWorkbook(...args) : undefined;
    };
    const generateFormHtml = (...args) => {
      const a = getPrintApi();
      return a ? a.generateFormHtml(...args) : undefined;
    };
    const createPrintContext = (...args) => {
      const a = getPrintApi();
      return a ? a.createPrintContext(...args) : undefined;
    };
    const ensureExportReady = (...args) => {
      const a = getPrintApi();
      return a ? a.ensureExportReady(...args) : undefined;
    };
    const printSelectedForms = (...args) => {
      const a = getPrintApi();
      return a ? a.printSelectedForms(...args) : undefined;
    };
    const openPrintPreview = (...args) => {
      const a = getPrintApi();
      return a ? a.openPrintPreview(...args) : undefined;
    };
    const openHistoryPrintPreview = (...args) => {
      const a = getPrintApi();
      return a ? a.openHistoryPrintPreview(...args) : undefined;
    };
    const closePrintPreview = (...args) => {
      const a = getPrintApi();
      return a ? a.closePrintPreview(...args) : undefined;
    };
    const confirmPrintPreview = (...args) => {
      const a = getPrintApi();
      return a ? a.confirmPrintPreview(...args) : undefined;
    };
    const getPrintPreviewPngBlob = (...args) => {
      const a = getPrintApi();
      return a ? a.getPrintPreviewPngBlob(...args) : undefined;
    };
    const getPrintPreviewFileName = (...args) => {
      const a = getPrintApi();
      return a ? a.getPrintPreviewFileName(...args) : undefined;
    };
    const downloadPrintPreviewImage = (...args) => {
      const a = getPrintApi();
      return a ? a.downloadPrintPreviewImage(...args) : undefined;
    };
    const copyPrintPreviewImage = (...args) => {
      const a = getPrintApi();
      return a ? a.copyPrintPreviewImage(...args) : undefined;
    };
    const buildPaperDraftRecords = (...args) => {
      const a = getPrintApi();
      return a ? a.buildPaperDraftRecords(...args) : undefined;
    };
    const buildPaperRecordsForSubmittedRequests = (...args) => {
      const a = getExportApi();
      return a ? a.buildPaperRecordsForSubmittedRequests(...args) : [];
    };
    const buildTrianglePaperDraftRecords = (...args) => {
      const a = getPrintApi();
      return a ? a.buildTrianglePaperDraftRecords(...args) : undefined;
    };
    const openPaperPrintDraft = (...args) => {
      const a = getPrintApi();
      return a ? a.openPaperPrintDraft(...args) : undefined;
    };
    const openPaperPrintForRequest = (...args) => {
      const a = getPrintApi();
      return a ? a.openPaperPrintForRequest(...args) : undefined;
    };
    const openTrianglePaperPreview = (...args) => {
      const a = getPrintApi();
      return a ? a.openTrianglePaperPreview(...args) : undefined;
    };
    const openPaperPrintMutualDrafts = (...args) => {
      const a = getPrintApi();
      return a ? a.openPaperPrintMutualDrafts(...args) : undefined;
    };
    const printPaperDraft = (...args) => {
      const a = getPrintApi();
      return a ? a.printPaperDraft(...args) : undefined;
    };
    const openPaperDraftPreview = (...args) => {
      const a = getPrintApi();
      return a ? a.openPaperDraftPreview(...args) : undefined;
    };
    const openSuccessPrintPreview = (...args) => {
      const a = getPrintApi();
      return a ? a.openSuccessPrintPreview(...args) : undefined;
    };
    const addSuccessToCalendar = (...args) => {
      const a = getPrintApi();
      return a ? a.addSuccessToCalendar(...args) : undefined;
    };
    const isReportNavigating = () => accountingPeriodNavigation;
  return { accountingPeriodNavigation, monthlyReportCalculationId, scheduleIndex, weekScheduleGrid, triangleCandidates, triangleCandidateB, triangleCandidateCList, triangleCandidateC, triangleCandidateSearch, triangleCandidateDisplayCount, triangleParticipants, triangleCandidateOptions, triangleDirectExchangeKeys, triangleCandidateCOptions, triangleCandidateCReadyCount, triangleCandidateBOptions, triangleCandidateBReadyCount, displayedTriangleCOptions, displayedTriangleBOptions, triangleLegs, triangleValidation, trianglePreviewRows, trianglePreviewWeekDates, triangleTimetablePreview, triangleReady, ensurePrintReady, decodePaperTimeKey, openPaperPrintDraftForSubmittedRequests, openPaperPrintDraftFromCompare, getExportApi, getReportApi, getPrintApi, printSingleRequest, markLocalPrinted, cancelScheduledMonthlyReport, scheduleMonthlyReportCalculation, shiftReportPeriod, ensureBillingReady, getBillingRequestWindow, billingRequestWindowIsLoaded, ensureBillingRequestsForPeriod, ensurePeriod8Ready, calculateMonthlyReport, exportReportToExcel, exportSubFeeToExcel, exportPeriod8Accounting, isSchoolExportTeacherSelected, toggleSchoolExportTeacher, selectAllSchoolExportTeachers, clearSchoolExportTeachers, setSchoolExportThisWeek, exportSchoolTimetableWord, ensureActivityCoverReady, fetchQuotaLedgerHistoryForExport, exportActivityCoverWord, buildDefaultInvigilationTitle, ensureInvigilationExportReady, exportInvigilationWorkbook, generateFormHtml, createPrintContext, ensureExportReady, printSelectedForms, openPrintPreview, openHistoryPrintPreview, closePrintPreview, confirmPrintPreview, getPrintPreviewPngBlob, getPrintPreviewFileName, downloadPrintPreviewImage, copyPrintPreviewImage, buildPaperDraftRecords, buildPaperRecordsForSubmittedRequests, buildTrianglePaperDraftRecords, openPaperPrintDraft, openPaperPrintForRequest, openTrianglePaperPreview, openPaperPrintMutualDrafts, printPaperDraft, openPaperDraftPreview, openSuccessPrintPreview, addSuccessToCalendar, isReportNavigating };
});
