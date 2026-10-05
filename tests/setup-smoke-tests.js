#!/usr/bin/env node
'use strict';

/**
 * setup 煙霧測試（2A/五檔拆分的接線安全網）
 *
 * 在 Node/vm 裡 stub Vue＋瀏覽器全域，實際執行 app.js setup()：
 *  - 會炸的錯誤型別：缺依賴（ReferenceError）、TDZ、解構對象缺失（TypeError）
 *  - 不驗邏輯正確性（純函式由既有合約測試覆蓋）
 *
 * 用法：node tests/setup-smoke-tests.js
 * 五檔拆分期間：每次搬移後必跑；基線：setup 不拋錯＋回傳 200+ 綁定鍵。
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

// ---- Vue stub（語義貼近：ref 持值、computed 懶求值、onMounted 只登記不執行） ----
function makeVueStub(captured) {
  const ref = (v) => ({ value: v });
  const computed = (fn) => {
    const o = {};
    Object.defineProperty(o, 'value', { get: () => fn(), enumerable: true });
    return o;
  };
  return {
    createApp(opts) {
      captured.setup = opts.setup;
      return { directive() {}, component() {}, mount() {}, config: {} };
    },
    ref, computed,
    watch() { return () => {}; },
    onMounted(fn) { captured.mounted.push(fn); },
    nextTick(fn) { return fn ? Promise.resolve().then(fn) : Promise.resolve(); }
  };
}

// ---- storage shim ----
function makeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(String(k)) ? m.get(String(k)) : null),
    setItem: (k, v) => { m.set(String(k), String(v)); },
    removeItem: (k) => { m.delete(String(k)); },
    clear: () => m.clear()
  };
}

function buildContext() {
  const captured = { setup: null, mounted: [] };
  const context = {
    Vue: makeVueStub(captured),
    window: {
      location: { origin: 'https://school.example', pathname: '/index.html', search: '' }
    },
    localStorage: makeStorage(),
    sessionStorage: makeStorage(),
    console: { log: () => {}, warn: () => {}, error: () => {}, info: () => {} },
    Date, Math, JSON, Object, String, Number, Array, Boolean, RegExp, Error,
    Map, Set, WeakMap, Promise, parseInt, parseFloat, isNaN, isFinite,
    encodeURIComponent, decodeURIComponent,
    setTimeout: () => 0, clearTimeout: () => {},
    setInterval: () => 0, clearInterval: () => {},
    atob: (s) => Buffer.from(String(s), 'base64').toString('binary'),
    btoa: (s) => Buffer.from(String(s), 'binary').toString('base64'),
    URL, Blob
  };
  return { context, captured };
}

// index.html defer 順序（app.js 除外，另行處理 ensure 懶載檔不需預載）
const DEPS = [
  'name-key-contract.js',
  'field-map.js',
  'date-utils.js',
  'gas-api.js',
  'domain-school-swap.js',
  'domain-schedule.js',
  'domain-triangle.js',
  'domain-match.js',
  'domain-class-away.js',
  'fee-utils.js',
  'domain-billing.js',
  'domain-activity-cover.js',
  'ui-activity.js',
  'ui-mutual.js',
  'ui-request.js',
  'ui-same-period-swap.js',
  'ui-timetable.js',
  'ui-approval.js',
  'ui-admin.js',
  'ui-line-template.js',
  'ui-list-helpers.js',
  'ui-calendar.js',
  'ui-style.js',
  'ui-history.js',
  'ui-export.js',
  'ui-classview.js',
  'ui-submit.js',
  'ui-data.js',
  'ui-backoffice.js',
  'ui-match.js',
  'ui-report.js',
  'ui-print.js',
  'ui-interaction.js',
  'ui-homeroom.js',
  'ui-auth.js',
  'ui-proxy.js',
  'ui-schedule.js',
  'ui-sync.js',
  'ui-schoolswap.js',
  'ui-tour.js',
  'template-buffer.js',
  'app-shell-utils.js'
];

function loadAll(context) {
  vm.createContext(context);
  for (const f of DEPS) {
    vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), context, { filename: f });
  }
  vm.runInContext(fs.readFileSync(path.join(root, 'app.js'), 'utf8'), context, { filename: 'app.js' });
}

function main() {
  const { context, captured } = buildContext();
  loadAll(context);
  assert.ok(typeof captured.setup === 'function', 'setup 必須被 createApp 捕獲');

  // Ui* 模組就緒（eager＋懶載前置：harness 全預載，驗接線不斷）
  for (const k of ['UiBatchPanel', 'UiBatchSubmit', 'UiClassAwayAdmin', 'UiMutualBridge',
    'UiMutualPanelState', 'UiMutualSubmit', 'UiLineTemplate', 'UiListHelpers', 'UiCalendar',
    'UiStyle', 'UiHistory', 'UiExport', 'UiClassView']) {
    assert.ok(context.window[k], `window.${k} 必須存在`);
  }

  // 執行 setup：缺依賴／TDZ／解構錯誤會在此拋出
  const exposed = captured.setup();
  assert.ok(exposed && typeof exposed === 'object', 'setup 必須回傳綁定物件');
  const keys = Object.keys(exposed);
  assert.ok(keys.length >= 200, `綁定鍵應 200+（實際 ${keys.length}）`);
  for (const k of ['user', 'loading', 'currentSemester', 'submitAllMutualDrafts', 'manualRefreshData',
    'teachersList', 'allSchedules', 'loadHistoryMonth', 'checkMobile', 'semestersList']) {
    assert.ok(k in exposed, `必須暴露 ${k}`);
  }
  console.log(`setup smoke tests PASS（${keys.length} 綁定鍵，onMounted 回調 ${captured.mounted.length} 個未執行）`);
}

main();
