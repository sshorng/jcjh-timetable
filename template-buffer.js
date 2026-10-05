/**
 * 學校調代課線上系統 - 範本載入共用模組 (template-buffer.js)
 *
 * 四支匯出（accounting／period8／invigilation／activity-cover）原本各有一份
 * loadTemplateBuffer 拷貝（Date.now()  bust＋no-cache，每次重抓數 MB）。
 * 此檔為唯一實作：版本號快取＋同頁記憶體共用＋失敗自動失效。
 *
 * 載入順序：index.html ensureTemplateBuffer() 優先於各 ensureExport*；
 * Node 測試若只測純函式，可不載入（load() 呼叫期才用 fetch）。
 */
window.TemplateBuffer = (function () {
  'use strict';

  // 範本異動時才 bump；讓瀏覽器／CDN 可快取範本檔
  var TEMPLATE_VERSION = '20261003';
  // 同一頁面內同一 URL 共用一次抓取
  var _cache = {};

  function versionedUrl(url) {
    var u = String(url || '');
    return u + (u.indexOf('?') >= 0 ? '&' : '?') + 'v=' + TEMPLATE_VERSION;
  }

  /**
   * 載入範本並回傳 ArrayBuffer 拷貝（呼叫端可安心 mutate／傳給 ExcelJS）。
   * url：相對路徑如 'templates/accounting-template.xlsx'
   * errorLabel：失敗訊息前綴，如 '無法載入會計範本'
   */
  function load(url, errorLabel) {
    var key = String(url || '');
    if (!key) return Promise.reject(new Error((errorLabel || '無法載入範本') + '（缺少範本路徑）'));
    if (!_cache[key]) {
      _cache[key] = Promise.resolve()
        .then(function () {
          var fetchFn = typeof fetch === 'function' ? fetch : null;
          if (!fetchFn) throw new Error('瀏覽器不支援 fetch，無法載入範本');
          return fetchFn(versionedUrl(key));
        })
        .then(function (response) {
          if (!response.ok) {
            throw new Error((errorLabel || '無法載入範本') + '（HTTP ' + response.status + '）');
          }
          return response.arrayBuffer();
        })
        .catch(function (error) {
          // 失敗時刪快取，允許下一次匯出重新嘗試
          delete _cache[key];
          throw error;
        });
    }
    return _cache[key].then(function (buffer) {
      return buffer && buffer.slice ? buffer.slice(0) : buffer;
    });
  }

  /** 範本更新後呼叫；不帶參數則清空全部 */
  function clear(url) {
    if (url) delete _cache[String(url)];
    else _cache = {};
  }

  return {
    TEMPLATE_VERSION: TEMPLATE_VERSION,
    versionedUrl: versionedUrl,
    load: load,
    clear: clear
  };
})();
