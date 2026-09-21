#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'code.gs'), 'utf8');
const cacheStore = new Map();
const fakeCache = {
  get(key) { return cacheStore.has(key) ? cacheStore.get(key) : null; },
  put(key, value) { cacheStore.set(key, String(value)); },
  getAll(keys) {
    const out = {};
    keys.forEach(key => {
      if (cacheStore.has(key)) out[key] = cacheStore.get(key);
    });
    return out;
  },
  putAll(values) {
    Object.keys(values).forEach(key => cacheStore.set(key, String(values[key])));
  },
  remove(key) { cacheStore.delete(key); },
  removeAll(keys) { keys.forEach(key => cacheStore.delete(key)); }
};

const context = {
  PropertiesService: {
    getScriptProperties() {
      return { getProperty() { return null; } };
    }
  },
  SpreadsheetApp: {},
  CacheService: { getScriptCache() { return fakeCache; } }
};
vm.createContext(context);
vm.runInContext(source, context, { filename: 'code.gs' });

const twoChunks = 'a'.repeat(90 * 1024 + 1);
context.putCacheChunked('cache-test', twoChunks, 120);
assert.equal(cacheStore.get('cache-test_chunks'), '2');
assert.equal(context.getCacheChunked('cache-test'), twoChunks);

context.putCacheChunked('cache-test', 'short', 120);
assert.equal(cacheStore.get('cache-test_chunks'), '1');
assert.equal(cacheStore.get('cache-test'), 'short');
assert.equal(cacheStore.has('cache-test_part_0'), false, '縮短為單值時不得留下舊分片');
assert.equal(cacheStore.has('cache-test_part_1'), false, '縮短為單值時不得留下舊分片');

const threeChunks = 'b'.repeat(180 * 1024 + 1);
context.putCacheChunked('cache-test', threeChunks, 120);
assert.equal(cacheStore.get('cache-test_chunks'), '3');
assert.equal(cacheStore.has('cache-test'), false, '改為分片時不得留下舊單值');
assert.equal(context.getCacheChunked('cache-test'), threeChunks);

const oneChunkAgain = 'c'.repeat(90 * 1024 + 1);
context.putCacheChunked('cache-test', oneChunkAgain, 120);
assert.equal(cacheStore.get('cache-test_chunks'), '2');
assert.equal(cacheStore.has('cache-test_part_2'), false, '分片縮短時不得留下多餘尾端分片');
assert.equal(context.getCacheChunked('cache-test'), oneChunkAgain);

const firstGeneration = context.getCacheGeneration_('quotaLedgerView', 'S1');
const nextGeneration = context.bumpCacheGeneration_('quotaLedgerView', 'S1');
assert.notEqual(nextGeneration, firstGeneration, '額度歷程 generation 應可遞增');
assert.equal(context.getCacheGeneration_('quotaLedgerView', 'S1'), nextGeneration);

const roster = [
  { '學期代號': 'S1', '教師Email': 'a@example.test', '教師姓名': '王老師' }
];
let directoryBuilds = 0;
const originalBuildDirectory = context.buildNameKeyDirectory_;
context.buildNameKeyDirectory_ = rows => {
  directoryBuilds += 1;
  return originalBuildDirectory(rows);
};
context.getTableData = sheetName => sheetName === '教師名單' ? roster : [];
context.resetRequestContext_();
context.hydrateNameKeyDomainRow_('教師課表', { '學期代號': 'S1', '教師姓名': '王老師' });
context.hydrateNameKeyDomainRow_('教師課表', { '學期代號': 'S1', '教師姓名': '王老師' });
assert.equal(directoryBuilds, 1, '同一 request 的逐列 hydration 應共用姓名目錄');
context.bustTableDataMem_('教師名單');
context.hydrateNameKeyDomainRow_('教師課表', { '學期代號': 'S1', '教師姓名': '王老師' });
assert.equal(directoryBuilds, 2, '教師名單失效時應同步清除姓名目錄 memo');
context.resetRequestContext_();
context.hydrateNameKeyDomainRow_('教師課表', { '學期代號': 'S1', '教師姓名': '王老師' });
assert.equal(directoryBuilds, 3, 'request context reset 應清除姓名目錄 memo');
const customRows = [
  { '學期代號': 'S2', '教師Email': 'b@example.test', '教師姓名': '李老師' }
];
const normalizedCustom = context.normalizeNameKeyRows_('教師課表', [
  { '學期代號': 'S2', '教師Email': 'b@example.test' }
], customRows);
assert.equal(normalizedCustom[0]['教師姓名'], '李老師', '顯式 teacherRows 正規化不得錯用 request memo');

let monthScans = 0;
context.getMonthRequestsFromSheet_ = () => {
  monthScans += 1;
  return [{ '申請單ID': `req-${monthScans}`, '申請人Email': 'a@example.test' }];
};
const firstMonthRows = context.getHistoryMonthRowsCached_('S1', '2026-09', false);
const cachedMonthRows = context.getHistoryMonthRowsCached_('S1', '2026-09', false);
assert.equal(monthScans, 1, '同一 generation 的月份資料應讓所有讀取者共用一次掃描');
assert.equal(cachedMonthRows[0]['申請單ID'], firstMonthRows[0]['申請單ID']);
context.bumpCacheGeneration_('data', 'S1');
const regeneratedMonthRows = context.getHistoryMonthRowsCached_('S1', '2026-09', false);
assert.equal(monthScans, 2, 'data generation 更新後不得命中舊月份資料');
assert.notEqual(regeneratedMonthRows[0]['申請單ID'], firstMonthRows[0]['申請單ID']);

console.log('cache contract tests PASS');
