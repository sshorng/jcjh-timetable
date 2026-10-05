import { test, expect } from 'vitest';
import { createGasClient, stableKey, googleScriptTransport } from '../src/api/gas.js';

function flush(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

test('成功直透＋key 穩定（payload 鍵序不同視為同鍵）', async () => {
  let n = 0;
  const c = createGasClient({ transport: async () => (++n, { ok: true }) });
  const a = await c.call('getMeta', { x: 1, y: 2 });
  const b = await c.call('getMeta', { y: 2, x: 1 });
  expect(a).toEqual({ ok: true });
  expect(b).toEqual({ ok: true });
  // 設計：去重僅限併發 in-flight；循序重呼視為合法重取（資料可能已變），各發一次
  expect(n).toBe(2);
  expect(stableKey('k', { b: 1, a: 2 })).toBe(stableKey('k', { a: 2, b: 1 }));
});

test('併發同鍵去重：三次同呼叫只發一次 transport', async () => {
  let n = 0;
  const c = createGasClient({
    transport: async () => {
      n++;
      await flush(20);
      return { n };
    }
  });
  const [r1, r2, r3] = await Promise.all([c.call('a', {}), c.call('a', {}), c.call('a', {})]);
  expect(n).toBe(1);
  expect(r1).toBe(r2);
  expect(r2).toBe(r3);
});

test('transient 失敗退避重試後成功', async () => {
  let n = 0;
  const c = createGasClient({
    transport: async () => {
      n++;
      if (n < 3) {
        const e = new Error('boom');
        e.transient = true;
        throw e;
      }
      return 'ok';
    },
    backoffMs: 1
  });
  expect(await c.call('a', {})).toBe('ok');
  expect(n).toBe(3);
});

test('fatal 錯誤不重試', async () => {
  let n = 0;
  const c = createGasClient({
    transport: async () => {
      n++;
      const e = new Error('nope');
      e.fatal = true;
      throw e;
    },
    backoffMs: 1
  });
  await expect(c.call('a', {})).rejects.toThrow('nope');
  expect(n).toBe(1);
});

test('逾時轉 transient 並重試耗盡後拋出', async () => {
  const c = createGasClient({
    transport: () => new Promise(() => {}),
    timeoutMs: 10,
    backoffMs: 1
  });
  await expect(c.call('a', {})).rejects.toThrow(/逾時/);
  // timeoutMs 10ms ×（1＋2 次重試）應在數百毫秒內結束
}, 10000);

test('TTL 快取命中不打 transport', async () => {
  let n = 0;
  const now = { t: 1000 };
  const c = createGasClient({
    transport: async () => (++n, { v: n }),
    cache: new Map(),
    cacheMs: 5000,
    now: () => now.t
  });
  expect(await c.call('a', {})).toEqual({ v: 1 });
  expect(await c.call('a', {})).toEqual({ v: 1 });
  expect(n).toBe(1);
  now.t += 6000;
  expect(await c.call('a', {})).toEqual({ v: 2 });
  expect(n).toBe(2);
});

test('skipCache 略過快取', async () => {
  let n = 0;
  const c = createGasClient({
    transport: async () => (++n, n),
    cache: new Map(),
    cacheMs: 60000
  });
  expect(await c.call('a', {})).toBe(1);
  expect(await c.call('a', {}, { skipCache: true })).toBe(2);
});

test('googleScriptTransport 缺席時拋 fatal（非 GAS 環境可測）', async () => {
  await expect(googleScriptTransport('x', {})).rejects.toMatchObject({ fatal: true });
});

test('無 transport 建構即拋錯（fail-fast）', () => {
  expect(() => createGasClient({})).toThrow(/transport/);
});
