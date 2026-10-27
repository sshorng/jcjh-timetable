// @vitest-environment happy-dom
 // 迴歸：媒合抽屜代課「載入更多」點擊應即時加載（10/54→20/54）；
 // 調課分支（同一 handler）另以 UiMatch stub 覆蓋（調課名單來自另一懶載模組，DOM 層不硬灌）。
import { test, expect } from 'vitest';
import { nextTick } from 'vue';
import { createV2App } from '../src/main.js';
import { UiMatch } from '../src/modules/ui-match.js';
import { useSessionStore } from '../src/stores/session.js';
import { useTourStore } from '../src/stores/tour.js';
import { useMutualStore } from '../src/stores/mutual.js';
import { useMatchStore } from '../src/stores/match.js';
import { storeToRefs } from 'pinia';

async function flush() {
  for (let i = 0; i < 5; i++) await nextTick();
  await new Promise((r) => setTimeout(r, 300));
}

test('drawer 載入更多：代課點擊 10/54→20/54', async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = () => Promise.reject(new Error('network disabled in test'));
  const errors = [];
  try {
    const app = createV2App();
    app.config.errorHandler = (err) => { errors.push(String((err && err.message) || err)); };
    const el = document.createElement('div');
    el.id = 'app';
    document.body.appendChild(el);
    app.mount(el);
    await flush();

    useSessionStore().user = { name: '測試員', email: 't@school' };
    await nextTick();

    const tour = useTourStore();
    tour.matchMode = 'substitution';
    tour.activeCell = {
      teacherEmail: 'a@x', teacherName: '請假師', dayOfWeek: 3, period: 2,
      classData: { className: '701', subject: '國文' },
    };
    tour.recommendedTeachers = Array.from({ length: 54 }, (_, i) => ({
      email: `t${i}@x`, name: `老師${i}`, subject: '國文', todayPeriodCount: 3,
    }));
    try { tour.recommendationLoading = false; } catch (e) { /* ref 不存在則略過 */ }

    const match = useMatchStore();
    await match.ensureMatchModule();
    useSessionStore().showMatchModal = true;
    await flush();

    const loadMoreBtn = () => el.querySelector('.match-drawer .center-pad-10 button');
    const btn = loadMoreBtn();
    expect(btn, '代課模式應有載入更多按鈕').toBeTruthy();
    expect(btn.textContent).toContain('10 / 54');
    btn.click();
    await flush();
    expect(storeToRefs(useMutualStore()).matchDisplayCount.value).toBe(20);
    expect(loadMoreBtn().textContent).toContain('20 / 54');
    expect(errors, 'vue errors:\n' + errors.join('\n')).toEqual([]);
    app.unmount();
  } finally {
    globalThis.fetch = origFetch;
  }
}, 60000);

test('loadMoreMatches 調課分支：以調課總數為上限累加', async () => {
  const ref = (v) => ({ value: v });
  const computed = (fn) => ({ get value() { return fn(); } });
  const deps = {
    computed,
    lookupTeacher: () => null, getTeacherNameByEmail: () => '',
    isAdmin: ref(false), fetchQuotaSpendPreview: async () => [],
    pendingRequestData: ref({ mode: 'exchange' }),
    QUOTA_DEDUCT_FEE: '扣額度', isPeriod8FeeLocked: ref(false),
    quotaPackPreview: ref([]), quotaPackError: ref(''), quotaPackLoading: ref(false),
    matchMode: ref('exchange'), matchDisplayCount: ref(10), MATCH_PAGE_SIZE: 10,
    matchSearchQuery: ref(''), recommendedTeachers: ref([]),
    isMutualCover: ref(false),
    recommendedExchangeList: ref(Array.from({ length: 25 }, (_, i) => ({
      teacherEmail: `e${i}@x`, teacherName: `調課師${i}`, className: '702',
      subject: '數學', dayOfWeek: 3, period: (i % 8) + 1, periodKey: `3-${(i % 8) + 1}`,
    }))),
    getWeekDayText: (d) => `週${d}`, formatPeriodText: (p) => `第${p}節`,
    exchangeWeekdayFilter: ref(0),
    activeCell: ref(null), matchShowNoTeacherWarning: ref(false), matchEmptyReasons: ref(null),
    showMatchModal: ref(false), getExchangeWeekDates: () => [], exchangeWeekOffset: ref(0),
    formatDateMMDD: (s) => String(s || ''), toLocalDateStr: () => '2026-10-27',
    batchExchangePreviewSlotKey: ref(''), compareWeekSelectionA: ref('source'), compareWeekSelectionB: ref('target'),
  };
  const api = UiMatch.create(deps);
  expect(api.filteredExchangeList.value.length).toBe(25);
  expect(api.displayedExchangeList.value.length).toBe(10);
  api.loadMoreMatches();
  expect(deps.matchDisplayCount.value).toBe(20);
  expect(api.displayedExchangeList.value.length).toBe(20);
});
