/**
 * 自 v1 gas-api.js 機械移植（port-modules.cjs）：
 * IIFE 掛載改 ESM export；body 與 v1 逐字一致。
 */
import FieldMap from '../domain/field-map.js';

/**
 * 學校調代課線上系統 - GAS API 客戶端 (gas-api.js)
 * JWT / Token 檢查 / 錯誤格式化 / callGasApi（讀寫皆 POST，Token 不進 URL）/ SWR 分鍵
 */
const GasApi = (() => {
  var APP_VERSION = '2026-09-04-calendar-new-tab';
  // 未取得明確網域設定時，前端也採 fail-closed；公開課表仍可免登入使用。
  var DEFAULT_ALLOWED_HD = [];
  var WRITE_ACTIONS = {
    submitRequest: 1, submitRequestBatch: 1, submitTriangleRequest: 1, respondToRequest: 1, respondToBatch: 1, respondTriangleRequest: 1,
    adminApprove: 1, adminReject: 1, adminApproveBatch: 1, adminRejectBatch: 1,
    cancelRequest: 1, withdrawRequest: 1, deleteSubstitutionRecord: 1,
    saveTeacher: 1, backupTeacherExpensePlans: 1, deleteTeacher: 1, importTeachersBatch: 1, updateMutualQuotas: 1,
    earnMutualQuotaFromActivity: 1,
    saveScheduleCell: 1, clearScheduleCell: 1, importSchedulesBatch: 1,
     saveSemester: 1, deleteSemester: 1, setDefaultSemester: 1,
     migrateNameKeySchema: 1, renameTeacherNameKey: 1,
    saveClassAwayEvent: 1, deleteClassAwayEvent: 1,
    saveSchoolSwap: 1, deleteSchoolSwap: 1,
    saveHistoryEdit: 1, saveHomeroomCoverTeacher: 1, saveManualHomeroomRecord: 1, deleteHomeroomRecord: 1, batchMarkPrinted: 1, saveMailSettings: 1, sendBatchNotices: 1
  };
  /** 只動申請／空堂對齊 → 只清 requests 分鍵，保留 meta／structure 快取 */
  var REQUEST_WRITE_ACTIONS = {
    submitRequest: 1, submitRequestBatch: 1, submitTriangleRequest: 1, respondToRequest: 1, respondToBatch: 1, respondTriangleRequest: 1,
    adminApprove: 1, adminReject: 1, adminApproveBatch: 1, adminRejectBatch: 1,
    cancelRequest: 1, withdrawRequest: 1, deleteSubstitutionRecord: 1,
    saveHistoryEdit: 1, saveHomeroomCoverTeacher: 1, batchMarkPrinted: 1, sendBatchNotices: 1
  };
  /** 課表／教師／學期結構變更 → 清全部分鍵 */
  var STRUCTURE_WRITE_ACTIONS = {
    saveTeacher: 1, backupTeacherExpensePlans: 1, deleteTeacher: 1, importTeachersBatch: 1, updateMutualQuotas: 1,
    earnMutualQuotaFromActivity: 1,
    saveScheduleCell: 1, clearScheduleCell: 1, importSchedulesBatch: 1,
     saveSemester: 1, deleteSemester: 1, setDefaultSemester: 1,
     migrateNameKeySchema: 1, renameTeacherNameKey: 1,
    saveClassAwayEvent: 1, deleteClassAwayEvent: 1, saveMailSettings: 1
    , saveSchoolSwap: 1, deleteSchoolSwap: 1
  };

  /** Phase 0 效能量測：?perf=1 或 localStorage jcjh_perf=1 時記錄每次 GAS 往返耗時 */
  var PERF_BUFFER_LIMIT = 120;
  var _perfRecords = [];
  function isPerfEnabled() {
    try {
      if (typeof window !== 'undefined' && window.location && /[?&]perf=1/.test(window.location.search || '')) return true;
      if (typeof localStorage !== 'undefined' && localStorage.getItem('jcjh_perf') === '1') return true;
    } catch (e) {}
    return false;
  }
  function recordPerf(action, elapsedMs, extra) {
    if (!isPerfEnabled()) return;
    try {
      _perfRecords.push({ action: action, ms: elapsedMs, ts: Date.now(), extra: extra || '' });
      if (_perfRecords.length > PERF_BUFFER_LIMIT) _perfRecords.splice(0, _perfRecords.length - PERF_BUFFER_LIMIT);
      if (typeof console !== 'undefined' && console.log) {
        console.log('[perf] ' + action + ': ' + elapsedMs + 'ms' + (extra ? ' (' + extra + ')' : ''));
      }
    } catch (e) {}
  }
  function getPerfRecords() { return _perfRecords.slice(); }
  function clearPerfRecords() { _perfRecords = []; }
  function perfSummary() {
    var byAction = {};
    _perfRecords.forEach(function (r) {
      var b = byAction[r.action] || (byAction[r.action] = { count: 0, total: 0, max: 0 });
      b.count += 1; b.total += r.ms; if (r.ms > b.max) b.max = r.ms;
    });
    return Object.keys(byAction).map(function (a) {
      return { action: a, count: byAction[a].count, avgMs: Math.round(byAction[a].total / byAction[a].count), maxMs: byAction[a].max };
    });
  }

  function decodeJwt(token) {
    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(
        window.atob(base64).split('').map(function (c) {
          return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join('')
      );
      return JSON.parse(jsonPayload);
    } catch (e) {
      console.error('Failed to decode JWT:', e);
      return null;
    }
  }

  /** token 剩餘毫秒；無效回 -1 */
  function tokenTtlMs(token) {
    if (!token || token === 'mock-admin-token') return -1;
    const payload = decodeJwt(token);
    if (!payload || !payload.exp) return -1;
    return payload.exp * 1000 - Date.now();
  }

  function isTokenExpired(token) {
    // 剩餘不足 15 秒視為不可用（給請求一點緩衝）
    return tokenTtlMs(token) < 15000;
  }

  /** 快過期：剩餘不足 withinMs（預設 5 分鐘）→ 應背景換票 */
  function isTokenExpiringSoon(token, withinMs) {
    var ttl = tokenTtlMs(token);
    if (ttl < 0) return true;
    return ttl < (withinMs != null ? withinMs : 5 * 60 * 1000);
  }

  function getStoredIdToken() {
    const idToken = sessionStorage.getItem('jcjh_google_id_token');
    if (!idToken || idToken === 'mock-admin-token') return null;
    return idToken;
  }

  function requireIdToken() {
    const idToken = getStoredIdToken();
    if (!idToken || isTokenExpired(idToken)) return null;
    return idToken;
  }

  function formatError(err, action) {
    if (FieldMap && typeof FieldMap.formatGasError === 'function') {
      return FieldMap.formatGasError(err, action);
    }
    const raw = err && err.message ? String(err.message) : String(err || '未知錯誤');
    return raw.replace(/^Error:\s*/i, '').trim();
  }

  function parseAllowedHd(settings) {
    var list = DEFAULT_ALLOWED_HD.slice();
    if (!settings) return list;
    var raw = settings.allowedHd || settings.ALLOWED_HD || '';
    if (!raw) return list;
    var parts = String(raw).split(',').map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean);
    return parts.length ? parts : list;
  }

  function isEmailDomainAllowed(email, payload, allowedList) {
    var list = allowedList && allowedList.length ? allowedList : DEFAULT_ALLOWED_HD;
    // 空清單不得再被視為不限制，避免設定遺失時放行陌生帳號。
    if (!list.length) return false;
    if (list.indexOf('*') !== -1) return true;
    var em = String(email || (payload && payload.email) || '').toLowerCase();
    var domain = em.split('@')[1] || '';
    var hd = String((payload && payload.hd) || domain).toLowerCase();
    return list.indexOf(hd) !== -1 || list.indexOf(domain) !== -1;
  }

  /** 舊整包 key（相容讀） */
  function cacheKey(semesterId) {
    return 'jcjh_swr_' + APP_VERSION + '_' + (semesterId || '');
  }

  /** 分鍵：meta | structure | requests */
  function partKey(semesterId, part) {
    return 'jcjh_swr_' + APP_VERSION + '_' + (semesterId || '') + '_' + String(part || 'full');
  }

  function readPart(semesterId, part, maxAgeMs) {
    try {
      const raw = sessionStorage.getItem(partKey(semesterId, part));
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || !obj.ts || obj.data === undefined) return null;
      if (Date.now() - obj.ts > (maxAgeMs || 120000)) return null;
      return obj.data;
    } catch (e) {
      return null;
    }
  }

  function writePart(semesterId, part, data) {
    var key = partKey(semesterId, part);
    var payload = JSON.stringify({ ts: Date.now(), data: data });
    try {
      sessionStorage.setItem(key, payload);
    } catch (e1) {
      // QuotaExceeded：清舊 SWR 後重試一次
      try {
        Object.keys(sessionStorage).forEach(function (k) {
          if (k.indexOf('jcjh_swr_') === 0) sessionStorage.removeItem(k);
        });
        sessionStorage.setItem(key, payload);
      } catch (e2) {
        try { console.warn('SWR writePart failed:', part, e2); } catch (e3) {}
      }
    }
  }

  function removePart(semesterId, part) {
    try {
      sessionStorage.removeItem(partKey(semesterId, part));
    } catch (e) {}
  }

  /**
   * 讀 SWR：優先合併分鍵；無分鍵時讀舊整包
   * maxAgeMs 預設 120s；可傳 { meta, structure, requests } 各別秒數
   */
  function readSWR(semesterId, maxAgeMs) {
    var ages = typeof maxAgeMs === 'object' && maxAgeMs
      ? maxAgeMs
      : { meta: maxAgeMs || 120000, structure: maxAgeMs || 120000, requests: maxAgeMs || 120000 };
    var metaAge = ages.meta != null ? ages.meta : 120000;
    var structAge = ages.structure != null ? ages.structure : 300000; // 課表結構可留較久
    var reqAge = ages.requests != null ? ages.requests : 120000;

    var meta = readPart(semesterId, 'meta', metaAge);
    var structure = readPart(semesterId, 'structure', structAge);
    var requests = readPart(semesterId, 'requests', reqAge);
    if (meta || structure || requests) {
      var out = { success: true };
      if (meta) {
        if (meta.semesters) out.semesters = meta.semesters;
        if (meta.teachers) out.teachers = meta.teachers;
        if (meta.settings) out.settings = meta.settings;
      }
      if (structure) {
        if (structure.schedules) out.schedules = structure.schedules;
        if (structure.schoolSwaps) out.schoolSwaps = structure.schoolSwaps;
        // structure 可帶 teachers 備援
        if (structure.teachers && !out.teachers) out.teachers = structure.teachers;
      }
      if (requests) {
        if (requests.requests) out.requests = requests.requests;
        if (requests.classAwayEvents !== undefined) out.classAwayEvents = requests.classAwayEvents;
        if (requests.requestWindow) out.requestWindow = requests.requestWindow;
        if (requests.serverTime) out.serverTime = requests.serverTime;
      }
      return out;
    }

    // 相容：舊整包
    try {
      const raw = sessionStorage.getItem(cacheKey(semesterId));
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || !obj.ts || !obj.data) return null;
      if (Date.now() - obj.ts > (typeof maxAgeMs === 'number' ? maxAgeMs : 120000)) return null;
      return obj.data;
    } catch (e) {
      return null;
    }
  }

  /** 只寫分鍵（不再寫整包 full bag，避免 sessionStorage 爆量） */
  function writeSWR(semesterId, data) {
    if (!data) return;
    // 清掉舊版整包 key（若仍存在）
    try { sessionStorage.removeItem(cacheKey(semesterId)); } catch (e0) {}
    writeSWRParts(semesterId, data);
  }

  /** 依 payload 拆寫 meta / structure / requests */
  function writeSWRParts(semesterId, data) {
    if (!data) return;
    if (data.semesters || data.teachers || data.settings) {
      writePart(semesterId, 'meta', {
        semesters: data.semesters,
        teachers: data.teachers,
        settings: data.settings
      });
    }
    if (data.schedules || data.teachers || data.schoolSwaps) {
      writePart(semesterId, 'structure', {
        schedules: data.schedules,
        teachers: data.teachers,
        schoolSwaps: data.schoolSwaps
      });
    }
    if (data.requests || data.classAwayEvents !== undefined || data.requestWindow || data.serverTime) {
      writePart(semesterId, 'requests', {
        requests: data.requests,
        classAwayEvents: data.classAwayEvents,
        requestWindow: data.requestWindow,
        serverTime: data.serverTime
      });
    }
  }

  /** 只更新某一分鍵（softRefresh 用） */
  function writeSWRPart(semesterId, part, data) {
    if (!part || !data) return;
    writePart(semesterId, part, data);
  }

  /**
   * 清除 SWR
   * clearSWR() — 全清
   * clearSWR(semesterId) — 該學期全部分鍵
   * clearSWR(semesterId, { parts: ['requests'] }) — 只清指定分鍵
   */
  function clearSWR(semesterId, opts) {
    try {
      opts = opts || {};
      var parts = opts.parts;
      if (semesterId && parts && parts.length) {
        parts.forEach(function (p) {
          if (p === 'full') sessionStorage.removeItem(cacheKey(semesterId));
          else removePart(semesterId, p);
        });
        return;
      }
      if (semesterId) {
        sessionStorage.removeItem(cacheKey(semesterId));
        ['meta', 'structure', 'requests'].forEach(function (p) {
          removePart(semesterId, p);
        });
        return;
      }
      Object.keys(sessionStorage).forEach(function (k) {
        if (k.indexOf('jcjh_swr_') === 0) sessionStorage.removeItem(k);
      });
    } catch (e) {}
  }

  function createClient(opts) {
    var _authExpiredNotified = false;
    var _refreshInflight = null;

    function handleAuthExpired(msg) {
      sessionStorage.removeItem('jcjh_google_id_token');
      clearSWR();
      if (opts.onAuthExpired) {
        try { opts.onAuthExpired(); } catch (e) {}
      }
      // B：不 location.reload()，只提示重新登入，保留畫面較不突兀
      if (!_authExpiredNotified) {
        _authExpiredNotified = true;
        if (opts.showToast) {
          opts.showToast(msg || '⚠️ 登入已過期，請再按一次 Google 登入（不必整頁重整）。', 'warning');
        }
        setTimeout(function () { _authExpiredNotified = false; }, 8000);
      }
    }

    /**
     * 取得可用 ID Token：
     * - 尚有效：直接回傳；若快過期則背景換票
     * - 已過期：先 await 靜默換票，成功則繼續
     */
    async function ensureIdToken(options) {
      options = options || {};
      var forceRefresh = !!options.forceRefresh;
      var token = getStoredIdToken();
      if (token && !isTokenExpired(token) && !forceRefresh) {
        if (isTokenExpiringSoon(token) && typeof opts.refreshIdToken === 'function') {
          // 背景換票，不擋本次請求
          if (!_refreshInflight) {
            _refreshInflight = Promise.resolve()
              .then(function () { return opts.refreshIdToken(); })
              .catch(function () { return null; })
              .finally(function () { _refreshInflight = null; });
          }
        }
        return token;
      }
      // 過期或缺票：嘗試靜默刷新
      if (typeof opts.refreshIdToken === 'function') {
        try {
          if (!_refreshInflight) {
            _refreshInflight = Promise.resolve()
              .then(function () { return opts.refreshIdToken(); })
              .finally(function () { _refreshInflight = null; });
          }
          var fresh = await _refreshInflight;
          if (fresh && !isTokenExpired(fresh)) {
            _authExpiredNotified = false;
            return fresh;
          }
        } catch (e) { /* ignore */ }
      }
      return null;
    }

    /** 長操作預估秒數（僅 UI 進度提示用） */
    var LONG_ACTION_HINT_SEC = {
      importSchedulesBatch: 90,
      importTeachersBatch: 45,
      adminApproveBatch: 60,
      adminRejectBatch: 40,
      submitRequestBatch: 50,
      sendBatchNotices: 40,
      getInitialData: 25,
      earnMutualQuotaFromActivity: 45
    };

    var ACTION_TIMEOUT_MS = {
      getMetaData: 20000,
      getPublicClassData: 15000,
      getPendingOnly: 20000,
      getMatchCandidates: 20000,
      getHistoryMonth: 30000,
      getMutualQuotaLedger: 30000,
      getInitialData: 60000,
      submitRequest: 45000,
      respondToRequest: 45000,
      adminApprove: 60000,
      adminReject: 60000,
      submitRequestBatch: 90000,
      adminApproveBatch: 120000,
      adminRejectBatch: 90000,
      importTeachersBatch: 120000,
      importSchedulesBatch: 180000,
      sendBatchNotices: 120000
    };
    var _inflightControllers = Object.create(null);
    function cancelInflight(action) {
      if (!action || !_inflightControllers[action]) return;
      try { _inflightControllers[action].abort(); } catch (e) { /* ignore */ }
      delete _inflightControllers[action];
    }
    function cancelAllInflight() {
      Object.keys(_inflightControllers).forEach(cancelInflight);
    }
    function sleepMs(ms) {
      return new Promise(function (resolve) { setTimeout(resolve, ms); });
    }
    function isTransientHttpStatus(status) {
      return status === 404 || status === 408 || status === 429
        || status === 500 || status === 502 || status === 503 || status === 504;
    }
    function isTransientNetworkMessage(msg) {
      return /timed out|timeout|temporarily|try again|Failed to fetch|NetworkError|network|abort|econn|ecconnreset|socket hang up/i.test(String(msg || ''));
    }

    async function postJson(action, data, options) {
      options = options || {};
      const url = opts.getApiUrl();
      if (!url) {
        throw new Error(formatError(new Error('主要資料庫 GAS API 網址尚未設定！'), action));
      }
      let idToken = '';
      if (!options.skipAuth) {
        idToken = await ensureIdToken();
        if (!idToken) {
          handleAuthExpired();
          throw new Error(formatError(new Error('登入憑證已過期，請重新登入！'), action));
        }
      } else if (action !== 'getPublicClassData' && action !== 'logClientError') {
        throw new Error('未授權的免登入 API 操作');
      }
      const payload = {
        idToken: idToken,
        apiKey: '',
        action: action,
        semesterId: options.semesterId || opts.getSemesterId(),
        currentUrl: window.location.origin + window.location.pathname,
        data: data || {}
      };

      // 長操作：每秒回報經過秒數，避免畫面像卡住
      var progressTimer = null;
      var t0 = Date.now();
      var onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;
      var hintSec = LONG_ACTION_HINT_SEC[action] || (options.longOp ? 60 : 0);
      if (onProgress && hintSec > 0) {
        try {
          onProgress({ action: action, elapsed: 0, hintSec: hintSec, phase: 'start' });
        } catch (e0) { /* ignore */ }
        progressTimer = setInterval(function () {
          var elapsed = Math.floor((Date.now() - t0) / 1000);
          try {
            onProgress({
              action: action,
              elapsed: elapsed,
              hintSec: hintSec,
              phase: elapsed >= hintSec ? 'slow' : 'wait'
            });
          } catch (eP) { /* ignore */ }
        }, 1000);
      }

      let response;
      var timeoutMs = Number(options.timeoutMs || ACTION_TIMEOUT_MS[action] || 45000);
      // 寫入重送可能重複落地：只對讀取類自動重試；寫入一律不重試，靠明確訊息請使用者先重新整理確認。
      var isWrite = !!WRITE_ACTIONS[action];
      var maxRetries = options.retries != null ? Number(options.retries)
        : (options.retry != null ? Number(options.retry) : (isWrite ? 0 : 2));
      if (!(maxRetries >= 0)) maxRetries = isWrite ? 0 : 2;
      var retryBaseMs = Number(options.retryDelayMs || 600);
      if (!(retryBaseMs >= 0)) retryBaseMs = 600;
      // abortPrevious：先取消上一代，整次呼叫（含重試）不再佔用舊 controller
      if (typeof AbortController === 'function' && !options.signal) {
        if (options.abortPrevious && _inflightControllers[action]) {
          cancelInflight(action);
        }
      }
      var attempt = 0;
      var lastTransientErr = null;
      var res = null;
      try {
      while (true) {
      var controller = null;
      var timeoutId = null;
      var timedOut = false;
      if (typeof AbortController === 'function' && !options.signal) {
        controller = new AbortController();
        if (options.abortPrevious) _inflightControllers[action] = controller;
      }
      var signal = options.signal || (controller && controller.signal);
      if (controller && timeoutMs > 0) {
        timeoutId = setTimeout(function () {
          timedOut = true;
          try { controller.abort(); } catch (eAbort) { /* ignore */ }
        }, timeoutMs);
      }
      try {
        response = await fetch(url, {
          method: 'POST',
          mode: 'cors',
          // user_content_key 是一次性跳轉：絕不快取，避免重播過期跳轉 URL 造成 404
          cache: 'no-store',
          redirect: 'follow',
          credentials: 'omit',
          referrerPolicy: 'no-referrer',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(payload),
          signal: signal
        });
      } catch (netErr) {
        var netMsg = String(netErr && netErr.message ? netErr.message : netErr);
        var superseded = !!(options.abortPrevious && controller && _inflightControllers[action] && _inflightControllers[action] !== controller);
        if (timeoutId) clearTimeout(timeoutId);
        if (controller && options.abortPrevious && _inflightControllers[action] === controller) {
          delete _inflightControllers[action];
        }
        // 被新請求取代：不重試，直接結束舊請求
        if (superseded || ((signal && signal.aborted) && !timedOut)) {
          throw new Error(formatError(new Error('已取消舊請求'), action));
        }
        if (timedOut || isTransientNetworkMessage(netMsg)) {
          lastTransientErr = new Error(
            '連線逾時或中斷（可能 GAS 處理較久）。請稍候再試；若剛完成寫入，可按 ↻ 重新整理確認。'
          );
          if (!isWrite && attempt < maxRetries) {
            attempt += 1;
            await sleepMs(retryBaseMs * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 200));
            continue;
          }
          throw new Error(formatError(lastTransientErr, action));
        }
        throw new Error(formatError(netErr, action));
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
        if (controller && options.abortPrevious && _inflightControllers[action] === controller) {
          delete _inflightControllers[action];
        }
      }
      if (!response.ok) {
        var httpStatus = Number(response.status || 0);
        var httpTransient = isTransientHttpStatus(httpStatus);
        if (controller && options.abortPrevious && _inflightControllers[action] === controller) {
          delete _inflightControllers[action];
        }
        if (!isWrite && httpTransient && attempt < maxRetries) {
          attempt += 1;
          lastTransientErr = new Error('網路連線失敗：HTTP ' + response.status + ' ' + (response.statusText || ''));
          await sleepMs(retryBaseMs * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 200));
          continue;
        }
        if (isWrite && httpTransient) {
          throw new Error(
            formatError(new Error(
              '後端連線不穩（HTTP ' + response.status + '）。寫入可能已生效，請先按 ↻ 重新整理確認，勿直接重送，避免重複送出。'
            ), action)
          );
        }
        throw new Error(
          formatError(new Error('網路連線失敗：HTTP ' + response.status + ' ' + (response.statusText || '')), action)
        );
      }
      try {
        res = await response.json();
      } catch (parseErr) {
        // Google 邊界偶發回 HTML 錯誤頁：讀取類用全新 POST 重試（拿新的 user_content_key）
        if (!isWrite && attempt < maxRetries) {
          attempt += 1;
          await sleepMs(retryBaseMs * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 200));
          continue;
        }
        throw new Error(formatError(new Error('伺服器回應格式錯誤，請確認 GAS 部署是否正常。'), action));
      }
      break;
      }
      } finally {
        if (progressTimer) clearInterval(progressTimer);
      }
      if (!res.success) {
        const errMsg = res.error || '未知錯誤';
        // Token 類錯誤：先試一次換票重送，再失敗才當登出
        if (/驗證失敗|verification failed|Token|登入憑證|id_token|expired|過期|aud 不符/i.test(String(errMsg))) {
          if (!options._retriedAuth && typeof opts.refreshIdToken === 'function') {
            try {
              var retryTok = await ensureIdToken({ forceRefresh: true });
              if (retryTok) {
                return postJson(action, data, Object.assign({}, options, { _retriedAuth: true }));
              }
            } catch (eR) { /* fallthrough */ }
          }
          handleAuthExpired();
        }
        if (/exceeded maximum execution time|Maximum execution time|逾時|timeout/i.test(String(errMsg))) {
          throw new Error(formatError(new Error(
            'GAS 執行逾時。請減少單次筆數後再試，或稍候按 ↻ 確認是否已部分寫入。'
          ), action));
        }
        throw new Error(formatError(new Error(errMsg), action));
      }
      if (onProgress && hintSec > 0) {
        try {
          onProgress({
            action: action,
            elapsed: Math.floor((Date.now() - t0) / 1000),
            hintSec: hintSec,
            phase: 'done'
          });
        } catch (eD) { /* ignore */ }
      }
      recordPerf(action, Date.now() - t0, options.semesterId || '');
      return res;
    }

    const callGasApi = async (action, data, callOpts) => {
      callOpts = callOpts || {};
      const res = await postJson(action, data || {}, callOpts);
      if (WRITE_ACTIONS[action]) {
        var sid = opts.getSemesterId();
        if (REQUEST_WRITE_ACTIONS[action] && !STRUCTURE_WRITE_ACTIONS[action]) {
          // 申請類寫入：只髒 requests（下次 soft 可先畫 meta／課表）
          clearSWR(sid, { parts: ['requests', 'full'] });
        } else {
          clearSWR(sid);
        }
      }
      return res;
    };

    /**
     * 輕量讀取：學期 + 教師 + 設定（POST，Token 不進 URL）
     */
    async function fetchMetaData(options) {
      options = options || {};
      const semesterId = options.semesterId || opts.getSemesterId();
      const requestData = {};
      if (options.force || options.scope) requestData.scope = options.force ? 'fresh' : options.scope;
      const res = await postJson('getMetaData', requestData, { abortPrevious: true, semesterId: semesterId });
      if (res) {
        writePart(semesterId, 'meta', {
          semesters: res.semesters,
          teachers: res.teachers,
          settings: res.settings
        });
      }
      return res;
    }

    /**
     * 全量讀取：含課表／異動／申請（POST + SWR）
     * options.historyAll=true：不裁時間窗（完整學期申請）
     * options.windowDays：已結案保留天數，預設 14
     * options.requestsOnly=true：只拉申請窗＋空堂（不寫 structure，只寫 requests）
     * options.parts：'requests' | 'teachers' | 'full'，後端對應 requestsOnly／teachersOnly（Phase 1B 瘦身）
     */
    async function fetchInitialData(options) {
      options = options || {};
      const semesterId = options.semesterId || opts.getSemesterId();
      const force = !!options.force;
      const historyAll = !!options.historyAll;
      const requestsOnly = !!options.requestsOnly || options.parts === 'requests';
      const teachersOnly = !!options.teachersOnly || options.parts === 'teachers';
      const windowDays = options.windowDays != null ? options.windowDays : 14;

      if (!force && !historyAll && !requestsOnly && typeof options.onStale === 'function') {
        const stale = readSWR(semesterId, 120000);
        if (stale) options.onStale(stale);
      }

      const res = await postJson('getInitialData', {
        scope: force ? 'fresh' : 'full',
        historyAll: historyAll,
        windowDays: windowDays,
        requestsOnly: requestsOnly,
        teachersOnly: teachersOnly,
        // 供後端 Phase 1B parts 路由與 perf 日誌識別（舊版 GAS 忽略未知欄位）
        parts: options.parts || (requestsOnly ? 'requests' : (teachersOnly ? 'teachers' : 'full'))
      }, { abortPrevious: true, semesterId: semesterId });
      if (historyAll) {
        // 完整歷史不覆寫預設 SWR
      } else if (requestsOnly) {
        writeSWRPart(semesterId, 'requests', {
          requests: res.requests,
          classAwayEvents: res.classAwayEvents,
          requestWindow: res.requestWindow,
          serverTime: res.serverTime
        });
      } else {
        writeSWR(semesterId, res);
      }
      return res;
    }

    /** 公開班級課表（免登入） */
    async function fetchPublicClassData(options) {
      options = options || {};
      const className = options.className || options.class || '';
      const semesterId = options.semesterId || opts.getSemesterId();
      return await postJson('getPublicClassData', { className: className, class: className }, { skipAuth: true, abortPrevious: true, semesterId: semesterId });
    }

    /** 極輕量：只拉進行中申請（不含課表） */
    async function fetchPendingOnly(options) {
      options = options || {};
      const semesterId = options.semesterId || opts.getSemesterId();
      return await postJson('getPendingOnly', {}, { abortPrevious: true, semesterId: semesterId });
    }

    /**
     * 申請增量：updatedSince 之後有變的列（合併用，不寫 SWR）
     * options.updatedSince：本地水位線字串 YYYY-MM-DD HH:mm:ss
     */
    async function fetchRequestsDelta(options) {
      options = options || {};
      const semesterId = options.semesterId || opts.getSemesterId();
      const updatedSince = String(options.updatedSince || '').trim();
      if (!updatedSince) {
        throw new Error('fetchRequestsDelta 需要 updatedSince');
      }
      return await postJson('getInitialData', {
        requestsDelta: true,
        updatedSince: updatedSince
      }, { abortPrevious: true, semesterId: semesterId });
    }

    /** 歷史按月：YYYY-MM，只回申請列 */
    async function fetchHistoryMonth(options) {
      options = options || {};
      const semesterId = options.semesterId || opts.getSemesterId();
      const month = String(options.month || '').slice(0, 7);
      return await postJson('getHistoryMonth', { month: month }, { abortPrevious: true, semesterId: semesterId });
    }

    /**
     * 代課媒合候選（後端算；教師端無全校課表時用）
      * options: leaveName, dateStr, dayOfWeek, period, myCourse, myDomain, myClass, awayClasses, activityMode, limit
     */
    async function fetchMatchCandidates(options) {
      options = options || {};
      const semesterId = options.semesterId || opts.getSemesterId();
      return await postJson('getMatchCandidates', {
        leaveName: options.leaveName || options.leaveEmail || '',
        dateStr: options.dateStr,
        dayOfWeek: options.dayOfWeek != null ? options.dayOfWeek : options.targetDay,
        period: options.period != null ? options.period : options.targetPeriod,
        myCourse: options.myCourse,
        myDomain: options.myDomain,
        myClass: options.myClass,
        className: options.myClass || options.className,
        subject: options.myCourse || options.subject,
        awayClasses: options.awayClasses || [],
        awayStartDate: options.awayStartDate || '',
        awayEndDate: options.awayEndDate || '',
        awayStartPeriod: options.awayStartPeriod || '',
        awayEndPeriod: options.awayEndPeriod || '',
        activityMode: !!options.activityMode,
        limit: options.limit != null ? options.limit : 40
      }, { abortPrevious: true, semesterId: semesterId });
    }

    /** 折抵額度帳本歷程（email 可選；管理員可查他人） */
    async function fetchMutualQuotaLedger(options) {
      options = options || {};
      const semesterId = options.semesterId || opts.getSemesterId();
      return await postJson('getMutualQuotaLedger', {
        name: options.name || options.teacherName || '',
        limit: options.limit != null ? options.limit : 50,
        allTeachers: options.allTeachers === true
      }, { abortPrevious: true, semesterId: semesterId });
    }

    /** 扣額度預覽：姓名為唯一識別，回傳包餘額＋FIFO 預設（送出前顯示，可下拉覆寫） */
    async function fetchQuotaSpendPreview(options) {
      options = options || {};
      const semesterId = options.semesterId || opts.getSemesterId();
      return await postJson('getQuotaSpendPreview', {
        names: options.names || (options.name ? [options.name] : []),
        requests: options.requests || []
      }, { abortPrevious: true, semesterId: semesterId });
    }

    return {
      callGasApi,
      fetchInitialData,
      fetchMetaData,
      fetchPublicClassData,
      fetchPendingOnly,
      fetchRequestsDelta,
      fetchHistoryMonth,
      fetchMatchCandidates,
      fetchMutualQuotaLedger,
      fetchQuotaSpendPreview,
      decodeJwt,
      isTokenExpired,
      isTokenExpiringSoon,
      tokenTtlMs,
      ensureIdToken,
      formatError,
      requireIdToken,
      clearSWR,
      writeSWRPart,
      cancel: cancelInflight,
      cancelAll: cancelAllInflight,
      parseAllowedHd,
      isEmailDomainAllowed,
      DEFAULT_ALLOWED_HD,
      APP_VERSION,
      isPerfEnabled,
      getPerfRecords,
      clearPerfRecords,
      perfSummary
    };
  }

  return {
    decodeJwt,
    isTokenExpired,
    isTokenExpiringSoon,
    tokenTtlMs,
    createClient,
    formatError,
    requireIdToken,
    readSWR,
    writeSWR,
    writeSWRPart,
    writeSWRParts,
    clearSWR,
    parseAllowedHd,
    isEmailDomainAllowed,
    DEFAULT_ALLOWED_HD,
    APP_VERSION,
    isPerfEnabled,
    getPerfRecords,
    clearPerfRecords,
    perfSummary
  };
})();

export { GasApi };
