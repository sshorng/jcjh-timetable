/**
 * export-gates.js — 重匯出 payload 的按需載入閘門（首屏不含，點匯出才抓）。
 *
 * 背景：export-accounting／invigilation／activity-cover／period8／school-timetable
 * 合計約 6k 行，只在匯出按鈕觸發時用到；改 import() 後主包減肥。呼叫端一律經由
 * 各模块既有的 ensure*Ready gate（ui-report 內實作，兼做 JSZip／ExcelJS／DAC 檢查）。
 *
 * 分包契約：本檔只能被「靜態」引用（ui-export／ui-report／stores/data），
 * 動態的 import() 一律寫在這裡，Rollup 才能把五個匯出模組切成各自的 chunk。
 * 若讓別的檔案動態 import 本檔、又有人靜態 import 本檔，Rollup 會退回警告
 * 「dynamic import will not move module into another chunk」，分包就會失效。
 */
import { notifyChunkLoadFailed } from './vendor-libs.js';

const _cache = {};
function _cached(key, load) {
  if (!_cache[key]) {
    _cache[key] = load().catch((e) => { _cache[key] = null; notifyChunkLoadFailed(); throw e; });
  }
  return _cache[key];
}

// domain-billing（2,363 行）只在月報／第8節／匯出用到：教師首屏永遠不碰。
// 月報自動計算只在 admin＋billing 頁籤觸發（data.js initImmediateData2），
// 故可移出主包；同步 computed（period8RosterData／monthlyReportTotals）經
// getDomainBillingSync() 取，未載入時回空（既有 !DomainBilling 守衛語義不變）。
let _domainBillingSync = null;
function ensureDomainBilling() {
  return _cached('domainBilling', () => import('../domain/domain-billing.js').then((m) => {
    _domainBillingSync = m.default || m.DomainBilling;
    return _domainBillingSync;
  }));
}
function getDomainBillingSync() {
  return _domainBillingSync;
}

function ensureActivityCover() {
  return _cached('activityCover', () => import('./export-activity-cover.js').then((m) => m.ExportActivityCover));
}

function ensureInvigilation() {
  return _cached('invigilation', () => import('./export-invigilation-recovered.js').then((m) => m.ExportInvigilation));
}

function ensureAccounting() {
  return _cached('accounting', () => import('./export-accounting.js').then((m) => m.default || m.ExportAccounting));
}

function ensurePeriod8() {
  return _cached('period8', () => import('./export-period8-accounting.js').then((m) => m.default || m.ExportPeriod8Accounting));
}

function ensureSchoolTimetable() {
  return _cached('schoolTimetable', () => import('./export-school-timetable.js').then((m) => m.ExportSchoolTimetable));
}

export { ensureActivityCover, ensureInvigilation, ensureAccounting, ensurePeriod8, ensureSchoolTimetable, ensureDomainBilling, getDomainBillingSync };
