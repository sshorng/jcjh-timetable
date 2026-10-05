/**
 * GAS 傳輸層（取代 v1 gas-api.js 的手寫重試／水位補丁）。
 *
 * 設計：
 * - transport 可注入（google.script.run／fetch／測試樁），本層只管傳輸語義
 * - 同鍵請求去重（in-flight dedup）：同一 action＋payload 併發只發一次
 * - 超時＋抖動退避重試（僅 transient 錯誤重試；err.fatal === true 直接拋）
 * - 可選 TTL 快取（Map 介面；SWR 背景重驗留待資料層切片）
 *
 * @param {object} opts
 * @param {Function} opts.transport (action, payload, { signal }) => Promise<any>
 * @param {number} [opts.timeoutMs=20000]
 * @param {number} [opts.retries=2]
 * @param {number} [opts.backoffMs=400]
 * @param {Map} [opts.cache] get/set/del 介面
 * @param {number} [opts.cacheMs=0] 命中且未過期直接回傳（0＝不快取）
 * @param {Function} [opts.now=Date.now]
 */
export function stableKey(action, payload) {
  return action + ':' + JSON.stringify(sortKeys(payload === undefined ? null : payload));
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value).sort()) out[k] = sortKeys(value[k]);
    return out;
  }
  return value;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createGasClient(opts) {
  const o = opts || {};
  if (typeof o.transport !== 'function') throw new Error('createGasClient 需要 transport(action, payload, { signal })');
  const timeoutMs = o.timeoutMs === undefined ? 20000 : o.timeoutMs;
  const retries = o.retries === undefined ? 2 : o.retries;
  const backoffMs = o.backoffMs === undefined ? 400 : o.backoffMs;
  const cache = o.cache || null;
  const cacheMs = o.cacheMs || 0;
  const now = o.now || Date.now;
  const inflight = new Map();

  function readCache(key) {
    if (!cache || !cacheMs) return undefined;
    try {
      const hit = cache.get(key);
      if (hit && now() - hit.ts < cacheMs) return hit.data;
    } catch (e) { /* 快取失效不影響主流程 */ }
    return undefined;
  }

  function writeCache(key, data) {
    if (!cache || !cacheMs) return;
    try {
      cache.set(key, { ts: now(), data });
    } catch (e) { /* ignore */ }
  }

  async function attempt(action, payload, signal) {
    let timer = null;
    try {
      const run = o.transport(action, payload, { signal });
      // 超時恆生效（與 signal 有無無關；signal 只用於上層取消）
      if (timeoutMs <= 0) return await run;
      let rejectTimeout = null;
      const timeout = new Promise((_, reject) => {
        rejectTimeout = () => {
          const err = new Error('GAS 逾時：' + action);
          err.transient = true;
          reject(err);
        };
        timer = setTimeout(rejectTimeout, timeoutMs);
      });
      return await Promise.race([run, timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function call(action, payload, callOpts) {
    const co = callOpts || {};
    const key = stableKey(action, payload);
    if (!co.skipCache) {
      const hit = readCache(key);
      if (hit !== undefined) return hit;
    }
    if (inflight.has(key)) return inflight.get(key);
    const task = (async () => {
      let lastErr = null;
      const tries = Math.max(1, (co.retries === undefined ? retries : co.retries) + 1);
      for (let i = 0; i < tries; i++) {
        try {
          const data = await attempt(action, payload, co.signal);
          writeCache(key, data);
          return data;
        } catch (e) {
          lastErr = e;
          if ((e && e.fatal === true) || i === tries - 1) throw e;
          await sleep(backoffMs * Math.pow(2, i) + Math.floor(Math.random() * 100));
        }
      }
      throw lastErr;
    })();
    inflight.set(key, task);
    try {
      return await task;
    } finally {
      if (inflight.get(key) === task) inflight.delete(key);
    }
  }

  return { call, stableKey };
}

/**
 * google.script.run 轉接（瀏覽器執行期才存在；缺席時拋錯由上層處理）。
 */
export function googleScriptTransport(action, payload, opts) {
  const o = opts || {};
  return new Promise((resolve, reject) => {
    try {
      const gs = (typeof google !== 'undefined' && google.script && google.script.run) || null;
      if (!gs) {
        const err = new Error('google.script.run 不可用（非 GAS iframe 環境）');
        err.fatal = true;
        reject(err);
        return;
      }
      if (o.signal && o.signal.aborted) {
        const err = new Error('已取消：' + action);
        err.transient = true;
        reject(err);
        return;
      }
      gs.withFailureHandler((e) => {
        const err = new Error((e && e.message) || String(e));
        err.transient = true;
        reject(err);
      }).withSuccessHandler(resolve)[action](payload);
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      if (err.transient === undefined) err.transient = true;
      reject(err);
    }
  });
}
