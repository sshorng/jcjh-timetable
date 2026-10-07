/**
 * vendor-libs.js — 第三方庫懶載（ExcelJS／JSZip）。
 *
 * 取代 v1 的 CDN script＋window.ensure* 懶載：npm 包＋import() 動態載入，
 * 首屏 bundle 不含它們，用到匯出時才抓。載入後掛到 globalThis，
 * 既有 `window.ExcelJS || typeof ExcelJS`／`root.ExcelJS` 守衛無需改動。
 * XLSX（SheetJS）已因 HIGH 漏洞移除，讀寫統一走 ExcelJS（見 excel-io.js）。
 * 版本見 package.json（exceljs@4.4.0、jszip@3.10.1）。
 */
/**
 * 分包載入失敗提示：主因通常是部署了新版、舊分頁還在跑舊主包
 * （舊 hash 分包已被新部署清除 → 404）。導引用戶硬重新整理，而非重試。
 */
import { showToast } from '../ui/toast.js';
function notifyChunkLoadFailed() {
  try {
    showToast('功能模組載入失敗，可能是版本已更新，請按 Ctrl+F5 重新整理後再試', 'error', 6000);
  } catch (e) { /* 無 DOM 環境略過 */ }
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
    }).catch((e) => { _excelP = null; notifyChunkLoadFailed(); throw e; });
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
    }).catch((e) => { _zipP = null; notifyChunkLoadFailed(); throw e; });
  }
  return _zipP;
}

export { ensureExcelJS, ensureJSZip, notifyChunkLoadFailed };
