/**
 * 自 v1 ui-auth.js 機械移植（port-modules.cjs）：
 * IIFE 掛載改 ESM export；body 與 v1 逐字一致。
 */

/**
 * ui-auth.js — 認證／導覽（GSI／OAuth／登入／設定／分頁記憶）（從 app.js 抽出，2A）
 *
 * Eager 載入（setup 內委派，需先於 app.js）。create(deps) 注入 refs／回呼。
 * GSI 暫態（_tokenRefreshP／_gsiInitialized／GSI_INIT_STATE_KEY／OAUTH 對應表）已隨函數遷入。
 */
import { showToast } from '../ui/toast.js';
const UiAuth = (() => {
  function create(deps) {
    deps = deps || {};
    var googleClientId = deps.googleClientId;
    var gsiButtonError = deps.gsiButtonError;
    var gsiLoggingIn = deps.gsiLoggingIn;
    var classReadonlyMode = deps.classReadonlyMode;
    var gsiButtonReady = deps.gsiButtonReady;
    var selectedMobileDay = deps.selectedMobileDay;
    var activeTab = deps.activeTab;
    var adminSubTab = deps.adminSubTab;
    var TAB_LS_KEY = deps.TAB_LS_KEY;
    var ADMIN_SUBTAB_LS_KEY = deps.ADMIN_SUBTAB_LS_KEY;
    var VALID_TABS = deps.VALID_TABS;
    var VALID_ADMIN_SUBTABS = deps.VALID_ADMIN_SUBTABS;
    var allowedHdList = deps.allowedHdList;
    var parseAllowedHd = deps.parseAllowedHd;
    var proxySubmitEmails = deps.proxySubmitEmails;
    var PROXY_SUBMIT_EMAILS_LS_KEY = deps.PROXY_SUBMIT_EMAILS_LS_KEY;
    var proxySubmitEnabledBy = deps.proxySubmitEnabledBy;
    var proxySubmitEnabledAt = deps.proxySubmitEnabledAt;
    var onlineSubstitutionEnabled = deps.onlineSubstitutionEnabled;
    var isEmailDomainAllowed = deps.isEmailDomainAllowed;
    var resetAppState = deps.resetAppState;
    var loading = deps.loading;
    var loadingMessage = deps.loadingMessage;
    var isTokenExpired = deps.isTokenExpired;
    let _tokenRefreshP = null;
    let _gsiInitialized = false;
    const GSI_INIT_STATE_KEY = '__jcjh_gsi_initialized';
    const OAUTH_REDIRECT_BY_ORIGIN = {
      'https://jcjh-timetable.vercel.app': 'https://jcjh-timetable.vercel.app/',
      'http://localhost:8000': 'http://localhost:8000/',
      'http://127.0.0.1:8000': 'http://localhost:8000/'
    };

function isGoogleGsiReady() {
  return typeof google !== 'undefined'
    && google.accounts
    && google.accounts.id
    && typeof google.accounts.id.initialize === 'function'
    && typeof google.accounts.id.renderButton === 'function';
}

function waitForGoogleGsi(timeoutMs) {
  const limit = timeoutMs != null ? timeoutMs : 15000;
  return new Promise((resolve) => {
    if (isGoogleGsiReady()) {
      resolve(true);
      return;
    }
    const t0 = Date.now();
    const tick = () => {
      if (isGoogleGsiReady()) {
        resolve(true);
        return;
      }
      if (Date.now() - t0 >= limit) {
        resolve(false);
        return;
      }
      setTimeout(tick, 120);
    };
    tick();
  });
}

function gsiCredentialBridge(response) {
  const fn = window.__gsiCredentialHandler || window.handleCredentialResponse;
  if (typeof fn === 'function') {
    try {
      return fn(response);
    } catch (e) {
      console.error('GSI credential handler error', e);
      showToast('登入處理失敗：' + (e && e.message ? e.message : e), 'error');
    }
  } else {
    console.warn('GSI callback 尚未就緒', response);
    showToast('登入回呼尚未就緒，請重新整理後再試', 'warning');
  }
}

function isSecureHttpsOrigin() {
  try {
    return String(location.protocol || '') === 'https:';
  } catch (e) {
    return false;
  }
}

function isGsiInitialized() {
  if (_gsiInitialized) return true;
  try {
    return window[GSI_INIT_STATE_KEY] === true;
  } catch (e) {
    return false;
  }
}

function suppressGsiAutoLogin() {
  try {
    if (isGsiInitialized() && typeof google !== 'undefined' && google.accounts && google.accounts.id) {
      if (typeof google.accounts.id.cancel === 'function') google.accounts.id.cancel();
      if (typeof google.accounts.id.disableAutoSelect === 'function') {
        google.accounts.id.disableAutoSelect();
      }
    }
  } catch (e) { /* ignore */ }
  try {
    const host = String(location.hostname || '');
    const expire = 'Thu, 01 Jan 1970 00:00:00 GMT';
    const base = '; path=/; expires=' + expire + '; SameSite=Lax';
    document.cookie = 'g_state=;' + base;
    if (host) document.cookie = 'g_state=; domain=' + host + base;
  } catch (eCookie) { /* ignore */ }
}

function ensureGsiInitialized() {
  if (!isGoogleGsiReady() || !googleClientId.value) return false;
  if (isGsiInitialized()) {
    _gsiInitialized = true;
    suppressGsiAutoLogin();
    return true;
  }
  try {
    google.accounts.id.initialize({
      client_id: googleClientId.value,
      callback: gsiCredentialBridge,
      auto_select: false,
      cancel_on_tap_outside: true,
      use_fedcm_for_prompt: false,
      itp_support: true
    });
    _gsiInitialized = true;
    try { window[GSI_INIT_STATE_KEY] = true; } catch (eState) { /* ignore */ }
    suppressGsiAutoLogin();
    return true;
  } catch (e) {
    console.warn('GSI initialize 失敗', e);
    return false;
  }
}

async function setupGoogleSignInUi() {
  if (classReadonlyMode.value) return;
  gsiButtonReady.value = true;
  gsiLoggingIn.value = false;
  const ready = await waitForGoogleGsi(8000);
  if (ready) {
    ensureGsiInitialized();
    suppressGsiAutoLogin();
  }
}

const reloadGsiLoginButton = async () => {
  gsiButtonError.value = '';
  gsiLoggingIn.value = false;
  await setupGoogleSignInUi();
};

function getOAuthRedirectUri() {
  try {
    const origin = String(location.origin || '').replace(/\/$/, '');
    if (OAUTH_REDIRECT_BY_ORIGIN[origin]) return OAUTH_REDIRECT_BY_ORIGIN[origin];
    // 未知 origin（如 Vercel 預覽網域）不硬猜，避免隨機 invalid_request
    return '';
  } catch (e) {
    return '';
  }
}

function makeOAuthNonce() {
  try {
    if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
      const buf = new Uint8Array(16);
      window.crypto.getRandomValues(buf);
      return Array.prototype.map.call(buf, function (b) {
        return ('0' + b.toString(16)).slice(-2);
      }).join('');
    }
  } catch (e) { /* ignore */ }
  return String(Date.now()) + Math.random().toString(36).slice(2);
}

function clearOAuthUrlResidue() {
  try {
    const path = location.pathname || '/';
    const search = String(location.search || '');
    // 清掉 OAuth 帶回的 query error／hash token
    const q = new URLSearchParams(search.charAt(0) === '?' ? search.slice(1) : search);
    let dirty = false;
    ['error', 'error_description', 'state', 'id_token', 'authuser', 'prompt', 'scope', 'hd'].forEach(function (k) {
      if (q.has(k)) { q.delete(k); dirty = true; }
    });
    const nextSearch = q.toString() ? ('?' + q.toString()) : '';
    if (dirty || (location.hash && location.hash.length > 1)) {
      history.replaceState(null, '', path + nextSearch);
    }
  } catch (e) { /* ignore */ }
}

function parseOAuthReturnParams() {
  // Google 錯誤有時在 hash、有時在 query；成功 id_token 在 hash
  let fromHash = null;
  let fromQuery = null;
  try {
    const hash = String(location.hash || '');
    if (hash && hash.length > 1) {
      const raw = hash.charAt(0) === '#' ? hash.slice(1) : hash;
      if (raw.indexOf('id_token=') >= 0 || raw.indexOf('error=') >= 0) {
        fromHash = new URLSearchParams(raw);
      }
    }
  } catch (eH) { /* ignore */ }
  try {
    const search = String(location.search || '');
    if (search && search.length > 1) {
      const raw = search.charAt(0) === '?' ? search.slice(1) : search;
      if (raw.indexOf('id_token=') >= 0 || raw.indexOf('error=') >= 0) {
        fromQuery = new URLSearchParams(raw);
      }
    }
  } catch (eQ) { /* ignore */ }
  if (!fromHash && !fromQuery) return null;
  // 合併：hash 優先（id_token 在此）
  const merged = new URLSearchParams();
  if (fromQuery) fromQuery.forEach(function (v, k) { merged.set(k, v); });
  if (fromHash) fromHash.forEach(function (v, k) { merged.set(k, v); });
  return merged;
}

function consumeOAuthRedirectToken() {
  try {
    gsiLoggingIn.value = false;
    const q = parseOAuthReturnParams();
    if (!q) return null;
    const expectedState = sessionStorage.getItem('jcjh_oauth_state');
    const returnedState = q.get('state');
    try {
      sessionStorage.removeItem('jcjh_oauth_state');
      sessionStorage.removeItem('jcjh_oauth_redirect');
    } catch (eStateCleanup) { /* ignore */ }
    if (!expectedState || !returnedState || returnedState !== expectedState) {
      clearOAuthUrlResidue();
      showToast('登入驗證失敗（state），請重新登入。', 'error');
      return null;
    }
    const err = q.get('error');
    const token = q.get('id_token');
    clearOAuthUrlResidue();
    if (err) {
      const desc = q.get('error_description') || err;
      const uri = getOAuthRedirectUri() || (String(location.origin || '') + '/');
      try { console.warn('[OAuth] error', err, desc, 'redirect_uri=', uri); } catch (eC) { /* ignore */ }
      if (err === 'redirect_uri_mismatch' || err === 'invalid_request' || /redirect|invalid/i.test(desc)) {
        gsiButtonError.value = 'Google 拒絕登入（' + err + '）。請確認 Console「重新導向 URI」含：' + uri
          + '（正式站與 localhost 都要；含尾斜線）。目前網址：' + location.origin;
        showToast('登入被拒：請檢查 OAuth 重新導向 URI 是否含 ' + uri, 'error', 10000);
      } else {
        gsiButtonError.value = '登入未完成：' + desc;
        showToast('Google 登入未完成：' + desc, 'warning', 6000);
      }
      return null;
    }
    if (!token) return null;
    const expected = sessionStorage.getItem('jcjh_oauth_nonce');
    try { sessionStorage.removeItem('jcjh_oauth_nonce'); } catch (eN) { /* ignore */ }
    if (!expected) {
      showToast('登入驗證失敗（nonce 遺失），請重新登入。', 'error');
      return null;
    }
    try {
      const payload = JSON.parse(
        decodeURIComponent(
          atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))
            .split('').map(function (c) {
              return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
            }).join('')
        )
      );
      if (!payload || !payload.nonce || payload.nonce !== expected) {
        showToast('登入驗證失敗（nonce），請再試一次', 'error');
        return null;
      }
    } catch (ePay) {
      showToast('登入驗證失敗（Token 格式錯誤），請再試一次', 'error');
      return null;
    }
    return token;
  } catch (e) {
    console.warn('consumeOAuthRedirectToken', e);
    gsiLoggingIn.value = false;
    return null;
  }
}

const loginWithGoogle = () => {
  if (gsiLoggingIn.value) return;
  if (!googleClientId.value) {
    showToast('缺少 Google Client ID', 'error');
    return;
  }
  const host = String(location.hostname || '').toLowerCase();
  if (host === '127.0.0.1' || host === '[::1]') {
    gsiButtonError.value = '請改開 http://localhost:8000/ 再登入（勿用 127.0.0.1）';
    showToast('請改用 http://localhost:8000/', 'warning', 5000);
    return;
  }
  const redirectUri = getOAuthRedirectUri();
  if (!redirectUri) {
    gsiButtonError.value = '目前網域未列入 OAuth 白名單：' + location.origin
      + '。請用 https://jcjh-timetable.vercel.app/ 或 http://localhost:8000/';
    showToast('請改用正式站或本機 localhost:8000', 'error', 8000);
    return;
  }
  suppressGsiAutoLogin();
  const nonce = makeOAuthNonce();
  const state = makeOAuthNonce().slice(0, 16);
  try {
    sessionStorage.setItem('jcjh_oauth_nonce', nonce);
    sessionStorage.setItem('jcjh_oauth_state', state);
    sessionStorage.setItem('jcjh_oauth_redirect', redirectUri);
  } catch (eS) { /* ignore */ }
  gsiLoggingIn.value = true;
  gsiButtonError.value = '';
  // 只帶必要參數；多餘參數有時會觸發 Google invalid_request
  const params = new URLSearchParams();
  params.set('client_id', googleClientId.value);
  params.set('redirect_uri', redirectUri);
  params.set('response_type', 'id_token token');
  params.set('scope', 'openid email profile');
  params.set('nonce', nonce);
  params.set('state', state);
  params.set('prompt', 'select_account');
  const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' + params.toString();
  try { console.info('[OAuth] go', { redirect_uri: redirectUri, origin: location.origin }); } catch (eL) { /* ignore */ }
  // 稍延遲再導向，讓 UI 先顯示「正在前往」；失敗返回用 pageshow 解鎖
  setTimeout(function () {
    location.assign(authUrl);
  }, 50);
};

const refreshGoogleIdToken = () => {
  if (_tokenRefreshP) return _tokenRefreshP;
  _tokenRefreshP = Promise.resolve().then(() => {
    try {
      const cur = sessionStorage.getItem('jcjh_google_id_token');
      if (cur && !isTokenExpired(cur)) return cur;
    } catch (e) { /* ignore */ }
    return null;
  }).finally(() => {
    _tokenRefreshP = null;
  });
  return _tokenRefreshP;
};

const gasProgressHandler = (label) => (p) => {
  if (!p || !loadingMessage) return;
  const sec = p.elapsed || 0;
  const hint = p.hintSec || 0;
  if (p.phase === 'done') return;
  if (p.phase === 'slow' || (hint > 0 && sec >= hint)) {
    loadingMessage.value = (label || '處理中') + '…已 ' + sec + ' 秒（較久屬正常，請勿關閉）';
  } else if (sec > 0) {
    loadingMessage.value = (label || '處理中') + '…' + sec + ' 秒'
      + (hint ? '／約 ' + hint + ' 秒' : '');
  }
};

const applySettings = (settings) => {
  if (!settings) return;
  allowedHdList.value = parseAllowedHd(settings);
  // 行政代申請：指定行政 Email 白名單
  if (Object.prototype.hasOwnProperty.call(settings, 'proxySubmitEmails')
      || Object.prototype.hasOwnProperty.call(settings, 'PROXY_SUBMIT_EMAILS')) {
    const rawEmails = settings.proxySubmitEmails != null
      ? settings.proxySubmitEmails
      : settings.PROXY_SUBMIT_EMAILS;
    const list = String(rawEmails == null ? '' : rawEmails)
      .split(/[,，;\s]+/)
      .map(s => s.trim().toLowerCase())
      .filter(Boolean);
    proxySubmitEmails.value = list;
    try { localStorage.setItem(PROXY_SUBMIT_EMAILS_LS_KEY, list.join(',')); } catch (e) { /* ignore */ }
  }
  if (settings.proxySubmitEnabledBy) proxySubmitEnabledBy.value = String(settings.proxySubmitEnabledBy);
  if (settings.proxySubmitEnabledAt) proxySubmitEnabledAt.value = String(settings.proxySubmitEnabledAt);
  if (Object.prototype.hasOwnProperty.call(settings, 'onlineSubstitutionEnabled')) {
    const rawOnline = settings.onlineSubstitutionEnabled;
    onlineSubstitutionEnabled.value = !(
      rawOnline === false
      || String(rawOnline).trim().toLowerCase() === 'false'
      || String(rawOnline).trim() === '0'
      || String(rawOnline).trim() === '否'
      || String(rawOnline).trim().toLowerCase() === 'off'
    );
  }
};

const assertSchoolDomain = (payload) => {
  const email = payload && payload.email;
  // 後端會先驗證網域；前端尚未取得設定時不可誤拒絕合法帳號。
  if (!allowedHdList.value.length) return true;
  if (!isEmailDomainAllowed(email, payload, allowedHdList.value)) {
    sessionStorage.removeItem('jcjh_google_id_token');
    showToast('⚠️ 非本校網域帳號，無法登入本系統。', 'error');
    resetAppState();
    loading.value = false;
    return false;
  }
  return true;
};

const initMobileDay = () => {
  const day = new Date().getDay();
  if (day >= 1 && day <= 5) {
    selectedMobileDay.value = day;
  } else {
    selectedMobileDay.value = 1;
  }
};

const persistNavPosition = () => {
  try {
    if (!VALID_TABS.includes(activeTab.value)) return;
    localStorage.setItem(TAB_LS_KEY, activeTab.value);
    if (VALID_ADMIN_SUBTABS.includes(adminSubTab.value)) {
      localStorage.setItem(ADMIN_SUBTAB_LS_KEY, adminSubTab.value);
    }
    // 寫入 hash，重整可直接還原（略過公開 ?class= 唯讀）
    if (!classReadonlyMode || !classReadonlyMode.value) {
      const nextHash = activeTab.value === 'admin'
        ? ('#admin/' + (adminSubTab.value || 'billing'))
        : ('#' + activeTab.value);
      if (window.location.hash !== nextHash) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search + nextHash);
      }
    }
  } catch (e) { /* ignore */ }
};

const setActiveTab = (tab) => {
  if (!VALID_TABS.includes(tab)) return;
  activeTab.value = tab;
  persistNavPosition();
};

    return {
      isGoogleGsiReady: isGoogleGsiReady,
      waitForGoogleGsi: waitForGoogleGsi,
      gsiCredentialBridge: gsiCredentialBridge,
      isSecureHttpsOrigin: isSecureHttpsOrigin,
      isGsiInitialized: isGsiInitialized,
      suppressGsiAutoLogin: suppressGsiAutoLogin,
      ensureGsiInitialized: ensureGsiInitialized,
      setupGoogleSignInUi: setupGoogleSignInUi,
      reloadGsiLoginButton: reloadGsiLoginButton,
      getOAuthRedirectUri: getOAuthRedirectUri,
      makeOAuthNonce: makeOAuthNonce,
      clearOAuthUrlResidue: clearOAuthUrlResidue,
      parseOAuthReturnParams: parseOAuthReturnParams,
      consumeOAuthRedirectToken: consumeOAuthRedirectToken,
      loginWithGoogle: loginWithGoogle,
      refreshGoogleIdToken: refreshGoogleIdToken,
      gasProgressHandler: gasProgressHandler,
      applySettings: applySettings,
      assertSchoolDomain: assertSchoolDomain,
      initMobileDay: initMobileDay,
      persistNavPosition: persistNavPosition,
      setActiveTab: setActiveTab,
    };
  }
  return { create: create };
})();

export { UiAuth };
