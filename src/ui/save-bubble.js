/**
 * save-bubble.js — 背景儲存泡泡（本地先寫入 → 背景同步 → 泡泡回報）
 *
 * 為什麼要這個：
 *   原本「儲存歷史紀錄／儲存教師／刪除空堂事件…」都用全域 loading 遮罩
 *   （.loading-overlay）擋住整個畫面等 GAS 回應，GAS 慢的時候轉圈圈會轉很久，
 *   使用者連捲動、切頁都不能做。
 *
 * 這支模組提供統一契約：
 *   ① optimistic()：先把結果寫進本地畫面（可同步，回傳 rollback 用的快照）
 *   ② apiCall()：GAS 在背景跑，畫面照常操作
 *   ③ 右下角泡泡回報：儲存中 → 已儲存／失敗（失敗給「重試」，並回滾本地）
 *
 * 不依賴 Vue、不依賴 store；測試環境（node，無 DOM）會自動略過泡泡，
 * 只保留 optimistic／apiCall／rollback 的行為。
 */

const STACK_ID = 'save-bubble-stack';
const DONE_HIDE_MS = 2600;
const ERROR_HIDE_MS = 9000;

/** key → { el, hideTimer, retry } */
const bubbles = new Map();

/** 最近一次泡泡狀態（無 DOM 也會更新，供測試／除錯觀察） */
let lastBubble = null;

function hasDom() {
  return typeof document !== 'undefined' && !!document && !!document.body;
}

function ensureStack() {
  if (!hasDom()) return null;
  let stack = document.getElementById(STACK_ID);
  if (stack) return stack;
  stack = document.createElement('div');
  stack.id = STACK_ID;
  stack.className = 'save-bubble-stack';
  stack.setAttribute('role', 'status');
  stack.setAttribute('aria-live', 'polite');
  stack.setAttribute('aria-atomic', 'false');
  document.body.appendChild(stack);
  return stack;
}

function iconTextFor(state) {
  if (state === 'done') return '✓';
  if (state === 'error') return '!';
  return '';
}

function paintBubble(key, state, text, label, retryFn) {
  const rec = bubbles.get(key);
  if (!rec || !rec.el) return;
  const el = rec.el;
  if (rec.hideTimer) {
    clearTimeout(rec.hideTimer);
    rec.hideTimer = null;
  }
  el.classList.remove('is-saving', 'is-done', 'is-error');
  el.classList.add('is-' + state, 'is-show');
  el.setAttribute('data-save-state', state);

  const icon = el.querySelector('.save-bubble-icon');
  const textEl = el.querySelector('.save-bubble-text');
  const retryBtn = el.querySelector('.save-bubble-retry');
  if (icon) {
    // 儲存中由 CSS 畫轉圈，完成／失敗用字形
    icon.classList.remove('spinner');
    if (state === 'saving') {
      icon.classList.add('spinner');
      icon.textContent = '';
    } else {
      icon.textContent = iconTextFor(state);
    }
  }
  if (textEl) {
    const main = String(text || '');
    const tail = label ? ' · ' + label : '';
    textEl.textContent = main + tail;
  }
  if (retryBtn) {
    const canRetry = state === 'error' && typeof retryFn === 'function';
    retryBtn.hidden = !canRetry;
    retryBtn.onclick = canRetry
      ? (ev) => {
        if (ev && ev.preventDefault) ev.preventDefault();
        retryBtn.disabled = true;
        Promise.resolve(retryFn()).finally(() => { retryBtn.disabled = false; });
      }
      : null;
  }
}

function createBubble(key) {
  const stack = ensureStack();
  if (!stack) return null;
  const el = document.createElement('div');
  el.className = 'save-bubble is-saving';
  el.setAttribute('data-save-key', key);
  el.setAttribute('data-save-state', 'saving');

  const icon = document.createElement('span');
  icon.className = 'save-bubble-icon spinner';
  icon.setAttribute('aria-hidden', 'true');

  const textEl = document.createElement('span');
  textEl.className = 'save-bubble-text';

  const retryBtn = document.createElement('button');
  retryBtn.type = 'button';
  retryBtn.className = 'save-bubble-retry';
  retryBtn.textContent = '重試';
  retryBtn.hidden = true;

  el.appendChild(icon);
  el.appendChild(textEl);
  el.appendChild(retryBtn);
  stack.appendChild(el);

  const rec = { el: el, hideTimer: null, retry: null };
  bubbles.set(key, rec);
  // 進場：下一 frame 再加 is-show，才有過場
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => el.classList.add('is-show'));
  } else {
    el.classList.add('is-show');
  }
  return rec;
}

function scheduleHide(key, ms) {
  const rec = bubbles.get(key);
  if (!rec) return;
  if (rec.hideTimer) clearTimeout(rec.hideTimer);
  rec.hideTimer = setTimeout(() => removeBubble(key), ms);
}

function removeBubble(key) {
  const rec = bubbles.get(key);
  if (!rec) return;
  if (rec.hideTimer) clearTimeout(rec.hideTimer);
  bubbles.delete(key);
  const el = rec.el;
  if (!el) return;
  el.classList.remove('is-show');
  const drop = () => { if (el.parentNode) el.parentNode.removeChild(el); };
  if (typeof setTimeout === 'function') setTimeout(drop, 260);
}

// ── 對外 API ─────────────────────────────────────────────────

/**
 * 送出一個背景儲存任務。
 * @param {Object} opts
 * @param {string} [opts.key]            同一 key 會沿用同一個泡泡（重複儲存不合併成兩顆）
 * @param {string} opts.label            泡泡文字（例如「編輯歷史紀錄」）
 * @param {Function} [opts.optimistic]   本地先寫入；回傳值會原樣交給 rollback
 * @param {Function} [opts.rollback]     失敗時回滾（參數為 optimistic 的回傳值）
 * @param {Function} opts.apiCall        真正的 GAS 呼叫
 * @param {string} [opts.successMessage] 完成文字（預設「已儲存」）
 * @param {string} [opts.errorMessage]   失敗文字前綴（預設「儲存失敗」）
 * @param {Function} [opts.onSuccess]    完成後回呼（例如背景軟重整）
 * @param {Function} [opts.onError]      失敗後回呼
 * @returns {Promise<{ok:boolean, result?:any, error?:any}>} 永不 reject
 */
function runBackgroundSave(opts) {
  opts = opts || {};
  const label = String(opts.label || '資料');
  const key = String(opts.key || label);
  const resolveErrorText = () => (typeof opts.errorMessage === 'function'
    ? String(opts.errorMessage() || '儲存失敗')
    : String(opts.errorMessage || '儲存失敗'));

  // ① 本地先寫入
  let snapshot = null;
  if (typeof opts.optimistic === 'function') {
    try {
      snapshot = opts.optimistic();
    } catch (optimisticError) {
      // 本地寫入就失敗：不打後端，直接把錯誤回報出去
      const msg = optimisticError && optimisticError.message
        ? String(optimisticError.message)
        : String(optimisticError || '未知錯誤');
      showState(key, 'error', resolveErrorText() + '：' + msg, label, null);
      if (typeof opts.onError === 'function') opts.onError(optimisticError);
      return Promise.resolve({ ok: false, error: optimisticError, local: true });
    }
  }

  // ② 泡泡進入「儲存中」，GAS 在背景跑
  const resolveSuccessText = () => (typeof opts.successMessage === 'function'
    ? String(opts.successMessage() || '已儲存')
    : String(opts.successMessage || '已儲存'));
  const attempt = () => {
    showState(key, 'saving', '儲存中', label, null);
    return Promise.resolve()
      .then(() => (typeof opts.apiCall === 'function' ? opts.apiCall() : null))
      .then((result) => {
        showState(key, 'done', resolveSuccessText(), label, null);
        scheduleHide(key, DONE_HIDE_MS);
        if (typeof opts.onSuccess === 'function') opts.onSuccess(result);
        return { ok: true, result: result };
      })
      .catch((error) => {
        if (typeof opts.rollback === 'function') {
          try { opts.rollback(snapshot); } catch (rollbackError) { /* 回滾失敗不再掩蓋原錯誤 */ }
        }
        const msg = error && error.message ? String(error.message) : String(error || '未知錯誤');
        showState(key, 'error', resolveErrorText() + '：' + msg, label, () => {
          // 重試：重新套用本地寫入，再打一次後端
          if (typeof opts.optimistic === 'function') {
            try { snapshot = opts.optimistic(); } catch (retryError) { /* 交由 apiCall 回報 */ }
          }
          return attempt();
        });
        scheduleHide(key, ERROR_HIDE_MS);
        if (typeof opts.onError === 'function') opts.onError(error);
        return { ok: false, error: error };
      });
  };

  return attempt();
}
function showState(key, state, text, label, retryFn) {
  // 無 DOM（測試／SSR）也留一份最近狀態，讓呼叫端與測試能觀察泡泡內容
  lastBubble = { key: key, state: state, text: String(text || '') + (label ? ' · ' + label : '') };
  if (!hasDom()) return;
  let rec = bubbles.get(key);
  if (!rec) rec = createBubble(key);
  paintBubble(key, state, text, label, retryFn);
}

/** 立刻收掉某一顆泡泡（測試或收尾用） */
function dismissSaveBubble(key) {
  if (key == null) {
    Array.from(bubbles.keys()).forEach(removeBubble);
    return;
  }
  removeBubble(String(key));
}

/** 讀取最近一次泡泡狀態（{ key, state, text }；無 DOM 環境也能用） */
function getLastSaveBubble() {
  return lastBubble ? Object.assign({}, lastBubble) : null;
}

export { runBackgroundSave, dismissSaveBubble, getLastSaveBubble };
