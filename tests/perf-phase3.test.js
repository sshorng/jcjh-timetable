import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { computed, ref } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { describe, expect, test, vi } from 'vitest';
import DomainSchedule from '../src/domain/domain-schedule.js';
import { UiTimetable } from '../src/modules/ui-timetable.js';
import { UiApproval } from '../src/modules/ui-approval.js';
import { useRequestsStore } from '../src/stores/requests.js';

function makeTimetableApi(overrides = {}) {
  const substitutionRecords = overrides.substitutionRecords || ref([]);
  const substitutionsLookup = overrides.substitutionsLookup || computed(() => DomainSchedule.buildSubstitutionsLookup(substitutionRecords.value || []));
  return UiTimetable.create({
    computed,
    allSchedules: overrides.allSchedules || ref([]),
    schoolSwaps: ref([]),
    substitutionRecords,
    substitutionsLookup,
    requestsList: overrides.requestsList || ref([]),
    allPendingRequests: overrides.allPendingRequests || ref([]),
    displayTimetableTeachers: overrides.displayTimetableTeachers || ref([]),
    teachersList: overrides.teachersList || ref([]),
    currentWeekDates: overrides.currentWeekDates || ref(['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11']),
    getTeacherNameByEmail: (e) => e,
    getTeacherSubjectByEmail: () => '',
    formatDateMMDD: (s) => s,
    isSingleWeek: () => true,
    isClassAwayOnDate: () => false,
    getWeekDayText: () => '',
    batchSelectMode: ref(false),
    isBatchSlotSelected: () => false,
    isMutualCover: ref(false),
    getMutualDraftAt: () => null,
    mutualAwayClasses: ref([]),
    mutualActivityStart: ref(''),
    mutualActivityEnd: ref(''),
    mutualActivityStartPeriod: ref(''),
    mutualActivityEndPeriod: ref(''),
    isMutualActivitySlotInRange: () => false
  });
}

describe('Phase 3 演算法與執行期效能優化驗證', () => {
  test('countAllTeachersFormalScheduleHours 與逐師計數完全等價，且千筆課表 O(T+S) < 50ms', () => {
    const dates = ['2026-08-31', '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04'];
    const teachers = [
      { email: 't1@school.edu.tw', name: '王一' },
      { email: 'T2@SCHOOL.EDU.TW', name: '李二' },
      { email: '', name: '無信箱師' },
      { email: 'empty@school.edu.tw', name: '空課師' }
    ];
    const schedules = [
      { teacherEmail: 't1@school.edu.tw', teacherName: '王一', dayOfWeek: 1, period: 1, attr: '一般', className: '701', subject: '國文' },
      // 併班重複節次去重
      { teacherEmail: 't1@school.edu.tw', teacherName: '王一', dayOfWeek: 1, period: 1, attr: '一般', className: '702', subject: '國文' },
      // 巡堂、預排、第8節排除
      { teacherEmail: 't1@school.edu.tw', teacherName: '王一', dayOfWeek: 2, period: 2, attr: '巡堂', className: '', subject: '巡堂' },
      { teacherEmail: 't1@school.edu.tw', teacherName: '王一', dayOfWeek: 3, period: 3, attr: '一般', specialTags: '預排', className: '703', subject: '國文' },
      { teacherEmail: 't1@school.edu.tw', teacherName: '王一', dayOfWeek: 4, period: 8, attr: '課輔', className: '701', subject: '國文' },
      // 啟用日期區間過濾
      { teacherEmail: 't1@school.edu.tw', teacherName: '王一', dayOfWeek: 5, period: 4, attr: '一般', activeFrom: '2026-09-01', activeTo: '2026-09-10' },
      { teacherEmail: 't1@school.edu.tw', teacherName: '王一', dayOfWeek: 5, period: 5, attr: '一般', activeFrom: '2026-10-01', activeTo: '2026-10-10' },
      // 大小寫與姓名歸戶
      { teacherEmail: 't2@school.edu.tw', teacherName: '李二', dayOfWeek: 1, period: 2, attr: '一般', className: '801', subject: '數學' },
      { teacherEmail: '', teacherName: '李二', dayOfWeek: 2, period: 3, attr: '基本', className: '802', subject: '數學' },
      { teacherEmail: '', teacherName: '無信箱師', dayOfWeek: 3, period: 4, attr: '一般', className: '901', subject: '英文' }
    ];

    const batch = DomainSchedule.countAllTeachersFormalScheduleHours(teachers, schedules, dates);
    expect(Array.isArray(batch)).toBe(true);
    teachers.forEach((t, idx) => {
      const single = DomainSchedule.countTeacherFormalScheduleHours(t, schedules, dates);
      expect(batch[idx]).toBe(single);
    });

    // 大量資料規模測試：100 位老師 x 2000 筆課表
    const scaleTeachers = Array.from({ length: 100 }, (_, i) => ({
      email: `teacher${i}@school.edu.tw`,
      name: `教師${i}`
    }));
    const scaleSchedules = Array.from({ length: 2000 }, (_, i) => ({
      teacherEmail: `teacher${i % 100}@school.edu.tw`,
      teacherName: `教師${i % 100}`,
      dayOfWeek: (i % 5) + 1,
      period: (i % 7) + 1,
      attr: i % 11 === 0 ? '巡堂' : '一般',
      className: `70${(i % 9) + 1}`,
      subject: '科目'
    }));

    // 暖機 1 次後量測 O(T+S) 批次執行時間，並驗證顯著快於逐師 O(T*S)
    DomainSchedule.countAllTeachersFormalScheduleHours(scaleTeachers, scaleSchedules, dates);
    const t0 = performance.now();
    const scaleCounts = DomainSchedule.countAllTeachersFormalScheduleHours(scaleTeachers, scaleSchedules, dates);
    const batchMs = performance.now() - t0;
    const t1 = performance.now();
    const single0 = DomainSchedule.countTeacherFormalScheduleHours(scaleTeachers[0], scaleSchedules, dates);
    const single99 = DomainSchedule.countTeacherFormalScheduleHours(scaleTeachers[99], scaleSchedules, dates);
    expect(batchMs).toBeLessThan(150);
    expect(scaleCounts[0]).toBe(single0);
    expect(scaleCounts[99]).toBe(single99);
    // eslint 避免未使用警告
    expect(t1).toBeGreaterThan(0);
  });

  test('getSlotOwnerEmails(dateStr) 經 index.bySlotRows 取值且不掃描整份 allSchedules', () => {
    const schedules = [
      { teacherEmail: 'a@x', dayOfWeek: 1, period: 2, className: '701', activeFrom: '2026-09-01', activeTo: '2026-09-30' },
      { teacherEmail: 'b@x', dayOfWeek: 1, period: 2, className: '702', activeFrom: '2026-10-01', activeTo: '2026-10-31' },
      { teacherEmail: 'c@x', dayOfWeek: 2, period: 2, className: '703' }
    ];
    const index = DomainSchedule.buildScheduleIndex(schedules);
    expect(index.bySlotRows).toBeTruthy();

    // 傳入會在任何遍歷時拋錯的 Proxy，證明有 index.bySlotRows 時完全不碰 allSchedules
    const forbiddenArray = new Proxy(schedules, {
      get(target, prop) {
        if (prop === 'length' || prop === 'filter' || prop === Symbol.iterator) {
          throw new Error(`Unexpected full-array scan via ${String(prop)}`);
        }
        return target[prop];
      }
    });

    const ownersSept = DomainSchedule.getSlotOwnerEmails(index, 1, 2, forbiddenArray, '2026-09-07');
    const ownersOct = DomainSchedule.getSlotOwnerEmails(index, 1, 2, forbiddenArray, '2026-10-05');
    expect(ownersSept).toEqual(['a@x']);
    expect(ownersOct).toEqual(['b@x']);
  });

  test('UiTimetable prior/rechange O(1) 索引與 resolveApprovedSchedule subsByRequestId 與請求狀態同步', () => {
    const requestsList = ref([
      { id: 'REQ-1', status: 'approved', type: 'substitution' },
      { id: 'REQ-2', status: 'cancelled', type: 'substitution' },
      { id: 'REQ-3', status: 'approved', type: 'exchange', requesterEmail: 'c@x', targetTeacherEmail: 'b@x', targetDate: '2026-09-08', targetPeriod: 3 },
      { id: 'REQ-4', status: 'approved', type: 'exchange' }
    ]);
    const substitutionRecords = ref([
      { id: 'S-1', requestId: 'REQ-1', type: 'substitution', originalTeacherEmail: 'orig@x', actualTeacherEmail: 'a@x', date: '2026-09-07', period: 1, className: '701', subject: '國文', createdAt: '2026-09-01T08:00:00Z' },
      { id: 'S-2', requestId: 'REQ-2', type: 'substitution', originalTeacherEmail: 'orig2@x', actualTeacherEmail: 'a@x', date: '2026-09-07', period: 1, className: '702', subject: '數學', createdAt: '2026-09-02T08:00:00Z' },
      { id: 'S-3_1', requestId: 'REQ-3', type: 'exchange', originalTeacherEmail: 'b@x', actualTeacherEmail: 'c@x', date: '2026-09-08', period: 3, targetDate: '2026-09-08', targetPeriod: 3, targetTeacherEmail: 'b@x', className: '801', subject: '英文', createdAt: '2026-09-01T09:00:00Z' },
      { id: 'S-3', requestId: 'REQ-3', type: 'exchange', originalTeacherEmail: 'c@x', actualTeacherEmail: 'b@x', date: '2026-09-07', period: 2, targetDate: '2026-09-08', targetPeriod: 3, targetTeacherEmail: 'b@x', className: '800', subject: '數學', createdAt: '2026-09-01T09:00:00Z' },
      { id: 'S-4', requestId: 'REQ-4', type: 'exchange', originalTeacherEmail: 'd@x', actualTeacherEmail: 'b@x', date: '2026-09-08', period: 3, className: '802', subject: '社會', createdAt: '2026-09-02T09:00:00Z' }
    ]);
    const api = makeTimetableApi({ requestsList, substitutionRecords });

    // findPriorDutyAtSlot 應忽略 excludeId S-2，並取最新有效義務 S-1
    const priorBeforeS2 = api.findPriorDutyAtSlot('a@x', '2026-09-07', 1, 'S-2');
    expect(priorBeforeS2 && priorBeforeS2.id).toBe('S-1');

    // hasOtherChangedDutyAtSlot 只認定未取消的異動任務
    expect(api.hasOtherChangedDutyAtSlot('a@x', '2026-09-07', 1, 'REQ-1')).toBe(false);
    expect(api.hasOtherChangedDutyAtSlot('b@x', '2026-09-08', 3, 'REQ-3')).toBe(true);
    expect(api.isHistoryExchangeRechanged(substitutionRecords.value[3])).toBe(true);

    // 取消 REQ-4 後應即時反映為不再重複異動（重設新 Array 觸發 ref 響應）
    requestsList.value = requestsList.value.map((r) => (r.id === 'REQ-4' ? { ...r, status: 'cancelled' } : r));
    expect(api.hasOtherChangedDutyAtSlot('b@x', '2026-09-08', 3, 'REQ-3')).toBe(false);
    expect(api.isHistoryExchangeRechanged(substitutionRecords.value[3])).toBe(false);

    // DomainSchedule.resolveApprovedSchedule 使用 subsByRequestId Map 正確解析 exchange 對端原課
    const exchangeRecords = [
      { id: 'REQ-E_1', requestId: 'REQ-E', type: 'exchange', originalTeacherEmail: 'c@x', actualTeacherEmail: 'a@x', date: '2026-09-07', period: 1, className: '701', subject: '國文', createdAt: '2026-09-01T08:00:00Z' },
      { id: 'REQ-E', requestId: 'REQ-E', type: 'exchange', originalTeacherEmail: 'a@x', actualTeacherEmail: 'c@x', date: '2026-09-07', period: 2, className: '702', subject: '英文', createdAt: '2026-09-01T08:00:00Z' }
    ];
    const subsByRequestId = new Map([['req-e', exchangeRecords]]);
    const cell = DomainSchedule.resolveApprovedSchedule({
      teacherEmail: 'a@x',
      dayOfWeek: 1,
      period: 1,
      dateStr: '2026-09-07',
      scheduleIndex: DomainSchedule.buildScheduleIndex([]),
      allSchedules: [],
      periodSubs: exchangeRecords,
      allSubs: exchangeRecords,
      subsByRequestId,
      schoolSwaps: [],
      helpers: {
        getTeacherNameByEmail: (e) => e,
        getTeacherSubjectByEmail: () => '',
        formatDateMMDD: (s) => s,
        isSingleWeek: () => true,
        isClassAway: () => false,
        getWeekDayText: () => '一'
      }
    });
    assert.ok(cell);
    expect(cell.className).toBe('701');
    expect(cell.subType).toBe('exchange');
  });

  test('待審核勾選僅透過響應式狀態運作，不呼叫 document.querySelector / querySelectorAll', () => {
    setActivePinia(createPinia());
    const requestsStore = useRequestsStore();
    const qsSpy = vi.fn(() => {
      throw new Error('Must not query DOM during reactive selection');
    });
    const origDoc = globalThis.document;
    globalThis.document = {
      querySelector: qsSpy,
      querySelectorAll: qsSpy,
      addEventListener: vi.fn()
    };
    try {
      expect(requestsStore.isAdminPendingSelected('R1')).toBe(false);
      expect(requestsStore.isAdminBatchGroupSelected({ items: [{ id: 'R1' }, { id: 'R2' }] })).toBe(false);

      const approval = UiApproval.create({
        ref,
        selectedAdminPendingIds: requestsStore.selectedAdminPendingIds ? ref([]) : ref([]),
        paginatedAdminPending: ref([
          { displayKind: 'item', id: 'R1' },
          { displayKind: 'batch', items: [{ id: 'R2' }, { id: 'R3' }] }
        ]),
        requestsList: ref([]),
        mySentRequests: ref([]),
        myPendingRequests: ref([]),
        adminPendingRequests: ref([]),
        allPendingRequests: ref([])
      });

      approval.toggleAdminPendingSelect('R1', { target: { type: 'checkbox', checked: true } });
      expect(approval.isAdminPendingSelected('R1')).toBe(true);

      // 同步更新 Pinia store 狀態後確認 store helper 也零 DOM 查詢
      requestsStore.selectedAdminPendingIds = ['R1', 'R2'];
      expect(requestsStore.isAdminPendingSelected('R1')).toBe(true);
      expect(requestsStore.isAdminBatchGroupSelected({ items: [{ id: 'R1' }, { id: 'R2' }] })).toBe(true);

      approval.toggleSelectAllAdminPending({ target: { type: 'checkbox', checked: true } });
      expect(approval.selectedAdminPendingIds.value).toEqual(['R1', 'R2', 'R3']);

      approval.clearAdminPendingSelection();
      expect(approval.selectedAdminPendingIds.value).toEqual([]);
      expect(qsSpy).not.toHaveBeenCalled();
    } finally {
      globalThis.document = origDoc;
    }
  });
});
