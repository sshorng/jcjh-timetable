/**
 * error-report.js — 前端錯誤回報（fire-and-forget）。
 *
 * window.onerror＋unhandledrejection 捕捉 → 同訊息 1 分鐘去重＋單次載入上限 10 筆
 * → GAS logClientError（免 Token，未登入／啟動期亦可報）。回報器本身永不丟錯、
 * 傳送失敗靜默吞掉，不影響主流程。純函數可單測（見 tests/error-report-tests）。
 * 另有 installVueErrorHandler：把 Vue 渲染／生命週期錯誤（預設只進 console）
 * 也接進同一管線，並在訊息前綴元件名＋info（不動 GAS 欄位結構）。
 */
const MAX_PER_LOAD = 10;
const DEDUPE_WINDOW_MS = 60000;
const MAX_MESSAGE_LEN = 500;
const MAX_STACK_LEN = 2000;
const MAX_URL_LEN = 500;
const MAX_UA_LEN = 300;
const MAX_EMAIL_LEN = 120;

function capString(value, max) {
  var s = String(value == null ? '' : value);
  return s.length > max ? s.slice(0, max) : s;
}

function normalizeErrorEntry(input) {
  input = input || {};
  return {
    time: new Date().toISOString(),
    message: capString(input.message || 'unknown error', MAX_MESSAGE_LEN),
    stack: capString(input.stack || '', MAX_STACK_LEN),
    url: capString(input.url || '', MAX_URL_LEN),
    userAgent: capString(input.userAgent || '', MAX_UA_LEN),
    email: capString(input.email || '', MAX_EMAIL_LEN)
  };
}

function createErrorGate() {
  var sent = 0;
  var recent = [];
  return {
    shouldSend: function (entry, nowMs) {
      if (sent >= MAX_PER_LOAD) return false;
      var key = String((entry && entry.message) || '');
      var cutoff = nowMs - DEDUPE_WINDOW_MS;
      recent = recent.filter(function (r) { return r.time >= cutoff; });
      if (recent.some(function (r) { return r.key === key; })) return false;
      return true;
    },
    markSent: function (entry, nowMs) {
      sent += 1;
      recent.push({ key: String((entry && entry.message) || ''), time: nowMs });
    }
  };
}

function isAbortNoise(reason) {
  var name = String((reason && reason.name) || '');
  var msg = String((reason && (reason.message || reason)) || '');
  return name === 'AbortError' || /abort/i.test(msg);
}

function installErrorReporting(opts) {
  opts = opts || {};
  var getEmail = typeof opts.getEmail === 'function' ? opts.getEmail : function () { return ''; };
  var send = typeof opts.send === 'function' ? opts.send : function () { return Promise.resolve(false); };
  var gate = createErrorGate();
  function currentLocals() {
    var url = '';
    var ua = '';
    try {
      if (typeof window !== 'undefined' && window.location) url = window.location.href || '';
    } catch (eLoc) { /* ignore */ }
    try {
      if (typeof window !== 'undefined' && window.navigator) ua = window.navigator.userAgent || '';
    } catch (eUa) { /* ignore */ }
    return { url: url, ua: ua };
  }
  function report(message, stack) {
    try {
      var locals = currentLocals();
      var email = '';
      try { email = getEmail() || ''; } catch (eMail) { /* ignore */ }
      var entry = normalizeErrorEntry({ message: message, stack: stack, url: locals.url, userAgent: locals.ua, email: email });
      var now = Date.now();
      if (!gate.shouldSend(entry, now)) return;
      gate.markSent(entry, now);
      try {
        var r = send(entry);
        if (r && typeof r.catch === 'function') r.catch(function () {});
      } catch (eSend) { /* fire-and-forget */ }
    } catch (eAll) { /* 回報器本身永不丟錯 */ }
  }
  function onError(message, source, lineno, colno, error) {
    // 資源載入失敗（CSS／圖）只有 target 沒有 message：略過，避免洗版
    if (!message && !error) return false;
    report(String(message || (error && error.message) || 'unknown error'), error && error.stack);
    return false;
  }
  function onUnhandledRejection(ev) {
    var reason = ev && ev.reason;
    if (isAbortNoise(reason)) return;
    var msg = reason && (reason.message || reason);
    report(String(msg || 'unhandled rejection'), reason && reason.stack);
  }
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('error', function (ev) {
      if (!ev) return;
      onError(ev.message, ev.filename, ev.lineno, ev.colno, ev.error);
    });
    window.addEventListener('unhandledrejection', onUnhandledRejection);
  }
  return { report: report };
}

function describeVueInstance(instance) {
  try {
    const names = [];
    let cur = instance || null;
    for (let i = 0; i < 3 && cur; i++) {
      const t = cur.type || {};
      const proxyOpts = (cur.proxy && cur.proxy.$options) || {};
      const nm = t.name || t.__name || proxyOpts.name || proxyOpts.__name;
      names.push(nm || 'anonymous');
      cur = cur.parent || null;
    }
    return names.filter(Boolean).join(' > ');
  } catch (eDesc) { return ''; }
}

// 把 Vue 渲染／生命週期內的錯誤也接進同一條回報管線。
// 用法：在根元件 setup 內以 getCurrentInstance().appContext.app 取得 app 後呼叫。
// opts.getContext 可回傳額外字串（如當前景籤），一併寫進訊息前綴。
// 回報器本身永不丟錯；本函式亦同（全程 try/catch），且會串連既有的 errorHandler。
function installVueErrorHandler(app, report, opts) {
  opts = opts || {};
  try {
    if (!app || !app.config) return;
    const prev = app.config.errorHandler;
    const getContext = typeof opts.getContext === 'function' ? opts.getContext : function () { return ''; };
    app.config.errorHandler = function (err, instance, info) {
      try {
        let ctx = '';
        try { ctx = getContext() || ''; } catch (eCtx) { /* ignore */ }
        const tag = '[Vue:' + (describeVueInstance(instance) || 'unknown')
          + (info ? ' ' + info : '') + (ctx ? ' ' + ctx : '') + '] ';
        report(tag + String((err && err.message) || err), err && err.stack);
      } catch (eRep) { /* ignore */ }
      try {
        if (typeof prev === 'function') return prev.apply(this, arguments);
      } catch (ePrev) { /* ignore */ }
    };
  } catch (e) { /* ignore */ }
}

export { normalizeErrorEntry, createErrorGate, isAbortNoise, installErrorReporting, describeVueInstance, installVueErrorHandler };
