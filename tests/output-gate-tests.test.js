import { describe, expect, test } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

// 2.0b：output-gates 迴歸鎖定。
// 注意：模組級 holder（UiExport 等）跨同檔測試共用，故先測未載入、後測已載入，順序即契約。
async function setupStores() {
  setActivePinia(createPinia());
  const output = await import('../src/stores/output.js');
  const data = await import('../src/stores/data.js');
  return { useOutputStore: output.useOutputStore, useDataStore: data.useDataStore };
}

describe('output 閘門：未載入行為', () => {
  test('三 api 回 null，render 委派回退且不丟錯', async () => {
    const { useOutputStore, useDataStore } = await setupStores();
    const out = useOutputStore();
    expect(out.getExportApi()).toBeNull();
    expect(out.getReportApi()).toBeNull();
    expect(out.getPrintApi()).toBeNull();
    // data store render 委派：空物件回退（setup store 自動解包，直接取值）
    expect(useDataStore().monthlyReportTotals).toEqual({});
    // 內聯查詢：免 ensure 即可同步回答
    expect(out.isSchoolExportTeacherSelected('teacher@school.edu.tw')).toBe(false);
  }, 30000);
});

describe('output 閘門：載入後行為', () => {
  test('ensure 後三 api 就緒，period8 鏈打通', async () => {
    const { useOutputStore, useDataStore } = await setupStores();
    const out = useOutputStore();
    await out.ensureOutputModules();
    expect(out.getExportApi()).toBeTruthy();
    expect(out.getReportApi()).toBeTruthy();
    expect(out.getPrintApi()).toBeTruthy();
    const { outputModulesReady } = await import('../src/modules/output-gates.js');
    expect(outputModulesReady.value).toBe(true);
    // period8 鏈：report → export ensureBillingReady → billing 動載 → period8Ready
    await out.ensurePeriod8Ready();
    expect(useDataStore().period8Ready).toBe(true);
  }, 30000);

  test('月報排程可叫可取消，不丟錯', async () => {
    const { useOutputStore } = await setupStores();
    const out = useOutputStore();
    await out.ensureOutputModules();
    await out.scheduleMonthlyReportCalculation();
    out.cancelScheduledMonthlyReport();
  }, 30000);
});
