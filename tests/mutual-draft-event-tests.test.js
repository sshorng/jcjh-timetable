import assert from 'node:assert/strict';
import { test } from 'vitest';
import { UiMutualPanelState } from '../src/modules/ui-mutual.js';

/**
 * 活動互代面板記憶含空堂事件下拉：
 * persist 把 mutualImportEventId 寫進 localStorage；
 * apply 在事件仍存在時還原、被刪除時跳過（不卡幽靈選項）。
 */
function makePanelApi(captured, eventGetter) {
  const r = (v) => ({ value: v });
  return UiMutualPanelState.create({
    showToast: () => {},
    showConfirm: async () => true,
    callGasApi: async () => ({}),
    isAdmin: r(true),
    loading: r(false),
    loadingMessage: r(''),
    isMutualCover: r(true),
    mutualAwayClasses: r([]),
    mutualLeadEmails: r([]),
    mutualSkipNotify: r(true),
    mutualNote: r(''),
    mutualDrafts: r([]),
    mutualActivityStart: r('2026-12-18'),
    mutualActivityEnd: r('2026-12-18'),
    mutualActivityStartPeriod: r('5'),
    mutualActivityEndPeriod: r('8'),
    mutualActivityPeriodMode: r('range'),
    mutualActivityPeriods: r(['all']),
    currentWeekDates: r(['2026-12-14', '2026-12-15', '2026-12-16', '2026-12-17', '2026-12-18']),
    classList: r(['701']),
    teachersList: r([]),
    allSchedules: r([]),
    requestsList: r([]),
    activeCell: r(null),
    inputRequestDate: r(''),
    recommendedTeachers: r([]),
    showMatchModal: r(false),
    pendingRequestData: r(null),
    batchSubFee: r(''),
    directApproveMode: r(false),
    ACTIVITY_PUBLIC_FEE: '活動公費',
    PERIOD8_FEE: '第8節代課',
    getTeacherNameByEmail: () => '',
    softRefreshInBackground: () => {},
    defaultSubFeeForReason: () => '自費代課',
    getScheduleForDate: () => null,
    classAwayEvents: r([{ id: 'evt-1', name: '畢旅' }]),
    fetchMutualQuotaLedger: async () => ({ ledger: [] }),
    getMutualImportEventId: eventGetter,
    setMutualImportEventId: (id) => { captured.eventId = id; },
    DAC: () => null
  });
}

test('互代面板記憶：persist 寫入空堂事件ID', () => {
  const prevStorage = globalThis.localStorage;
  const box = {};
  globalThis.localStorage = {
    setItem: (k, v) => { box[k] = String(v); },
    getItem: (k) => (k in box ? box[k] : null)
  };
  try {
    const captured = {};
    const api = makePanelApi(captured, () => 'evt-1');
    api.persistMutualPanelDraft();
    const saved = JSON.parse(box[api.LS_KEY]);
    assert.equal(saved.eventId, 'evt-1', '草稿應記住空堂事件下拉的選擇');
    console.log('mutual draft eventId persist tests PASS');
  } finally {
    if (prevStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = prevStorage;
  }
});

test('互代面板記憶：apply 還原仍存在的事件、跳過已刪除的', () => {
  const captured = {};
  const api = makePanelApi(captured, () => '');
  api.applyMutualPanelDraft({ eventId: 'evt-1', awayClasses: ['701'] });
  assert.equal(captured.eventId, 'evt-1', '事件仍在清單應還原下拉選擇');

  const captured2 = {};
  const api2 = makePanelApi(captured2, () => '');
  api2.applyMutualPanelDraft({ eventId: 'evt-gone' });
  assert.equal(captured2.eventId, undefined, '事件已被刪除不可還原，避免卡幽靈選項');
  console.log('mutual draft eventId apply tests PASS');
});
