/**
 * 事件額度（額度包）後備計算。
 *
 * 正常情況抽屜會叫 getQuotaSpendPreview 取得每人各事件包餘額；那支 API 出問題時，
 * 改讀「額度帳本」在本機算（同一支帳本 API，匯出流程已在用）。
 * 整段只在需要時動態載入（見 quota-gates.js），不佔主包體積。
 */
 let _cache = { semesterId: '', ts: 0, rows: [] };
 function bustEventQuotaLedgerCache() {
   _cache = { semesterId: '', ts: 0, rows: [] };
 }

 function buildEventQuotaPreviewFromLedger(rows, names) {
   const want = {};
   (names || []).forEach((nm) => { want[String(nm || '').trim()] = true; });
   const byTeacher = {};
   (rows || []).forEach((r) => {
     const nm = String((r && (r.name || r.teacherName)) || '').trim();
     if (!nm || !want[nm]) return;
     // 舊帳本列可能沒有包ID：與後端 buildQuotaSpendPreview_ 一致，用 nopack_歸戶，避免整包遺失
     let pid = String((r && r.packageId) || '').trim();
     if (!pid) pid = 'nopack_' + nm;
     const delta = parseFloat(r && r.delta);
     if (!Number.isFinite(delta)) return;
     const packs = byTeacher[nm] || (byTeacher[nm] = {});
     const pack = packs[pid] || (packs[pid] = { packageId: pid, eventId: '', eventName: '', remaining: 0 });
     pack.remaining = Math.round(((pack.remaining || 0) + delta) * 1000) / 1000;
     if (!pack.eventId && r.eventId) pack.eventId = String(r.eventId);
     if (!pack.eventName && r.eventName) pack.eventName = String(r.eventName);
   });
  return (names || []).map((nm) => {
    const packs = byTeacher[nm]
      ? Object.keys(byTeacher[nm]).map((k) => {
        const p = byTeacher[nm][k];
        return {
          packageId: p.packageId,
          eventId: p.eventId,
          eventName: p.eventName,
          remaining: Math.max(0, Math.round((p.remaining || 0) * 1000) / 1000)
        };
      }).filter((p) => p.remaining > 0)
      : [];
    return { name: nm, packs: packs };
  });
}
/**
 * 把各種形狀的拋出值（Error／字串／布林／物件）都描述成可讀字串，免得再看到「true」卻不知是什麼。
 */
function describeThrown_(e) {
  try {
    if (e instanceof Error) return 'Error:' + String(e.message || e);
    if (e !== null && typeof e === 'object') {
      try { return 'object:' + JSON.stringify(e).slice(0, 120); } catch (_) { return 'object'; }
    }
    return typeof e + ':' + String(e);
  } catch (_) { return 'undescribable'; }
}

/**
 * 讀額度帳本（60 秒內共用一次）後算出各事件包餘額。
 * deps.getSemesterId(): 目前學期代號；deps.fetchLedger({allTeachers,limit}): 帳本 API
 */
async function loadEventQuotaPreviewFromLedger(names, deps) {
  deps = deps || {};
  if (typeof deps.fetchLedger !== 'function') throw new Error('缺少額度帳本 API');
  const sid = String((typeof deps.getSemesterId === 'function' ? deps.getSemesterId() : '') || '');
  const now = Date.now();
  if (!(_cache.rows.length && _cache.semesterId === sid && (now - _cache.ts) < 60000)) {
    const res = await deps.fetchLedger({ allTeachers: true, limit: 'all' });
    const rows = (res && Array.isArray(res.ledger)) ? res.ledger : [];
    // 帳本是空的也算正常（本學期還沒任何發放），直接回傳即可，後續會算成各包 0
    _cache = { semesterId: sid, ts: now, rows: rows };
  }
  return buildEventQuotaPreviewFromLedger(_cache.rows, names);
}

/**
 * 事件額度統一入口：先走 getQuotaSpendPreview（不限管理員，人人可用），
 * 失敗才後備讀全校帳本（僅管理員）。兩路回傳同形 [{name, packs}]。
 * deps.fetchPreview(chunkNames60): 預覽 API；deps.fetchLedger/getSemesterId: 帳本後備。
 */
async function loadEventQuotaPreview(names, deps) {
  deps = deps || {};
  let previewErr = null;
  if (typeof deps.fetchPreview === 'function') {
    try {
      const merged = [];
      for (let i = 0; i < (names || []).length; i += 60) {
        const res = await deps.fetchPreview((names || []).slice(i, i + 60));
        ((res && res.preview) || []).forEach((p) => merged.push(p));
      }
      return merged;
    } catch (ePrev) {
      previewErr = ePrev;
      if (typeof console !== 'undefined' && console.error) console.error('[事件額度] 預覽失敗改走帳本：', ePrev);
    }
  }
  try {
    return await loadEventQuotaPreviewFromLedger(names, {
      getSemesterId: deps.getSemesterId,
      fetchLedger: (o) => deps.fetchLedger(Object.assign({ abortPrevious: false }, o || {}))
    });
  } catch (eLedger) {
    // 兩路都掛才顯示「!」：把兩邊原因併成一句（抽屜紅字可見），才不用猜是權限、節流還是斷線
    if (!previewErr) throw eLedger;
    throw new Error('預覽失敗[' + describeThrown_(previewErr) + ']；帳本失敗[' + describeThrown_(eLedger) + ']');
  }
}
 export { buildEventQuotaPreviewFromLedger, bustEventQuotaLedgerCache, loadEventQuotaPreview, loadEventQuotaPreviewFromLedger };
