// @vitest-environment happy-dom
import { test, expect } from 'vitest';
import { nextTick } from 'vue';
import { createV2App } from '../src/main.js';

test('mount：App 掛載不報錯、首屏有內容', async () => {
  // 安全網：測試環境不打真網路
  const origFetch = globalThis.fetch;
  globalThis.fetch = () => Promise.reject(new Error('network disabled in test'));
  const warnings = [];
  const errors = [];
  try {
    const app = createV2App();
    app.config.warnHandler = (msg, _trace) => { warnings.push(String(msg)); };
    app.config.errorHandler = (err) => { errors.push(String((err && err.message) || err)); };
    const el = document.createElement('div');
    el.id = 'app';
    document.body.appendChild(el);
    app.mount(el);
    // 等 mounted inits＋首屏渲染 flush
    for (let i = 0; i < 5; i++) await nextTick();
    await new Promise((r) => setTimeout(r, 500));
    const html = el.innerHTML;
    expect(errors, 'vue errors:\n' + errors.join('\n')).toEqual([]);
    // 未登入首屏＝login 卡（結構不斷言位元組數，login 本來就小）
    for (const needle of ['login-container', 'login-title', 'app-logo', 'btn-google']) {
      expect(html).toContain(needle);
    }
    // 模板根不得再包一層 #app（掛載點唯一；querySelectorAll 只算後代）
    expect(el.querySelectorAll('#app').length).toBe(0);
    expect(html).toContain('login-title');
    app.unmount();
  } finally {
    globalThis.fetch = origFetch;
  }
  // 警告歸零鎖定（autofit 已修；新增警告即失敗）
  expect([...new Set(warnings)]).toEqual([]);
}, 60000);
