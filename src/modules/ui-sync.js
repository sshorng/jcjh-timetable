import { GasApi } from '../api/gas-client.js';
/**
 * 自 v1 ui-sync.js 機械移植（port-modules.cjs）：
 * IIFE 掛載改 ESM export；body 與 v1 逐字一致。
 */
import FieldMap from '../domain/field-map.js';

/**
 * ui-sync.js — 增量同步（pending／requests／delta）（從 app.js 抽出，2A）
 *
 * Eager 載入（setup 內委派，需先於 app.js）。create(deps) 注入 refs／回呼。
 */
const UiSync = (() => {
  function create(deps) {
    deps = deps || {};
    var serverRequestChangesLocal = deps.serverRequestChangesLocal;
    var user = deps.user;
    var fetchPendingOnly = deps.fetchPendingOnly;
    var currentSemester = deps.currentSemester;
    var requestsList = deps.requestsList;
    var sortRequestListDesc = deps.sortRequestListDesc;
    var recomputeRequestBuckets = deps.recomputeRequestBuckets;
    var bumpRequestsWatermarkFromRows = deps.bumpRequestsWatermarkFromRows;
    var fetchInitialData = deps.fetchInitialData;
    var classAwayEvents = deps.classAwayEvents;
    var requestWindowInfo = deps.requestWindowInfo;
    var stampIsNewer = deps.stampIsNewer;
    var clearScheduleCache = deps.clearScheduleCache;
    var fetchRequestsDelta = deps.fetchRequestsDelta;
    var watermarkAgeMs = deps.watermarkAgeMs;
    var _getRequestsWatermark = deps._getRequestsWatermark;
    var _setRequestsWatermark = deps._setRequestsWatermark;

const softSyncPendingOnly = async () => {
  if (!user.value || !fetchPendingOnly) return false;
  try {
    const res = await fetchPendingOnly({ semesterId: currentSemester.value });
    const rows = (res && res.requests) || [];
    const normSt = (s) => {
      if (FieldMap && FieldMap.normalizeRequestStatus) {
        return FieldMap.normalizeRequestStatus(s);
      }
      return String(s || '').toLowerCase();
    };
    const isOpenPending = (st) => {
      const n = normSt(st);
      return n === 'pending_teacher' || n === 'pending_admin';
    };
    const serverPendingById = {};
    const mappedPending = rows.map(r => {
      const m = FieldMap.mapRequest(r);
      if (m && m.id) serverPendingById[m.id] = m;
      return m;
    }).filter(Boolean);
    // 伺服器回 0 筆、本地仍有進行中 → 可能掃描失敗或空快取，勿全部幽靈取消
    const localOpenN = (requestsList.value || []).filter(r => r && isOpenPending(r.status)).length;
    if (mappedPending.length === 0 && localOpenN > 0) {
      console.warn('pendingOnly 回空但本地有進行中', localOpenN, '筆，略過幽靈取消');
      return false;
    }
    const next = [];
    const seen = {};
    let ghosted = false;
    let changed = false;
    (requestsList.value || []).forEach(r => {
      if (!r || !r.id) return;
      if (isOpenPending(r.status)) {
        if (serverPendingById[r.id]) {
          // 伺服器仍進行中：合併
          const serverRow = serverPendingById[r.id];
          const rowChanged = serverRequestChangesLocal(r, serverRow);
          next.push(rowChanged ? Object.assign({}, r, serverRow) : r);
          if (rowChanged) changed = true;
          seen[r.id] = 1;
        } else if (mappedPending.length > 0) {
          // 伺服器有回其他 pending、唯獨本筆消失 → 才幽靈取消（已核准／已駁回）
          next.push(Object.assign({}, r, { status: 'cancelled' }));
          seen[r.id] = 1;
          ghosted = true;
          changed = true;
        } else {
          // 伺服器空包：保留本地，交給後續 delta／全量
          next.push(r);
          seen[r.id] = 1;
        }
      } else {
        next.push(r);
        seen[r.id] = 1;
      }
    });
    mappedPending.forEach(m => {
      if (m && m.id && !seen[m.id]) {
        next.push(m);
        seen[m.id] = 1;
        changed = true;
      }
    });
    if (changed) {
      requestsList.value = sortRequestListDesc(next);
      recomputeRequestBuckets();
    }
    bumpRequestsWatermarkFromRows(mappedPending);
    return ghosted ? 'ghost' : true;
  } catch (e) {
    console.warn('pendingOnly 同步失敗：', e);
    return false;
  }
};

const softSyncRequestsOnly = async () => {
  if (!user.value || !fetchInitialData) return false;
  try {
    const res = await fetchInitialData({
      semesterId: currentSemester.value,
      requestsOnly: true,
      force: false
    });
    if (!res || res.success === false) return false;
    // 合併申請（不整表覆寫，避免清掉已載入的月份歷史）
    if (res.requests) mergeRequestsFromServer(res.requests);
    if (res.classAwayEvents) {
      classAwayEvents.value = res.classAwayEvents.map(e => FieldMap.mapClassAwayEvent(e));
    }
    if (res.requestWindow) requestWindowInfo.value = res.requestWindow;
    if (res.serverTime && stampIsNewer(res.serverTime, _getRequestsWatermark())) {
      _setRequestsWatermark(String(res.serverTime).trim());
    }
    // soft 只更新 requests 分鍵；課表 structure 保留
    try {
      if (GasApi && GasApi.writeSWRPart) {
        GasApi.writeSWRPart(currentSemester.value, 'requests', {
          requests: res.requests,
          classAwayEvents: res.classAwayEvents,
          requestWindow: res.requestWindow,
          serverTime: res.serverTime || _getRequestsWatermark()
        });
      }
    } catch (swrE) { /* ignore */ }
    clearScheduleCache();
    return true;
  } catch (e) {
    console.warn('requestsOnly 同步失敗：', e);
    return false;
  }
};

const softSyncRequestsDelta = async () => {
  if (!user.value || !fetchRequestsDelta) return false;
  if (!_getRequestsWatermark()) return false;
  // 過舊：增量可能漏幽靈結案，改全窗
  if (watermarkAgeMs() > 48 * 3600 * 1000) return false;
  try {
    const res = await fetchRequestsDelta({
      semesterId: currentSemester.value,
      updatedSince: _getRequestsWatermark()
    });
    if (!res || res.success === false) return false;
    let n = 0;
    if (res.requests && res.requests.length) {
      n = mergeRequestsFromServer(res.requests);
      clearScheduleCache();
    }
    if (res.serverTime && stampIsNewer(res.serverTime, _getRequestsWatermark())) {
      _setRequestsWatermark(String(res.serverTime).trim());
    }
    return n > 0 ? true : 'empty';
  } catch (e) {
    console.warn('requestsDelta 同步失敗：', e);
    return false;
  }
};

const mergeRequestsFromServer = (serverRows) => {
  if (!serverRows || !serverRows.length) return 0;
  const mapped = serverRows.map(r => FieldMap.mapRequest(r));
  const byId = {};
  let changed = false;
  (requestsList.value || []).forEach(r => { if (r && r.id) byId[r.id] = r; });
  mapped.forEach(r => {
    if (!r || !r.id) return;
    const localRow = byId[r.id];
    if (!serverRequestChangesLocal(localRow, r)) return;
    byId[r.id] = Object.assign({}, localRow || {}, r);
    changed = true;
  });
  if (changed) {
    requestsList.value = sortRequestListDesc(Object.keys(byId).map(k => byId[k]));
    recomputeRequestBuckets();
  }
  bumpRequestsWatermarkFromRows(mapped);
  return mapped.length;
};

    return {
      softSyncPendingOnly: softSyncPendingOnly,
      softSyncRequestsOnly: softSyncRequestsOnly,
      softSyncRequestsDelta: softSyncRequestsDelta,      mergeRequestsFromServer: mergeRequestsFromServer,

    };
  }
  return { create: create };
})();

export { UiSync };
