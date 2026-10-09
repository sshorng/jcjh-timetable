/** v2 stores/mutual.js — 由 v1 setup() §分節機械分解（gen-final.cjs）。 */
import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import DateUtils from '../domain/date-utils.js';
import FeeUtils from '../domain/fee-utils.js';
import { UiMutualBridge } from '../modules/ui-activity.js';
import { UiMutualPanelState } from '../modules/ui-mutual.js';
import { showConfirm, showToast } from '../ui/toast.js';
import { useBackofficeStore } from './backoffice.js';
import { useDataStore } from './data.js';
import { useGasStore } from './gas.js';
import { useInteractionStore } from './interaction.js';
import { useMatchStore } from './match.js';
import { useOutputStore } from './output.js';
import { useSessionStore } from './session.js';
import { useSubmitStore } from './submit.js';
import { useTimetableStore } from './timetable.js';
import { useTourStore } from './tour.js';
import { storeToRefs } from 'pinia';
export const useMutualStore = defineStore('mutual', () => {
    let _mutualPanelApi = null;
    let _getMutualImportEventId = () => '';
    const onMutualLeadChipClick = (email) => {
      const em = String(email || '').trim();
      if (!em) return;
      const wasLead = isMutualLead(em);
      toggleMutualLead(em);
      const t = useDataStore().lookupTeacher(em);
      const name = t ? t.name : em;
      if (wasLead) showToast(`已取消帶隊：${name}`, 'info');
      else showToast(`已加入帶隊：${name}`, 'info');
    };
    const bustQuotaLedgerViewCache = () => {
      try {
        if (typeof window !== 'undefined' && typeof window.__quotaLedgerCacheBust === 'function') {
          window.__quotaLedgerCacheBust();
        }
      } catch (e) { /* ignore */ }
    };
    const selectedClass = ref('');
    const classReadonlyMode = ref(false);
    const pendingClassView = ref('');
    const classDirectory = ref([]);
    const classViewSchedules = ref([]);
    const classViewSchoolSwaps = ref([]);
    const classViewSubstitutionRecords = ref([]);
    const classViewClassAwayEvents = ref([]);
    const classViewLoadedClass = ref('');
    const selectedClassDate = ref(DateUtils.toLocalDateStr(new Date()));
    const period8WeekDate = ref(DateUtils.toLocalDateStr(new Date()));
    const selectedClassWeekDates = computed(() => {
      const a = useTimetableStore().getScheduleApi();
      return a ? a.selectedClassWeekDates.value : [];
    });
    const period8WeekDates = computed(() => {
      const a = useTimetableStore().getScheduleApi();
      return a ? a.period8WeekDates.value : [];
    });
    const classWeekNumber = computed(() => {
      if (!selectedClassWeekDates.value.length) return '';
      const wn = useSessionStore().getWeekNumber(selectedClassWeekDates.value[0]);
      return wn > 0 ? `第 ${wn} 週` : '';
    });
    const period8WeekNumber = computed(() => {
      if (!period8WeekDates.value.length) return '';
      const wn = useSessionStore().getWeekNumber(period8WeekDates.value[0]);
      return wn > 0 ? `第 ${wn} 週` : '';
    });
    const classSubstitutionMap = computed(() => {
      const a = useTimetableStore().getScheduleApi();
      return a ? a.classSubstitutionMap.value : {};
    });
    const classChangeSummary = computed(() => {
      const a = useTimetableStore().getClassViewApi();
      return a ? a.classChangeSummary.value : [];
    });
    const classChangeTypeLabels = Object.freeze({
      '全校對調': '全校',
      '併班上課': '併班',
      '合班回原班': '併班',
      '課務調整': '調課',
      '互代不結': '互代',
      '空堂任務': '空堂'
    });
    const getClassChangeTypeLabel = (type) => {
      const value = String(type || '').trim();
      return classChangeTypeLabels[value] || value;
    };
    const matchSearchQuery = ref('');
    const matchDisplayCount = ref(10);
    const matchShowNoTeacherWarning = ref(false);
    const matchEmptyReasons = ref(null);
    const exchangeTeacherEmail = ref('');
    const exchangeTeacherClasses = ref([]);
    const exchangePeriodId = ref('');
    const exchangeTargetDate = ref('');
    const exchangeWeekOffset = ref(0);
    const exchangeWeekdayFilter = ref(0); // 0＝全部；1～5＝週一至週五
    const exchangeWeekdayOptions = [
      { value: 0, label: '全部' },
      { value: 1, label: '週一' },
      { value: 2, label: '週二' },
      { value: 3, label: '週三' },
      { value: 4, label: '週四' },
      { value: 5, label: '週五' }
    ];
    const setExchangeWeekdayFilter = (day) => {
      const value = parseInt(day, 10);
      exchangeWeekdayFilter.value = value >= 1 && value <= 5 ? value : 0;
      matchDisplayCount.value = 10;
    };
    const showCompareModal = ref(false);
    const showTriangleTimetablePreview = ref(false);
    const showSuccessModal = ref(false);
    const showLineMessageModal = ref(false);
    const lineMessageTitle = ref('LINE 訊息');
    const lineMessageText = ref('');
    const successModalTitle = ref('');
    const successModalMessage = ref('');
    const successFlowMode = ref('normal');
    const successActionRequests = ref([]);
    const lineCopyText = ref('');
    const hasLineTemplate = ref(false);
    const lineBatchParts = ref([]);
    const copyLineMessage = async (text) => {
      const payload = (text != null && String(text).length) ? String(text) : lineCopyText.value;
      try {
        await navigator.clipboard.writeText(payload);
        showToast("📋 LINE 邀請訊息已複製至剪貼簿！可以直接貼給對方老師囉～", 'success');
      } catch (err) {
        console.error("複製失敗：", err);
        showToast("複製失敗，請手動複製文字框內的內容。", 'error');
      }
    };
    const sendLineMessage = (text) => {
      const payload = (text != null && String(text).length) ? String(text) : lineCopyText.value;
      if (!payload) return;
      try {
        navigator.clipboard.writeText(payload);
      } catch (e) {}
      const url = `https://line.me/R/msg/text/?${encodeURIComponent(payload)}`;
      window.open(url, '_blank');
    };
    const openLineMessageEditor = (text, title = 'LINE 訊息') => {
      // LINE 編輯器取代目前的內容視窗，避免兩個 modal 疊在一起。
      showDetailModal.value = false;
      showCompareModal.value = false;
      showSuccessModal.value = false;
      lineMessageTitle.value = title;
      lineMessageText.value = String(text || '');
      showLineMessageModal.value = true;
    };
    const copyEditedLineMessage = () => copyLineMessage(lineMessageText.value);
    const sendEditedLineMessage = () => sendLineMessage(lineMessageText.value);
    const copyLineBatchPart = (idx) => {
      const part = lineBatchParts.value[idx];
      if (part && part.text) copyLineMessage(part.text);
    };
    const isExchangeLikeRequest = (...args) => useTimetableStore().timetableApiOrNull().isExchangeLikeRequest(...args);
    const getTargetSubject = (...args) => useTimetableStore().timetableApiOrNull().getTargetSubject(...args);
    const getTargetClassAndSubject = (...args) => useTimetableStore().timetableApiOrNull().getTargetClassAndSubject(...args);
    const getOriginalRequestSubject = (...args) => useTimetableStore().timetableApiOrNull().getOriginalRequestSubject(...args);
    const getOriginalRequestClass = (...args) => useTimetableStore().timetableApiOrNull().getOriginalRequestClass(...args);
    const getOriginalTargetSubject = (...args) => useTimetableStore().timetableApiOrNull().getOriginalTargetSubject(...args);
    const getOriginalTargetClass = (...args) => useTimetableStore().timetableApiOrNull().getOriginalTargetClass(...args);
    const pendingRequestData = ref({
      mode: '', leaveTeacher: '', subTeacher: '', cls: '', subject: '', date: '', timeKey: '',
      reason: '', leaveReasonBeforeCourseAdjustment: '', courseAdjustmentOnly: false,
      subFee: '', dateB: '', timeB: '', subB: '', note: '',
      leaveTimeType: '', leaveTimeStart: '', leaveTimeEnd: '', leaveTime: '',
      submitRequestId: '', submitSerial: '', submitBatchId: ''
    });
    const combinedReturnCandidates = ref([]);
    const askFirstLineText = computed(() => {
      const a = useSubmitStore().getSubmitApi();
      return a ? a.askFirstLineText.value : '';
    });
    const askFirstLineDraft = ref('');
    const selectedRecordIds = ref([]);
    const showDevDropdown = ref(false);
    const paperPrintDraft = ref(null);
    const paperSignatureByTeacher = ref({});
    const showPrintPreviewModal = ref(false);
    const printPreview = ref(null);
    const printPreviewImageBusy = ref(false);
    const isSubmitting = ref(false);
    const showDetailModal = ref(false);
    const consecAlertsA = ref([]);
    const consecAlertsB = ref([]);
    const detailRequest = ref(null);
    const detailSubRecord = ref(null);
    const historyFilterMode = ref('all');
    const historyTypeFilter = ref('all');
    const historyFilterDate = ref(DateUtils.toLocalDateStr(new Date()));
    const historySearchQuery = ref('');
    const historyPage = ref(1);
    const isHistoryExchangeType = (record) => {
      const type = String(record && record.type || '').trim().toLowerCase();
      return type === 'exchange' || type === '對調' || type === '調課' || type === 'triangle' || type === '三角調';
    };
    const historyPageSize = ref(20);
    const classList = computed(() => {
      const a = useTimetableStore().getScheduleApi();
      return a ? a.classList.value : [];
    });
const getMutualPanelApi = () => {
      if (_mutualPanelApi) return _mutualPanelApi;
      // 同步路徑：若尚未載入 DAC，先觸發背景載入（常數有 fallback）
      _mutualPanelApi = UiMutualPanelState.create({
        showToast, showConfirm, callGasApi: useGasStore().callGasApi, isAdmin: storeToRefs(useSessionStore()).isAdmin, loading: storeToRefs(useSessionStore()).loading, loadingMessage: storeToRefs(useSessionStore()).loadingMessage,
        isMutualCover: storeToRefs(useTourStore()).isMutualCover, mutualAwayClasses: storeToRefs(useTourStore()).mutualAwayClasses, mutualLeadEmails: storeToRefs(useTourStore()).mutualLeadEmails, mutualSkipNotify: storeToRefs(useTourStore()).mutualSkipNotify, mutualNote: storeToRefs(useTourStore()).mutualNote, mutualDrafts: storeToRefs(useTourStore()).mutualDrafts,
        mutualActivityStart: storeToRefs(useTourStore()).mutualActivityStart, mutualActivityEnd: storeToRefs(useTourStore()).mutualActivityEnd, mutualActivityStartPeriod: storeToRefs(useTourStore()).mutualActivityStartPeriod, mutualActivityEndPeriod: storeToRefs(useTourStore()).mutualActivityEndPeriod,
        mutualActivityPeriodMode: storeToRefs(useTourStore()).mutualActivityPeriodMode, mutualActivityPeriods: storeToRefs(useTourStore()).mutualActivityPeriods,
        currentWeekDates: storeToRefs(useTimetableStore()).currentWeekDates, classList, teachersList: storeToRefs(useSessionStore()).teachersList, allSchedules: storeToRefs(useSessionStore()).allSchedules, requestsList: storeToRefs(useSessionStore()).requestsList,
        activeCell: storeToRefs(useTourStore()).activeCell, inputRequestDate: storeToRefs(useTourStore()).inputRequestDate, recommendedTeachers: storeToRefs(useTourStore()).recommendedTeachers, showMatchModal: storeToRefs(useSessionStore()).showMatchModal, pendingRequestData, batchSubFee: storeToRefs(useTourStore()).batchSubFee, directApproveMode: storeToRefs(useDataStore()).directApproveMode,
        ACTIVITY_PUBLIC_FEE: useTourStore().ACTIVITY_PUBLIC_FEE, PERIOD8_FEE: useTourStore().PERIOD8_FEE, getTeacherNameByEmail: useDataStore().getTeacherNameByEmail, softRefreshInBackground: useDataStore().softRefreshInBackground, defaultSubFeeForReason: useBackofficeStore().defaultSubFeeForReason, getScheduleForDate: useTimetableStore().getScheduleForDate,
        classAwayEvents: storeToRefs(useSessionStore()).classAwayEvents,
        getMutualImportEventId: function () { return _getMutualImportEventId(); },
        DAC: useTourStore().DAC
      });
      return _mutualPanelApi;
    };

    const setMutualActivityPeriodBoundary = (field, value) => { const a = getMutualPanelApi(); if (a) a.setMutualActivityPeriodBoundary(field, value); };
    const persistMutualPanelDraft = () => { const a = getMutualPanelApi(); if (a) a.persistMutualPanelDraft(); };
    const restoreMutualPanelDraft = () => { const a = getMutualPanelApi(); return a ? a.restoreMutualPanelDraft() : null; };
    const applyMutualPanelDraft = (saved) => { const a = getMutualPanelApi(); if (a) a.applyMutualPanelDraft(saved); };
    const clearMutualPanel = async () => { const a = getMutualPanelApi(); if (a) await a.clearMutualPanel(); };
    const ensureMutualActivityRange = () => { const a = getMutualPanelApi(); if (a) a.ensureMutualActivityRange(); };
    const setMutualActivityThisWeek = () => { const a = getMutualPanelApi(); if (a) a.setMutualActivityThisWeek(); };
    const setMutualActivityPeriodMode = (mode) => { const a = getMutualPanelApi(); if (a) a.setMutualActivityPeriodMode(mode); };
    const toggleMutualActivityPeriod = (period) => { const a = getMutualPanelApi(); if (a) a.toggleMutualActivityPeriod(period); };
    const isMutualActivityPeriodSelected = (period) => { const a = getMutualPanelApi(); return a ? a.isMutualActivityPeriodSelected(period) : false; };
    const activityBalanceCtx = (extra) => { const a = getMutualPanelApi(); return a ? a.activityBalanceCtx(extra) : {}; };
    const patchLocalMutualQuota = (email, nextQuota) => { const a = getMutualPanelApi(); if (a) a.patchLocalMutualQuota(email, nextQuota); };
    const recalculateMutualQuotasFromActivity = async () => {
      await useTourStore().ensureDAC();
      const a = getMutualPanelApi();
      if (a) await a.recalculateMutualQuotasFromActivity();
    };
    const toggleMutualLead = (email) => { const a = getMutualPanelApi(); if (a) a.toggleMutualLead(email); };
    const isMutualLead = (email) => { const a = getMutualPanelApi(); return a ? a.isMutualLead(email) : false; };
    const setMutualCover = async (on) => {
      if (on) await useTourStore().ensureDAC();
      const a = getMutualPanelApi();
      if (a) a.setMutualCover(on);
    };
    const getMutualDraftAt = (leaveEmail, dateStr, period) => {
      const a = getMutualPanelApi();
      return a ? a.getMutualDraftAt(leaveEmail, dateStr, period) : null;
    };
    const removeMutualDraft = (key) => { const a = getMutualPanelApi(); if (a) a.removeMutualDraft(key); };
    const clearMutualDrafts = () => { const a = getMutualPanelApi(); if (a) a.clearMutualDrafts(); };
    const assignMutualDraftFromMatch = (subEmail) => { const a = getMutualPanelApi(); if (a) a.assignMutualDraftFromMatch(subEmail); };
    const toggleMutualAwayClass = (cls) => { const a = getMutualPanelApi(); if (a) a.toggleMutualAwayClass(cls); };
    const selectAwayGrade = (grade) => { const a = getMutualPanelApi(); if (a) a.selectAwayGrade(grade); };
    function initImmediateMutual1() {
    watch(askFirstLineText, (text) => {
      if (!showLineMessageModal.value) askFirstLineDraft.value = text || '';
    }, { immediate: true });
    }
    function initImmediateMutual2() {
    watch(showDetailModal, (open) => {
      if (!open) return;
      showLineMessageModal.value = false;
      showPrintPreviewModal.value = false;
      showCompareModal.value = false;
      showSuccessModal.value = false;
    });
    }
    function initImmediateMutual3() {
    watch(showLineMessageModal, (open) => {
      if (!open) return;
      showDetailModal.value = false;
      showPrintPreviewModal.value = false;
      showCompareModal.value = false;
      showSuccessModal.value = false;
    });
    }
    function initImmediateMutual4() {
    watch(showPrintPreviewModal, (open) => {
      if (!open) return;
      showDetailModal.value = false;
      showLineMessageModal.value = false;
      showCompareModal.value = false;
      showTriangleTimetablePreview.value = false;
      showSuccessModal.value = false;
    });
    }
    function initImmediateMutual5() {
    watch(showTriangleTimetablePreview, (open) => {
      if (!open) return;
      showDetailModal.value = false;
      showLineMessageModal.value = false;
      showPrintPreviewModal.value = false;
      showSuccessModal.value = false;
    });
    }
    function initImmediateMutual6() {
    watch(showSuccessModal, (open) => {
      if (!open) return;
      showDetailModal.value = false;
      showLineMessageModal.value = false;
      showPrintPreviewModal.value = false;
      showCompareModal.value = false;
    });
    }
    function initImmediateMutual7() {
    watch(historyFilterDate, (d) => {
      if (historyFilterMode.value !== 'month') return;
      useDataStore().ensureHistoryMonthLoaded(String(d || '').slice(0, 7));
    });
    }
    function initImmediateMutual8() {
    watch([storeToRefs(useTourStore()).inputRequestDate, exchangePeriodId, exchangeWeekOffset], () => {
      if (!storeToRefs(useTourStore()).inputRequestDate.value || !exchangePeriodId.value) {
        exchangeTargetDate.value = '';
        return;
      }
      try {
        if (DateUtils && typeof DateUtils.getExchangeTargetDate === 'function') {
          exchangeTargetDate.value = DateUtils.getExchangeTargetDate(
            storeToRefs(useTourStore()).inputRequestDate.value, exchangePeriodId.value, exchangeWeekOffset.value
          );
          return;
        }
        const [targetDayStr] = exchangePeriodId.value.split('-');
        const targetDay = parseInt(targetDayStr);
        const [y, m, d] = storeToRefs(useTourStore()).inputRequestDate.value.split('-').map(Number);
        const reqDate = new Date(y, m - 1, d);
        const reqDay = reqDate.getDay();
        const currentDayOfWeek = reqDay === 0 ? 7 : reqDay;
        const diffDays = (targetDay - currentDayOfWeek) + (exchangeWeekOffset.value * 7);
        const targetDateObj = new Date(reqDate);
        targetDateObj.setDate(reqDate.getDate() + diffDays);
        const year = targetDateObj.getFullYear();
        const month = String(targetDateObj.getMonth() + 1).padStart(2, '0');
        const dateVal = String(targetDateObj.getDate()).padStart(2, '0');
        exchangeTargetDate.value = `${year}-${month}-${dateVal}`;
      } catch (err) {
        console.error("推算對調日期失敗：", err);
        exchangeTargetDate.value = '';
      }
    });
    }
    function initImmediateMutual9() {
    watch(function () {
      const pd = pendingRequestData.value || {};
      return [pd.mode, pd.subFee, pd.subTeacher, showCompareModal.value, storeToRefs(useTimetableStore()).isPeriod8FeeLocked.value];
    }, function () {
      if (!storeToRefs(useSessionStore()).isAdmin.value) return;
      if (!showCompareModal.value) return;
      const p = pendingRequestData.value;
      if (!p || p.mode !== 'substitution' || storeToRefs(useTimetableStore()).isPeriod8FeeLocked.value) return;
        // R-v2接線：v1 此為 setup 常數（= FeeUtils.QUOTA），移植漏接；改直引已 import 的 FeeUtils
        if (p.subFee === FeeUtils.QUOTA) {
        useMatchStore().fetchQuotaPackPreview();
      } else {
        storeToRefs(useMatchStore()).quotaPackPreview.value = [];
        storeToRefs(useMatchStore()).quotaPackError.value = '';
        if (p.subTeacher) useMatchStore().warmQuotaPackCache(p.subTeacher);
      }
    });
    }
    function initImmediateMutual10() {
    watch(matchSearchQuery, () => {
      matchDisplayCount.value = useMatchStore().MATCH_PAGE_SIZE;
    });
    }
    function initMutual1() {
      useInteractionStore().bindVueModalA11y(storeToRefs(useSessionStore()).showMatchModal, () => { useMatchStore().closeMatchModal(); }, '.match-drawer-overlay', '智慧媒合');
      useInteractionStore().bindVueModalA11y(showCompareModal, () => { useSubmitStore().closeCompareModal(); }, '[data-tour="compare-modal"]', '模擬對照');
      useInteractionStore().bindVueModalA11y(showLineMessageModal, () => { showLineMessageModal.value = false; }, '[data-tour="line-message-modal"]', 'LINE 訊息');
      useInteractionStore().bindVueModalA11y(showSuccessModal, () => { showSuccessModal.value = false; }, '[data-tour="success-modal"]', '送出成功');
    }
    function initMutual2() {
      useInteractionStore().bindFlagModal(showDetailModal, () => { showDetailModal.value = false; }, '異動詳情');
      useInteractionStore().bindFlagModal(showPrintPreviewModal, () => { useOutputStore().closePrintPreview(true); }, '調代課單列印預覽');
      useInteractionStore().bindFlagModal(storeToRefs(useSessionStore()).showSemesterModal, () => { storeToRefs(useSessionStore()).showSemesterModal.value = false; }, '學期設定');
    }
    function initImmediateMutual11() {
    watch(
      () => [
        storeToRefs(useTimetableStore()).isPeriod8FeeLocked.value,
        pendingRequestData.value && pendingRequestData.value.mode,
        pendingRequestData.value && pendingRequestData.value.timeKey,
        pendingRequestData.value && pendingRequestData.value.isBatch
      ],
      () => {
        if (!storeToRefs(useTimetableStore()).isPeriod8FeeLocked.value) return;
        const pending = pendingRequestData.value;
        if (!pending || pending.mode !== 'substitution') return;
        pending.subFee = useTourStore().PERIOD8_FEE;
        storeToRefs(useTourStore()).batchSubFee.value = useTourStore().PERIOD8_FEE;
      }
    );
    }
const {
      mutualImportableEvents, mutualImportEventId,
      applyClassAwayEventById, applyClassAwayToMutualPanel, mutualCoverStats
    } = UiMutualBridge.create({
      ref,
      computed,
      showToast,
      classAwayEvents: storeToRefs(useSessionStore()).classAwayEvents,
      classList,
      semesterEndDate: storeToRefs(useSessionStore()).semesterEndDate,
       mutualActivityStart: storeToRefs(useTourStore()).mutualActivityStart,
       mutualActivityEnd: storeToRefs(useTourStore()).mutualActivityEnd,
       mutualActivityStartPeriod: storeToRefs(useTourStore()).mutualActivityStartPeriod,
       mutualActivityEndPeriod: storeToRefs(useTourStore()).mutualActivityEndPeriod,
       mutualActivityPeriodMode: storeToRefs(useTourStore()).mutualActivityPeriodMode,
       mutualActivityPeriods: storeToRefs(useTourStore()).mutualActivityPeriods,
      mutualAwayClasses: storeToRefs(useTourStore()).mutualAwayClasses,
      mutualNote: storeToRefs(useTourStore()).mutualNote,
      mutualLeadEmails: storeToRefs(useTourStore()).mutualLeadEmails,
      mutualDrafts: storeToRefs(useTourStore()).mutualDrafts,
      isMutualCover: storeToRefs(useTourStore()).isMutualCover,
      batchSlots: storeToRefs(useTourStore()).batchSlots,
      allSchedules: storeToRefs(useSessionStore()).allSchedules,
      requestsList: storeToRefs(useSessionStore()).requestsList,
      teachersList: storeToRefs(useSessionStore()).teachersList,
      currentWeekDates: storeToRefs(useTimetableStore()).currentWeekDates,
      getScheduleForDate: useTimetableStore().getScheduleForDate,
      isSingleWeek: useSessionStore().isSingleWeek,
      persistMutualPanelDraft,
      clearScheduleCache: useTimetableStore().clearScheduleCache,
      ensureMutualActivityRange,
      DAC: useTourStore().DAC
    });

    _getMutualImportEventId = () => (mutualImportEventId && mutualImportEventId.value) || '';
  return { onMutualLeadChipClick, bustQuotaLedgerViewCache, selectedClass, classReadonlyMode, pendingClassView, classDirectory, classViewSchedules, classViewSchoolSwaps, classViewSubstitutionRecords, classViewClassAwayEvents, classViewLoadedClass, selectedClassDate, period8WeekDate, selectedClassWeekDates, period8WeekDates, classWeekNumber, period8WeekNumber, classSubstitutionMap, classChangeSummary, classChangeTypeLabels, getClassChangeTypeLabel, matchSearchQuery, matchDisplayCount, matchShowNoTeacherWarning, matchEmptyReasons, exchangeTeacherEmail, exchangeTeacherClasses, exchangePeriodId, exchangeTargetDate, exchangeWeekOffset, exchangeWeekdayFilter, exchangeWeekdayOptions, setExchangeWeekdayFilter, showCompareModal, showTriangleTimetablePreview, showSuccessModal, showLineMessageModal, lineMessageTitle, lineMessageText, successModalTitle, successModalMessage, successFlowMode, successActionRequests, lineCopyText, hasLineTemplate, lineBatchParts, copyLineMessage, sendLineMessage, openLineMessageEditor, copyEditedLineMessage, sendEditedLineMessage, copyLineBatchPart, isExchangeLikeRequest, getTargetSubject, getTargetClassAndSubject, getOriginalRequestSubject, getOriginalRequestClass, getOriginalTargetSubject, getOriginalTargetClass, pendingRequestData, combinedReturnCandidates, askFirstLineText, askFirstLineDraft, selectedRecordIds, showDevDropdown, paperPrintDraft, paperSignatureByTeacher, showPrintPreviewModal, printPreview, printPreviewImageBusy, isSubmitting, showDetailModal, consecAlertsA, consecAlertsB, detailRequest, detailSubRecord, historyFilterMode, historyTypeFilter, historyFilterDate, historySearchQuery, historyPage, isHistoryExchangeType, historyPageSize, classList, getMutualPanelApi, mutualImportableEvents, mutualImportEventId, applyClassAwayEventById, applyClassAwayToMutualPanel, mutualCoverStats, setMutualActivityPeriodBoundary, persistMutualPanelDraft, restoreMutualPanelDraft, applyMutualPanelDraft, clearMutualPanel, ensureMutualActivityRange, setMutualActivityThisWeek, setMutualActivityPeriodMode, toggleMutualActivityPeriod, isMutualActivityPeriodSelected, activityBalanceCtx, patchLocalMutualQuota, recalculateMutualQuotasFromActivity, toggleMutualLead, isMutualLead, setMutualCover, getMutualDraftAt, removeMutualDraft, clearMutualDrafts, assignMutualDraftFromMatch, toggleMutualAwayClass, selectAwayGrade, initImmediateMutual1, initImmediateMutual2, initImmediateMutual3, initImmediateMutual4, initImmediateMutual5, initImmediateMutual6, initImmediateMutual7, initImmediateMutual8, initImmediateMutual9, initImmediateMutual10, initMutual1, initMutual2, initImmediateMutual11 };
});

