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

console.log('cache contract tests PASS');
