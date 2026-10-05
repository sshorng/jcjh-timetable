/**
 * vendor-libs.js — 第三方庫懶載（ExcelJS／JSZip／XLSX）。
 *
 * 取代 v1 的 CDN script＋window.ensure* 懶載：npm 包＋import() 動態載入，
 * 首屏 bundle 不含它們，用到匯出時才抓。載入後掛到 globalThis，
 * 既有 `window.ExcelJS || typeof ExcelJS`／`root.ExcelJS` 守衛無需改動。
 * 版本與 v1 CDN 一致（exceljs@4.4.0、jszip@3.10.1、xlsx@0.18.5，見 package.json）。
 */
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
    }).catch((e) => { _excelP = null; throw e; });
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
    }).catch((e) => { _zipP = null; throw e; });
  }
  return _zipP;
}

let _xlsxP = null;
async function ensureXlsx() {
  if (typeof globalThis !== 'undefined' && globalThis.XLSX) return globalThis.XLSX;
  if (typeof window !== 'undefined' && window.XLSX) return window.XLSX;
  if (!_xlsxP) {
    _xlsxP = import('xlsx').then((m) => {
      const lib = (m && m.default) || m;
      setGlobal('XLSX', lib);
      return lib;
    }).catch((e) => { _xlsxP = null; throw e; });
  }
  return _xlsxP;
}

export { ensureExcelJS, ensureJSZip, ensureXlsx };
