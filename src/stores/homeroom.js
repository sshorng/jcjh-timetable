/** v2 stores/homeroom.js — 由 v1 setup() §分節機械分解（gen-final.cjs）。 */
import { defineStore } from 'pinia';
import { computed } from 'vue';
import DateUtils from '../domain/date-utils.js';
import { UiHomeroom } from '../modules/ui-homeroom.js';
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
    let _homeroomApi = null;
const getHomeroomApi = () => {
      if (_homeroomApi) return _homeroomApi;
      if (!UiHomeroom) {
        console.error('UiHomeroom 未載入');
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
    const approvedConvertSig = (...args) => {
      const a = getHomeroomApi();
      return a ? a.approvedConvertSig(...args) : undefined;
    };
    const loadHomeroomRecords = (...args) => {
      const a = getHomeroomApi();
      return a ? a.loadHomeroomRecords(...args) : undefined;
    };
    const executeOptimisticAction = (...args) => {
      const a = getHomeroomApi();
      return a ? a.executeOptimisticAction(...args) : undefined;
    };
    const assignHomeroomTeacher = (...args) => {
      const a = getHomeroomApi();
      return a ? a.assignHomeroomTeacher(...args) : undefined;
    };
    const onHomeroomInputSelect = (...args) => {
      const a = getHomeroomApi();
      return a ? a.onHomeroomInputSelect(...args) : undefined;
    };
    const onManualCoverTeacherInput = (...args) => {
      const a = getHomeroomApi();
      return a ? a.onManualCoverTeacherInput(...args) : undefined;
    };
    const getFilteredHomeroomCandidates = (...args) => {
      const a = getHomeroomApi();
      return a ? a.getFilteredHomeroomCandidates(...args) : undefined;
    };
    const openManualHomeroomModal = (...args) => {
      const a = getHomeroomApi();
      return a ? a.openManualHomeroomModal(...args) : undefined;
    };
    const onManualHomeroomLeaveTeacherChange = (...args) => {
      const a = getHomeroomApi();
      return a ? a.onManualHomeroomLeaveTeacherChange(...args) : undefined;
    };
    const saveManualHomeroomRecord = (...args) => {
      const a = getHomeroomApi();
      return a ? a.saveManualHomeroomRecord(...args) : undefined;
    };
    const deleteHomeroomRecord = (...args) => {
      const a = getHomeroomApi();
      return a ? a.deleteHomeroomRecord(...args) : undefined;
    };
    const flattenBatchDisplayGroups = (...args) => {
      const a = getHomeroomApi();
      return a ? a.flattenBatchDisplayGroups(...args) : undefined;
    };
    const resolvePendingPeriods = (...args) => {
      const a = getHomeroomApi();
      return a ? a.resolvePendingPeriods(...args) : undefined;
    };
    const switchQuotaDeductToSelfPay = (...args) => {
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
    const getTeacherJobTitleByEmail = (...args) => {
      const a = getHomeroomApi();
      return a ? a.getTeacherJobTitleByEmail(...args) : '';
    };
    const chineseClassNumber = (...args) => {
      const a = getHomeroomApi();
      return a ? a.chineseClassNumber(...args) : 0;
    };
    const getHomeroomClassCodes = (...args) => {
      const a = getHomeroomApi();
      return a ? a.getHomeroomClassCodes(...args) : [];
    };
    const isHomeroomTeacher = (...args) => {
      const a = getHomeroomApi();
      return a ? a.isHomeroomTeacher(...args) : false;
    };
  return { getHomeroomApi, isBillableHomeroomRecord, approvedConvertSig, loadHomeroomRecords, executeOptimisticAction, assignHomeroomTeacher, onHomeroomInputSelect, onManualCoverTeacherInput, getFilteredHomeroomCandidates, openManualHomeroomModal, onManualHomeroomLeaveTeacherChange, saveManualHomeroomRecord, deleteHomeroomRecord, flattenBatchDisplayGroups, resolvePendingPeriods, switchQuotaDeductToSelfPay, homeroomTimeRangeBounds, homeroomFullDayEndMinutes, isFullDayHomeroomLeave, getTeacherJobTitleByEmail, chineseClassNumber, getHomeroomClassCodes, isHomeroomTeacher };
});
