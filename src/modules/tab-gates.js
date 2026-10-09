/**
 * tab-gates.js — 非首屏 tab／動作模組的按需載入閘門（首屏 timetable 不含）。
 *
 * 背景：UiCalendar／UiHistory／UiMatch／UiHomeroom／UiTour／UiApproval 只在特定頁籤
 *（records／pending／admin）或動作（加入日曆、媒合抽屜、送審）觸發時用到；
 * 靜態 import 會把它們全塞進首屏主包。改 import() 後主包減肥。
 *
 * 呼叫端一律經由各 store 的 ensureXxx()（action 包裝器先 await 再委派；
 * 同步 render 路徑沿用既有 null-safe 回退＋xReady 重算依賴）。
 *
 * 分包契約：本檔只能被「靜態」引用，動態的 import() 一律寫在這裡，
 * Rollup 才能把各模組切成各自的 chunk。若讓別的檔案動態 import 本檔、
 * 又有人靜態 import 本檔，Rollup 會退回警告
 * 「dynamic import will not move module into another chunk」，分包就會失效。
 */
import { ref } from 'vue';
import { notifyChunkLoadFailed } from './vendor-libs.js';

// 各 tab 模組是否已載入：同步 render 委派在載入完成後重算用。
const tabModulesReady = ref({});

const _cache = {};
function _cached(key, load) {
  if (!_cache[key]) {
    _cache[key] = load()
      .then((m) => {
        tabModulesReady.value = Object.assign({}, tabModulesReady.value, { [key]: true });
        return m;
      })
      .catch((e) => { _cache[key] = null; notifyChunkLoadFailed(); throw e; });
  }
  return _cache[key];
}

function ensureUiCalendarModule() {
  return _cached('calendar', () => import('./ui-calendar.js').then((m) => m.UiCalendar));
}

function ensureUiHistoryModule() {
  return _cached('history', () => import('./ui-history.js').then((m) => m.UiHistory));
}

function ensureUiMatchModule() {
  return _cached('match', () => import('./ui-match.js').then((m) => m.UiMatch));
}

function ensureUiHomeroomModule() {
  return _cached('homeroom', () => import('./ui-homeroom.js').then((m) => m.UiHomeroom));
}

function ensureUiTourModule() {
  return _cached('tour', () => import('./ui-tour.js').then((m) => m.UiTour));
}

function ensureUiApprovalModule() {
  return _cached('approval', () => import('./ui-approval.js').then((m) => m.UiApproval));
}

function ensureUiSyncModule() {
  return _cached('sync', () => import('./ui-sync.js').then((m) => m.UiSync));
}

export { ensureUiCalendarModule, ensureUiHistoryModule, ensureUiMatchModule, ensureUiHomeroomModule, ensureUiTourModule, ensureUiApprovalModule, ensureUiSyncModule, tabModulesReady };
