
import assert from 'node:assert/strict';
import { test } from 'vitest';
import { GasApi } from '../src/api/gas-client.js';



const storageMap = new Map();
const stubSessionStorage = {
  get length() { return storageMap.size; },
  key(index) { return Array.from(storageMap.keys())[index] || null; },
  getItem(key) { return storageMap.has(String(key)) ? storageMap.get(String(key)) : null; },
  setItem(key, value) { storageMap.set(String(key), String(value)); },
  removeItem(key) { storageMap.delete(String(key)); },
  clear() { storageMap.clear(); }
};
const prevSessionStorage = globalThis.sessionStorage;
const prevFetch = globalThis.fetch;
const prevAtob = globalThis.atob;
const prevLocation = globalThis.location;
globalThis.sessionStorage = stubSessionStorage;
globalThis.location = { origin: 'http://localhost:8000', pathname: '/' };
globalThis.atob = (value) => Buffer.from(value, 'base64').toString('binary');
globalThis.fetch = async function (url, options) {
  calls.push({ url, options });
  const fixture = responses.shift() || { status: 200, body: { success: true } };
  return {
    ok: fixture.status >= 200 && fixture.status < 300,
    status: fixture.status,
    statusText: fixture.statusText || '',
    json: async function () {
      if (fixture.parseError) throw new Error('invalid JSON');
      return fixture.body;
    }
  };
};

const calls = [];
const responses = [];
const validToken = [
  Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url'),
  Buffer.from(JSON.stringify({
    email: 'teacher@school.example',
    hd: 'school.example',
    exp: Math.floor(Date.now() / 1000) + 3600
  })).toString('base64url'),
  'fixture-signature'
].join('.');



function createClient(apiUrl) {
  return GasApi.createClient({
    getApiUrl: function () { return apiUrl; },
    getSemesterId: function () { return '115-1'; },
    refreshIdToken: async function () { return validToken; },
    onAuthExpired: function () {},
    showToast: function () {}
  });
}

function lastPayload() {
  return JSON.parse(calls[calls.length - 1].options.body);
}

test('api contract tests（v1 移植，GAS 傳輸層）', async () => {
  const client = createClient('https://gas.example.test/exec');
  responses.push({ status: 200, body: { success: true, public: true, schedules: [] } });
  const publicResult = await client.fetchPublicClassData({ className: '701', semesterId: '115-1' });
  assert.equal(publicResult.public, true);
  assert.equal(lastPayload().action, 'getPublicClassData');
  assert.equal(lastPayload().idToken, '');
  assert.deepEqual(lastPayload().data, { className: '701', class: '701' });
  assert.equal(calls[0].options.headers['Content-Type'], 'text/plain;charset=utf-8');

  sessionStorage.setItem('jcjh_google_id_token', validToken);
  responses.push({ status: 200, body: {
    success: true,
    semesters: [{ '學期代號': '115-1' }],
    teachers: [],
    settings: {}
  } });
  const metaResult = await client.fetchMetaData({ semesterId: '115-1' });
  assert.equal(metaResult.success, true);
  assert.equal(lastPayload().action, 'getMetaData');
  assert.equal(lastPayload().idToken, validToken);
  assert.ok(Array.from(storageMap.keys()).some(key => /_meta$/.test(key)));

  responses.push({ status: 200, body: {
    success: true,
    semesterId: '115-1',
    userRole: 'teacher',
    teachers: []
  } });
  await client.fetchMetaData({ semesterId: '115-1', force: true });
  assert.deepEqual(lastPayload().data, { scope: 'fresh' });

  const swrPrefix = 'jcjh_swr_' + GasApi.APP_VERSION + '_115-1';
  responses.push({ status: 200, body: {
    success: true,
    semesters: [{ '學期代號': '115-1' }],
    teachers: [],
    schedules: [],
    schoolSwaps: [{ '對調ID': 'swap-1', '事件名稱': '校慶補課' }],
    settings: {}
  } });
  const initialResult = await client.fetchInitialData({ force: true });
  assert.equal(initialResult.schoolSwaps[0]['對調ID'], 'swap-1');
  const structureCache = JSON.parse(storageMap.get(swrPrefix + '_structure'));
  assert.equal(structureCache.data.schoolSwaps[0]['事件名稱'], '校慶補課');

  sessionStorage.setItem(swrPrefix + '_requests', 'fixture');
  sessionStorage.setItem(swrPrefix, 'fixture');
  responses.push({ status: 200, body: { success: true } });
  await client.callGasApi('submitRequest', { request: { '申請單ID': 'req-1' } });
  assert.equal(lastPayload().action, 'submitRequest');
  assert.equal(storageMap.has(swrPrefix + '_requests'), false);
  assert.equal(storageMap.has(swrPrefix), false);
  assert.equal(Array.from(storageMap.keys()).some(key => /_meta$/.test(key)), true);

  const missingUrlClient = createClient('');
  await assert.rejects(
    missingUrlClient.fetchMetaData(),
    /主要資料庫 GAS API 網址尚未設定/
  );

  responses.push({ status: 503, statusText: 'Unavailable', body: { success: false } });
  // v1 以 FieldMap.formatGasError 恆等樁測試，期望原始訊息；v2 用真 FieldMap，
  // 503 經過錯誤中文化（與 v1 生產環境行為一致），期望真實訊息。
  await assert.rejects(client.fetchPendingOnly(), /無法連線至伺服器/);

  responses.push({ status: 200, parseError: true });
  await assert.rejects(client.fetchPendingOnly(), /伺服器回應格式錯誤/);

  responses.push({ status: 200, body: {
    success: true,
    ledger: [],
    historyComplete: true
  } });
  const ledgerResult = await client.fetchMutualQuotaLedger({ allTeachers: true, limit: 'all' });
  assert.equal(ledgerResult.historyComplete, true);
  assert.deepEqual(lastPayload().data, {
    name: '',
    limit: 'all',
    allTeachers: true
  });

  console.log('api contract tests PASS');
});
