import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { test } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const here = path.dirname(fileURLToPath(import.meta.url));
const codeGsSource = fs.readFileSync(path.join(here, '..', 'code.gs'), 'utf8');

function makeSheet(headers, rows, counters) {
  return {
    getLastRow() { return rows.length + 1; },
    getLastColumn() { return headers.length; },
    getDataRange() {
      return {
        getValues() {
          if (counters) counters.dataRangeCalls += 1;
          return [headers.slice()].concat(rows.map((r) => r.slice()));
        }
      };
    },
    getRange(row, col, numRows, numCols) {
      return {
        getValues() {
          if (counters) counters.rangeGetCalls += 1;
          const all = [headers.slice()].concat(rows);
          const out = [];
          for (let r = 0; r < numRows; r++) {
            const src = all[row - 1 + r] || new Array(headers.length).fill('');
            out.push(src.slice(col - 1, col - 1 + numCols));
          }
          return out;
        },
        setValues(values) {
          for (let r = 0; r < values.length; r++) {
            const targetIdx = row - 1 + r - 1;
            if (targetIdx >= 0) {
              if (!rows[targetIdx]) rows[targetIdx] = new Array(headers.length).fill('');
              for (let c = 0; c < values[r].length; c++) {
                rows[targetIdx][col - 1 + c] = values[r][c];
              }
            }
          }
        },
        setValue() { return this; },
        setFontWeight() { return this; },
        setBackground() { return this; }
      };
    }
  };
}

function loadPhase5GasContext(sheetMap = {}) {
  const cacheMap = new Map();
  const cacheStats = { gets: 0, getAlls: 0, puts: 0, putAlls: 0 };
  const fakeCache = {
    get(key) {
      cacheStats.gets += 1;
      return cacheMap.has(key) ? cacheMap.get(key) : null;
    },
    put(key, val) {
      cacheStats.puts += 1;
      cacheMap.set(key, String(val));
    },
    getAll(keys) {
      cacheStats.getAlls += 1;
      const out = {};
      keys.forEach((k) => { if (cacheMap.has(k)) out[k] = cacheMap.get(k); });
      return out;
    },
    putAll(entries) {
      cacheStats.putAlls += 1;
      Object.keys(entries).forEach((k) => cacheMap.set(k, String(entries[k])));
    },
    remove(key) { cacheMap.delete(key); },
    removeAll(keys) { keys.forEach((k) => cacheMap.delete(k)); }
  };

  const context = {
    console,
    Object,
    String,
    Array,
    Number,
    Boolean,
    RegExp,
    Math,
    Date,
    JSON,
    Set,
    Map,
    Error,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    Utilities: {
      formatDate(d, _tz, fmt) {
        const dt = new Date(d);
        const p = (n) => String(n).padStart(2, '0');
        const ymd = `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
        if (fmt === 'yyyy-MM-dd') return ymd;
        return `${ymd} ${p(dt.getHours())}:${p(dt.getMinutes())}:${p(dt.getSeconds())}`;
      }
    },
    Session: { getScriptTimeZone() { return 'Asia/Taipei'; } },
    PropertiesService: {
      getScriptProperties() {
        return {
          getProperty() { return null; },
          getProperties() { return {}; },
          setProperty() {}
        };
      }
    },
    CacheService: { getScriptCache() { return fakeCache; } },
    SpreadsheetApp: {
      getActiveSpreadsheet() {
        return {
          getSheetByName(name) { return sheetMap[name] || null; }
        };
      },
      flush() {}
    },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput(content) {
        return {
          content: String(content),
          getContent() { return this.content; },
          setMimeType() { return this; }
        };
      }
    }
  };
  vm.createContext(context);
  vm.runInContext(codeGsSource, context, { filename: 'code.gs' });
  return { context, cacheMap, cacheStats };
}

test('Phase 5: getRawSheetValues_ 與 scanRequestsFromSheet_ 共用同請求原始讀取＋正確處理 Date 物件與斜線日期', () => {
  const teacherHeaders = ['學期代號', '教師Email', '教師姓名'];
  const teacherRows = [
    ['115-1', 'alice@school.example', '王甲'],
    ['115-1', 'bob@school.example', '李乙']
  ];
  const reqHeaders = [
    '學期代號', '申請單ID', '狀態', '申請人姓名', '受邀人姓名', '班級', '科目',
    '異動日期', '異動星期', '異動節次', '異動類型', '對調目標日期', '建立時間'
  ];
  const dateObjOct = new Date(2026, 9, 15, 0, 0, 0);
  const reqRows = [
    ['115-1', 'R-DATEOBJ', '已核准', '王甲', '李乙', '701', '國文', dateObjOct, 4, 2, '代課', '', '2026-10-01 08:00:00'],
    ['115-1', 'R-OLD', '已核准', '王甲', '李乙', '701', '國文', '2026/09/05', 6, 1, '代課', '', '2026-09-01 08:00:00'],
    ['115-1', 'R-PEND', '待行政審核', '王甲', '李乙', '701', '國文', '2026-09/03', 4, 3, '代課', '', '2026-09-01 09:00:00'],
    ['115-1', 'R-NOW', '已核准', '王甲', '李乙', '701', '國文', '2026-10-12', 1, 5, '代課', '', '2026-10-10 10:00:00']
  ];
  const reqCounters = { dataRangeCalls: 0, rangeGetCalls: 0 };

  const { context } = loadPhase5GasContext({
    '教師名單': makeSheet(teacherHeaders, teacherRows),
    '申請單': makeSheet(reqHeaders, reqRows, reqCounters)
  });

  context.resetRequestContext_();
  const pending = context.scanRequestsFromSheet_('115-1', { mode: 'pending' });
  const win = context.scanRequestsFromSheet_('115-1', { mode: 'window', cutoffYmd: '2026-10-01' });
  const monthOct = context.scanRequestsFromSheet_('115-1', { mode: 'month', monthStr: '2026-10' });
  const allRows = context.getTableData('申請單');

  assert.equal(reqCounters.dataRangeCalls, 1, '同請求多次掃描＋getTableData 只應讀一次試算表');
  assert.deepEqual(Array.from(pending.rows.map((r) => r['申請單ID'])), ['R-PEND']);
  assert.deepEqual(Array.from(win.rows.map((r) => r['申請單ID'])), ['R-DATEOBJ', 'R-PEND', 'R-NOW']);
  assert.deepEqual(Array.from(monthOct.rows.map((r) => r['申請單ID'])), ['R-DATEOBJ', 'R-NOW'], 'Date 儲存格在 month 模式必須正確命中 2026-10');
  assert.equal(allRows.length, 4);

  context.bustTableDataMem_('申請單');
  context.scanRequestsFromSheet_('115-1', { mode: 'all' });
  assert.equal(reqCounters.dataRangeCalls, 2, 'bustTableDataMem_ 後應重新讀取試算表');

  context.resetRequestContext_();
  context.scanRequestsFromSheet_('115-1', { mode: 'all' });
  assert.equal(reqCounters.dataRangeCalls, 3, 'resetRequestContext_ 後應重新讀取試算表');
});

test('Phase 5: 請求內學期分層快取去重複（Zero repeat CacheService／Sheet reads）與寫入失效同步', () => {
  const teacherHeaders = ['學期代號', '教師Email', '教師姓名', '授課科目', '系統角色', '基本鐘點', '折抵額度'];
  const teacherRows = [
    ['115-1', 'admin@school.example', '管理師', '國文', 'admin', 16, 2],
    ['115-1', 't1@school.example', '教師甲', '數學', 'teacher', 16, 1]
  ];
  const schedHeaders = ['學期代號', '課表ID', '教師姓名', '星期', '節次', '班級', '科目'];
  const schedRows = [
    ['115-1', 'SC-1', '教師甲', 1, 2, '701', '數學']
  ];
  const reqHeaders = ['學期代號', '申請單ID', '狀態', '申請人姓名', '受邀人姓名', '班級', '科目', '異動日期'];
  const reqRows = [
    ['115-1', 'REQ-1', 'pending_admin', '教師甲', '管理師', '701', '數學', '2026-10-15']
  ];
  const awayHeaders = ['學期代號', '事件ID', '事件名稱', '起日', '迄日', '適用範圍'];
  const awayRows = [
    ['115-1', 'AW-1', '段考', '2026-10-14', '2026-10-15', '全校']
  ];
  const swapHeaders = ['學期代號', '對調ID', '事件名稱', '日期A', '星期A', '節次A', '日期B', '星期B', '節次B', '啟用'];
  const swapRows = [
    ['115-1', 'SW-1', '補課對調', '2026-10-12', 1, 1, '2026-10-16', 5, 2, 'TRUE']
  ];

  const counters = {
    teachers: { dataRangeCalls: 0, rangeGetCalls: 0 },
    sched: { dataRangeCalls: 0, rangeGetCalls: 0 },
    req: { dataRangeCalls: 0, rangeGetCalls: 0 }
  };

  const { context, cacheStats } = loadPhase5GasContext({
    '教師名單': makeSheet(teacherHeaders, teacherRows, counters.teachers),
    '教師課表': makeSheet(schedHeaders, schedRows, counters.sched),
    '申請單': makeSheet(reqHeaders, reqRows, counters.req),
    '空堂事件': makeSheet(awayHeaders, awayRows),
    '全校對調': makeSheet(swapHeaders, swapRows),
    '額度帳本': makeSheet(['學期代號', '流水ID', '教師姓名', '異動', '索引鍵'], [])
  });

  context.resetRequestContext_();
  // 先預熱 ScriptCache（模擬下一請求從 ScriptCache 命中）
  context.getSemesterTeachersCached_('115-1');
  context.getSemesterSchedulesCached_('115-1');
  context.getSemesterRequestsCached_('115-1', true);
  context.getSemesterClassAwayCached_('115-1');
  context.getSemesterSchoolSwapsCached_('115-1');

  // 新請求起手（清請求 mem，保留 ScriptCache）
  context.resetRequestContext_();
  const getsBeforeWarmRequest = cacheStats.gets;
  const t1 = context.getSemesterTeachersCached_('115-1');
  const s1 = context.getSemesterSchedulesCached_('115-1');
  const r1 = context.getSemesterRequestsCached_('115-1', true);
  const a1 = context.getSemesterClassAwayCached_('115-1');
  const w1 = context.getSemesterSchoolSwapsCached_('115-1');
  const getsAfterFirstLoad = cacheStats.gets;

  // 同一請求內再重複呼叫數次（模擬 batch approve / buildFullSemesterPayload_ 熱路徑）
  for (let i = 0; i < 10; i++) {
    assert.strictEqual(context.getSemesterTeachersCached_('115-1'), t1);
    assert.strictEqual(context.getSemesterSchedulesCached_('115-1'), s1);
    assert.strictEqual(context.getSemesterRequestsCached_('115-1', true), r1);
    assert.strictEqual(context.getSemesterClassAwayCached_('115-1'), a1);
    assert.strictEqual(context.getSemesterSchoolSwapsCached_('115-1'), w1);
  }
  // 課表讀取保留「匯入處理中」安全閘（每次 2 次 CacheService.get），其餘層不得再碰 CacheService。
  assert.equal(cacheStats.gets - getsAfterFirstLoad, 10 * 2, '同請求第 2..11 次僅允許課表匯入安全閘的 get，其餘層不再碰 CacheService');
  assert.ok(getsAfterFirstLoad > getsBeforeWarmRequest);

  // forceFresh 與失效機制驗證
  teacherRows.push(['115-1', 't2@school.example', '教師乙', '英文', 'teacher', 16, 0]);
  const stale = context.getSemesterTeachersCached_('115-1');
  assert.equal(stale.length, 2);
  const refreshed = context.getSemesterTeachersCached_('115-1', true);
  assert.equal(refreshed.length, 3, 'forceFresh 必須繞過請求內與 ScriptCache 快取');

  reqRows.push(['115-1', 'REQ-2', 'pending_admin', '教師甲', '管理師', '701', '數學', '2026-10-16']);
  context.bustTableDataMem_('申請單');
  context.invalidateRequestCaches_('115-1');
  const r2 = context.getSemesterRequestsCached_('115-1', true);
  assert.equal(r2.rows.length, 2, 'bust + invalidate 後應立即取得新申請列');

  // patchTeacherMutualQuotaColumn_ 寫入後應清教師 mem，讓後續讀取看到最新額度
  context.patchTeacherMutualQuotaColumn_('115-1', { 't1@school.example': 5 });
  context.invalidateQuotaCaches_('115-1', []);
  const tAfterQuotaPatch = context.getSemesterTeachersCached_('115-1');
  const hitT1 = tAfterQuotaPatch.find((t) => t['教師Email'] === 't1@school.example');
  assert.equal(hitT1['折抵額度'], 5);
});

test('Phase 5: O(1) lookup helpers 與 buildMatchCandidates_ 預計算／無對調捷徑', () => {
  const { context } = loadPhase5GasContext();

  assert.equal(context.isTimestampField_('建立時間'), true);
  assert.equal(context.isTimestampField_('更新時間'), true);
  assert.equal(context.isTimestampField_('異動日期'), false);
  assert.equal(context.isNameKeyDomainSheet_('申請單'), true);
  assert.equal(context.isNameKeyDomainSheet_('教師名單'), false);
  assert.equal(context.isSemesterScopedSheet_('全校對調'), true);
  assert.equal(context.isSemesterScopedSheet_('系統設定'), false);

  let swapHelperCalls = 0;
  context.getSemesterTeachersCached_ = () => [
    { '教師Email': 'leave@school.example', '教師姓名': '請假師', '授課科目': '國文；輔導', '職務': '' },
    { '教師Email': 'cand1@school.example', '教師姓名': '候補主科', '授課科目': '國文', '職務': '' },
    { '教師Email': 'cand2@school.example', '教師姓名': '候補副科', '授課科目': '社會、輔導', '職務': '' },
    { '教師Email': 'busy@school.example', '教師姓名': '撞課師', '授課科目': '國文', '職務': '' }
  ];
  context.getSemesterSchedulesCached_ = () => [
    { '教師Email': 'leave@school.example', '教師姓名': '請假師', '星期': 1, '節次': 2, '班級': '701', '科目': '國文' },
    { '教師Email': 'cand1@school.example', '教師姓名': '候補主科', '星期': 1, '節次': 3, '班級': '701', '科目': '國文' },
    { '教師Email': 'cand2@school.example', '教師姓名': '候補副科', '星期': 1, '節次': 4, '班級': '801', '科目': '輔導' },
    { '教師Email': 'busy@school.example', '教師姓名': '撞課師', '星期': 1, '節次': 2, '班級': '702', '科目': '國文' }
  ];
  context.getActiveSchoolSwapRows_ = () => [
    // 非請求當日 2026-10-12 的對調不應在 cellAt 觸發 resolveSchoolSwapSlotForTeacher_
    { '對調ID': 'SW-OTHER', '日期A': '2026-10-19', '星期A': 1, '節次A': 1, '日期B': '2026-10-20', '星期B': 2, '節次B': 1, '啟用': 'TRUE' }
  ];
  context.getSemesterRequestsCached_ = () => ({ rows: [] });
  context.resolveSchoolSwapSlotForTeacher_ = (_rows, _d, day, period) => {
    swapHelperCalls += 1;
    return { dayOfWeek: day, period };
  };

  const out = context.buildMatchCandidates_('115-1', {
    leaveEmail: 'leave@school.example',
    dateStr: '2026-10-12',
    dayOfWeek: 1,
    period: 2,
    myCourse: '國文',
    myDomain: '國文；輔導',
    myClass: '701'
  });

  assert.equal(swapHelperCalls, 0, '請求日無全校對調時，cellAt 不得重複呼叫 resolveSchoolSwapSlotForTeacher_');
  assert.deepEqual(
    Array.from(out.candidates.map((c) => c.teacherName)),
    ['候補主科', '候補副科'],
    '主科＋同班與次科匹配排序應維持不變並排除該節有課教師'
  );
  assert.equal(out.candidates[0].subjectMatchRank, 4);
  assert.equal(out.candidates[0].todayPeriodCount, 1);
  assert.equal(out.candidates[1].subjectMatchRank, 1);
  assert.equal(out.candidates[1].todayPeriodCount, 1);
});
