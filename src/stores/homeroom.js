/** v2 stores/homeroom.js — 由 v1 setup() §分節機械分解（gen-final.cjs）。 */
import { defineStore } from 'pinia';
import { computed } from 'vue';
import DateUtils from '../domain/date-utils.js';
import { ensureUiHomeroomModule, tabModulesReady } from '../modules/tab-gates.js';
import { UiListHelpers } from '../modules/ui-list-helpers.js';
import { useDataStore } from './data.js';
import { useGasStore } from './gas.js';
import { useMutualStore } from './mutual.js';
import { useSessionStore } from './session.js';
import { useSubmitStore } from './submit.js';
import { useTimetableStore } from './timetable.js';
import { useTourStore } from './tour.js';
import { storeToRefs } from 'pinia';
export const useHomeroomStore = defineStore('homeroom', () => {
  const { extractNameFromFormatted, makeBatchItemRow } = UiListHelpers;
// 2.1d：UiHomeroom 改閘門按需載入（admin 代導區／相關動作才抓）；未載入前回 null（既有守衛語義）。
let UiHomeroom = null;
let _homeroomModulesPromise = null;
const ensureHomeroomModule = () => {
  if (!_homeroomModulesPromise) {
    _homeroomModulesPromise = ensureUiHomeroomModule().then((m) => { UiHomeroom = m; })
      .catch((e) => { _homeroomModulesPromise = null; throw e; });
  }
  return _homeroomModulesPromise;
};
// 2.1d內聯：approvedConvertSig 為純函式（自 ui-homeroom.js 搬移，僅分隔符改寫法），免經 api。
    const approvedConvertSig = (requests) => {
      const sep1 = String.fromCharCode(31);
      const sep2 = String.fromCharCode(30);
      const out = [];
      const list = requests || [];
      for (let i = 0; i < list.length; i++) {
        const r = list[i];
        if (!r || r.status !== 'approved') continue;
        const per = (r.requestPeriod != null) ? r.requestPeriod : (r.period || '');
        const tper = (r.targetPeriod != null) ? r.targetPeriod : '';
        out.push([(r.id || ''), (r.type || ''), (r.batchId || ''), (r.requestDate || r.date || ''), per, (r.targetDate || ''), tper, (r.requesterEmail || ''), (r.targetTeacherEmail || ''), (r.triangleId || ''), (r.triangleLegIndex != null ? r.triangleLegIndex : ''), (r.specialFlow || ''), (r.className || ''), (r.subject || ''), (r.targetClassName || ''), (r.targetSubject || ''), (r.subFee || ''), (r.leaveTimeType || ''), (r.leaveTime || ''), (r.printed ? '1' : '0'), (r.updatedAt || r.createdAt || '')].join(sep1));
      }
      out.sort();
      return out.join(sep2);
    };
// 2.1d內聯：查職務（tooltip／抽屜 render 路徑）， deps 直引 data store。
    const getTeacherJobTitleByEmail = (email) => {
      if (!email) return '';
      const lookup = useDataStore().lookupTeacher;
      const t = (typeof lookup === 'function' ? lookup(email) : null);
      return t ? (t.jobTitle || t.job || '') : '';
    };
    const chineseClassNumber = (raw) => {
      const value = String(raw || '').trim();
      if (/^\d+$/.test(value)) return parseInt(value, 10);
      if (value === '十') return 10;
      const numMap = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
      if (value.startsWith('十')) return 10 + parseInt(numMap[value.slice(1)] || '', 10);
      return (numMap[value] || 0);
    };
    const getHomeroomClassCodes = (value) => {
      const raw = String(value || '').replace(/\s+/g, '');
      if (!raw) return [];
      const codes = new Set((raw.match(/[789]\d{2}/g) || []));
      const named = raw.match(/[789七八九]年(?:級)?[0-9一二三四五六七八九十]+班/g) || [];
      named.forEach((n) => {
        const m = n.match(/^([789七八九])年(?:級)?([0-9一二三四五六七八九十]+)班$/);
        if (!m) return;
        const grade = ({ 七: '7', 八: '8', 九: '9' }[m[1]] || m[1]);
        const cn = chineseClassNumber(m[2]);
        if (cn > 0) codes.add(grade + String(cn).padStart(2, '0'));
      });
      return Array.from(codes);
    };
    const isHomeroomTeacher = (teacher, className) => {
      const cell = storeToRefs(useTourStore()).activeCell;
      const target = className || (cell.value && cell.value.classData && cell.value.classData.className);
      if (!teacher || !target) return false;
      const direct = teacher.jobTitle || teacher.job || teacher['職務'] || '';
      const title = String(direct || getTeacherJobTitleByEmail(teacher.loginEmail || teacher.email || teacher.teacherName || teacher.name) || '').trim();
      if (!title.includes('導師')) return false;
      const targets = getHomeroomClassCodes(target);
      if (!targets.length) return false;
      const owns = getHomeroomClassCodes(title);
      return targets.some((c) => owns.includes(c));
    };
    const resolvePendingPeriods = () => {
      const p = storeToRefs(useMutualStore()).pendingRequestData.value || {};
      const slots = storeToRefs(useTourStore()).batchSlots;
      if (p.isBatch && slots.value && slots.value.length) {
        return slots.value.map((s) => parseInt(s.period, 10)).filter((n) => !isNaN(n));
      }
      if (p.isBatch && p.batchSlots && p.batchSlots.length) {
        return p.batchSlots.map((s) => parseInt(s.period, 10)).filter((n) => !isNaN(n));
      }
      if (p.timeKey) {
        const tk = (DateUtils && DateUtils.decodeTimeKey)
          ? DateUtils.decodeTimeKey(p.timeKey)
          : { period: parseInt(String(p.timeKey).slice(-1), 10) };
        const n = parseInt(tk.period, 10);
        if (!isNaN(n)) return [n];
      }
      const cellNow = storeToRefs(useTourStore()).activeCell;
      if (cellNow.value && cellNow.value.period != null) {
        return [parseInt(cellNow.value.period, 10)];
      }
      return [];
    };
    const flattenBatchDisplayGroups = (entries, scope) => {
      const open = useTimetableStore().isBatchGroupExpanded;
      const rows = [];
      (entries || []).forEach((entry) => {
        rows.push(entry);
        if (entry.displayKind !== 'batch' || !open(scope, entry.batchId)) return;
        entry.items.forEach((record, index) => {
          rows.push(makeBatchItemRow(record, entry.displayKey + ':item:' + (record && record.id ? record.id : index), entry.displayKey));
        });
      });
      return rows;
    };
    let _homeroomApi = null;
const getHomeroomApi = () => {
      // 讀 ready 使呼叫端 computed 在模組載入後自動重算（未載入照舊回 null）。
      const _homeroomReady = tabModulesReady.value.homeroom;
      if (_homeroomApi) return _homeroomApi;
      if (!UiHomeroom) {
        // 未載入一律靜默回 null（載入中／尚未排程皆屬正常；失敗由 ensure 拋錯＋toast）。
        return null;
      }
      _homeroomApi = UiHomeroom.create({
        computed, callGasApi: useGasStore().callGasApi, isAdmin: storeToRefs(useSessionStore()).isAdmin, user: storeToRefs(useSessionStore()).user, homeroomRecordsLoading: storeToRefs(useSessionStore()).homeroomRecordsLoading, currentSemester: storeToRefs(useSessionStore()).currentSemester,
        homeroomRecords: storeToRefs(useSessionStore()).homeroomRecords, loadWeeklyData: useDataStore().loadWeeklyData, homeroomAssignSelections: storeToRefs(useSessionStore()).homeroomAssignSelections, teachersList: storeToRefs(useSessionStore()).teachersList,
        extractNameFromFormatted, getHomeroomCoverCandidates: useTimetableStore().getHomeroomCoverCandidates, teachersListDetails: storeToRefs(useTimetableStore()).teachersListDetails,
        manualHomeroomForm: storeToRefs(useTimetableStore()).manualHomeroomForm, getTodayYmdStr: useTimetableStore().getTodayYmdStr, showManualHomeroomModal: storeToRefs(useTimetableStore()).showManualHomeroomModal,
        getLeaveTimeDefaults: useSubmitStore().getLeaveTimeDefaults,
        reportStartDate: storeToRefs(useDataStore()).reportStartDate, reportEndDate: storeToRefs(useDataStore()).reportEndDate, isBillableHomeroomRecord, activeCell: storeToRefs(useTourStore()).activeCell,
        inputRequestDate: storeToRefs(useTourStore()).inputRequestDate, allSchedules: storeToRefs(useSessionStore()).allSchedules, pendingRequestData: storeToRefs(useMutualStore()).pendingRequestData, matchMode: storeToRefs(useTourStore()).matchMode,
        isBatchGroupExpanded: useTimetableStore().isBatchGroupExpanded, makeBatchItemRow, exchangeWeekOffset: storeToRefs(useMutualStore()).exchangeWeekOffset, getExchangeWeekDates: useTimetableStore().getExchangeWeekDates,
        toLocalDateStr: DateUtils.toLocalDateStr, isSingleWeek: useSessionStore().isSingleWeek, getScheduleForDate: useTimetableStore().getScheduleForDate, getTeacherNameByEmail: useDataStore().getTeacherNameByEmail,
        isMutualCover: storeToRefs(useTourStore()).isMutualCover, mutualAwayClasses: storeToRefs(useTourStore()).mutualAwayClasses, batchSlots: storeToRefs(useTourStore()).batchSlots, QUOTA_DEDUCT_FEE: useTourStore().QUOTA_DEDUCT_FEE, lookupTeacher: useDataStore().lookupTeacher,
        isPeriod8FeeLocked: storeToRefs(useTimetableStore()).isPeriod8FeeLocked, ACTIVITY_PUBLIC_FEE: useTourStore().ACTIVITY_PUBLIC_FEE, batchSubFee: storeToRefs(useTourStore()).batchSubFee,
        isCourseAdjustmentOnlyRequest: useSessionStore().isCourseAdjustmentOnlyRequest, isEmptySlotAssignmentRequest: useSessionStore().isEmptySlotAssignmentRequest,
        // R-線上除錯：currentMonthHomeroomRecords→isBillableHomeroomRecord 讀 substitutionRecords.value，缺件即炸
        substitutionRecords: storeToRefs(useSessionStore()).substitutionRecords,
      });
      return _homeroomApi;
    };

    const isBillableHomeroomRecord = (...args) => {
      const a = getHomeroomApi();
      return a ? a.isBillableHomeroomRecord(...args) : undefined;
    };
    const loadHomeroomRecords = async (...args) => {
      await ensureHomeroomModule();
      const a = getHomeroomApi();
      return a ? a.loadHomeroomRecords(...args) : undefined;
    };
    const executeOptimisticAction = async (...args) => {
      await ensureHomeroomModule();
      const a = getHomeroomApi();
      return a ? a.executeOptimisticAction(...args) : undefined;
    };
    const assignHomeroomTeacher = async (...args) => {
      await ensureHomeroomModule();
      const a = getHomeroomApi();
      return a ? a.assignHomeroomTeacher(...args) : undefined;
    };
    const onHomeroomInputSelect = async (...args) => {
      await ensureHomeroomModule();
      const a = getHomeroomApi();
      return a ? a.onHomeroomInputSelect(...args) : undefined;
    };
    const onManualCoverTeacherInput = async (...args) => {
      await ensureHomeroomModule();
      const a = getHomeroomApi();
      return a ? a.onManualCoverTeacherInput(...args) : undefined;
    };
    const getFilteredHomeroomCandidates = async (...args) => {
      await ensureHomeroomModule();
      const a = getHomeroomApi();
      return a ? a.getFilteredHomeroomCandidates(...args) : undefined;
    };
    const openManualHomeroomModal = async (...args) => {
      await ensureHomeroomModule();
      const a = getHomeroomApi();
      return a ? a.openManualHomeroomModal(...args) : undefined;
    };
    const onManualHomeroomLeaveTeacherChange = async (...args) => {
      await ensureHomeroomModule();
      const a = getHomeroomApi();
      return a ? a.onManualHomeroomLeaveTeacherChange(...args) : undefined;
    };
    const saveManualHomeroomRecord = async (...args) => {
      await ensureHomeroomModule();
      const a = getHomeroomApi();
      return a ? a.saveManualHomeroomRecord(...args) : undefined;
    };
    const deleteHomeroomRecord = async (...args) => {
      await ensureHomeroomModule();
      const a = getHomeroomApi();
      return a ? a.deleteHomeroomRecord(...args) : undefined;
    };
    const switchQuotaDeductToSelfPay = async (...args) => {
      await ensureHomeroomModule();
      const a = getHomeroomApi();
      return a ? a.switchQuotaDeductToSelfPay(...args) : undefined;
    };
    const homeroomTimeRangeBounds = (...args) => {
      const a = getHomeroomApi();
      return a ? a.homeroomTimeRangeBounds(...args) : null;
    };
    const homeroomFullDayEndMinutes = (...args) => {
      const a = getHomeroomApi();
      return a ? a.homeroomFullDayEndMinutes(...args) : 16 * 60;
    };
    const isFullDayHomeroomLeave = (...args) => {
      const a = getHomeroomApi();
      return a ? a.isFullDayHomeroomLeave(...args) : false;
    };
  return { getHomeroomApi, ensureHomeroomModule, isBillableHomeroomRecord, approvedConvertSig, loadHomeroomRecords, executeOptimisticAction, assignHomeroomTeacher, onHomeroomInputSelect, onManualCoverTeacherInput, getFilteredHomeroomCandidates, openManualHomeroomModal, onManualHomeroomLeaveTeacherChange, saveManualHomeroomRecord, deleteHomeroomRecord, flattenBatchDisplayGroups, resolvePendingPeriods, switchQuotaDeductToSelfPay, homeroomTimeRangeBounds, homeroomFullDayEndMinutes, isFullDayHomeroomLeave, getTeacherJobTitleByEmail, chineseClassNumber, getHomeroomClassCodes, isHomeroomTeacher };
});
