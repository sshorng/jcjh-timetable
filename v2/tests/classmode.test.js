// @vitest-environment happy-dom
import { test, expect } from 'vitest';
import { nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createV2App } from '../src/main.js';
import { useMutualStore } from '../src/stores/mutual.js';
import { useSessionStore } from '../src/stores/session.js';

// ?class=701 公開課表：免登入，整條 guest 載入鏈（URL 解析→fetchPublicClassData→applyClassPayload→唯讀課表渲染）
const CANNED_PUBLIC = {
  success: true,
  semesterId: '115-1',
  className: '701',
  classNames: ['701', '702'],
  semesters: [{ '學期代號': '115-1', '是否預設': 'TRUE' }],
  schedules: [
    { '課表ID': 's1', '教師姓名': '王老師', '星期': 1, '節次': 1, '班級': '701', '科目': '國文' },
    { '課表ID': 's2', '教師姓名': '李老師', '星期': 1, '節次': 2, '班級': '701', '科目': '數學' }
  ],
  schoolSwaps: [],
  requests: [],
  classAwayEvents: []
};

test('classmode：?class=701 免登入渲染唯讀課表', async () => {
  window.happyDOM.setURL('http://localhost/?class=701');
  // happy-dom 無 alert；toast  fallback 用（只記不跳）
  const alerts = [];
  window.alert = (m) => { alerts.push(String(m)); };
  const seen = [];
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    const body = JSON.parse(String(opts && opts.body ? opts.body : '{}'));
    seen.push(body.action);
    if (body.action === 'getPublicClassData') {
      return { ok: true, status: 200, json: async () => CANNED_PUBLIC };
    }
    throw new Error('unexpected network in classmode test: ' + body.action);
  };
  const warnings = [];
  const errors = [];
  setActivePinia(createPinia());
  try {
    const app = createV2App();
    app.config.warnHandler = (msg) => { warnings.push(String(msg)); };
    app.config.errorHandler = (err) => { errors.push(String((err && err.message) || err)); };
    const el = document.createElement('div');
    el.id = 'app';
    document.body.appendChild(el);
    app.mount(el);
    // 等 guest 載入鏈跑完（applyClassViewFromUrl 同步，loadPublicClassData 非同步）
    const mutual = useMutualStore();
    const session = useSessionStore();
    let ok = false;
    for (let i = 0; i < 100; i++) {
      await nextTick();
      await new Promise((r) => setTimeout(r, 100));
      if (mutual.classViewLoadedClass === '701' && session.loading === false) { ok = true; break; }
    }
    expect(ok, 'class view 未載入（seen=' + seen.join(',') + ')').toBe(true);
    expect(mutual.classReadonlyMode).toBe(true);
    expect(session.user).toBe(null);
    expect(seen).toContain('getPublicClassData');
    // 只打公開 API，不碰需登入 API
    expect(seen.filter((a) => a !== 'getPublicClassData')).toEqual([]);
    // 最終 flush：讓佇列中的重渲染落地再讀 DOM
    await nextTick();
    await new Promise((r) => setTimeout(r, 300));
    await nextTick();
    const diag = 'tab=' + session.activeTab + ' loaded=' + mutual.classViewLoadedClass +
      ' readonly=' + mutual.classReadonlyMode + ' loading=' + session.loading;
    const html = el.innerHTML;
    expect(html, diag).toContain('701');
    expect(html).toContain('國文');
    expect(html).not.toContain('login-title');
    expect(errors, 'vue errors:\n' + errors.join('\n')).toEqual([]);
    expect([...new Set(warnings)]).toEqual([]);
    app.unmount();
  } finally {
    globalThis.fetch = origFetch;
    window.happyDOM.setURL('http://localhost/');
  }
}, 60000);
