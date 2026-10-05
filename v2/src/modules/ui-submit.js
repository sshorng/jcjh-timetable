import { computed } from 'vue';
/**
 * 自 v1 ui-submit.js 機械移植（port-modules.cjs）：
 * IIFE 掛載改 ESM export；body 與 v1 逐字一致。
 */
import DateUtils from '../domain/date-utils.js';
import DomainMatch from '../domain/domain-match.js';
import DomainSchedule from '../domain/domain-schedule.js';
import { UiSubmitHelpers } from '../modules/ui-request.js';

/**
 * ui-submit.js — 送審流程（比對／驗證／送出）（從 app.js 抽出，2A）
 *
 * Eager 載入（模板綁定，需先於 app.js）。create(deps) 注入 refs／回呼。
 */
import { showToast, showConfirm } from '../ui/toast.js';
const UiSubmit = (() => {
  'use strict';
  function create(deps) {
    deps = deps || {};
    var batchCompareWeekDates = deps.batchCompareWeekDates;
    var resolvePendingPeriods = deps.resolvePendingPeriods;
    var lineBatchParts = deps.lineBatchParts;
    var sendLineMessage = deps.sendLineMessage;
    var formatPeriodText = deps.formatPeriodText;
    var getLineHandledSlot = deps.getLineHandledSlot;
    var shortTeacherName = deps.shortTeacherName;
    var buildAskFirstLineText = deps.buildAskFirstLineText;
    var patchLocalMutualQuota = deps.patchLocalMutualQuota;
    var bustQuotaLedgerViewCache = deps.bustQuotaLedgerViewCache;
    var callGasApi = deps.callGasApi;
    var computed = deps.computed;
    var canStaffProxySubmit = deps.canStaffProxySubmit;
    var user = deps.user;
    var proxyTargetEmail = deps.proxyTargetEmail;
    var batchCompareViewEmail = deps.batchCompareViewEmail;
    var canOperateOnTeacherEmail = deps.canOperateOnTeacherEmail;
    var ensureProxyTargetForTeacher = deps.ensureProxyTargetForTeacher;
    var isStaff = deps.isStaff;
    var isProxySubmitGranted = deps.isProxySubmitGranted;
    var QUOTA_DEDUCT_FEE = deps.QUOTA_DEDUCT_FEE;
    var quotaDeductPreview = deps.quotaDeductPreview;
    var batchSubFee = deps.batchSubFee;
    var groupBatchSlotsBySub = function (slots) {
      var map = {};
      (slots || []).forEach(function (s) {
        var email = String(s.subTeacherEmail || s.subEmail || '').toLowerCase();
        if (!email) return;
        if (!map[email]) {
          map[email] = {
            subEmail: s.subTeacherEmail || s.subEmail,
            subName: s.subTeacherName || getTeacherNameByEmail(s.subTeacherEmail || s.subEmail),
            slots: []
          };
        }
        map[email].slots.push(s);
      });
      return Object.values(map);
    };
    var loading = deps.loading;
    var loadingMessage = deps.loadingMessage;
    var activeCell = deps.activeCell;
    var inputRequestDate = deps.inputRequestDate;
    var allSchedules = deps.allSchedules;
    var getScheduleForDate = deps.getScheduleForDate;
    var formatDateMMDD = deps.formatDateMMDD;
    var getWeekDayText = deps.getWeekDayText;
    var exchangePeriodId = deps.exchangePeriodId;
    var exchangeWeekOffset = deps.exchangeWeekOffset;
    var exchangeTargetDate = deps.exchangeTargetDate;
    var isSingleWeek = deps.isSingleWeek;
    var consecAlertsA = deps.consecAlertsA;
    var consecAlertsB = deps.consecAlertsB;
    var isMutualCover = deps.isMutualCover;
    var assignMutualDraftFromMatch = deps.assignMutualDraftFromMatch;
    var PERIOD8_FEE = deps.PERIOD8_FEE;
    var pendingRequestData = deps.pendingRequestData;
    var showMatchModal = deps.showMatchModal;
    var showCompareModal = deps.showCompareModal;
    var getLeaveTimeDefaults = deps.getLeaveTimeDefaults;
    var batchActiveSlotKey = deps.batchActiveSlotKey;
    var batchSlots = deps.batchSlots;
    var batchAssignMode = deps.batchAssignMode;
    var isBatchExchangeFlow = deps.isBatchExchangeFlow;
    var getTeacherNameByEmail = deps.getTeacherNameByEmail;
    var batchSelectMode = deps.batchSelectMode;
    var DAC = deps.DAC;
    var isMutualActivitySlotInRange = deps.isMutualActivitySlotInRange;
    var mutualAwayClasses = deps.mutualAwayClasses;
    var substitutionRecords = deps.substitutionRecords;
    var allPendingRequests = deps.allPendingRequests;
    var currentWeekDates = deps.currentWeekDates;
    var isClassAwayOnDate = deps.isClassAwayOnDate;
    var mutualDrafts = deps.mutualDrafts;
    var isAdmin = deps.isAdmin;
    var isQuotaDeductFee = deps.isQuotaDeductFee;
    var isTimetableOnlyFee = deps.isTimetableOnlyFee;
    var buildLineInviteText = deps.buildLineInviteText;
    var successModalTitle = deps.successModalTitle;
    var successModalMessage = deps.successModalMessage;
    var lineCopyText = deps.lineCopyText;
    var hasLineTemplate = deps.hasLineTemplate;
    var showSuccessModal = deps.showSuccessModal;
    var successActionRequests = deps.successActionRequests;
    var successFlowMode = deps.successFlowMode;
    var notificationsSuppressed = deps.notificationsSuppressed;
    var openPaperPrintDraft = deps.openPaperPrintDraft;
    var openPaperPrintDraftFromCompare = deps.openPaperPrintDraftFromCompare;
    var openPaperPrintDraftForSubmittedRequests = deps.openPaperPrintDraftForSubmittedRequests;
    var canStaffProxySubmit = deps.canStaffProxySubmit;
    var shouldProxySubmitForLeave = deps.shouldProxySubmitForLeave;
    var getProxyActor = deps.getProxyActor;
    var user = deps.user;
    var currentSemester = deps.currentSemester;
    var TIMETABLE_ONLY_FEE = deps.TIMETABLE_ONLY_FEE;
    var ACTIVITY_PUBLIC_FEE = deps.ACTIVITY_PUBLIC_FEE;
    var defaultSubFeeForReason = deps.defaultSubFeeForReason;
    var directApproveMode = deps.directApproveMode;
    var directApproveSkipNotify = deps.directApproveSkipNotify;
    var mutualSkipNotify = deps.mutualSkipNotify;
    var isSubmitting = deps.isSubmitting;
    var optimisticUpsertRequest = deps.optimisticUpsertRequest;
    var sheetRequestToFront = deps.sheetRequestToFront;
    var softRefreshInBackground = deps.softRefreshInBackground;
    var paperMode = deps.paperMode;
    var paperFlow = deps.paperFlow;
    var toLocalDateStr = deps.toLocalDateStr;
    var lookupTeacher = deps.lookupTeacher;
    var getTeacherSubjectByEmail = deps.getTeacherSubjectByEmail;

    const runComparePreparation = async (mode, targetEmail, periodIdVal = '', subjectVal = '', classVal = '', isBatchCandidatePreview = false) => {
      if (!UiSubmitHelpers || !UiSubmitHelpers.prepCompare) {
        showToast('申請模組未載入', 'error');
        return;
      }
      return UiSubmitHelpers.prepCompare({
        activeCell, inputRequestDate, allSchedules, showConfirm, getScheduleForDate,
         formatDateMMDD, getWeekDayText, exchangePeriodId, exchangeWeekOffset, exchangeTargetDate, isSingleWeek,
        consecAlertsA, consecAlertsB, isMutualCover, assignMutualDraftFromMatch, PERIOD8_FEE,
         pendingRequestData, showMatchModal, showCompareModal, getLeaveTimeDefaults, isBatchCandidatePreview
      }, mode, targetEmail, periodIdVal, subjectVal, classVal);
    };

    const prepCompare = async (mode, targetEmail, periodIdVal = '', subjectVal = '', classVal = '') => {
      if (!(isBatchExchangeFlow.value && mode === 'exchange')) {
        return runComparePreparation(mode, targetEmail, periodIdVal, subjectVal, classVal);
      }
      const slotKey = String(batchActiveSlotKey.value || '');
      const activeSlot = (batchSlots.value || []).find(slot => String(slot.key) === slotKey);
      if (!activeSlot) {
        showToast('請先選擇要配對的調課組別', 'warning');
        return 'cancelled';
      }
      if (activeSlot.exchangeSubmissionUnknown) {
        showToast('此組送出結果不明，請重新整理確認歷程後再處理', 'warning');
        return 'cancelled';
      }
      if (batchAssignMode.value === 'same') {
        const assignedTeacher = (batchSlots.value || []).find(slot =>
          slot.key !== activeSlot.key && slot.subTeacherEmail && !slot.exchangeSubmitted
        );
        if (assignedTeacher
            && String(assignedTeacher.subTeacherEmail).toLowerCase() !== String(targetEmail || '').toLowerCase()) {
          showToast('目前是「同一人全調」，請維持同一位對調教師；要更換請重新選媒合模式', 'warning');
          return 'cancelled';
        }
      }

      const result = await runComparePreparation('exchange', targetEmail, periodIdVal, subjectVal, classVal);
      if (result !== 'opened') return result;

      const draft = pendingRequestData.value || {};
      const targetTime = DateUtils && DateUtils.decodeTimeKey
        ? DateUtils.decodeTimeKey(draft.timeB)
        : {
          day: parseInt(String(draft.timeB || '').split('-')[0], 10),
          period: parseInt(String(draft.timeB || '').split('-')[1], 10)
        };
      const retryWithNewId = !!activeSlot.exchangeSubmitError;
      batchSlots.value = (batchSlots.value || []).map(slot => slot.key === activeSlot.key
        ? Object.assign({}, slot, {
          subTeacherEmail: draft.subTeacher || targetEmail,
          subTeacherName: getTeacherNameByEmail(draft.subTeacher || targetEmail),
          targetDate: draft.dateB || '',
          targetDayOfWeek: parseInt(targetTime.day, 10),
          targetPeriod: parseInt(targetTime.period, 10),
          targetClassName: draft.subBClass || classVal || '',
          targetSubject: draft.subB || subjectVal || '',
          exchangeWeekOffset: parseInt(exchangeWeekOffset.value, 10) || 0,
          exchangeRequestId: retryWithNewId
            ? 'req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 7)
            : slot.exchangeRequestId,
          exchangeSerial: retryWithNewId
            ? 'SWP' + Date.now() + '-' + Math.random().toString(36).substr(2, 4)
            : slot.exchangeSerial,
          exchangeValidationError: '',
          exchangeSubmitError: '',
          exchangeSubmissionUnknown: false,
          exchangeSubmitted: false
        })
        : slot);
      pendingRequestData.value = null;
      showCompareModal.value = false;
      showMatchModal.value = true;
      const next = batchSlots.value.find(slot => !slot.exchangeSubmitted
        && (!slot.subTeacherEmail || !slot.targetDate || slot.targetPeriod == null));
      if (next) {
        selectBatchSlotForMatch(next.key);
      } else {
        batchActiveSlotKey.value = '';
        showToast('全部組別已配對，可按「預覽批次」檢視交換結果', 'success');
      }
      return 'drafted';
    };

    const previewBatchCandidate = async (mode, targetEmail, periodIdVal = '', subjectVal = '', classVal = '') => {
      if (!isBatchMatchFlow.value || !targetEmail) return 'cancelled';
      return runComparePreparation(mode, targetEmail, periodIdVal, subjectVal, classVal, true);
    };

    const closeCompareModal = () => {
      const isBatchPreview = !!(pendingRequestData.value && pendingRequestData.value.isBatchCandidatePreview);
      showCompareModal.value = false;
      if (!isBatchPreview) return;
      pendingRequestData.value = null;
      showMatchModal.value = !!(batchSelectMode.value && batchSlots.value.length >= 2);
    };

    const isBatchSlotAt = (dateStr, day, period) => {
      const pending = pendingRequestData.value;
      if (!pending || !pending.isBatch || !batchSlots.value.length) return false;
      return batchSlots.value.some(s =>
        s.dateStr === dateStr &&
        parseInt(s.dayOfWeek) === parseInt(day) &&
        parseInt(s.period) === parseInt(period)
      );
    };

        const batchCompareSubGroups = computed(() => {
      const pending = pendingRequestData.value;
      if (!pending || !pending.isBatch) return [];
      return groupBatchSlotsBySub(batchSlots.value);
    });

    const resolveCompareBEmail = () => {
      const pending = pendingRequestData.value;
      if (!pending) return '';
      if (pending.isExchangeBatch) return pending.subTeacher || '';
      if (pending.isBatch && (pending.isPerSlot || batchAssignMode.value === 'perSlot')) {
        return batchCompareViewEmail.value
          || (batchCompareSubGroups.value[0] && batchCompareSubGroups.value[0].subEmail)
          || '';
      }
      return pending.subTeacher || '';
    };

    const getBatchSlotForCompareB = (dateStr, day, period) => {
      const pending = pendingRequestData.value;
      if (!pending || !pending.isBatch || !dateStr) return null;
      const bEmail = resolveCompareBEmail();
      if (!bEmail) return null;
      const d = parseInt(day, 10);
      const p = parseInt(period, 10);
      const em = String(bEmail).toLowerCase();
      return batchSlots.value.find(s =>
        String(s.dateStr || '') === String(dateStr || '') &&
        parseInt(s.dayOfWeek, 10) === d &&
        parseInt(s.period, 10) === p &&
        String(s.subTeacherEmail || '').toLowerCase() === em
      ) || null;
    };

    const isSlotConflict = (cell, dateStr, period) => {
      if (DomainSchedule && DomainSchedule.isPatrolCell && DomainSchedule.isPatrolCell(cell)) {
        return false;
      }
      if (DAC() && isMutualCover.value) {
        const awayAtSlot = isMutualActivitySlotInRange(dateStr, period) ? mutualAwayClasses.value : [];
        return DAC().isConflictCell(cell, true, awayAtSlot);
      }
      return !!(cell && !cell.isSubstituted);
    };

    const exchangeIncomingConflict = computed(() => {
      const pending = pendingRequestData.value || {};
      if (pending.mode !== 'exchange') return null;
      const sourceTime = (DateUtils && DateUtils.decodeTimeKey)
        ? DateUtils.decodeTimeKey(pending.timeKey)
        : { period: parseInt(String(pending.timeKey || '').split('-').pop(), 10) };
      const targetTime = (DateUtils && DateUtils.decodeTimeKey)
        ? DateUtils.decodeTimeKey(pending.timeB)
        : {
            period: parseInt(String(pending.timeB || '').split('-').pop(), 10)
          };
      const dateKey = (value) => String(value || '').slice(0, 10).replace(/\//g, '-');
      const teacherKey = (value) => String(getTeacherNameByEmail(value) || value || '').trim().toLowerCase();
      const slotKey = (teacher, date, period) => [
        teacherKey(teacher), dateKey(date), parseInt(period, 10)
      ].join('|');
      const incoming = [
        { teacher: pending.leaveTeacher, date: pending.dateB, period: targetTime.period },
        { teacher: pending.subTeacher, date: pending.date, period: sourceTime.period }
      ];
      const existing = [];
      const currentRequestId = String(pending.submitRequestId || pending.requestId || '').trim();
      const addExisting = (requestId, teacher, date, period) => {
        const id = String(requestId || '').trim();
        if (currentRequestId && id && currentRequestId === id) return;
        const key = slotKey(teacher, date, period);
        if (key.split('|')[0] && dateKey(date) && Number.isFinite(parseInt(period, 10))) {
          existing.push({ key: key, teacher: String(teacher || '').trim(), date: dateKey(date), period: parseInt(period, 10) });
        }
      };

      (substitutionRecords.value || []).forEach((record) => {
        if (!record || (record.type !== 'exchange' && record.type !== '對調')) return;
        addExisting(record.requestId, record.actualTeacherEmail || record.actualTeacherName, record.date, record.period);
      });
      (allPendingRequests.value || []).forEach((request) => {
        if (!request || (request.type !== 'exchange' && request.type !== '對調')) return;
        const status = String(request.status || '').toLowerCase();
        if (status && status !== 'pending_teacher' && status !== 'pending_admin') return;
        const sourcePeriod = request.requestPeriod != null ? request.requestPeriod : request['異動節次'];
        const targetPeriod = request.targetPeriod != null ? request.targetPeriod : request['對調目標節次'];
        addExisting(request.id || request['申請單ID'], request.targetTeacherEmail || request['受邀人Email'],
          request.requestDate || request['異動日期'], sourcePeriod);
        addExisting(request.id || request['申請單ID'], request.requesterEmail || request['申請人Email'],
          request.targetDate || request['對調目標日期'], targetPeriod);
      });

      for (let i = 0; i < incoming.length; i++) {
        const slot = incoming[i];
        const key = slotKey(slot.teacher, slot.date, slot.period);
        const conflict = existing.find((item) => item.key === key);
        if (conflict) return conflict;
      }
      return null;
    });

    const confirmIfTargetPatrol = async (targetEmail, dateStr, period, dayOfWeek) => {
      if (!targetEmail || !dateStr || period == null) return true;
      const cell = getScheduleForDate(targetEmail, dateStr, period, dayOfWeek);
      if (!(DomainSchedule && DomainSchedule.isPatrolCell && DomainSchedule.isPatrolCell(cell))) {
        return true;
      }
      const name = getTeacherNameByEmail(targetEmail) || '該教師';
      const tip = (DomainSchedule && DomainSchedule.PATROL_INCOMING_TIP)
        || '對方本節為【巡堂】。排入後請私下協調代巡堂或互換。';
      return !!(await showConfirm(
        name + ' 老師 ' + String(dateStr).slice(5) + ' 第' + period + '節：\n\n' + tip + '\n\n仍要繼續？',
        '巡堂提醒'
      ));
    };

    const getCompareCellText = (who, day, period, view) => {
      if (!UiSubmitHelpers || !UiSubmitHelpers.getCompareCellText) return '';
      return UiSubmitHelpers.getCompareCellText({
         pendingRequestData, currentWeekDates, compareWeekDatesA, compareWeekDatesB,
         getScheduleForDate, isClassAwayOnDate,
        resolveCompareBEmail, isBatchSlotAt, getBatchSlotForCompareB,
        mutualDrafts, isMutualCover
      }, who, day, period, view);
    };

    const getCompareCellClass = (who, day, period, view) => {
      if (!UiSubmitHelpers || !UiSubmitHelpers.getCompareCellClass) return '';
      return UiSubmitHelpers.getCompareCellClass({
         pendingRequestData, currentWeekDates, compareWeekDatesA, compareWeekDatesB,
         getScheduleForDate, isClassAwayOnDate,
        resolveCompareBEmail, isBatchSlotAt, getBatchSlotForCompareB, isSlotConflict,
        mutualDrafts, isMutualCover
      }, who, day, period, view);
    };

    const hasSubTeacherConflict = computed(() => {
      const pending = pendingRequestData.value;
      if (!pending || pending.mode !== 'substitution') return false;
      if (pending.isBatch && batchSlots.value.length) {
        if (pending.isPerSlot || batchAssignMode.value === 'perSlot') {
          return batchSlots.value.some(s => {
            if (!s.subTeacherEmail) return false;
            const cell = getScheduleForDate(s.subTeacherEmail, s.dateStr, s.period, s.dayOfWeek);
            return isSlotConflict(cell, s.dateStr, s.period);
          });
        }
        const subEmail = pending.subTeacher;
        if (!subEmail) return false;
        return batchSlots.value.some(s => {
          const cell = getScheduleForDate(subEmail, s.dateStr, s.period, s.dayOfWeek);
          return isSlotConflict(cell, s.dateStr, s.period);
        });
      }
      const subEmail = pending.subTeacher;
      if (!subEmail) return false;
      const timeKey = pending.timeKey;
      const dateStr = pending.date;
      if (!timeKey || !dateStr) return false;
      const tk = (DateUtils && DateUtils.decodeTimeKey)
        ? DateUtils.decodeTimeKey(timeKey)
        : { day: parseInt(timeKey.slice(0, -1), 10), period: parseInt(timeKey.slice(-1), 10) };
      const day = parseInt(tk.day, 10);
      const period = parseInt(tk.period, 10);
      const cell = getScheduleForDate(subEmail, dateStr, period, day);
      return isSlotConflict(cell, dateStr, period);
    });

    const isProxySubmitActive = computed(() => {
      if (!canStaffProxySubmit.value || !user.value) return false;
      const me = String(getTeacherNameByEmail(user.value.email) || '').toLowerCase();
      const tgt = String(proxyTargetEmail.value || '').toLowerCase();
      return !!(tgt && tgt !== me);
    });

    const assertCanSubmitAsLeaveTeacher = (leaveEmail) => {
      const leaveKey = String(leaveEmail || (activeCell.value && activeCell.value.teacherEmail) || '').trim();
      if (isAdmin.value) {
        if (!leaveKey) {
          showToast('所選班級課堂缺少任課教師資料，請確認課表設定。', 'warning');
          return false;
        }
        if (pendingRequestData.value && !pendingRequestData.value.leaveTeacher) {
          pendingRequestData.value.leaveTeacher = leaveKey;
        }
        return true;
      }
      if (canOperateOnTeacherEmail(leaveKey)) {
        ensureProxyTargetForTeacher(leaveKey);
        return true;
      }
      if (isStaff.value && !isProxySubmitGranted.value) {
        showToast('您是行政，但尚未被教學組勾選授權代申請。', 'warning');
        return false;
      }
      showToast('無法代此教師申請。僅「已授權的行政」可代送。', 'warning');
      return false;
    };

    const assertQuotaDeductAllowed = () => {
      const pending = pendingRequestData.value;
      if (!pending || pending.mode !== 'substitution') return true;
      if (pending.subFee !== QUOTA_DEDUCT_FEE) return true;
      if (isPeriod8FeeLocked.value) return true;
      const lines = quotaDeductPreview.value;
      if (!lines || !lines.length) {
        if (isMutualCover.value) {
          pending.subFee = ACTIVITY_PUBLIC_FEE;
          batchSubFee.value = ACTIVITY_PUBLIC_FEE;
          showToast('找不到可用額度，已改為活動公費', 'info');
          return true;
        }
        showToast('找不到代課老師的折抵額度，請改用自費代課或其他經費', 'warning');
        return false;
      }
      const shorts = lines.filter(q => q.short);
      if (!shorts.length) return true;
      const tip = shorts.map(q => `${q.name}（現有 ${q.before}，需扣 ${q.deduct}）`).join('、');
      if (isMutualCover.value) {
        pending.subFee = ACTIVITY_PUBLIC_FEE;
        batchSubFee.value = ACTIVITY_PUBLIC_FEE;
        showToast(`額度不足（${tip}），已自動改為活動公費`, 'info');
        return true;
      }
      showToast(`額度不足，不可用「扣額度」：${tip}。請改自費排代，或另選有額度的老師。`, 'warning');
      return false;
    };

    const validateSubmitRequest = async () => {
      if (!UiSubmitHelpers) {
        showToast('送出模組未載入', 'error');
        return false;
      }
      const mutualPending = pendingRequestData.value || {};
      if (isMutualCover.value && mutualPending.mode === 'substitution') {
        const mutualSlots = mutualPending.isBatch && batchSlots.value.length
          ? batchSlots.value
          : [{ dateStr: mutualPending.date || mutualPending.requestDate || inputRequestDate.value,
              period: activeCell.value && activeCell.value.period }];
        if (mutualSlots.some(slot => !isMutualActivitySlotInRange(slot.dateStr, slot.period))) {
          showToast('申請節次不在目前活動日期／節次範圍內，請重新選課或調整活動範圍', 'warning');
          return false;
        }
      }
      return UiSubmitHelpers.validateSubmitRequest({
        pendingRequestData, showToast, showConfirm, isAdmin, getTeacherNameByEmail,
          hasSubTeacherConflict, exchangeIncomingConflict, assertQuotaDeductAllowed,
         activeCell, allSchedules, getScheduleForDate, isSingleWeek,
        isProxySubmitActive: function () { return isProxySubmitActive.value; },
        assertCanSubmitAsLeaveTeacher: assertCanSubmitAsLeaveTeacher
      });
    };

    const buildSubmitPayload = (requestId, serial) => {
      if (!UiSubmitHelpers) {
        throw new Error('UiSubmitHelpers 未載入');
      }
      return UiSubmitHelpers.buildSubmitPayload({
        pendingRequestData, currentSemester, getTeacherNameByEmail, isAdmin, directApproveMode,
        isMutualCover, PERIOD8_FEE, ACTIVITY_PUBLIC_FEE, TIMETABLE_ONLY_FEE, defaultSubFeeForReason, activeCell, DAC,
        paperFlow,
        isProxySubmitActive: function () { return isProxySubmitActive.value; },
        canStaffProxySubmit: function () { return canStaffProxySubmit.value; },
        shouldProxySubmitForLeave: shouldProxySubmitForLeave,
        getProxyActor: getProxyActor,
        userEmail: function () { return user.value ? user.value.email : ''; }
      }, requestId, serial);
    };

    const getWeekDatesForCompare = (dateStr) => {
      if (dateStr && DateUtils && typeof DateUtils.getWeekDatesFrom === 'function') {
        const dates = DateUtils.getWeekDatesFrom(dateStr);
        if (Array.isArray(dates) && dates.length === 5) return dates;
      }
      return currentWeekDates.value || [];
    };

    const validateBatchExchangeSlot = (slot) => {
      if (!slot || !slot.teacherEmail || !slot.subTeacherEmail || !slot.targetDate
          || slot.targetPeriod == null || slot.targetPeriod === '') {
        return { valid: false, reason: '尚未完成雙方課堂配對' };
      }
      if (!DomainMatch || typeof DomainMatch.listExchangeCandidates !== 'function') {
        return { valid: false, reason: '調課候選驗證模組尚未載入' };
      }
      const offset = parseInt(slot.exchangeWeekOffset, 10) || 0;
      const targetWeekDates = getWeekDatesForCompare(slot.dateStr).map(dateStr => {
        if (!dateStr || !offset) return dateStr;
        const date = new Date(String(dateStr).replace(/-/g, '/'));
        if (Number.isNaN(date.getTime())) return dateStr;
        date.setDate(date.getDate() + offset * 7);
        return toLocalDateStr(date);
      });
      const candidates = DomainMatch.listExchangeCandidates({
        allSchedules: allSchedules.value || [],
        className: slot.className || '',
        leaveEmail: slot.teacherEmail,
        leaveDate: slot.dateStr,
        leavePeriod: slot.period,
        leaveDay: slot.dayOfWeek,
        leaveCell: {
          className: slot.className || '',
          subject: slot.subject || '',
          attr: slot.attr || '',
          isPullOut: !!slot.isPullOut
        },
        weekDates: targetWeekDates,
        isSingleWeek,
        getScheduleForDate,
        getTeacherNameByEmail,
        awayClasses: []
      });
      const targetEmail = String(slot.subTeacherEmail || '').toLowerCase();
      const match = candidates.find(candidate => {
        if (String(candidate.teacherEmail || '').toLowerCase() !== targetEmail) return false;
        if (parseInt(candidate.dayOfWeek, 10) !== parseInt(slot.targetDayOfWeek, 10)) return false;
        if (parseInt(candidate.period, 10) !== parseInt(slot.targetPeriod, 10)) return false;
        return String(targetWeekDates[parseInt(candidate.dayOfWeek, 10) - 1] || '')
          === String(slot.targetDate || '').slice(0, 10);
      });
      return match
        ? { valid: true }
        : { valid: false, reason: '對調課堂已不符合目前課表或調課規則，請重新選擇' };
    };

    const executeSubmitRequest = async () => {
      if (paperMode.value && !isAdmin.value && isMutualCover.value && !paperFlow.value) {
        openPaperPrintDraftFromCompare();
        return;
      }
      if (isSubmitting.value || loading.value) {
        showToast('申請送出中，請稍候…', 'info');
        return;
      }
      if (!UiSubmitHelpers || !UiSubmitHelpers.executeSubmitRequest) {
        showToast('申請模組未載入', 'error');
        return;
      }
      return UiSubmitHelpers.executeSubmitRequest({
        validateSubmitRequest, buildSubmitPayload, loading, loadingMessage, isSubmitting, pendingRequestData,
        activeCell, inputRequestDate,
        isMutualCover, mutualSkipNotify, isAdmin, directApproveMode, directApproveSkipNotify,
        callGasApi, showCompareModal, showMatchModal, optimisticUpsertRequest, sheetRequestToFront,
        deductMutualQuotaForRows, softRefreshInBackground, isQuotaDeductFee, buildLineInviteText,
         successModalTitle, successModalMessage, lineCopyText, hasLineTemplate, showSuccessModal, successActionRequests, showToast,
        successFlowMode, paperMode, paperFlow, notificationsSuppressed,
        openPaperPrintDraft: function (requests) {
          return requests && requests.length
            ? openPaperPrintDraftForSubmittedRequests(requests)
            : openPaperPrintDraftFromCompare();
        },
        canStaffProxySubmit: function () { return canStaffProxySubmit.value; },
        shouldProxySubmitForLeave: shouldProxySubmitForLeave,
        getProxyActor: getProxyActor,
        getTeacherNameByEmail: getTeacherNameByEmail,
        userEmail: function () { return user.value ? user.value.email : ''; }
      });
    };

const toggleCourseAdjustmentOnly = (event) => {
  const p = pendingRequestData.value || {};
  if (p.mode !== 'substitution' && p.mode !== 'exchange') return;
  if (p.specialFlow === 'combined_return') return;
  const enabled = event && event.target ? !!event.target.checked : !!p.courseAdjustmentOnly;
  if (enabled) {
    const autoFee = typeof defaultSubFeeForReason === 'function'
      ? defaultSubFeeForReason('課務調整')
      : (p.subFee || (p.mode === 'exchange' ? '無' : '自費代課'));
    pendingRequestData.value = Object.assign({}, p, {
      courseAdjustmentOnly: true,
      leaveReasonBeforeCourseAdjustment: p.reason && p.reason !== '課務調整' ? p.reason : '',
      reason: '課務調整',
      subFee: p.mode === 'exchange' ? '無' : autoFee,
      leaveTimeType: '',
      leaveTimeStart: '',
      leaveTimeEnd: '',
      leaveTime: ''
    });
    return;
  }
  const d = p.mode === 'substitution'
    ? getLeaveTimeDefaults(p.leaveTeacher)
    : { type: '', start: '', end: '', range: '' };
  const restoredReason = p.leaveReasonBeforeCourseAdjustment || (isMutualCover.value ? '公假' : '');
  pendingRequestData.value = Object.assign({}, p, {
    courseAdjustmentOnly: false,
    reason: restoredReason,
    subFee: p.mode === 'exchange'
      ? '無'
      : (typeof defaultSubFeeForReason === 'function'
        ? defaultSubFeeForReason(restoredReason)
        : (p.subFee || '自費代課')),
    leaveReasonBeforeCourseAdjustment: '',
    leaveTimeType: d.type,
    leaveTimeStart: d.start,
    leaveTimeEnd: d.end,
    leaveTime: d.range
  });
};

const deductMutualQuotaForRows = async (rows) => {
  if (!rows || !rows.length) return;
  const shouldDeduct = (fee) => {
    if (DAC() && DAC().shouldDeductQuota) {
      return DAC().shouldDeductQuota(fee, !!isMutualCover.value);
    }
    return isQuotaDeductFee(fee);
  };
  const deductMap = {};
  let hasQuotaMutation = false;
  rows.forEach(r => {
    const fee = r['經費來源'] || r.subFee || '';
    if (!shouldDeduct(fee)) return;
    hasQuotaMutation = true;
    const teacherName = String(r['受邀人姓名'] || r.targetTeacherName || '').trim();
    const key = teacherName.toLowerCase();
    if (!key) return;
    deductMap[key] = (deductMap[key] || 0) + 1;
  });
  Object.keys(deductMap).forEach(key => {
    const t = lookupTeacher(key);
    const prev = t ? (parseFloat(t.mutualQuota) || 0) : 0;
    // 每節扣 1；畫面樂觀更新（不足 1 時後端不會扣）
    const next = Math.round(Math.max(0, prev - deductMap[key]) * 1000) / 1000;
    patchLocalMutualQuota(t ? t.teacherName || t.name : key, next);
  });
  if (hasQuotaMutation) bustQuotaLedgerViewCache();
  try { if (typeof window.__quotaPackCacheBust === 'function') window.__quotaPackCacheBust(); } catch (eCache) {}
};

const restoreMutualQuotaForRows = (reqs) => {
  const list = Array.isArray(reqs) ? reqs : (reqs ? [reqs] : []);
  if (!list.length) return;
  const terminal = { cancelled: 1, rejected: 1, admin_rejected: 1, withdrawn: 1 };
  const addMap = {};
  let hasQuotaMutation = false;
  list.forEach(r => {
    if (!r) return;
    const st = String(r.status || r['狀態'] || '').toLowerCase();
    if (terminal[st]) return;
    const fee = r.subFee || r['經費來源'] || '';
    if (!isQuotaDeductFee(fee)) return;
    hasQuotaMutation = true;
    const teacherName = String(r.targetTeacherName || r['受邀人姓名'] || r.actualTeacherName || '').trim();
    const key = teacherName.toLowerCase();
    if (!key) return;
    addMap[key] = (addMap[key] || 0) + 1;
  });
  Object.keys(addMap).forEach(key => {
    const t = lookupTeacher(key);
    if (!t) return;
    const prev = parseFloat(t.mutualQuota) || 0;
    const next = Math.round((prev + addMap[key]) * 1000) / 1000;
    patchLocalMutualQuota(t.teacherName || t.name, next);
  });
  if (hasQuotaMutation) bustQuotaLedgerViewCache();
};

const askFirstLineText = computed(() => {
  const p = pendingRequestData.value || {};
  if (!p.mode || p.isBatch) return '';
  const targetEmail = String(p.subTeacher || '').trim();
  if (!targetEmail) return '';
  // 非本人申請（行政代申請／教學組直接核准等）：受話對象是「請假老師」而非「我」
  const leaveEmail = String(p.leaveTeacher || '').trim().toLowerCase();
  const currentEmail = user.value && user.value.email
    ? String(user.value.email).trim().toLowerCase()
    : '';
  const isProxyApplication = !!(leaveEmail && currentEmail && leaveEmail !== currentEmail);
  const handledSlot = getLineHandledSlot(p);
  const opts = {
    targetName: shortTeacherName(getTeacherNameByEmail(targetEmail) || targetEmail),
     requesterName: isProxyApplication
       ? (getTeacherNameByEmail(p.leaveTeacher) || p.leaveTeacher || '')
       : '',
     courseTeacherA: getTeacherNameByEmail(p.leaveTeacher) || p.leaveTeacher || '',
     courseTeacherB: getTeacherNameByEmail(p.subTeacher) || p.subTeacher || '',
     isExchange: p.mode === 'exchange',
    dateA: handledSlot.date,
    dayA: handledSlot.day,
    periodA: handledSlot.period,
    classA: handledSlot.className,
    subjectA: handledSlot.subject
  };
  if (p.mode === 'exchange') {
    const tkB = (DateUtils && DateUtils.decodeTimeKey)
      ? DateUtils.decodeTimeKey(p.timeB)
      : { day: parseInt(String(p.timeB || '').charAt(0), 10), period: parseInt(String(p.timeB || '').slice(-1), 10) };
    opts.dateB = p.dateB;
    opts.dayB = tkB.day;
    opts.periodB = tkB.period;
    opts.classB = p.subBClass || '';
    opts.subjectB = p.subB || '';
  }
  return buildAskFirstLineText(opts);
});

const sendLineBatchPart = (idx) => {
  const part = lineBatchParts.value[idx];
  if (part && part.text) sendLineMessage(part.text);
};

const getExchangeEndpointText = (which) => {
  const pending = pendingRequestData.value || {};
  const date = which === 'target' ? pending.dateB : pending.date;
  const timeKey = which === 'target' ? pending.timeB : pending.timeKey;
  if (!date || !timeKey) return '';
  const decoded = DateUtils && typeof DateUtils.decodeTimeKey === 'function'
    ? DateUtils.decodeTimeKey(timeKey)
    : { day: parseInt(String(timeKey).split('-')[0], 10), period: parseInt(String(timeKey).split('-')[1], 10) };
  const dayText = getWeekDayText(decoded.day);
  return `${formatDateMMDD(date)}${dayText ? `(${dayText})` : ''} ${formatPeriodText(decoded.period)}`;
};

const setLeaveTimePreset = (type) => {
  const p = pendingRequestData.value || {};
  if (p.mode !== 'substitution') return;
  const d = getLeaveTimeDefaults(p.leaveTeacher);
  const start = type === '下午' ? '12:00' : d.start;
  const end = type === '上午' ? '12:00' : d.end;
  pendingRequestData.value = Object.assign({}, p, {
    leaveTimeType: type,
    leaveTimeStart: start,
    leaveTimeEnd: end,
    leaveTime: start + '~' + end
  });
};

const compareWeekDatesA = computed(() => {
  const pending = pendingRequestData.value || {};
  if (pending.isBatch && pending.mode === 'exchange') {
    return getWeekDatesForCompare(pending.date || inputRequestDate.value);
  }
  if (pending.isBatch) return batchCompareWeekDates.value;
  return getWeekDatesForCompare(pending.date || inputRequestDate.value);
});

const compareWeekDatesB = computed(() => {
  const pending = pendingRequestData.value || {};
  if (pending.isBatch && pending.mode === 'exchange') {
    return getWeekDatesForCompare(pending.dateB || pending.date || inputRequestDate.value);
  }
  if (pending.isBatch) return batchCompareWeekDates.value;
  const date = pending.mode === 'exchange' && pending.dateB
    ? pending.dateB
    : (pending.date || inputRequestDate.value);
  return getWeekDatesForCompare(date);
});

const isPeriod8FeeLocked = computed(() => {
  const pending = pendingRequestData.value;
  if (!pending || pending.mode !== 'substitution') return false;
  const periods = resolvePendingPeriods();
  if (!periods.length) return false;
  // 單節第8、或批次全是第8 → 鎖定；混批不鎖 UI（送出時仍逐節強制第8）
  return periods.every(n => n === 8);
});

    return {
      runComparePreparation: runComparePreparation,
      prepCompare: prepCompare,
      previewBatchCandidate: previewBatchCandidate,
      closeCompareModal: closeCompareModal,
      isBatchSlotAt: isBatchSlotAt,
      batchCompareViewEmail: batchCompareViewEmail,
      batchCompareSubGroups: batchCompareSubGroups,
      resolveCompareBEmail: resolveCompareBEmail,
      getBatchSlotForCompareB: getBatchSlotForCompareB,
      isSlotConflict: isSlotConflict,
      exchangeIncomingConflict: exchangeIncomingConflict,
      confirmIfTargetPatrol: confirmIfTargetPatrol,
      getCompareCellText: getCompareCellText,
      getCompareCellClass: getCompareCellClass,
      hasSubTeacherConflict: hasSubTeacherConflict,
      isProxySubmitActive: isProxySubmitActive,
      assertCanSubmitAsLeaveTeacher: assertCanSubmitAsLeaveTeacher,
      assertQuotaDeductAllowed: assertQuotaDeductAllowed,
      validateSubmitRequest: validateSubmitRequest,
      buildSubmitPayload: buildSubmitPayload,
      getWeekDatesForCompare: getWeekDatesForCompare,
      validateBatchExchangeSlot: validateBatchExchangeSlot,
      executeSubmitRequest: executeSubmitRequest,      toggleCourseAdjustmentOnly: toggleCourseAdjustmentOnly,
      deductMutualQuotaForRows: deductMutualQuotaForRows,
      restoreMutualQuotaForRows: restoreMutualQuotaForRows,
      askFirstLineText: askFirstLineText,
      sendLineBatchPart: sendLineBatchPart,
      getExchangeEndpointText: getExchangeEndpointText,
      setLeaveTimePreset: setLeaveTimePreset,
      compareWeekDatesA: compareWeekDatesA,
      compareWeekDatesB: compareWeekDatesB,
      isPeriod8FeeLocked: isPeriod8FeeLocked,

    };
  }
  return { create: create };
})();

export { UiSubmit };
