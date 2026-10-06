import assert from 'node:assert/strict';
import { test } from 'vitest';
import DomainClassAway from '../src/domain/domain-class-away.js';
import { UiClassAwayAdmin, UiMutualBridge } from '../src/modules/ui-activity.js';

test('class away ui tests（v1 移植）', () => {
  const savedRows = [];
  const toasts = [];
  const eventRef = { value: [] };
  const admin = UiClassAwayAdmin.create({
    ref: value => ({ value }),
    callGasApi: async (action, row) => {
      assert.equal(action, 'saveClassAwayEvent');
      savedRows.push(row);
    },
    showToast: (message, type) => toasts.push({ message, type }),
    showConfirm: async () => true,
    classAwayEvents: eventRef,
    classList: { value: ['901', '902'] },
    currentSemester: { value: '115-1' },
    loading: { value: false },
    clearScheduleCache: () => {},
    softRefreshInBackground: () => {}
  });

  async function run() {
    admin.openAddClassAwayModal();
    assert.deepEqual(admin.classAwayPeriodOptions.map(option => option.value), ['0', '1', '2', '3', '4', '45', '5', '6', '7', '8']);
    admin.classAwayForm.value = Object.assign({}, admin.classAwayForm.value, {
      name: '一天半事件', startDate: '2026-10-05', endDate: '2026-10-06',
      startPeriod: '0', endPeriod: '4', scope: 'all', forMutual: true
    });
    await admin.saveClassAwayEvent();

    assert.equal(savedRows[0]['起始節次'], '0');
    assert.equal(savedRows[0]['結束節次'], '4');
    assert.equal(savedRows[0]['停課節次'], '全部節次');
    assert.equal(savedRows[0]['可進互代'], 'TRUE', '指定節次區間也可開放活動互代');
    assert.equal(eventRef.value[0].startPeriod, '0');
    assert.equal(eventRef.value[0].endPeriod, '4');
    assert.equal(admin.classAwayPeriodLabel(eventRef.value[0]), '連續：早自習～第4節');
    assert.match(toasts[0].message, /早自習～第4節/);

    const mutualState = {
      start: { value: '' }, end: { value: '' }, startPeriod: { value: '0' }, endPeriod: { value: '8' },
      away: { value: [] }, note: { value: '' }
    };
    const bridge = UiMutualBridge.create({
      ref: value => ({ value }),
      computed: getter => ({ get value() { return getter(); } }),
      showToast: (message, type) => toasts.push({ message, type }),
      classAwayEvents: eventRef,
      classList: { value: ['901', '902'] },
      semesterEndDate: { value: '2026-10-30' },
      mutualActivityStart: mutualState.start,
      mutualActivityEnd: mutualState.end,
      mutualActivityStartPeriod: mutualState.startPeriod,
      mutualActivityEndPeriod: mutualState.endPeriod,
      mutualAwayClasses: mutualState.away,
      mutualNote: mutualState.note,
      mutualLeadEmails: { value: [] },
      mutualDrafts: { value: [] },
      isMutualCover: { value: true },
      batchSlots: { value: [] },
      allSchedules: { value: [] },
      requestsList: { value: [] },
      teachersList: { value: [] },
      currentWeekDates: { value: [] },
      getScheduleForDate: () => null,
      persistMutualPanelDraft: () => {},
      clearScheduleCache: () => {},
      ensureMutualActivityRange: () => {},
      DAC: () => null
    });
    assert.equal(bridge.mutualImportableEvents.value[0].name, '一天半事件', '指定節次事件也應列為可互代事件');
    bridge.applyClassAwayEventById(eventRef.value[0].id);
    assert.equal(mutualState.startPeriod.value, '0');
    assert.equal(mutualState.endPeriod.value, '4');
    assert.deepEqual(mutualState.away.value, ['901', '902']);

    admin.openAddClassAwayModal();
    admin.classAwayForm.value = Object.assign({}, admin.classAwayForm.value, {
      name: '全天事件', startDate: '2026-10-06', scope: 'all'
    });
    await admin.saveClassAwayEvent();
    assert.equal(savedRows[1]['停課節次'], '全部節次', '原本的全部節次設定仍可使用');
    assert.equal(savedRows[1]['起始節次'], '0');
    assert.equal(savedRows[1]['結束節次'], '8');
    assert.equal(savedRows[1]['可進互代'], 'TRUE');

    admin.openEditClassAwayModal(eventRef.value[0]);
    assert.equal(admin.classAwayForm.value.startPeriod, '0');
    assert.equal(admin.classAwayForm.value.endPeriod, '4');

    admin.openAddClassAwayModal();
    admin.classAwayForm.value = Object.assign({}, admin.classAwayForm.value, {
      name: '跨日端點', startDate: '2026-10-07', endDate: '2026-10-08',
      startPeriod: '8', endPeriod: '0', scope: 'all'
    });
    await admin.saveClassAwayEvent();
    assert.equal(savedRows[2]['起始節次'], '8', '跨日區間起點可晚於終點節次');
    assert.equal(savedRows[2]['結束節次'], '0');

    admin.openAddClassAwayModal();
    admin.classAwayForm.value = Object.assign({}, admin.classAwayForm.value, {
      name: '錯誤區間', startDate: '2026-10-07', endDate: '2026-10-07',
      startPeriod: '5', endPeriod: '4', scope: 'all'
    });
    await admin.saveClassAwayEvent();
    assert.equal(savedRows.length, 3, '同日終點早於起點時不可送出');
    assert.match(toasts[toasts.length - 1].message, /同一天的終點節次不可早於起點節次/);

    admin.openAddClassAwayModal();
    admin.classAwayForm.value = Object.assign({}, admin.classAwayForm.value, {
      name: '兩天第八節', startDate: '2026-10-07', endDate: '2026-10-08',
      periodMode: 'daily', periods: ['8'], scope: 'all'
    });
    await admin.saveClassAwayEvent();
    assert.equal(savedRows[3]['起始節次'], '', '每日指定節次不應寫入起點');
    assert.equal(savedRows[3]['結束節次'], '', '每日指定節次不應寫入終點');
    assert.equal(savedRows[3]['停課節次'], '8', '兩天每天第8節應以一筆每日模式保存');
    const dailyEvent = eventRef.value[eventRef.value.length - 1];
    assert.equal(DomainClassAway.eventAppliesToPeriod(dailyEvent, 8, '2026-10-07', '2026-10-30'), true);
    assert.equal(DomainClassAway.eventAppliesToPeriod(dailyEvent, 8, '2026-10-08', '2026-10-30'), true);
    assert.equal(DomainClassAway.eventAppliesToPeriod(dailyEvent, 7, '2026-10-07', '2026-10-30'), false);
    assert.equal(admin.classAwayDailyPeriodLabel(dailyEvent), '第8節');
    assert.equal(admin.classAwayBoundaryPeriodLabel(dailyEvent, 'start'), '—');
    console.log('class-away UI tests PASS');
  }

  run().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });

});
