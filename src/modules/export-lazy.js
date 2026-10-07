/**
 * export-lazy.js — 重匯出 payload 的按需載入（首屏不含，點匯出才抓）。
 *
 * 背景：export-accounting／invigilation／activity-cover／period8／school-timetable
 * 合計約 6k 行，只在匯出按鈕觸發時用到；改 import() 後主包減肥。呼叫端一律經由
 * 各模块既有的 ensure*Ready gate（ui-report 內實作，兼做 JSZip／ExcelJS／DAC 檢查）。
 */
import { notifyChunkLoadFailed } from './vendor-libs.js';
const _cache = {};
function _cached(key, load) {
  if (!_cache[key]) {
    _cache[key] = load().catch((e) => { _cache[key] = null; notifyChunkLoadFailed(); throw e; });
  }
  return _cache[key];
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

export { ensureActivityCover, ensureInvigilation, ensureAccounting, ensurePeriod8, ensureSchoolTimetable };
