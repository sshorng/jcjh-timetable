// @vitest-environment happy-dom
import assert from 'node:assert/strict';
import { test } from 'vitest';
import { UiExport } from '../src/modules/ui-export.js';

// 監考表檢查未通過時不再硬擋：先跳通知列出缺少／重複，再給「確認＝強制匯出／取消＝回去補排」。

function ref(value) { return { value }; }

// happy-dom 沒有 alert／createObjectURL，補上以免 toast 與下載中斷測試
if (typeof window.alert !== 'function') window.alert = () => {};
if (typeof URL.createObjectURL !== 'function') URL.createObjectURL = () => 'blob:test';
if (typeof URL.revokeObjectURL !== 'function') URL.revokeObjectURL = () => {};

function makeDeps(fakeModule) {
  return {
    isAdmin: ref(true),
    schoolExportStart: ref('2026-12-02'),
    schoolExportEnd: ref('2026-12-03'),
    buildDefaultInvigilationTitle: () => '114-1 第二次段考監考表',
    ensureInvigilationExportReady: async () => fakeModule,
    ensureInvigilationClassReady: async () => fakeModule,
    schoolExportSelectedEmails: ref(['a@school']),
    teachersList: ref([{ email: 'a@school', name: '甲師' }]),
    allSchedules: ref([]),
    classList: ref(['701']),
    requestsList: ref([]),
    classAwayEvents: ref([]),
    fetchMutualQuotaLedger: async () => ({ success: true, ledger: [], historyComplete: true, yearScope: true }),
    invigilationExportTitle: ref(''),
    semesterEndDate: ref('2027-01-20'),
    loading: ref(false),
    loadingMessage: ref('')
  };
}

const FAILED = {
  ok: false,
  needsCoverageConfirm: true,
  error: '監考表（班級版）班級檢查未通過。　缺少：12-02第6節 701'
};

function okResult() {
  return {
    ok: true,
    fileName: 'invigilation-class.xlsx',
    classCount: 22,
    dayCount: 2,
    copyCount: 1,
    teacherCount: 1,
    changedMarked: 0,
    patrolCount: 0,
    warning: '已強制匯出：監考表仍有 1 組缺少、0 組重複未處理，請自行核對。'
  };
}

function withConfirm(answers, fn) {
  const original = window.confirm;
  const asked = [];
  window.confirm = (msg) => {
    asked.push(String(msg || ''));
    return answers.length ? answers.shift() : false;
  };
  return Promise.resolve()
    .then(fn)
    .finally(() => { window.confirm = original; });
}

test('班級檢查未通過：按「確認」可強制匯出，並把缺漏寫進提示', async () => {
  const calls = [];
  const fakeModule = {
    exportWorkbook: async (opts) => {
      calls.push(opts);
      return opts.forceCoverage ? okResult() : FAILED;
    }
  };
  const api = UiExport.create(makeDeps(fakeModule));
  await withConfirm([true], () => api.exportInvigilationClassWorkbook());

  assert.equal(calls.length, 2, '先試一般匯出，確認後再跑一次強制匯出');
  assert.equal(calls[0].forceCoverage, undefined, '第一次不可偷偷強制');
  assert.equal(calls[1].forceCoverage, true, '第二次要帶 forceCoverage');
});

test('班級檢查未通過：按「取消」就停手，不再匯出', async () => {
  const calls = [];
  const fakeModule = {
    exportWorkbook: async (opts) => {
      calls.push(opts);
      return FAILED;
    }
  };
  const api = UiExport.create(makeDeps(fakeModule));
  await withConfirm([false], () => api.exportInvigilationClassWorkbook());

  assert.equal(calls.length, 1, '取消後不應再呼叫匯出');
});

test('教師版監考表：標題確認後若班級檢查未通過，仍可選擇強制匯出', async () => {
  const calls = [];
  const fakeModule = {
    exportWorkbook: async (opts) => {
      calls.push(opts);
      return opts.forceCoverage ? okResult() : FAILED;
    }
  };
  const api = UiExport.create(makeDeps(fakeModule));
  // 第一個 confirm 是標題輸入，第二個是班級檢查未通過的強制匯出詢問
  await withConfirm([true, true], () => api.exportInvigilationWorkbook());

  assert.equal(calls.length, 2);
  assert.equal(calls[1].forceCoverage, true);
  assert.ok(calls[1].title, '強制匯出仍要帶原本確認過的標題');
});

test('沒有 needsCoverageConfirm 時不會多問', async () => {
  const calls = [];
  const fakeModule = {
    exportWorkbook: async (opts) => {
      calls.push(opts);
      return okResult();
    }
  };
  const api = UiExport.create(makeDeps(fakeModule));
  await withConfirm([], () => api.exportInvigilationClassWorkbook());

  assert.equal(calls.length, 1);
  assert.equal(calls[0].forceCoverage, undefined);
});
