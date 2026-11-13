// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { mutualDraftKey, batchSlotKey, getBatchCompareWeeks } from '../src/domain/slot-helpers.js';

describe('Phase 2 延遲載入閘門與主包瘦身合約', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('slot-helpers 提供穩定的純函式鍵值與週別比較工具', () => {
    expect(mutualDraftKey('A@JCJH.EDU.TW', '2026-10-12', 3)).toBe('a@jcjh.edu.tw|2026-10-12|3');
    expect(batchSlotKey('B@JCJH.EDU.TW', '2026-10-13', 5)).toBe('b@jcjh.edu.tw|2026-10-13|5');

    expect(getBatchCompareWeeks([])).toEqual([]);
    expect(getBatchCompareWeeks([
      { dateStr: '2026-10-12', period: 1 },
      { dateStr: '2026-10-14', period: 2 },
      { dateStr: '2026-10-19', period: 3 }
    ])).toHaveLength(2);
  });

  it('初始啟動時 activityModulesReady 全為 false，store get*Api 同步回傳 null 不拋錯', async () => {
    const gates = await import('../src/modules/activity-gates.js');
    expect(gates.activityModulesReady.value).toEqual({
      dac: false,
      activity: false,
      mutual: false,
      submit: false
    });

    const { useSubmitStore } = await import('../src/stores/submit.js');
    const { useMutualStore } = await import('../src/stores/mutual.js');
    const { useBackofficeStore } = await import('../src/stores/backoffice.js');
    const { useTourStore } = await import('../src/stores/tour.js');

    const submit = useSubmitStore();
    const mutual = useMutualStore();
    const backoffice = useBackofficeStore();
    const tour = useTourStore();

    expect(submit.getSubmitApi()).toBeNull();
    expect(submit.getBatchPanelApi()).toBeNull();
    expect(mutual.getMutualPanelApi()).toBeNull();
    expect(gates.getUiActivitySync()).toBeNull();
    expect(gates.getUiMutualSync()).toBeNull();
    expect(backoffice.getClassAwayAdminApi()).toBeNull();

    // 未載入重模組前，DAC() 回 null、純狀態判定與 FeeUtils 常量仍可用
    expect(tour.DAC()).toBeNull();
    expect(tour.QUOTA_DEDUCT_FEE).toBe('扣額度');
    expect(tour.isQuotaDeductFee('扣額度')).toBe(true);
    expect(tour.isTimetableOnlyFee('僅課表呈現（不結算）')).toBe(true);
    expect(submit.compareWeekDatesA).toEqual([]);
    expect(submit.compareWeekDatesB).toEqual([]);
    expect(submit.isBatchMatchFlow).toBe(false);
    expect(submit.batchAssignedCount).toBe(0);
    expect(submit.groupBatchSlotsBySub([
      { subTeacherEmail: 'sub@jcjh.edu.tw', subTeacherName: '王老師', period: 1 }
    ])).toHaveLength(1);
    expect(mutual.mutualCoverStats).toEqual({
      awayClasses: 0,
      rangeDays: 0,
      rangeLabel: '',
      demand: 0,
      leaveTeachers: 0,
      releasedSlots: 0,
      arranged: 0,
      remaining: 0,
      mutualDone: 0,
      publicDone: 0,
      drafted: 0,
      pendingSelected: 0,
      byLeaders: []
    });
  }, 30000);

  it('觸發 ensure* 非同步閘門後，對應模組就緒且 API 轉為可用', async () => {
    const gates = await import('../src/modules/activity-gates.js');
    const { useSubmitStore } = await import('../src/stores/submit.js');
    const { useMutualStore } = await import('../src/stores/mutual.js');
    const { useBackofficeStore } = await import('../src/stores/backoffice.js');
    const { useTourStore } = await import('../src/stores/tour.js');

    const submit = useSubmitStore();
    const mutual = useMutualStore();
    const backoffice = useBackofficeStore();
    const tour = useTourStore();

    const dacMod = await tour.ensureDAC();
    expect(dacMod).toBeTruthy();
    expect(tour.DAC()).toBe(dacMod);
    expect(gates.activityModulesReady.value.dac).toBe(true);

    const submitApi = await submit.ensureSubmitModule();
    expect(submitApi).toBeTruthy();
    expect(typeof submitApi.buildSubmitPayload).toBe('function');
    expect(submit.getSubmitApi()).toBe(submitApi);
    expect(gates.activityModulesReady.value.submit).toBe(true);

    const batchPanelApi = await submit.ensureBatchPanelModule();
    expect(batchPanelApi).toBeTruthy();
    expect(typeof batchPanelApi.toggleBatchSelectMode).toBe('function');
    expect(submit.getBatchPanelApi()).toBe(batchPanelApi);
    expect(gates.activityModulesReady.value.activity).toBe(true);

    const mutualApi = await mutual.ensureMutualPanelModule();
    expect(mutualApi).toBeTruthy();
    expect(typeof mutualApi.toggleMutualCover).toBe('function');
    expect(mutual.getMutualPanelApi()).toBe(mutualApi);
    expect(gates.getUiMutualSync()).toBeTruthy();
    expect(gates.activityModulesReady.value.mutual).toBe(true);

    const classAwayApi = await backoffice.ensureClassAwayAdminModule();
    expect(classAwayApi).toBeTruthy();
    expect(typeof classAwayApi.openAddClassAwayModal).toBe('function');
    expect(backoffice.getClassAwayAdminApi()).toBe(classAwayApi);
  }, 30000);
});
