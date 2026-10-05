#!/usr/bin/env node
'use strict';

/**
 * Factory 作用域測試（2A 拆分的安全網第三層）
 *
 * 背景：曾發生五個 getXApi factory 被困在 clearMatchHoverDom 的 try 內，
 * node --check 照過、smoke 照過（setup 可執行但不呼叫 wrapper），實機才炸
 * ReferenceError。靜態檢查抓不到作用域陷阱，只能實際呼叫 wrapper。
 *
 * 作法：在 vm 跑 setup()，每座 factory 挑一個無 DOM／無網路的純函數呼叫，
 * 驗 factory 可達＋委派鏈通暢。
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const captured = { setup: null, mounted: [] };
function makeVueStub() {
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
function makeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}
const nullEl = () => ({
  classList: { add() {}, remove() {}, contains() { return false; } },
  appendChild() {}, setAttribute() {}, getAttribute() { return null; },
  addEventListener() {}, querySelectorAll: () => [], style: {},
});
const context = {
  Vue: makeVueStub(),
  window: { location: { origin: 'https://school.example', pathname: '/index.html', search: '' }, alert: () => {} },
  document: {
    querySelectorAll: () => [], getElementById: () => null,
    createElement: () => nullEl(), addEventListener: () => {},
  },
  alert: () => {},
  localStorage: makeStorage(), sessionStorage: makeStorage(),
  console: { log: () => {}, warn: () => {}, error: () => {}, info: () => {} },
  Date, Math, JSON, Object, String, Number, Array, Boolean, RegExp, Error,
  Map, Set, WeakMap, Promise, parseInt, parseFloat, isNaN, isFinite,
  encodeURIComponent, decodeURIComponent,
  setTimeout: () => 0, clearTimeout: () => {},
  setInterval: () => 0, clearInterval: () => {},
  atob: (s) => Buffer.from(String(s), 'base64').toString('binary'),
  btoa: (s) => Buffer.from(String(s), 'binary').toString('base64'),
  URL, Blob,
};
vm.createContext(context);
const DEPS = ['name-key-contract.js', 'field-map.js', 'date-utils.js', 'gas-api.js', 'domain-school-swap.js', 'domain-schedule.js', 'domain-triangle.js', 'domain-match.js', 'domain-class-away.js', 'fee-utils.js', 'domain-billing.js', 'domain-activity-cover.js', 'ui-activity.js', 'ui-mutual.js', 'ui-request.js', 'ui-same-period-swap.js', 'ui-timetable.js', 'ui-approval.js', 'ui-admin.js', 'ui-line-template.js', 'ui-list-helpers.js', 'ui-calendar.js', 'ui-style.js', 'ui-history.js', 'ui-export.js', 'ui-classview.js', 'ui-submit.js', 'ui-data.js', 'ui-backoffice.js', 'ui-match.js', 'template-buffer.js', 'app-shell-utils.js'];
for (const f of DEPS) vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), context, { filename: f });
vm.runInContext(fs.readFileSync(path.join(root, 'app.js'), 'utf8'), context, { filename: 'app.js' });
const exposed = captured.setup();

// 每座 factory 一次真實呼叫（純函數，無 DOM／無網路）
exposed.changeHistoryPage(1); // getBackofficeApi
assert.equal(typeof exposed.closeCompareModal, 'function');
exposed.closeCompareModal(); // getSubmitApi
exposed.loadMoreMatches(); // getMatchApi
exposed.saveClientSettings(); // getDataApi（經 showToast→alert 樁）
assert.equal(typeof exposed.filteredDevTeachers.value, 'object');

// 渲染路徑稽核：強制求值所有 ref/computed 綁定，缺 dep 會丟 ReferenceError
const refErrors = [];
const typeErrors = [];
// 注意：vm 內拋出的錯誤與外部 realm 不同 constructor，一律用 e.name 判斷
const isRefErr = (e) => e && (e.name === 'ReferenceError' || e instanceof ReferenceError);
for (const k of Object.keys(exposed)) {
  const v = exposed[k];
  if (typeof v === 'function') continue;
  if (v && typeof v === 'object' && 'value' in v) {
    try {
      void v.value;
    } catch (e) {
      if (isRefErr(e)) refErrors.push(k + ': ' + e.message);
      else typeErrors.push(k + ': ' + (e && e.constructor ? e.constructor.name : typeof e) + ' ' + (e && e.message));
    }
  }
}
assert.deepEqual(refErrors, [], '渲染路徑缺依賴（未登入）');
if (typeErrors.length) console.log('（參考）非 ReferenceError：' + typeErrors.slice(0, 10).join(' | '));

// 第二遍：模擬登入態（user＋基本資料），再求值全部綁定
exposed.user.value = { email: 'a@school.example', displayName: '陳小華' };
if (exposed.userRole) exposed.userRole.value = 'teacher';
if (exposed.teachersList) exposed.teachersList.value = [{ loginEmail: 'a@school.example', email: 'a@school.example', name: '陳小華', subject: '國文' }];
if (exposed.allSchedules) exposed.allSchedules.value = [];
if (exposed.requestsList) exposed.requestsList.value = [];
if (exposed.substitutionRecords) exposed.substitutionRecords.value = [];
if (exposed.currentSemester) exposed.currentSemester.value = '114-1';
const refErrors2 = [];
const typeErrors2 = [];
for (const k of Object.keys(exposed)) {
  const v = exposed[k];
  if (typeof v === 'function') continue;
  if (v && typeof v === 'object' && 'value' in v) {
    try {
      void v.value;
    } catch (e) {
      if (isRefErr(e)) refErrors2.push(k + ': ' + e.message);
      else typeErrors2.push(k + ': ' + (e && e.constructor ? e.constructor.name : typeof e) + ' ' + (e && e.message));
    }
  }
}
assert.deepEqual(refErrors2, [], '渲染路徑缺依賴（登入態）');
if (typeErrors2.length) console.log('（參考登入態）非 ReferenceError：' + typeErrors2.slice(0, 10).join(' | '));

console.log('factory scope tests PASS（4 座 factory 可達）');
