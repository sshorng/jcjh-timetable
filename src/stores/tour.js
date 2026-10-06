/** v2 stores/tour.js — 由 v1 setup() §分節機械分解（gen-final.cjs）。 */
import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import DateUtils from '../domain/date-utils.js';
import DomainActivityCover from '../domain/domain-activity-cover.js';
import DomainClassAway from '../domain/domain-class-away.js';
import FeeUtils from '../domain/fee-utils.js';
import { UiLineTemplate } from '../modules/ui-line-template.js';
import { UiTour } from '../modules/ui-tour.js';
import { useDataStore } from './data.js';
import { useGasStore } from './gas.js';
import { useInteractionStore } from './interaction.js';
import { useMatchStore } from './match.js';
import { useMutualStore } from './mutual.js';
import { useOutputStore } from './output.js';
import { useSessionStore } from './session.js';
import { useSubmitStore } from './submit.js';
import { useTimetableStore } from './timetable.js';
import { storeToRefs } from 'pinia';
export const useTourStore = defineStore('tour', () => {
  const { buildLineInviteText } = UiLineTemplate;
    const tourDemoInvite = ref(null);
    const nextOnboardingStep = () => {};
    const prevOnboardingStep = () => {};
    const showOnboarding = ref(false);
    const onboardingStep = ref(0);
    const onboardingSteps = [];
    const mySentRequests = ref([]);
    const myPendingRequests = ref([]);
    const adminPendingRequests = ref([]);
    const allPendingRequests = ref([]);
    const matchMode = ref('substitution'); // 'substitution'、'exchange' 或 'triangle'
    const activeCell = ref({ teacherEmail: '', teacherName: '', dayOfWeek: 1, period: 1, classData: null });
    const matchPreview = ref(null);
    const inputRequestDate = ref('');
    const recommendedTeachers = ref([]);
    const recommendationLoading = ref(false);
    const trianglePickB = ref('');
    const trianglePickC = ref('');
    const triangleReason = ref('');
    const triangleNote = ref('');
    const triangleSubmitting = ref(false);
    const batchSelectMode = ref(false);
    const batchFlowMode = ref('substitution'); // 'substitution' | 'exchange'
    const batchSlots = ref([]); // [{ key, teacherEmail, teacherName, dateStr, dayOfWeek, period, className, subject, restriction, subTeacherEmail?, subTeacherName? }]
    const showBatchConfirmModal = ref(false);
    const batchSubTeacher = ref('');
    const batchReason = ref('');
    const batchSubFee = ref('自費代課');
    const batchNote = ref('');
    const batchAssignMode = ref('same'); // 'same' | 'perSlot'
    const batchActiveSlotKey = ref(''); // 每節不同人：目前正在媒合的節次 key
    const isMutualCover = ref(false);
    const QUOTA_DEDUCT_FEE = (FeeUtils && FeeUtils.QUOTA)
      || (DomainActivityCover && DomainActivityCover.QUOTA_DEDUCT_FEE) || '扣額度';
    const MUTUAL_COVER_FEE = (FeeUtils && FeeUtils.QUOTA)
      || (DomainActivityCover && DomainActivityCover.MUTUAL_COVER_FEE) || QUOTA_DEDUCT_FEE;
    const ACTIVITY_PUBLIC_FEE = (DomainActivityCover && DomainActivityCover.ACTIVITY_PUBLIC_FEE) || '活動公費';
    const isQuotaDeductFee = (fee) => {
      if (DAC() && DAC().isQuotaDeductFee) return DAC().isQuotaDeductFee(fee);
      return String(fee || '') === QUOTA_DEDUCT_FEE || String(fee || '') === '互代不結';
    };
    const PERIOD8_FEE = (DomainActivityCover && DomainActivityCover.PERIOD8_FEE) || '第8節代課';
    const TIMETABLE_ONLY_FEE = (FeeUtils && FeeUtils.TIMETABLE_ONLY) || '僅課表呈現（不結算）';
    const isTimetableOnlyFee = (fee) => {
      if (FeeUtils && FeeUtils.isTimetableOnlyFee) {
        return FeeUtils.isTimetableOnlyFee(fee);
      }
      const value = String(fee || '').trim();
      return value === TIMETABLE_ONLY_FEE || value === '僅課表呈現';
    };
    const MUTUAL_PANEL_LS_KEY = 'jcjh_mutual_panel_draft_v1';
    const mutualAwayClasses = ref([]);
    const mutualLeadEmails = ref([]);
    const mutualSkipNotify = ref(true);
    const directApproveSkipNotify = ref(false);
    const mutualNote = ref('');
    const mutualDrafts = ref([]);
    const mutualActivityStart = ref('');
    const mutualActivityEnd = ref('');
    const mutualActivityStartPeriod = ref('0');
    const mutualActivityEndPeriod = ref('8');
    const mutualActivityPeriodMode = ref('range');
    const mutualActivityPeriods = ref(['all']);
    const DAC = () => DomainActivityCover;
    const isMutualActivitySlotInRange = (dateStr, period) => {
      const date = String(dateStr || '').slice(0, 10);
      const startDate = String(mutualActivityStart.value || '').slice(0, 10);
      const endDate = String(mutualActivityEnd.value || mutualActivityStart.value || '').slice(0, 10);
      if (startDate && date && date < startDate) return false;
      if (endDate && date && date > endDate) return false;
      const dca = DomainClassAway;
      if (!dca || typeof dca.eventAppliesToPeriod !== 'function') return true;
      const useRange = mutualActivityPeriodMode.value !== 'daily';
      return dca.eventAppliesToPeriod({
        startDate: startDate,
        endDate: endDate,
        startPeriod: useRange ? String(mutualActivityStartPeriod.value || '0') : '',
        endPeriod: useRange ? String(mutualActivityEndPeriod.value || '8') : '',
        periods: mutualActivityPeriods.value || ['all'],
        period: mutualActivityPeriods.value || ['all']
      }, period, date, endDate || startDate);
    };
    const ensureDAC = async () => {
      if (DomainActivityCover) return DomainActivityCover;
      if (typeof window.ensureDomainActivityCover === 'function') {
        await window.ensureDomainActivityCover();
      }
      return DomainActivityCover || null;
    };
    let _tourApi = null;
const getTourApi = () => {
      if (_tourApi) return _tourApi;
      if (!UiTour) {
        console.error('UiTour 未載入');
        return null;
      }
      _tourApi = UiTour.create({
        computed, callGasApi: useGasStore().callGasApi, activeTab: storeToRefs(useSessionStore()).activeTab, showMatchModal: storeToRefs(useSessionStore()).showMatchModal, inputRequestDate, matchMode,
        fetchRecommendations: useTimetableStore().fetchRecommendations, clearMatchPreview: useMatchStore().clearMatchPreview, showCompareModal: storeToRefs(useMutualStore()).showCompareModal, matchSearchQuery: storeToRefs(useMutualStore()).matchSearchQuery,
        matchDisplayCount: storeToRefs(useMutualStore()).matchDisplayCount, recommendedTeachers, prepCompare: useSubmitStore().prepCompare, showSuccessModal: storeToRefs(useMutualStore()).showSuccessModal,
        currentWeekDates: storeToRefs(useTimetableStore()).currentWeekDates, getTodayString: DateUtils.getTodayString, user: storeToRefs(useSessionStore()).user, openPaperPrintDraft: useOutputStore().openPaperPrintDraft, paperFlow: storeToRefs(useSubmitStore()).paperFlow,
        showPrintPreviewModal: storeToRefs(useMutualStore()).showPrintPreviewModal, closePrintPreview: useOutputStore().closePrintPreview, paperPrintDraft: storeToRefs(useMutualStore()).paperPrintDraft, paperSignatureByTeacher: storeToRefs(useMutualStore()).paperSignatureByTeacher,
        printPreview: storeToRefs(useMutualStore()).printPreview, buildLineInviteText, lineCopyText: storeToRefs(useMutualStore()).lineCopyText, successModalTitle: storeToRefs(useMutualStore()).successModalTitle,
        successModalMessage: storeToRefs(useMutualStore()).successModalMessage, notificationsSuppressed: storeToRefs(useSubmitStore()).notificationsSuppressed, successFlowMode: storeToRefs(useMutualStore()).successFlowMode, hasLineTemplate: storeToRefs(useMutualStore()).hasLineTemplate,
        lineBatchParts: storeToRefs(useMutualStore()).lineBatchParts, tourDemoInvite, getWeekDayText: DateUtils.getWeekDayText, scrollMainToTop: useInteractionStore().scrollMainToTop, isAdmin: storeToRefs(useSessionStore()).isAdmin,
        isStaff: storeToRefs(useSessionStore()).isStaff, classReadonlyMode: storeToRefs(useMutualStore()).classReadonlyMode, getTeacherNameByEmail: useDataStore().getTeacherNameByEmail, getScheduleForDate: useTimetableStore().getScheduleForDate,
        showOnboarding,
        activeCell, closeMatchModal: useMatchStore().closeMatchModal
      });
      return _tourApi;
    };

    const ensureOnboardingTour = (...args) => {
      const a = getTourApi();
      return a ? a.ensureOnboardingTour(...args) : undefined;
    };
    const findDemoScheduleCell = (...args) => {
      const a = getTourApi();
      return a ? a.findDemoScheduleCell(...args) : undefined;
    };
    const openMatchDemoForTour = (...args) => {
      const a = getTourApi();
      return a ? a.openMatchDemoForTour(...args) : undefined;
    };
    const closeMatchDemoForTour = (...args) => {
      const a = getTourApi();
      return a ? a.closeMatchDemoForTour(...args) : undefined;
    };
    const openExchangeModeDemoForTour = (...args) => {
      const a = getTourApi();
      return a ? a.openExchangeModeDemoForTour(...args) : undefined;
    };
    const openCompareDemoForTour = (...args) => {
      const a = getTourApi();
      return a ? a.openCompareDemoForTour(...args) : undefined;
    };
    const closeCompareDemoForTour = (...args) => {
      const a = getTourApi();
      return a ? a.closeCompareDemoForTour(...args) : undefined;
    };
    const openPaperPrintDemoForTour = (...args) => {
      const a = getTourApi();
      return a ? a.openPaperPrintDemoForTour(...args) : undefined;
    };
    const closePaperPrintDemoForTour = (...args) => {
      const a = getTourApi();
      return a ? a.closePaperPrintDemoForTour(...args) : undefined;
    };
    const openLineDemoForTour = (...args) => {
      const a = getTourApi();
      return a ? a.openLineDemoForTour(...args) : undefined;
    };
    const closeLineDemoForTour = (...args) => {
      const a = getTourApi();
      return a ? a.closeLineDemoForTour(...args) : undefined;
    };
    const clearTourDemoInvite = (...args) => {
      const a = getTourApi();
      return a ? a.clearTourDemoInvite(...args) : undefined;
    };
    const showTourDemoInvite = (...args) => {
      const a = getTourApi();
      return a ? a.showTourDemoInvite(...args) : undefined;
    };
    const tourDemoInviteRespond = (...args) => {
      const a = getTourApi();
      return a ? a.tourDemoInviteRespond(...args) : undefined;
    };
    const goTimetableForTour = (...args) => {
      const a = getTourApi();
      return a ? a.goTimetableForTour(...args) : undefined;
    };
    const tourCallbacks = (...args) => {
      const a = getTourApi();
      return a ? a.tourCallbacks(...args) : undefined;
    };
    const startOnboarding = (...args) => {
      const a = getTourApi();
      return a ? a.startOnboarding(...args) : undefined;
    };
    const skipOnboarding = (...args) => {
      const a = getTourApi();
      return a ? a.skipOnboarding(...args) : undefined;
    };
    const shouldAutoStartOnboarding = (...args) => {
      const a = getTourApi();
      return a ? a.shouldAutoStartOnboarding(...args) : undefined;
    };
    function initImmediateTour1() {
    watch(mutualSkipNotify, () => { useMutualStore().persistMutualPanelDraft(); });
    }
    function initImmediateTour2() {
    watch(mutualNote, () => { useMutualStore().persistMutualPanelDraft(); });
    }
  return { tourDemoInvite, nextOnboardingStep, prevOnboardingStep, showOnboarding, onboardingStep, onboardingSteps, mySentRequests, myPendingRequests, adminPendingRequests, allPendingRequests, matchMode, activeCell, matchPreview, inputRequestDate, recommendedTeachers, recommendationLoading, trianglePickB, trianglePickC, triangleReason, triangleNote, triangleSubmitting, batchSelectMode, batchFlowMode, batchSlots, showBatchConfirmModal, batchSubTeacher, batchReason, batchSubFee, batchNote, batchAssignMode, batchActiveSlotKey, isMutualCover, QUOTA_DEDUCT_FEE, MUTUAL_COVER_FEE, ACTIVITY_PUBLIC_FEE, isQuotaDeductFee, PERIOD8_FEE, TIMETABLE_ONLY_FEE, isTimetableOnlyFee, MUTUAL_PANEL_LS_KEY, mutualAwayClasses, mutualLeadEmails, mutualSkipNotify, directApproveSkipNotify, mutualNote, mutualDrafts, mutualActivityStart, mutualActivityEnd, mutualActivityStartPeriod, mutualActivityEndPeriod, mutualActivityPeriodMode, mutualActivityPeriods, DAC, isMutualActivitySlotInRange, ensureDAC, getTourApi, ensureOnboardingTour, findDemoScheduleCell, openMatchDemoForTour, closeMatchDemoForTour, openExchangeModeDemoForTour, openCompareDemoForTour, closeCompareDemoForTour, openPaperPrintDemoForTour, closePaperPrintDemoForTour, openLineDemoForTour, closeLineDemoForTour, clearTourDemoInvite, showTourDemoInvite, tourDemoInviteRespond, goTimetableForTour, tourCallbacks, startOnboarding, skipOnboarding, shouldAutoStartOnboarding, initImmediateTour1, initImmediateTour2 };
});
