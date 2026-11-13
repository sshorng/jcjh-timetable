import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { test } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const here = path.dirname(fileURLToPath(import.meta.url));
const codeGsSource = fs.readFileSync(path.join(here, '..', 'code.gs'), 'utf8');

function createBaseCache() {
  const store = new Map();
  const getAllBatches = [];
  const cache = {
    get(key) { return store.has(key) ? store.get(key) : null; },
    put(key, val) { store.set(key, String(val)); },
    putAll(obj) { Object.keys(obj).forEach((k) => store.set(k, String(obj[k]))); },
    getAll(keys) {
      getAllBatches.push(keys.length);
      const out = {};
      keys.forEach((k) => { if (store.has(k)) out[k] = store.get(k); });
      return out;
    },
    remove(key) { store.delete(key); },
    removeAll(keys) { keys.forEach((k) => store.delete(k)); }
  };
  return { store, getAllBatches, cache };
}

function loadCodeGsContext(extra = {}) {
  const { store, getAllBatches, cache } = createBaseCache();
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
    Utilities: {
      formatDate(d) {
        return new Date(d).toISOString().slice(0, 19).replace('T', ' ');
      }
    },
    PropertiesService: {
      getScriptProperties() {
        return {
          getProperty() { return null; },
          getProperties() { return {}; },
          setProperty() {}
        };
      }
    },
    CacheService: { getScriptCache() { return cache; } },
    SpreadsheetApp: { getActiveSpreadsheet() { return {}; }, flush() {} },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput(content) {
        return {
          content: String(content),
          getContent() { return this.content; },
          setMimeType() { return this; }
        };
      }
    },
    ...extra
  };
  vm.createContext(context);
  vm.runInContext(codeGsSource, context, { filename: 'code.gs' });
  return { context, store, getAllBatches, cache };
}

test('Phase 1: slimScheduleRows_ reuses already-slimmed 12-key row references', () => {
  const { context } = loadCodeGsContext();
  const alreadySlim = {
    '課表ID': 'S1',
    '教師Email': 'a@school.example',
    '教師姓名': '甲',
    '星期': 1,
    '節次': 2,
    '班級': '701',
    '科目': '國文',
    '課堂屬性': '一般',
    '調課限制': '',
    '特殊標記': '',
    '啟用起日': '',
    '啟用迄日': ''
  };
  const rawWithSem = {
    '學期代號': '115-1',
    '課表ID': 'S2',
    '教師Email': 'b@school.example',
    '教師姓名': '乙',
    '星期': 2,
    '節次': 3,
    '班級': '702',
    '科目': '數學'
  };

  const out = context.slimScheduleRows_([alreadySlim, rawWithSem]);
  assert.strictEqual(out[0], alreadySlim);
  assert.notStrictEqual(out[1], rawWithSem);
  assert.strictEqual(out[1]['學期代號'], undefined);
  assert.strictEqual(out[1]['課表ID'], 'S2');
});

test('Phase 1: resolveSchoolSwapSlotForTeacher_ with 7th scheduleMap matches full-scan patrol revert', () => {
  const { context } = loadCodeGsContext();
  const swapRows = [{
    '對調ID': 'swap-1',
    '事件名稱': '段考對調',
    '日期A': '2026-09-01', // Tue (day 2)
    '星期A': 2,
    '節次A': 1,
    '日期B': '2026-09-02', // Wed (day 3)
    '星期B': 3,
    '節次B': 2,
    '啟用': 'TRUE'
  }];
  const patrolSourceRow = {
    '課表ID': 'P1',
    '教師Email': 'patrol@school.example',
    '教師姓名': '巡堂師',
    '星期': 2,
    '節次': 1,
    '課堂屬性': '巡堂'
  };
  const patrolTargetRow = {
    '課表ID': 'P2',
    '教師Email': 'patrolTarget@school.example',
    '教師姓名': '目標巡堂師',
    '星期': 3,
    '節次': 2,
    '課堂屬性': '巡堂'
  };
  const normalRow = {
    '課表ID': 'N1',
    '教師Email': 'normal@school.example',
    '教師姓名': '一般師',
    '星期': 2,
    '節次': 1,
    '課堂屬性': '一般'
  };
  const schedules = [patrolSourceRow, patrolTargetRow, normalRow];
  const scheduleMap = {
    'patrol@school.example|2|1': [patrolSourceRow],
    'patroltarget@school.example|3|2': [patrolTargetRow],
    'normal@school.example|2|1': [normalRow]
  };

  for (const email of ['patrol@school.example', 'patrolTarget@school.example', 'normal@school.example']) {
    const fullRes = context.resolveSchoolSwapSlotForTeacher_(swapRows, '2026-09-01', 2, 1, schedules, email);
    const mapRes = context.resolveSchoolSwapSlotForTeacher_(swapRows, '2026-09-01', 2, 1, [], email, scheduleMap);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(mapRes)), JSON.parse(JSON.stringify(fullRes)));
  }

  const patrolBlocked = context.resolveSchoolSwapSlotForTeacher_(
    swapRows, '2026-09-01', 2, 1, [], 'patrol@school.example', scheduleMap
  );
  assert.strictEqual(patrolBlocked.row, null);

  const normalSwapped = context.resolveSchoolSwapSlotForTeacher_(
    swapRows, '2026-09-01', 2, 1, [], 'normal@school.example', scheduleMap
  );
  assert.strictEqual(normalSwapped.dayOfWeek, 3);
  assert.strictEqual(normalSwapped.period, 2);
});

test('Phase 1: handleReadGetPendingOnly_ invalidates via data generation and removeCacheChunkedMany_ chunks >=100 keys', () => {
  const { context, getAllBatches } = loadCodeGsContext();
  let sheetScanCalls = 0;
  let pendingData = [{ '申請單ID': 'REQ-1', '狀態': 'pending_admin' }];

  context.getSemesterTeachersCached_ = () => [{ '教師Email': 'admin@school.example', '系統角色': 'admin' }];
  context.resolveIsAdmin_ = () => true;
  context.resolveIsStaff_ = () => false;
  context.getPendingRequestsFromSheet_ = () => {
    sheetScanCalls += 1;
    return pendingData.slice();
  };
  context.nameKeyPublicRows_ = (_sheetName, rows) => rows;

  const rctx = {
    postData: {},
    action: 'getPendingOnly',
    semesterId: '115-1',
    reqData: {},
    scope: 'normal',
    readerEmail: 'admin@school.example',
    readerTeachers: [],
    readerRole: 'admin',
    readerIsAdmin: true,
    readerIsStaff: false
  };

  const first = JSON.parse(context.handleReadGetPendingOnly_(rctx).getContent());
  assert.strictEqual(first.count, 1);
  assert.strictEqual(sheetScanCalls, 1);

  const second = JSON.parse(context.handleReadGetPendingOnly_(rctx).getContent());
  assert.strictEqual(second.count, 1);
  assert.strictEqual(sheetScanCalls, 1);

  pendingData = [
    { '申請單ID': 'REQ-1', '狀態': 'pending_admin' },
    { '申請單ID': 'REQ-2', '狀態': 'pending_teacher' }
  ];
  context.invalidateRequestCaches_('115-1');

  const third = JSON.parse(context.handleReadGetPendingOnly_(rctx).getContent());
  assert.strictEqual(third.count, 2);
  assert.strictEqual(sheetScanCalls, 2);

  const manyKeys = Array.from({ length: 150 }, (_, i) => `k_${i}`);
  context.removeCacheChunkedMany_(manyKeys);
  assert.deepStrictEqual(getAllBatches.slice(-2), [100, 50]);
});

test('Phase 1: saveRows batches >40 rows with 500-row chunks without extra full-table reads', () => {
  const headers = ['學期代號', '課表ID', '教師姓名', '星期', '節次', '班級', '科目', '課堂屬性', '調課限制', '特殊標記', '啟用起日', '啟用迄日'];
  const sheetData = [headers.slice()];
  for (let i = 0; i < 520; i++) {
    sheetData.push(['115-1', `S_${i}`, '師0', 1, 1, '701', '國文', '', '', '', '', '']);
  }

  const teacherHeaders = ['學期代號', '教師Email', '教師姓名'];
  const teacherData = [teacherHeaders.slice(), ['115-1', 't0@school.example', '師0']];
  const fakeTeacherSheet = {
    getLastRow() { return teacherData.length; },
    getLastColumn() { return teacherHeaders.length; },
    getDataRange() {
      return { getValues() { return teacherData.map((r) => r.slice()); } };
    },
    getRange(row, col, numRows, numCols) {
      return {
        getValues() {
          const out = [];
          for (let r = 0; r < numRows; r++) {
            const src = teacherData[row - 1 + r] || new Array(teacherHeaders.length).fill('');
            out.push(src.slice(col - 1, col - 1 + numCols));
          }
          return out;
        }
      };
    }
  };

  let getValuesCount = 0;
  const setValueBatchSizes = [];
  const fakeSheet = {
    getLastRow() { return sheetData.length; },
    getLastColumn() { return headers.length; },
    getDataRange() {
      return {
        getValues() {
          getValuesCount += 1;
          return sheetData.map((r) => r.slice());
        }
      };
    },
    getRange(row, col, numRows, numCols) {
      return {
        getValues() {
          getValuesCount += 1;
          const out = [];
          for (let r = 0; r < numRows; r++) {
            const src = sheetData[row - 1 + r] || new Array(headers.length).fill('');
            out.push(src.slice(col - 1, col - 1 + numCols));
          }
          return out;
        },
        setValues(values) {
          setValueBatchSizes.push({ row, count: values.length });
          for (let r = 0; r < values.length; r++) {
            const targetIdx = row - 1 + r;
            sheetData[targetIdx] = values[r].slice();
          }
        }
      };
    }
  };

  const { context } = loadCodeGsContext({
    SpreadsheetApp: {
      getActiveSpreadsheet() {
        return {
          getSheetByName(name) {
            if (name === '教師課表') return fakeSheet;
            if (name === '教師名單') return fakeTeacherSheet;
            return null;
          }
        };
      },
      flush() {}
    }
  });

  const payload = [];
  for (let i = 0; i < 520; i++) {
    payload.push({
      '學期代號': '115-1',
      '課表ID': `S_${i}`,
      '教師姓名': '師0',
      '星期': 1,
      '節次': 1,
      '班級': '701',
      '科目': '英語'
    });
  }
  for (let i = 520; i < 1040; i++) {
    payload.push({
      '學期代號': '115-1',
      '課表ID': `S_${i}`,
      '教師姓名': '師0',
      '星期': 2,
      '節次': 2,
      '班級': '702',
      '科目': '數學'
    });
  }

  context.saveRows('教師課表', payload, '課表ID');

  assert.strictEqual(sheetData.length, 1 + 1040);
  assert.strictEqual(sheetData[1][6], '英語');
  assert.strictEqual(sheetData[520][6], '英語');
  assert.strictEqual(sheetData[521][6], '數學');
  assert.strictEqual(sheetData[1040][6], '數學');
  assert.deepStrictEqual(
    setValueBatchSizes.map((b) => b.count),
    [500, 20, 500, 20]
  );
  // getTableData uses mem cache on second call; total Sheet value reads stays tiny (headers + 1 full scan)
  assert.ok(getValuesCount <= 3, `unexpected sheet read count: ${getValuesCount}`);
});
