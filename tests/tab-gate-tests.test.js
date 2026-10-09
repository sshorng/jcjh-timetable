import { describe, expect, test, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

// 2.1：tab-gates 迴歸鎖定（calendar／history／match／homeroom／approval）。
// 注意：模組級 holder 跨同檔測試共用，故「未載入」斷言一律先行，ensure 在後，順序即契約。
async function setupAll() {
  setActivePinia(createPinia());
  const t = await import('../src/stores/timetable.js');
  const h = await import('../src/stores/history.js');
  const m = await import('../src/stores/match.js');
  const hr = await import('../src/stores/homeroom.js');
  const r = await import('../src/stores/requests.js');
  const tour = await import('../src/stores/tour.js');
  return {
    useTimetableStore: t.useTimetableStore,
    useHistoryStore: h.useHistoryStore,
    useMatchStore: m.useMatchStore,
    useHomeroomStore: hr.useHomeroomStore,
    useRequestsStore: r.useRequestsStore,
    useTourStore: tour.useTourStore
  };
}

describe('tab 閘門：未載入行為（靜默＋回退）', () => {
  test('四 api 回 null 且不打 console.error，render 委派回退', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const s = await setupAll();
      expect(s.useHistoryStore().getHistoryApi()).toBeNull();
      expect(s.useMatchStore().getMatchApi()).toBeNull();
      expect(s.useHomeroomStore().getHomeroomApi()).toBeNull();
      expect(s.useRequestsStore().getApprovalApi()).toBeNull();
      expect(s.useTimetableStore().getCalendarApi()).toBeNull();
      expect(s.useTourStore().getTourApi()).toBeNull();
      // 內聯判定：localStorage 空即 true（node 測試用 noop storage，回 '' → true）
      expect(typeof s.useTourStore().shouldAutoStartOnboarding()).toBe('boolean');
      // render 委派回退
      expect(s.useTimetableStore().filteredHistoryRecords).toEqual([]);
      expect(s.useTimetableStore().paginatedMyPending).toEqual([]);
      // 未 ensure 不應有「未載入」紅字
      const noisy = err.mock.calls.some((c) => String(c[0] || '').indexOf('未載入') >= 0);
      expect(noisy).toBe(false);
    } finally {
      err.mockRestore();
    }
  }, 30000);

  test('內聯純函式免 ensure 即可同步回答', async () => {
    const s = await setupAll();
    // match
    expect(s.useMatchStore().quotaTeacherNameOf('')).toBe('');
    expect(s.useMatchStore().getMatchSlotDateMMDD('')).toBe('');
    // homeroom
    expect(s.useHomeroomStore().approvedConvertSig([])).toBe('');
    const sig = s.useHomeroomStore().approvedConvertSig([{ status: 'approved', id: 'A1', type: 'substitution', requestDate: '2026-10-01', requestPeriod: 1, requesterEmail: 'a@x', subFee: '自費代課' }]);
    expect(sig).toContain('A1');
    expect(sig).toContain('自費代課');
    expect(s.useHomeroomStore().getTeacherJobTitleByEmail('')).toBe('');
    expect(s.useHomeroomStore().chineseClassNumber('三')).toBe(3);
    expect(s.useHomeroomStore().getHomeroomClassCodes('701')).toContain('701');
    expect(s.useHomeroomStore().isHomeroomTeacher(null)).toBe(false);
    expect(s.useHomeroomStore().isHomeroomTeacher({ jobTitle: '701導師' }, '701')).toBe(true);
    expect(s.useHomeroomStore().isHomeroomTeacher({ jobTitle: '702導師' }, '701')).toBe(false);
    // 預設 activeCell.period=1（與模組同邏輯，ui-homeroom.js:506）
    expect(s.useHomeroomStore().resolvePendingPeriods()).toEqual([1]);
    expect(s.useHomeroomStore().flattenBatchDisplayGroups([], 'history')).toEqual([]);
    // approval
    expect(s.useRequestsStore().isProxySubmitRequest(null)).toBe(false);
    expect(s.useRequestsStore().isProxySubmitRequest({ note: 'xxx[行政代申請]yyy' })).toBe(true);
    expect(s.useRequestsStore().isPaperFlowRequest(null)).toBe(false);
    expect(s.useRequestsStore().isPaperFlowRequest({ paperFlow: true })).toBe(true);
    expect(s.useRequestsStore().isAdminPendingSelected('nope')).toBe(false);
    expect(s.useRequestsStore().isAdminBatchGroupSelected({ items: [] })).toBe(false);
    const steps = s.useRequestsStore().getRequestProgressSteps({});
    expect(Array.isArray(steps.steps)).toBe(true);
    expect(typeof steps.summary).toBe('string');
    expect(s.useRequestsStore().selectedAdminPendingIds).toEqual([]);
  }, 30000);

  test('checkUrlCallback 無參數時短路，不載入 approval', async () => {
    const s = await setupAll();
    const out = s.useRequestsStore();
    const r = await out.checkUrlCallback({});
    expect(r).toBeUndefined();
    const { tabModulesReady } = await import('../src/modules/tab-gates.js');
    expect(tabModulesReady.value.approval).toBeFalsy();
  }, 30000);
});

describe('tab 閘門：sync 模組', () => {
  test('未載入回 null，ensure 後就緒', async () => {
    setActivePinia(createPinia());
    const data = await import('../src/stores/data.js');
    const out = data.useDataStore();
    expect(out.getSyncApi()).toBeNull();
    await out.ensureSyncModule();
    expect(out.getSyncApi()).toBeTruthy();
    const { tabModulesReady } = await import('../src/modules/tab-gates.js');
    expect(tabModulesReady.value.sync).toBe(true);
  }, 30000);
});

describe('tab 閘門：載入後行為', () => {
  test('ensure 後五 api 就緒＋ready 旗標', async () => {
    const s = await setupAll();
    await s.useHistoryStore().ensureHistoryModule();
    await s.useMatchStore().ensureMatchModule();
    await s.useHomeroomStore().ensureHomeroomModule();
    await s.useRequestsStore().ensureApprovalModule();
    await s.useTimetableStore().ensureCalendarModule();
    await s.useTourStore().ensureTourModule();
    expect(s.useHistoryStore().getHistoryApi()).toBeTruthy();
    expect(s.useMatchStore().getMatchApi()).toBeTruthy();
    expect(s.useHomeroomStore().getHomeroomApi()).toBeTruthy();
    expect(s.useRequestsStore().getApprovalApi()).toBeTruthy();
    expect(s.useTimetableStore().getCalendarApi()).toBeTruthy();
    expect(s.useTourStore().getTourApi()).toBeTruthy();
    const { tabModulesReady } = await import('../src/modules/tab-gates.js');
    expect(tabModulesReady.value.history).toBe(true);
    expect(tabModulesReady.value.match).toBe(true);
    expect(tabModulesReady.value.homeroom).toBe(true);
    expect(tabModulesReady.value.approval).toBe(true);
    expect(tabModulesReady.value.calendar).toBe(true);
    expect(tabModulesReady.value.tour).toBe(true);
  }, 60000);
});
