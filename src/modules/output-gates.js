/**
 * output-gates.js — 列印／匯出／報表 UI 模組的按需載入閘門（首屏不含，進管理頁籤或點列印／匯出才抓）。
 *
 * 背景：UiExport／UiPrint／UiReport（連同 print-helper、excel-io）合計約 160kB 來源，
 * 只在管理員頁籤、列印預覽、匯出按鈕觸發時用到；靜態 import 會把它們全塞進首屏主包。
 * 改 import() 後主包減肥；呼叫端一律經由 stores/output.js 的 ensureOutputModules()
 *（各 action 包裝器先 await 再委派；同步 render 路徑沿用既有 null-safe 回退）。
 *
 * 分包契約：本檔只能被「靜態」引用（stores/output、ui-report、stores/interaction、
 * stores/timetable 讀 outputModulesReady），動態的 import() 一律寫在這裡，
 * Rollup 才能把三個 UI 模組切成各自的 chunk。若讓別的檔案動態 import 本檔、
 * 又有人靜態 import 本檔，Rollup 會退回警告
 * 「dynamic import will not move module into another chunk」，分包就會失效。
 */
import { ref } from 'vue';
import { notifyChunkLoadFailed } from './vendor-libs.js';

// 管理員 UI 模組是否已載入：同步 render 委派（accountingPlanOptions／
// filteredSchoolExportTeachers／monthlyReportTotals 鏈）在載入完成後重算用。
const outputModulesReady = ref(false);

const _cache = {};
function _cached(key, load) {
  if (!_cache[key]) {
    _cache[key] = load().catch((e) => { _cache[key] = null; notifyChunkLoadFailed(); throw e; });
  }
  return _cache[key];
}

function ensureUiExportModule() {
  return _cached('uiExport', () => import('./ui-export.js').then((m) => m.UiExport));
}

function ensureUiPrintModule() {
  return _cached('uiPrint', () => import('./ui-print.js').then((m) => m.UiPrint));
}

function ensureUiReportModule() {
  return _cached('uiReport', () => import('./ui-report.js').then((m) => m.UiReport));
}

export { ensureUiExportModule, ensureUiPrintModule, ensureUiReportModule, outputModulesReady };
