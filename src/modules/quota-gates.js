/**
 * 事件額度後備計算的 lazy gate。
 *
 * 依專案閘門規則：動態 import() 只能寫在 *-gates.js，呼叫端一律靜態引用 gate 函式，
 * 才不會把後備邏輯（event-quota-ledger.js）打進主包。
 */
let _cache = null;

function ensureEventQuotaLedger() {
  if (!_cache) {
    _cache = import('./event-quota-ledger.js').catch((e) => {
      _cache = null;
      throw e;
    });
  }
  return _cache;
}

export { ensureEventQuotaLedger };
