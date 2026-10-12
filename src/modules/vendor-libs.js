/**
 * vendor-libs.js — 第三方庫懶載（ExcelJS／JSZip）。
 *
 * 取代 v1 的 CDN script＋window.ensure* 懶載：npm 包＋import() 動態載入，
 * 首屏 bundle 不含它們，用到匯出時才抓。載入後掛到 globalThis，
 * 既有 `window.ExcelJS || typeof ExcelJS`／`root.ExcelJS` 守衛無需改動。
 * XLSX（SheetJS）已因 HIGH 漏洞移除，讀寫統一走 ExcelJS（見 excel-io.js）。
 * 版本見 package.json（exceljs@4.4.0、jszip@3.10.1）。
 */
import { showToast } from '../ui/toast.js';
/**
 * 分包載入失敗提示：主因通常是部署了新版、舊分頁還在跑舊主包
 * （舊 hash 分包已被新部署清除 → 404）。新版會嘗試自動重載一次
 * （sessionStorage 守衛防迴圈）；若仍失敗則顯示真實錯誤摘要，
 * 方便回報（F12 Console 有完整堆疊）。
 * @param {any} err 原始錯誤（動態 import 拒絕原因）
 * @param {string} label 哪個分包（例 exceljs / uiExport / accounting）
 */
function notifyChunkLoadFailed(err, label) {
  try {
    console.error('[chunk-load-failed]' + (label ? ' ' + label : ''), err);
  } catch (e) { /* ignore */ }
  try {
    const msg = String((err && err.message) || err || '');
    const isStaleLike = /Failed to fetch|dynamically imported module|Loading chunk|ChunkLoadError|Importing a module script failed|404|Failed to load module/i.test(msg);
    // 無訊息的 TypeError（常見於舊 hash 404 被轉成 fetch 失敗）也視為可重載
    const maybeStale = isStaleLike || !msg || /TypeError/i.test(msg);
    const KEY = 'jcjh_chunk_autoreload_v1';
    let reloaded = null;
    try { reloaded = sessionStorage.getItem(KEY); } catch (e) { reloaded = '1'; }
    try {
      const ts = parseInt(reloaded || '', 10);
      if (ts && Date.now() - ts > 10 * 60 * 1000) reloaded = null;
    } catch (e) { /* ignore */ }
    if (maybeStale && !reloaded) {
      try { sessionStorage.setItem(KEY, String(Date.now())); } catch (e) { /* ignore */ }
      showToast('偵測到新版本，正在自動重新載入，好了之後請重試剛才的動作…', 'info', 4000);
      setTimeout(() => { try { location.reload(); } catch (e) { /* ignore */ } }, 900);
      return;
    }
    const detail = msg ? msg.slice(0, 160) : '未知錯誤';
    const where = label ? '（' + label + '）' : '';
    showToast('功能模組載入失敗' + where + '：' + detail + '。請按 Ctrl+F5 重新整理後再試，若仍失敗請截圖 F12 Console 回報', 'error', 8000);
  } catch (e) {
    try { showToast('功能模組載入失敗，請按 Ctrl+F5 重新整理後再試', 'error', 6000); } catch (_) { /* ignore */ }
  }
}
function setGlobal(name, lib) {
  try {
    if (typeof globalThis !== 'undefined' && lib) globalThis[name] = lib;
  } catch (e) { /* ignore */ }
  try {
    if (typeof window !== 'undefined' && lib && !window[name]) window[name] = lib;
  } catch (e) { /* ignore */ }
}

let _excelP = null;
async function ensureExcelJS() {
  if (typeof globalThis !== 'undefined' && globalThis.ExcelJS) return globalThis.ExcelJS;
  if (typeof window !== 'undefined' && window.ExcelJS) return window.ExcelJS;
  if (!_excelP) {
    _excelP = import('exceljs').then((m) => {
      const lib = (m && m.default) || m;
      setGlobal('ExcelJS', lib);
      return lib;
    }).catch((e) => { _excelP = null; notifyChunkLoadFailed(e, 'exceljs'); throw e; });
  }
  return _excelP;
}

let _zipP = null;
async function ensureJSZip() {
  if (typeof globalThis !== 'undefined' && globalThis.JSZip) return globalThis.JSZip;
  if (typeof window !== 'undefined' && window.JSZip) return window.JSZip;
  if (!_zipP) {
    _zipP = import('jszip').then((m) => {
      const lib = (m && m.default) || m;
      setGlobal('JSZip', lib);
      return lib;
    }).catch((e) => { _zipP = null; notifyChunkLoadFailed(e, 'jszip'); throw e; });
  }
  return _zipP;
}

export { ensureExcelJS, ensureJSZip, notifyChunkLoadFailed };
