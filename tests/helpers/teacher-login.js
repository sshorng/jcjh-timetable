/** teacher 登入掛載共用夾具（happy-dom 測試用；非 .test.js，不會被 vitest 直接執行）。
 * 假 JWT（免簽，decodeJwt 只拆 payload）→ preflight → loadWeeklyData 全鏈打樁。
 */
import { nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createV2App } from '../../src/main.js';
import { useSessionStore } from '../../src/stores/session.js';

export function fakeJwt(email, name) {
  const b64 = Buffer.from(JSON.stringify({
    email, name, exp: Math.floor(Date.now() / 1000) + 3600, iat: Math.floor(Date.now() / 1000)
  }), 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return 'zz.' + b64 + '.zz';
}

export const TEACHER_ROW = { '學期代號': '115-1', '教師Email': 'teacher@school.test', '教師姓名': '王老師', '授課科目': '國文' };

export const CANNED_META = {
  success: true, userRole: 'teacher', semesterId: '115-1',
  teachers: [TEACHER_ROW],
  settings: { allowedHd: 'school.test' }
};

// r2（pending_teacher 待王老師簽核）日期取今天，星期配合（週一＝1）
const _today = new Date();
const _todayStr = _today.getFullYear() + '-' + String(_today.getMonth() + 1).padStart(2, '0') + '-' + String(_today.getDate()).padStart(2, '0');
const _todayWeek = (_today.getDay() + 6) % 7 + 1;

export const CANNED_INITIAL = {
  success: true, userRole: 'teacher', scope: 'teacher', semesterId: '115-1',
  semesters: [{ '學期代號': '115-1', '是否預設': 'TRUE' }],
  teachers: [TEACHER_ROW],
  classNames: ['701'],
  schedules: [
    { '課表ID': 's1', '教師Email': 'teacher@school.test', '教師姓名': '王老師', '星期': 1, '節次': 1, '班級': '701', '科目': '國文' }
  ],
  schoolSwaps: [],
  homeroomRecords: [],
  requests: [
    {
      '學期代號': '115-1', '申請單ID': 'r1', '狀態': 'approved',
      '申請人Email': 'leave@school.test', '申請人姓名': '李老師',
      '受邀人Email': 'teacher@school.test', '受邀人姓名': '王老師',
      '班級': '701', '科目': '國文', '異動日期': '2026-08-17', '異動星期': 1, '異動節次': 1, '異動類型': 'substitution'
    },
    {
      '學期代號': '115-1', '申請單ID': 'r2', '狀態': 'pending_teacher',
      '申請人Email': 'chen@school.test', '申請人姓名': '陳老師',
      '受邀人Email': 'teacher@school.test', '受邀人姓名': '王老師',
      '班級': '702', '科目': '英文', '異動日期': _todayStr, '異動星期': _todayWeek, '異動節次': 2, '異動類型': 'substitution'
    }
  ]
};

/** 掛載已登入的 App。回傳 { app, el, session, seen, errors, warnings, cleanup }。
 * opts: { role='teacher', email, name, meta, initial, pollRounds, onExtraFetch } */
export async function mountAsTeacher(opts) {
  const o = opts || {};
  const role = o.role || 'teacher';
  const email = o.email || 'teacher@school.test';
  const name = o.name || '王老師';
  const teacherRow = o.teacherRow || TEACHER_ROW;
  const meta = o.meta || {
    success: true, userRole: role, semesterId: '115-1',
    teachers: [teacherRow],
    settings: { allowedHd: 'school.test' }
  };
  const initial = o.initial || CANNED_INITIAL;
  window.happyDOM.setURL('http://localhost/');
  sessionStorage.setItem('jcjh_google_id_token', fakeJwt(email, name));
  const seen = [];
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url, fetchOpts) => {
    const body = JSON.parse(String(fetchOpts && fetchOpts.body ? fetchOpts.body : '{}'));
    seen.push(body.action);
    if (body.action === 'getMetaData') return { ok: true, status: 200, json: async () => meta };
    if (body.action === 'getInitialData') return { ok: true, status: 200, json: async () => initial };
    if (o.onExtraFetch) return o.onExtraFetch(body.action, body);
    throw new Error('unexpected network in test: ' + body.action);
  };
  const warnings = [];
  const errors = [];
  const origAlert = window.alert;
  const origConfirm = window.confirm;
  window.alert = () => {};
  window.confirm = () => true;
  // 對齊 v2/index.html：toast 容器（無則 showToast 掉進 alert）
  if (!document.getElementById('toast-container')) {
    const tc = document.createElement('div');
    tc.id = 'toast-container';
    document.body.appendChild(tc);
  }
  setActivePinia(createPinia());
  const app = createV2App();
  app.config.warnHandler = (msg) => { warnings.push(String(msg)); };
  app.config.errorHandler = (err) => { errors.push(String((err && err.stack) || err)); };
  const el = document.createElement('div');
  el.id = 'app';
  document.body.appendChild(el);
  app.mount(el);
  const session = useSessionStore();
  let ok = false;
  for (let i = 0; i < (o.pollRounds || 150); i++) {
    await nextTick();
    await new Promise((r) => setTimeout(r, 100));
    if (session.user && session.user.email === email && session.loading === false) { ok = true; break; }
  }
  await warmupAsyncModals();
  await settleAsync(el);
  return {
    app, el, session, seen, errors, warnings,
    loginOk: ok,
    cleanup() {
      try { app.unmount(); } catch (e) { /* ignore */ }
      try { el.remove(); } catch (e) { /* ignore */ }
      globalThis.fetch = origFetch;
      window.alert = origAlert;
      window.confirm = origConfirm;
      sessionStorage.removeItem('jcjh_google_id_token');
      window.happyDOM.setURL('http://localhost/');
    }
  };
}
// App.vue 的 modal 皆為 defineAsyncComponent：掛載當下只觸發 chunk 載入，
// 在高並行下 transform 可能比 DOM 穩定檢查更慢，造成「DOM 暫穩、chunk 未到」的誤判。
// 這裡把 components/*.vue 全部預載一次（import.meta.glob 可被 Vite 靜態分析），
// 讓 App 內的非同步載入命中已轉換好的模組快取；之後的 settle 只需等渲染節拍。
// 注意 glob 路徑以本檔為準：tests/helpers/ → ../../src/components/。
const modalPreloads = import.meta.glob('../../src/components/*.vue');
export async function warmupAsyncModals() {
  await Promise.all(Object.values(modalPreloads).map((load) => load().catch(() => {})));
  await nextTick();
}

/** 等非同步元件（defineAsyncComponent 的 modal chunk）載入並渲染穩定後才回傳。
 *  App.vue 的 modal 改為非同步載入後，掛載當下 DOM 只有佔位註解，
 *  測試若立刻斷言會讀到空殼；這裡以 DOM 不再變化作為「已穩定」判準。 */
export async function settleAsync(el, opts) {
  const rounds = (opts && opts.rounds) || 80;
  const stepMs = (opts && opts.stepMs) || 25;
  let prev = null;
  for (let i = 0; i < rounds; i++) {
    await nextTick();
    await new Promise((r) => setTimeout(r, stepMs));
    const now = el ? el.innerHTML : '';
    if (prev !== null && now === prev) return;
    prev = now;
  }
}

/** 點一下＋等渲染 flush */
export async function clickAndFlush(el, selector) {
  const node = el.querySelector(selector);
  if (!node) throw new Error('找不到可點元素：' + selector);
  node.click();
  for (let i = 0; i < 5; i++) await nextTick();
  await new Promise((r) => setTimeout(r, 200));
  await nextTick();
  await settleAsync(el);
}
