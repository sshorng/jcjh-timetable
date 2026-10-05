import { ref } from 'vue';
/**
 * 自 v1 ui-list-helpers.js 機械移植（port-modules.cjs）：
 * IIFE 掛載改 ESM export；body 與 v1 逐字一致。
 */
import FieldMap from '../domain/field-map.js';

/**
 * ui-list-helpers.js — 申請清單排序／分組／顯示純函式（從 app.js 抽出，2A）
 *
 * Eager 載入（app.js setup 期即解構，需排在 app.js 之前）。
 * 零外部依賴（僅用全域 Object／String／Number／Date／Set），可在 Node/vm 直接驗證。
 *
 * 對外 API 不變：
 * UiListHelpers.{ requestTimestampText, firstRequestTimestamp, getRequestApplicationStamp,
 *   formatRequestApplicationDate, serialRoot, parseTimeMs, requestGroupKey, requestTimeMs,
 *   sortListRowsDesc, sortRequestListDesc, sortRequestsDesc,
 *   isTriangleRequest, collapseTriangleRows,
 *   getBatchGroupTeacherSummary, getBatchGroupStatusValues }
 */
const UiListHelpers = (() => {
  'use strict';

  function requestTimestampText(value) {
    if (value === undefined || value === null || value === '') return '';
    if (Object.prototype.toString.call(value) === '[object Date]' && !Number.isNaN(value.getTime())) {
      const y = value.getFullYear();
      const m = String(value.getMonth() + 1).padStart(2, '0');
      const d = String(value.getDate()).padStart(2, '0');
      const hh = String(value.getHours()).padStart(2, '0');
      const mm = String(value.getMinutes()).padStart(2, '0');
      const ss = String(value.getSeconds()).padStart(2, '0');
      return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
    }
    const text = String(value).trim();
    return /^(?:---|undefined|null)$/i.test(text) ? '' : text;
  }

  function firstRequestTimestamp(request, fields) {
    for (const field of fields) {
      const value = requestTimestampText(request && request[field]);
      if (value) return value;
    }
    return '';
  }

  function getRequestApplicationStamp(request) {
    const created = firstRequestTimestamp(request, [
      'createdAt', 'requestCreatedAt', '建立時間', '申請時間', '建立日期', '申請日期'
    ]);
    if (created) return created;
    const updated = firstRequestTimestamp(request, ['updatedAt', '更新時間', 'updated_at']);
    if (updated) return updated;
    return firstRequestTimestamp(request, ['createdDate', 'requestDate', '異動日期', 'date']);
  }

  function formatRequestApplicationDate(request) {
    const stamp = getRequestApplicationStamp(request);
    const match = String(stamp || '').replace(/\//g, '-').match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (match) return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
    return stamp ? String(stamp).slice(0, 10) : '---';
  }

  function serialRoot(serial) {
    const s = String(serial || '').trim();
    if (!s) return '';
    return s.replace(/-\d+$/, '') || s;
  }

  function parseTimeMs(raw) {
    const t = requestTimestampText(raw);
    if (!t) return 0;
    const direct = Date.parse(t);
    if (Number.isFinite(direct)) return direct;
    // 支援 "YYYY-MM-DD HH:mm:ss" / ISO / 僅日期；保留完整時分秒排序。
    const norm = t.replace('T', ' ').replace(/-/g, '/');
    const ms = Date.parse(norm);
    return Number.isFinite(ms) ? ms : 0;
  }

  function requestGroupKey(r) {
    if (r && r.batchId) return 'bat:' + String(r.batchId);
    const root = serialRoot(r && r.serial);
    if (root) return 'ser:' + root;
    return 'id:' + String((r && (r.id || r.requestId)) || '');
  }

  function requestTimeMs(r) {
    return parseTimeMs(getRequestApplicationStamp(r));
  }

  function sortListRowsDesc(a, b) {
    const ga = requestGroupKey(a);
    const gb = requestGroupKey(b);
    if (ga !== gb) {
      // 不同組：以組內最新時間倒序（先掃一遍不划算，改比各自時間；同秒再比 groupKey）
      const ta = requestTimeMs(a);
      const tb = requestTimeMs(b);
      if (tb !== ta) return tb - ta;
      return String(gb).localeCompare(String(ga));
    }
    // 同組：日期→節次 正序（方便連看）
    const da = String(a.requestDate || a.date || '');
    const db = String(b.requestDate || b.date || '');
    if (da !== db) return da.localeCompare(db);
    const pa = parseInt(a.requestPeriod != null ? a.requestPeriod : a.period, 10) || 0;
    const pb = parseInt(b.requestPeriod != null ? b.requestPeriod : b.period, 10) || 0;
    if (pa !== pb) return pa - pb;
    return String(a.id || '').localeCompare(String(b.id || ''));
  }

  /** 整表：先依「組最新時間」倒序，再把同組排在一起 */
  function sortRequestListDesc(list) {
    const arr = (list || []).slice();
    const groupMax = {};
    arr.forEach(r => {
      const g = requestGroupKey(r);
      const t = requestTimeMs(r);
      if (!groupMax[g] || t > groupMax[g]) groupMax[g] = t;
    });
    return arr.sort((a, b) => {
      const ga = requestGroupKey(a);
      const gb = requestGroupKey(b);
      if (ga !== gb) {
        const ta = groupMax[ga] || 0;
        const tb = groupMax[gb] || 0;
        if (tb !== ta) return tb - ta;
        return String(gb).localeCompare(String(ga));
      }
      return sortListRowsDesc(a, b);
    });
  }

  function sortRequestsDesc(a, b) { return sortListRowsDesc(a, b); }

  function isTriangleRequest(r) {
    return !!(r && (r.type === 'triangle' || r.type === '三角調' || r.triangleId));
  }

  function collapseTriangleRows(rows) {
    const result = [];
    const seen = Object.create(null);
    (rows || []).forEach((row) => {
      if (!isTriangleRequest(row)) {
        result.push(row);
        return;
      }
      const key = String(row.triangleId || row.batchId || row.id || '');
      if (!key || seen[key]) return;
      seen[key] = true;
      result.push(row);
    });
    return result;
  }

  function getBatchGroupTeacherSummary(group) {
    const values = [];
    const seen = new Set();
    (group && group.items ? group.items : []).forEach(item => {
      const value = String(
        (item && (item.targetTeacherName || item['受邀人姓名']))
        || (item && (item.targetTeacherEmail || item['受邀人Email']))
        || ''
      ).trim();
      const key = value.toLowerCase();
      if (!key || seen.has(key)) return;
      seen.add(key);
      values.push(value);
    });
    return values.length ? values.join('、') : '—';
  }

  function getBatchGroupStatusValues(group) {
    return [...new Set((group && group.items ? group.items : [])
      .map(item => String(item && item.status || '').trim().toLowerCase()).filter(Boolean))];
  }

  // —— 以下為 2A 第三批：批次顯示分組（自 app.js verbatim 搬移） ——
  // flattenBatchDisplayGroups 需讀展開狀態 ref，留守 app.js。

  function getStatusText(status) { return FieldMap.getStatusText(status); }

  function isCollapsibleBatchRecord(record) {
    if (!record || !String(record.batchId || '').trim()) return false;
    const type = String(record.type || '').trim().toLowerCase();
    // 三角調有自己的整組流程，不與一般批次代課混在一起。
    return type !== 'triangle' && type !== '三角調' && !String(record.triangleId || '').trim();
  }

  function makeBatchItemRow(record, displayKey, batchGroupKey) {
    return Object.assign({}, record || {}, {
      displayKind: 'item',
      displayKey,
      batchGroupKey: batchGroupKey || ''
    });
  }

  function buildBatchDisplayGroups(records, scope) {
    const entries = [];
    const groups = new Map();
    (records || []).forEach((record, index) => {
      if (!record) return;
      if (!isCollapsibleBatchRecord(record)) {
        entries.push(makeBatchItemRow(record, `${scope}:item:${record.id || index}`));
        return;
      }
      const batchId = String(record.batchId).trim();
      const groupLookupKey = batchId.toLowerCase();
      let group = groups.get(groupLookupKey);
      if (!group) {
        group = {
          displayKind: 'batch',
          displayKey: `${scope}:batch:${groupLookupKey}`,
          batchId,
          items: []
        };
        groups.set(groupLookupKey, group);
        entries.push(group);
      }
      group.items.push(record);
    });
    // 篩選後只剩一筆時，直接維持單筆列，避免製造空洞的批次標題。
    return entries.map(entry => {
      if (entry.displayKind === 'batch' && entry.items.length < 2) {
        const item = entry.items[0];
        return makeBatchItemRow(item, `${scope}:item:${item && item.id ? item.id : entry.displayKey}`);
      }
      return entry;
    });
  }

  function getBatchGroupSlotSummary(group, formatter) {
    const values = [...new Set((group && group.items ? group.items : []).map(item => {
      try { return String(typeof formatter === 'function' ? formatter(item) : '').trim(); } catch (e) { return ''; }
    }).filter(value => value && value !== '—' && value !== '---'))];
    if (!values.length) return '—';
    if (values.length === 1) return values[0];
    return `${values[0]} 等 ${group.items.length} 筆`;
  }

  function getBatchGroupStatusText(group) {
    const statuses = getBatchGroupStatusValues(group);
    if (!statuses.length) return '批次';
    return statuses.length === 1 ? getStatusText(statuses[0]) : '多種狀態';
  }

  function getBatchGroupStatusClass(group) {
    const statuses = getBatchGroupStatusValues(group);
    return statuses.length === 1 ? `status-${statuses[0]}` : 'tag-gray';
  }

  // —— 以下為 2A 第四批：同步水位印記（自 app.js verbatim 搬移，純函式） ——

  function requestRowStamp(r) {
    if (!r) return '';
    const u = String(r.updatedAt || '').trim();
    if (u) return u;
    return String(r.createdAt || '').trim();
  }

  function stampIsNewer(a, b) {
    // 字串 YYYY-MM-DD HH:mm:ss 可直接比；缺則舊
    const sa = String(a || '').trim();
    const sb = String(b || '').trim();
    if (!sa) return false;
    if (!sb) return true;
    return sa > sb;
  }

  function isAdminDirectRequest(r) {
    if (!r) return false;
    if (r.directApprove === true) return true;
    const note = String(r.note || '');
    return note.indexOf('[直接核准]') >= 0 || note.indexOf('行政直接核准') >= 0;
  }

  function serverRequestChangesLocal(localRow, serverRow) {
    if (!localRow || !serverRow) return true;
    return Object.keys(serverRow).some(key => localRow[key] !== serverRow[key]);
  }

  // —— 以下為 2A 第五批：名稱處理（自 app.js verbatim 搬移，純函式） ——

  function extractNameFromFormatted(str) {
    const raw = String(str || '').trim();
    const idx = raw.indexOf('（');
    if (idx >= 0) return raw.slice(0, idx).trim();
    return raw;
  }

  return {
    requestTimestampText: requestTimestampText,
    firstRequestTimestamp: firstRequestTimestamp,
    getRequestApplicationStamp: getRequestApplicationStamp,
    formatRequestApplicationDate: formatRequestApplicationDate,
    serialRoot: serialRoot,
    parseTimeMs: parseTimeMs,
    requestGroupKey: requestGroupKey,
    requestTimeMs: requestTimeMs,
    sortListRowsDesc: sortListRowsDesc,
    sortRequestListDesc: sortRequestListDesc,
    sortRequestsDesc: sortRequestsDesc,
    isTriangleRequest: isTriangleRequest,
    collapseTriangleRows: collapseTriangleRows,
    getBatchGroupTeacherSummary: getBatchGroupTeacherSummary,
    getBatchGroupStatusValues: getBatchGroupStatusValues,
    getStatusText: getStatusText,
    isCollapsibleBatchRecord: isCollapsibleBatchRecord,
    makeBatchItemRow: makeBatchItemRow,
    buildBatchDisplayGroups: buildBatchDisplayGroups,
    getBatchGroupSlotSummary: getBatchGroupSlotSummary,
    getBatchGroupStatusText: getBatchGroupStatusText,
    getBatchGroupStatusClass: getBatchGroupStatusClass,
    requestRowStamp: requestRowStamp,
    stampIsNewer: stampIsNewer,
    serverRequestChangesLocal: serverRequestChangesLocal,
    isAdminDirectRequest: isAdminDirectRequest,
    extractNameFromFormatted: extractNameFromFormatted
  };
})();

export { UiListHelpers };
