/** v2 stores/output.js — 由 v1 setup() §分節機械分解（gen-final.cjs）。 */
import { defineStore } from 'pinia';
import { computed, nextTick, ref } from 'vue';
import DateUtils from '../domain/date-utils.js';
import DomainSchedule from '../domain/domain-schedule.js';
import { ensureUiExportModule, ensureUiPrintModule, ensureUiReportModule, outputModulesReady } from '../modules/output-gates.js';
import { UiLineTemplate } from '../modules/ui-line-template.js';
import { UiListHelpers } from '../modules/ui-list-helpers.js';
// 2.0b：UiExport／UiPrint／UiReport 改閘門按需載入；未載入前 getXApi() 回 null（既有守衛語義）。
let UiExport = null;
let UiPrint = null;
let UiReport = null;
let _outputModulesPromise = null;
const ensureOutputModules = () => {
  if (!_outputModulesPromise) {
    _outputModulesPromise = Promise.all([
      ensureUiExportModule().then((m) => { UiExport = m; }),
      ensureUiPrintModule().then((m) => { UiPrint = m; }),
      ensureUiReportModule().then((m) => { UiReport = m; }),
    ]).then(() => { outputModulesReady.value = true; }).catch((e) => { _outputModulesPromise = null; throw e; });
  }
  return _outputModulesPromise;
};
import { useBackofficeStore } from './backoffice.js';
import { useDataStore } from './data.js';
import { useGasStore } from './gas.js';
import { useHomeroomStore } from './homeroom.js';
import { useInteractionStore } from './interaction.js';
import { useMutualStore } from './mutual.js';
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
      await ensureOutputModules();
      const a = getPrintApi();
      if (!a) throw new Error('列印模組尚未載入');
    };
    const decodePaperTimeKey = DateUtils.decodePaperTimeKey;
    const openPaperPrintDraftForSubmittedRequests = async (requests) => {
      await ensureOutputModules();
      return openPaperPrintDraft(buildPaperRecordsForSubmittedRequests(requests), { canPrint: true });
    };
    const openPaperPrintDraftFromCompare = async () => {
      await ensureOutputModules();
      return openPaperPrintDraft(null, { returnTo: 'compare', canPrint: false });
    };
const getExportApi = () => {
      if (_exportApi) return _exportApi;
      if (!UiExport) {
        if (_outputModulesPromise) console.error('UiExport 未載入');
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
        if (_outputModulesPromise) console.error('UiReport 未載入');
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
        if (_outputModulesPromise) console.error('UiPrint 未載入');
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

    const printSingleRequest = async (...args) => {
      await ensureOutputModules();
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
    const scheduleMonthlyReportCalculation = async (...args) => {
      await ensureOutputModules();
      const a = getReportApi();
      return a ? a.scheduleMonthlyReportCalculation(...args) : undefined;
    };
    const shiftReportPeriod = async (...args) => {
      await ensureOutputModules();
      const a = getReportApi();
      return a ? a.shiftReportPeriod(...args) : undefined;
    };
    const ensureBillingReady = async (...args) => {
      await ensureOutputModules();
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
    const ensurePeriod8Ready = async (...args) => {
      await ensureOutputModules();
      const a = getReportApi();
      return a ? a.ensurePeriod8Ready(...args) : undefined;
    };
    const calculateMonthlyReport = async (...args) => {
      await ensureOutputModules();
      const a = getReportApi();
      return a ? a.calculateMonthlyReport(...args) : undefined;
    };
    const exportReportToExcel = async (...args) => {
      await ensureOutputModules();
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
    // 2.0b內聯：純 ref 讀取（:checked render 路徑），免經 reportApi，模組未載也正確。
    const isSchoolExportTeacherSelected = (email) => {
      const em = String(email || '').toLowerCase();
      const list = storeToRefs(useInteractionStore()).schoolExportSelectedEmails.value || [];
      return list.indexOf(em) >= 0;
    };
    const toggleSchoolExportTeacher = async (...args) => {
      await ensureOutputModules();
      const a = getReportApi();
      return a ? a.toggleSchoolExportTeacher(...args) : undefined;
    };
    const selectAllSchoolExportTeachers = async (...args) => {
      await ensureOutputModules();
      const a = getReportApi();
      return a ? a.selectAllSchoolExportTeachers(...args) : undefined;
    };
    const clearSchoolExportTeachers = async (...args) => {
      await ensureOutputModules();
      const a = getReportApi();
      return a ? a.clearSchoolExportTeachers(...args) : undefined;
    };
    const setSchoolExportThisWeek = async (...args) => {
      await ensureOutputModules();
      const a = getReportApi();
      return a ? a.setSchoolExportThisWeek(...args) : undefined;
    };
    const exportSchoolTimetableWord = async (...args) => {
      await ensureOutputModules();
      const a = getReportApi();
      return a ? a.exportSchoolTimetableWord(...args) : undefined;
    };
    const ensureActivityCoverReady = async (...args) => {
      await ensureOutputModules();
      const a = getReportApi();
      return a ? a.ensureActivityCoverReady(...args) : undefined;
    };
    const fetchQuotaLedgerHistoryForExport = async (...args) => {
      await ensureOutputModules();
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
    const ensureInvigilationExportReady = async (...args) => {
      await ensureOutputModules();
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
    const ensureExportReady = async (...args) => {
      await ensureOutputModules();
      const a = getPrintApi();
      return a ? a.ensureExportReady(...args) : undefined;
    };
    const printSelectedForms = async (...args) => {
      await ensureOutputModules();
      const a = getPrintApi();
      return a ? a.printSelectedForms(...args) : undefined;
    };
    const openPrintPreview = async (...args) => {
      await ensureOutputModules();
      const a = getPrintApi();
      return a ? a.openPrintPreview(...args) : undefined;
    };
    const openHistoryPrintPreview = async (...args) => {
      await ensureOutputModules();
      const a = getPrintApi();
      return a ? a.openHistoryPrintPreview(...args) : undefined;
    };
    const closePrintPreview = async (...args) => {
      await ensureOutputModules();
      const a = getPrintApi();
      return a ? a.closePrintPreview(...args) : undefined;
    };
    const confirmPrintPreview = async (...args) => {
      await ensureOutputModules();
      const a = getPrintApi();
      return a ? a.confirmPrintPreview(...args) : undefined;
    };
    const getPrintPreviewPngBlob = async (...args) => {
      await ensureOutputModules();
      const a = getPrintApi();
      return a ? a.getPrintPreviewPngBlob(...args) : undefined;
    };
    const getPrintPreviewFileName = async (...args) => {
      await ensureOutputModules();
      const a = getPrintApi();
      return a ? a.getPrintPreviewFileName(...args) : undefined;
    };
    const downloadPrintPreviewImage = async (...args) => {
      await ensureOutputModules();
      const a = getPrintApi();
      return a ? a.downloadPrintPreviewImage(...args) : undefined;
    };
    const copyPrintPreviewImage = async (...args) => {
      await ensureOutputModules();
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
    const openPaperPrintDraft = async (...args) => {
      await ensureOutputModules();
      const a = getPrintApi();
      return a ? a.openPaperPrintDraft(...args) : undefined;
    };
    const openPaperPrintForRequest = async (...args) => {
      await ensureOutputModules();
      const a = getPrintApi();
      return a ? a.openPaperPrintForRequest(...args) : undefined;
    };
    const openTrianglePaperPreview = async (...args) => {
      await ensureOutputModules();
      const a = getPrintApi();
      return a ? a.openTrianglePaperPreview(...args) : undefined;
    };
    const openPaperPrintMutualDrafts = async (...args) => {
      await ensureOutputModules();
      const a = getPrintApi();
      return a ? a.openPaperPrintMutualDrafts(...args) : undefined;
    };
    const printPaperDraft = async (...args) => {
      await ensureOutputModules();
      const a = getPrintApi();
      return a ? a.printPaperDraft(...args) : undefined;
    };
    const openPaperDraftPreview = async (...args) => {
      await ensureOutputModules();
      const a = getPrintApi();
      return a ? a.openPaperDraftPreview(...args) : undefined;
    };
    const openSuccessPrintPreview = async (...args) => {
      await ensureOutputModules();
      const a = getPrintApi();
      return a ? a.openSuccessPrintPreview(...args) : undefined;
    };
    const addSuccessToCalendar = async (...args) => {
      await ensureOutputModules();
      const a = getPrintApi();
      return a ? a.addSuccessToCalendar(...args) : undefined;
    };
    const isReportNavigating = () => accountingPeriodNavigation;
  return { accountingPeriodNavigation, monthlyReportCalculationId, ensureOutputModules, scheduleIndex, weekScheduleGrid, triangleCandidates, triangleCandidateB, triangleCandidateCList, triangleCandidateC, triangleCandidateSearch, triangleCandidateDisplayCount, triangleParticipants, triangleCandidateOptions, triangleDirectExchangeKeys, triangleCandidateCOptions, triangleCandidateCReadyCount, triangleCandidateBOptions, triangleCandidateBReadyCount, displayedTriangleCOptions, displayedTriangleBOptions, triangleLegs, triangleValidation, trianglePreviewRows, trianglePreviewWeekDates, triangleTimetablePreview, triangleReady, ensurePrintReady, decodePaperTimeKey, openPaperPrintDraftForSubmittedRequests, openPaperPrintDraftFromCompare, getExportApi, getReportApi, getPrintApi, printSingleRequest, markLocalPrinted, cancelScheduledMonthlyReport, scheduleMonthlyReportCalculation, shiftReportPeriod, ensureBillingReady, getBillingRequestWindow, billingRequestWindowIsLoaded, ensureBillingRequestsForPeriod, ensurePeriod8Ready, calculateMonthlyReport, exportReportToExcel, exportSubFeeToExcel, exportPeriod8Accounting, isSchoolExportTeacherSelected, toggleSchoolExportTeacher, selectAllSchoolExportTeachers, clearSchoolExportTeachers, setSchoolExportThisWeek, exportSchoolTimetableWord, ensureActivityCoverReady, fetchQuotaLedgerHistoryForExport, exportActivityCoverWord, buildDefaultInvigilationTitle, ensureInvigilationExportReady, exportInvigilationWorkbook, generateFormHtml, createPrintContext, ensureExportReady, printSelectedForms, openPrintPreview, openHistoryPrintPreview, closePrintPreview, confirmPrintPreview, getPrintPreviewPngBlob, getPrintPreviewFileName, downloadPrintPreviewImage, copyPrintPreviewImage, buildPaperDraftRecords, buildPaperRecordsForSubmittedRequests, buildTrianglePaperDraftRecords, openPaperPrintDraft, openPaperPrintForRequest, openTrianglePaperPreview, openPaperPrintMutualDrafts, printPaperDraft, openPaperDraftPreview, openSuccessPrintPreview, addSuccessToCalendar, isReportNavigating };
});
