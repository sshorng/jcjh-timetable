import assert from 'node:assert/strict';
import { test } from 'vitest';
import { UiHomeroom } from '../src/modules/ui-homeroom.js';

// 迴歸：線上 TypeError Cannot read properties of undefined (reading 'value')
// currentMonthHomeroomRecords → isBillableHomeroomRecord 讀 substitutionRecords.value，
// homeroom store 曾漏傳（空紀錄時 filter 不執行故測試全綠，有資料才炸）。
test('homeroom monthly records（線上 crash 迴歸）', () => {
  const ref = (v) => ({ value: v });
  const api = UiHomeroom.create({
    computed: (fn) => ({ get value() { return fn(); } }),
    activeCell: ref(null),
    lookupTeacher: () => null,
    reportStartDate: ref('2026-09-01'),
    reportEndDate: ref('2026-09-30'),
    homeroomRecords: ref([
      {
        date: '2026-09-07', enabled: true, status: 'approved',
        sourceRequestId: 'req-1', leaveEmail: 'a@x'
      }
    ]),
    substitutionRecords: ref([
      { requestId: 'req-1', type: 'substitution' }
    ]),
    isCourseAdjustmentOnlyRequest: () => false,
    isEmptySlotAssignmentRequest: () => false
  });
  const rows = api.currentMonthHomeroomRecords.value;
  assert.equal(rows.length, 1, '當月紀錄應保留（有對應代課）');
  assert.equal(rows[0].date, '2026-09-07');

  // 無代課對應 → 仍不炸（走 isFullDayHomeroomLeave 分支）
  const api2 = UiHomeroom.create({
    computed: (fn) => ({ get value() { return fn(); } }),
    activeCell: ref(null),
    lookupTeacher: () => null,
    reportStartDate: ref('2026-09-01'),
    reportEndDate: ref('2026-09-30'),
    homeroomRecords: ref([
      { date: '2026-09-07', enabled: true, status: 'approved', sourceRequestId: 'req-x' }
    ]),
    substitutionRecords: ref([]),
    isCourseAdjustmentOnlyRequest: () => false,
    isEmptySlotAssignmentRequest: () => false
  });
  assert.ok(Array.isArray(api2.currentMonthHomeroomRecords.value), '無對應紀錄也不應拋錯');
  console.log('homeroom monthly records PASS');
});
