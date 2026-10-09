import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  normalizeErrorEntry,
  createErrorGate,
  isAbortNoise,
  installErrorReporting,
  describeVueInstance,
  installVueErrorHandler
} from '../src/modules/error-report.js';

test('error report：正規化截斷超長欄位', () => {
  const entry = normalizeErrorEntry({
    message: 'x'.repeat(600),
    stack: 'y'.repeat(2500),
    url: 'http://localhost/?class=701',
    userAgent: 'test-agent',
    email: 'teacher@school.example'
  });
  assert.equal(entry.message.length, 500);
  assert.equal(entry.stack.length, 2000);
  assert.equal(entry.email, 'teacher@school.example');
  assert.ok(entry.time);
});

test('error report：同訊息 1 分鐘去重＋單次載入上限', () => {
  const gate = createErrorGate();
  const e = { message: 'boom' };
  assert.equal(gate.shouldSend(e, 0), true);
  gate.markSent(e, 0);
  assert.equal(gate.shouldSend(e, 1000), false);
  assert.equal(gate.shouldSend(e, 61000), true);
  const other = { message: 'other' };
  assert.equal(gate.shouldSend(other, 2000), true);
  gate.markSent(other, 2000);
  for (let i = 0; i < 20; i++) {
    const x = { message: 'm' + i };
    if (gate.shouldSend(x, 3000)) gate.markSent(x, 3000);
  }
  assert.equal(gate.shouldSend({ message: 'fresh' }, 4000), false);
});

test('error report：abort 噪音不上報', () => {
  assert.equal(isAbortNoise({ name: 'AbortError', message: 'abort' }), true);
  assert.equal(isAbortNoise({ message: 'The user aborted a request' }), true);
  assert.equal(isAbortNoise({ message: 'boom' }), false);
  assert.equal(isAbortNoise(null), false);
});

test('error report：無 window 時安裝不報錯', () => {
  const api = installErrorReporting({});
  assert.equal(typeof api.report, 'function');
  console.log('error report tests PASS');
});

test('error report：Vue handler 帶元件名＋info＋tab', () => {
  assert.equal(
    describeVueInstance({ type: { __name: 'CompareModal' }, parent: { type: { name: 'App' } }, proxy: {} }),
    'CompareModal > App'
  );
  assert.equal(describeVueInstance(null), '');
  assert.equal(describeVueInstance({}), 'anonymous');
  const seen = [];
  const fakeApp = { config: {} };
  installVueErrorHandler(fakeApp, (msg) => { seen.push(msg); }, {
    getContext: () => 'tab=timetable'
  });
  assert.equal(typeof fakeApp.config.errorHandler, 'function');
  fakeApp.config.errorHandler(new Error('Cannot read properties of undefined'), { type: { __name: 'DetailModal' } }, 'render function');
  assert.ok(seen[0].includes('[Vue:DetailModal render function tab=timetable]'));
  assert.ok(seen[0].includes('Cannot read properties of undefined'));
  let prevCalled = false;
  const fakeApp2 = { config: { errorHandler: () => { prevCalled = true; } } };
  installVueErrorHandler(fakeApp2, () => {});
  fakeApp2.config.errorHandler(new Error('x'), null, '');
  assert.equal(prevCalled, true);
  installVueErrorHandler(null, () => {});
  installVueErrorHandler({}, () => {});
});
