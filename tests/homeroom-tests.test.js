import assert from 'node:assert/strict';
import { test } from 'vitest';
import path from 'node:path';
import { UiHomeroom } from '../src/modules/ui-homeroom.js';

test('homeroom tests（v1 移植）', () => {
  /**
   * UiHomeroom 代導／空堂測試（2A：app.js 代導簇搬移的安全網）
   *
   * - create 回傳 19 件 API（含 6 computed）
   * - isRequestValid：空申請／缺日期／正常三態
   * - quotaDeductPreview：非代課／非扣額度短路
   * - flattenBatchDisplayGroups：批次攤平成列
   */

  const ref = (v) => ({ value: v });
  const computed = (fn) => ({ get value() { return fn(); } });


  assert.ok(UiHomeroom, 'UiHomeroom 應掛載');

  const deps = {
    computed, callGasApi: async () => ({}),
    isAdmin: ref(false), user: ref(null), homeroomRecordsLoading: ref(false),
    currentSemester: ref('114-1'), homeroomRecords: ref([]),
    loadWeeklyData: async () => {}, homeroomAssignSelections: ref({}),
    teachersList: ref([]),
    extractNameFromFormatted: (s) => String(s || ''),
    getHomeroomCoverCandidates: () => [], teachersListDetails: ref([]),
    manualHomeroomForm: ref({}), getTodayYmdStr: () => '2026-10-04',
    showManualHomeroomModal: ref(false), isFullDayHomeroomLeave: () => false,
    getLeaveTimeDefaults: () => ({}), reportStartDate: ref('2026-08-01'),
    reportEndDate: ref('2026-08-31'), isBillableHomeroomRecord: () => true,
    activeCell: ref(null), inputRequestDate: ref(''),
    allSchedules: ref([]), pendingRequestData: ref(null), matchMode: ref('substitution'),
    isBatchGroupExpanded: () => false, makeBatchItemRow: (r) => r,
    exchangeWeekOffset: ref(0), getExchangeWeekDates: () => [],
    toLocalDateStr: (d) => d, isSingleWeek: () => true, getScheduleForDate: () => null,
    getTeacherNameByEmail: () => '', isMutualCover: ref(false), mutualAwayClasses: ref([]),
    batchSlots: ref([]), QUOTA_DEDUCT_FEE: '扣額度', lookupTeacher: () => null,
    isPeriod8FeeLocked: ref(false), ACTIVITY_PUBLIC_FEE: '活動公費', batchSubFee: ref(''),
  };
  const api = UiHomeroom.create(deps);

  const EXPECTED = ['loadHomeroomRecords', 'executeOptimisticAction', 'assignHomeroomTeacher', 'onHomeroomInputSelect', 'onManualCoverTeacherInput', 'getFilteredHomeroomCandidates', 'filteredManualCoverTeachers', 'openManualHomeroomModal', 'onManualHomeroomLeaveTeacherChange', 'currentMonthHomeroomRecords', 'saveManualHomeroomRecord', 'deleteHomeroomRecord', 'exchangeTeachersList', 'isRequestValid', 'flattenBatchDisplayGroups', 'recommendedExchangeList', 'resolvePendingPeriods', 'quotaDeductPreview', 'switchQuotaDeductToSelfPay', 'homeroomTimeRangeBounds', 'homeroomFullDayEndMinutes', 'isFullDayHomeroomLeave', 'getTeacherJobTitleByEmail', 'chineseClassNumber', 'getHomeroomClassCodes', 'isHomeroomTeacher'];
  for (const k of EXPECTED) assert.ok(api[k], '缺少 ' + k);

  // isRequestValid 三態
  assert.equal(api.isRequestValid.value, false, '空申請應無效');
  deps.pendingRequestData.value = { mode: 'substitution' };
  assert.equal(api.isRequestValid.value, false, '缺日期應無效');
  deps.inputRequestDate.value = '2026-10-04';
  deps.pendingRequestData.value = { mode: 'substitution', subTeacher: 'b@x' };
  assert.equal(api.isRequestValid.value, true, '完整應有效');

  // quotaDeductPreview 短路
  assert.equal(api.quotaDeductPreview.value, null, '非代課不預覽');
  deps.pendingRequestData.value = { mode: 'substitution', subFee: '自費代課' };
  assert.equal(api.quotaDeductPreview.value, null, '非扣額度不預覽');

  // flatten 攤平
  const rows = [...api.flattenBatchDisplayGroups([{ id: 'a' }, { id: 'b' }])];
  assert.equal(rows.length, 2);

  // R16：代導判定（純函＋teachersList 角色時數）
  assert.deepEqual({ ...api.homeroomTimeRangeBounds('08:00~12:00') }, { start: 480, end: 720 });
  assert.equal(api.homeroomTimeRangeBounds('xx'), null);
  assert.equal(api.homeroomFullDayEndMinutes({}, ''), 16 * 60, '未知身分預設 16:00');
  assert.equal(api.isFullDayHomeroomLeave({ leaveTime: '全天' }), true);
  assert.equal(api.isFullDayHomeroomLeave({ leaveTimeType: '上午', leaveTime: '08:00~12:00' }), false);
  assert.equal(api.getTeacherJobTitleByEmail(''), '');
  assert.equal(api.chineseClassNumber('十'), 10);
  assert.deepEqual([...api.getHomeroomClassCodes('801')], ['801']);
  assert.equal(api.isHomeroomTeacher(null, ''), false);

  console.log('homeroom tests PASS（26 API＋驗證三態＋預覽短路＋代導判定）');

});
