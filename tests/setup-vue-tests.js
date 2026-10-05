#!/usr/bin/env node
'use strict';

/**
 * 真實 Vue setup 執行測試（2A 拆分的安全網第四層）
 *
 * 背景：smoke 的 watch/computed 是 noop stub，測不到「watch 註冊期求值」
 * 打到 setup 後段才宣告的依賴（TDZ）。本測試用真實 Vue 跑完整 setup()：
 * watch 註冊會立即求值 getter，任何 setup 期求值 hazard 直接炸。
 * 另含 _setupReady 閘門驗證：setup 期求值應拿 fallback，不應拋錯。
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
let Vue = null;
const candidates = [
  'C:\\Users\\sshor\\AppData\\Local\\Temp\\opencode\\e2e\\node_modules\\vue',
  path.join(root, 'node_modules', 'vue'),
];
for (const c of candidates) {
  try {
    Vue = require(c);
    break;
  } catch (e) { /* next */ }
}
if (!Vue) {
  console.log('SKIP（找不到 vue，跑 npm i -D vue@3.5.16 後再測）');
  process.exit(0);
}

const captured = { setup: null, mounted: [] };
function makeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}
const nullEl = () => ({ classList: { add() {}, remove() {}, contains() { return false; } }, appendChild() {}, setAttribute() {}, getAttribute() { return null; }, addEventListener() {}, querySelectorAll: () => [], style: {} });
const context = {
  Vue: {
    createApp(opts) {
      captured.setup = opts.setup;
      return { directive() {}, component() {}, mount() {}, config: {} };
    },
    ref: Vue.ref, computed: Vue.computed, watch: Vue.watch,
    onMounted(fn) { captured.mounted.push(fn); },
    nextTick: Vue.nextTick,
  },
  window: { location: { origin: 'https://school.example', pathname: '/index.html', search: '' }, alert: () => {} },
  document: { querySelectorAll: () => [], getElementById: () => null, createElement: () => nullEl(), addEventListener: () => {} },
  alert: () => {}, localStorage: makeStorage(), sessionStorage: makeStorage(),
  console: { log: () => {}, warn: () => {}, error: () => {}, info: () => {} },
  Date, Math, JSON, Object, String, Number, Array, Boolean, RegExp, Error, Map, Set, WeakMap, Promise, parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent, setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {}, atob: (s) => Buffer.from(String(s), 'base64').toString('binary'), btoa: (s) => Buffer.from(String(s), 'binary').toString('base64'), URL, Blob,
};
vm.createContext(context);
const DEPS = ['name-key-contract.js', 'field-map.js', 'date-utils.js', 'gas-api.js', 'domain-school-swap.js', 'domain-schedule.js', 'domain-triangle.js', 'domain-match.js', 'domain-class-away.js', 'fee-utils.js', 'domain-billing.js', 'domain-activity-cover.js', 'ui-activity.js', 'ui-mutual.js', 'ui-request.js', 'ui-same-period-swap.js', 'ui-timetable.js', 'ui-approval.js', 'ui-admin.js', 'ui-line-template.js', 'ui-list-helpers.js', 'ui-calendar.js', 'ui-style.js', 'ui-history.js', 'ui-export.js', 'ui-classview.js', 'ui-submit.js', 'ui-data.js', 'ui-backoffice.js', 'ui-match.js', 'ui-report.js', 'ui-print.js', 'ui-interaction.js', 'ui-homeroom.js', 'ui-auth.js', 'ui-proxy.js', 'ui-schedule.js', 'template-buffer.js', 'app-shell-utils.js'];
for (const f of DEPS) vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), context, { filename: f });
vm.runInContext(fs.readFileSync(path.join(root, 'app.js'), 'utf8'), context, { filename: 'app.js' });

// 真實 Vue 下執行 setup：watch 註冊期求值、immediate 回調都會跑；TDZ 會直接拋出
let exposed = null;
try {
  exposed = captured.setup();
} catch (e) {
  assert.fail('setup 在真實 Vue 下拋錯：' + (e && e.message));
}
assert.ok(exposed && typeof exposed === 'object', 'setup 必須回傳綁定物件');
assert.ok(Object.keys(exposed).length >= 700, '綁定鍵應 700+');
// _setupReady 就緒後 wrapper 應為 live（非 fallback）：teachers 為空時 filteredTeachers 為 []，屬正常 live 值
assert.ok(Array.isArray(exposed.filteredTeachers.value), 'filteredTeachers 應可求值');

console.log('real-vue setup tests PASS（setup 完整執行，watch 求值無 TDZ）');
